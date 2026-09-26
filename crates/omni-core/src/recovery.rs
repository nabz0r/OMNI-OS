//! Bounded authenticated recovery. Archive data never supplies executable SQL.
use crate::{
    journal::{audit_on, AuditDetails},
    vault::{now, Vault},
};
use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use anyhow::{bail, Context, Result};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use rusqlite::types::{Value as Cell, ValueRef};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use zeroize::Zeroizing;

const FORMAT: &str = "omni-workspace-recovery-v1";
const MAX_PLAINTEXT: usize = 400_000;
// Fixed parameters prevent an input archive from choosing excessive KDF costs.
const MEMORY_KIB: u32 = 65_536;
const ITERATIONS: u32 = 3;
const TABLES:&[(&str,&str)]=&[
 ("sources","id,kind,content,metadata,created_at"),
 ("memories","id,source_id,content,status,created_at,updated_at"),
 ("memory_history","id,memory_id,content,status,recorded_at"),
 ("grants","id,destination,scope,expires_at,revoked_at,created_at"),
 ("receipts","id,destination,memory_ids,created_at,grant_id,status"),
 ("interactions","id,week,topic,latency_bucket,token_bucket,success,created_at"),
 ("analytics_reports","week,report_id,epsilon,payload,created_at"),
 ("settings","key,value"),
 ("request_policy","id,revision,document"),
 ("policy_decisions","seq,id,document"),
 ("journal_interactions","id,provider_id,provider_name,model,status,started_at,record"),
 ("journal_audit","id,created_at,action,level,provider_id,model,entity_id,record"),
 ("work_instance","id,instance_id,label,enabled"),
 ("work_requests","interaction_id,principal_id,receipt_id,preflight_us,policy_us,created_at"),
 ("continuity_threads","id,title,scope,provider_id,destination,model,grant_id,created_at,expires_at,revision,pending_request"),
 ("continuity_turns","thread_id,request_id,request_hash,user_text,assistant_text,receipt_id,interaction_id,created_at,position"),
];
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Archive {
    format: String,
    kdf: String,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    salt: String,
    nonce: String,
    ciphertext: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    format: String,
    created_at: String,
    tables: BTreeMap<String, Vec<Vec<Value>>>,
}
fn key(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    if !(16..=1024).contains(&password.len()) {
        bail!(
            "Use a recovery passphrase of 16–1024 UTF-8 bytes, stored separately from the archive"
        );
    }
    let mut key = Zeroizing::new([0; 32]);
    let params = Params::new(MEMORY_KIB, ITERATIONS, 1, Some(32))
        .map_err(|_| anyhow::anyhow!("Recovery KDF parameters unavailable"))?;
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, &mut *key)
        .map_err(|_| anyhow::anyhow!("Recovery key derivation failed"))?;
    Ok(key)
}
fn encrypt(snapshot: &[u8], password: &str) -> Result<Archive> {
    if snapshot.len() > MAX_PLAINTEXT {
        bail!("Recovery snapshot exceeds 400000 bytes; no partial archive was created");
    }
    let mut salt = [0; 16];
    let mut nonce = [0; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let key = key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&*key)
        .map_err(|_| anyhow::anyhow!("Recovery encryption unavailable"))?;
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: snapshot,
                aad: FORMAT.as_bytes(),
            },
        )
        .map_err(|_| anyhow::anyhow!("Recovery encryption failed"))?;
    Ok(Archive {
        format: FORMAT.into(),
        kdf: "argon2id-v19".into(),
        memory_kib: MEMORY_KIB,
        iterations: ITERATIONS,
        parallelism: 1,
        salt: hex::encode(salt),
        nonce: hex::encode(nonce),
        ciphertext: hex::encode(ciphertext),
    })
}
fn decrypt(archive: Archive, password: &str) -> Result<Snapshot> {
    if archive.format != FORMAT
        || archive.kdf != "argon2id-v19"
        || archive.memory_kib != MEMORY_KIB
        || archive.iterations != ITERATIONS
        || archive.parallelism != 1
        || archive.salt.len() != 32
        || archive.nonce.len() != 24
        || archive.ciphertext.len() > 2 * (MAX_PLAINTEXT + 16)
    {
        bail!("Unsupported or oversized recovery archive");
    }
    let salt = hex::decode(&archive.salt).context("Invalid archive salt")?;
    let nonce = hex::decode(&archive.nonce).context("Invalid archive nonce")?;
    let ciphertext = hex::decode(&archive.ciphertext).context("Invalid archive ciphertext")?;
    let key = key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&*key)
        .map_err(|_| anyhow::anyhow!("Recovery encryption unavailable"))?;
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: FORMAT.as_bytes(),
                },
            )
            .map_err(|_| {
                anyhow::anyhow!("Wrong passphrase or damaged archive; nothing was restored")
            })?,
    );
    let snapshot: Snapshot =
        serde_json::from_slice(&plaintext).context("Invalid recovery contents")?;
    if snapshot.format != FORMAT
        || snapshot.tables.len() != TABLES.len()
        || TABLES
            .iter()
            .any(|(table, _)| !snapshot.tables.contains_key(*table))
    {
        bail!("Unsupported recovery schema");
    }
    Ok(snapshot)
}
impl Vault {
    pub(crate) fn recovery_snapshot(&self) -> Result<Zeroizing<Vec<u8>>> {
        self.prune_conversations()?;
        let mut schema = self
            .db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
        let names = schema
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if names.iter().any(|name| {
            !TABLES.iter().any(|(table, _)| name == table)
                && !matches!(
                    name.as_str(),
                    "sqlite_sequence" | "work_clients" | "work_grants"
                )
        }) {
            bail!("The vault contains an unsupported table; recovery export refused");
        }
        let mut tables = BTreeMap::new();
        let mut byte_count = 0usize;
        let mut row_count = 0usize;
        for (table, columns) in TABLES {
            let mut statement = self
                .db
                .prepare(&format!("SELECT {columns} FROM {table} ORDER BY 1"))?;
            let count = columns.split(',').count();
            let mut rows = statement.query([])?;
            let mut data = vec![];
            while let Some(row) = rows.next()? {
                row_count += 1;
                if row_count > 10_000 {
                    bail!(
                        "Recovery snapshot exceeds 10000 records; no partial archive was created"
                    );
                }
                let mut cells = vec![];
                for i in 0..count {
                    cells.push(match row.get_ref(i)? {
                        ValueRef::Null => Value::Null,
                        ValueRef::Integer(n) => json!(n),
                        ValueRef::Real(n) => json!(n),
                        ValueRef::Text(s) => Value::String(std::str::from_utf8(s)?.into()),
                        ValueRef::Blob(_) => bail!("Binary recovery columns are unsupported"),
                    });
                }
                byte_count += serde_json::to_vec(&cells)?.len();
                if byte_count > MAX_PLAINTEXT {
                    bail!("Recovery snapshot exceeds 400000 bytes; no partial archive was created");
                }
                data.push(cells);
            }
            tables.insert(table.to_string(), data);
        }
        Ok(Zeroizing::new(serde_json::to_vec(&Snapshot {
            format: FORMAT.into(),
            created_at: now(),
            tables,
        })?))
    }
    pub(crate) fn recovery_empty(&self) -> Result<bool> {
        for table in [
            "sources",
            "memories",
            "grants",
            "receipts",
            "interactions",
            "analytics_reports",
            "work_clients",
            "continuity_threads",
            "journal_interactions",
        ] {
            let count: i64 =
                self.db
                    .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))?;
            if count != 0 {
                return Ok(false);
            }
        }
        let changes: i64 = self.db.query_row(
            "SELECT count(*) FROM journal_audit WHERE action NOT IN ('core_started')",
            [],
            |r| r.get(0),
        )?;
        Ok(changes == 0)
    }
    fn restore_snapshot(&mut self, snapshot: Snapshot) -> Result<Value> {
        if !self.recovery_empty()? {
            bail!("Restore requires an unused installation; existing work is never overwritten");
        }
        let instance_id: String = self.db.query_row(
            "SELECT instance_id FROM work_instance WHERE id=1",
            [],
            |r| r.get(0),
        )?;
        let tx = self.db.transaction()?;
        for (table, _) in TABLES.iter().rev() {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }
        let mut rows = 0;
        for (table, columns) in TABLES {
            let count = columns.split(',').count();
            let sql = format!(
                "INSERT INTO {table} ({columns}) VALUES ({})",
                vec!["?"; count].join(",")
            );
            for row in &snapshot.tables[*table] {
                if row.len() != count {
                    bail!("Recovery column count is invalid; nothing was restored");
                }
                let cells = row
                    .iter()
                    .map(|cell| {
                        Ok(match cell {
                            Value::Null => Cell::Null,
                            Value::String(s) => Cell::Text(s.clone()),
                            Value::Number(n) if n.is_i64() => Cell::Integer(n.as_i64().unwrap()),
                            Value::Number(n) => {
                                Cell::Real(n.as_f64().context("Invalid recovery number")?)
                            }
                            _ => bail!("Invalid recovery cell"),
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                tx.execute(&sql, rusqlite::params_from_iter(cells))?;
                rows += 1;
            }
        }
        // Recovery never resurrects old device identity or active access.
        tx.execute(
            "UPDATE work_instance SET instance_id=?1 WHERE id=1",
            [&instance_id],
        )?;
        tx.execute(
            "UPDATE grants SET revoked_at=COALESCE(revoked_at,?1)",
            [now()],
        )?;
        tx.execute(
            "UPDATE continuity_threads SET pending_request=NULL,revision=revision+1",
            [],
        )?;
        tx.execute("INSERT INTO settings VALUES('analytics_consent','0') ON CONFLICT(key) DO UPDATE SET value='0'",[])?;
        // Compile restored local rules before the transaction can commit.
        let policy: String =
            tx.query_row("SELECT document FROM request_policy WHERE id=1", [], |r| {
                r.get(0)
            })?;
        crate::policy::CompiledPolicy::compile(serde_json::from_str(&policy)?)?;
        let foreign_errors: i64 =
            tx.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
                r.get(0)
            })?;
        if foreign_errors != 0 {
            bail!("Recovery references are invalid; nothing was restored");
        }
        audit_on(
            &tx,
            "recovery_restored",
            &AuditDetails {
                count: Some(rows),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        self.prune_conversations()?;
        Ok(
            json!({"restored":true,"records":rows,"instance_id":instance_id,"grants_revoked":true,"clients_restored":false,"analytics_enabled":false}),
        )
    }
}
// KDF work is executed on a blocking worker; the API permits one recovery at a time.
pub(crate) fn seal(snapshot: Zeroizing<Vec<u8>>, password: Zeroizing<String>) -> Result<Archive> {
    encrypt(&snapshot, &password)
}
pub(crate) fn restore(
    vault: &mut Vault,
    archive: Archive,
    password: Zeroizing<String>,
) -> Result<Value> {
    let snapshot = decrypt(archive, &password)?;
    vault.restore_snapshot(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    const PASSWORD: &str = "synthetic recovery passphrase only";
    #[test]
    fn recovery_changes_key_and_identity_without_reviving_access() {
        let dir = tempfile::tempdir().unwrap();
        let mut source = Vault::open(&dir.path().join("source.db"), &[31; 32]).unwrap();
        source.enable_work("Synthetic work").unwrap();
        let memory = source
            .add_memory(
                "Synthetic private preference",
                "confirmed",
                "manual",
                &json!({}),
            )
            .unwrap();
        let grant = source
            .create_grant("https://example.test/v1", vec![memory.id.clone()], 3600)
            .unwrap();
        let client = source
            .create_work_client("Reference client", vec![grant.destination.clone()], 3600)
            .unwrap();
        source
            .bind_work_grant(
                &grant.id,
                client["id"].as_str().unwrap(),
                &grant.destination,
            )
            .unwrap();
        let thread = source
            .create_conversation(
                crate::continuity::ConversationInput {
                    title: "Synthetic thread".into(),
                    scope: "Project".into(),
                    provider_id: "synthetic".into(),
                    model: "test".into(),
                    grant_id: Some(grant.id.clone()),
                    retention_days: 7,
                    consent: true,
                },
                &grant.destination,
            )
            .unwrap();
        let prepared = source
            .prepare_conversation(
                &thread.id,
                &Uuid::new_v4().to_string(),
                0,
                "synthetic",
                &grant.destination,
                "test",
                Some(&grant.id),
                "Human statement",
            )
            .unwrap();
        source
            .finish_conversation(&prepared, "Model suggestion", None, "synthetic-interaction")
            .unwrap();
        let encrypted = seal(
            source.recovery_snapshot().unwrap(),
            Zeroizing::new(PASSWORD.into()),
        )
        .unwrap();
        let serialized = serde_json::to_string(&encrypted).unwrap();
        assert!(!serialized.contains("Synthetic private preference"));
        assert!(!serialized.contains(client["token"].as_str().unwrap()));
        let mut target = Vault::open(&dir.path().join("target.db"), &[72; 32]).unwrap();
        let original_id = target.work_view().unwrap()["instance_id"].clone();
        restore(&mut target, encrypted, Zeroizing::new(PASSWORD.into())).unwrap();
        assert_eq!(target.work_view().unwrap()["instance_id"], original_id);
        assert_ne!(source.work_view().unwrap()["instance_id"], original_id);
        assert_eq!(
            target.memories().unwrap()[0].content,
            "Synthetic private preference"
        );
        assert!(target.grants().unwrap()[0].revoked_at.is_some());
        assert!(target
            .authenticate_client(client["token"].as_str().unwrap())
            .unwrap()
            .is_none());
        assert!(target.work_clients().unwrap().is_empty());
        let restored = target.conversation_messages(&thread.id).unwrap();
        assert_eq!(restored["turns"][0]["human_statement"], "Human statement");
        assert_eq!(restored["turns"][0]["model_suggestion"], "Model suggestion");
        assert!(!target.recovery_empty().unwrap());
        assert!(restore(
            &mut target,
            serde_json::from_str(&serialized).unwrap(),
            Zeroizing::new(PASSWORD.into())
        )
        .is_err());
        drop(target);
        assert!(Vault::open(&dir.path().join("target.db"), &[31; 32]).is_err());
        assert_eq!(
            Vault::open(&dir.path().join("target.db"), &[72; 32])
                .unwrap()
                .memories()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn authenticated_archive_rejects_tampering_and_rolls_back_invalid_rows() {
        let dir = tempfile::tempdir().unwrap();
        let source = Vault::open(&dir.path().join("source.db"), &[9; 32]).unwrap();
        let snapshot = source.recovery_snapshot().unwrap();
        let mut archive = seal(snapshot.clone(), Zeroizing::new(PASSWORD.into())).unwrap();
        let original = serde_json::to_string(&archive).unwrap();
        assert!(decrypt(
            serde_json::from_str(&original).unwrap(),
            "wrong synthetic passphrase"
        )
        .is_err());
        archive.ciphertext.replace_range(
            0..2,
            if &archive.ciphertext[..2] == "ff" {
                "00"
            } else {
                "ff"
            },
        );
        assert!(decrypt(archive, PASSWORD).is_err());
        let mut hostile: Snapshot = serde_json::from_slice(&snapshot).unwrap();
        hostile
            .tables
            .get_mut("sources")
            .unwrap()
            .push(vec![json!("wrong column count")]);
        let mut target = Vault::open(&dir.path().join("target.db"), &[10; 32]).unwrap();
        let before = target.work_view().unwrap();
        assert!(target.restore_snapshot(hostile).is_err());
        assert_eq!(target.work_view().unwrap(), before);
        assert!(target.recovery_empty().unwrap());
        let mut archive: Archive = serde_json::from_str(&original).unwrap();
        archive.memory_kib = u32::MAX;
        assert!(decrypt(archive, PASSWORD).is_err());
        assert!(encrypt(&vec![0; MAX_PLAINTEXT + 1], PASSWORD).is_err());
    }
    use uuid::Uuid;
}
