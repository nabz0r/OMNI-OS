use crate::journal::{audit_on, AuditDetails};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Memory {
    pub id: String,
    pub source_id: String,
    pub content: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Grant {
    pub id: String,
    pub destination: String,
    pub scope: Vec<String>,
    pub expires_at: String,
    pub revoked_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Receipt {
    pub id: String,
    pub destination: String,
    pub memory_ids: Vec<String>,
    pub created_at: String,
    pub grant_id: Option<String>,
    pub status: String,
}

pub struct Vault {
    pub(crate) db: Connection,
}

pub fn valid_status(status: &str) -> bool {
    matches!(status, "proposed" | "confirmed" | "disputed" | "superseded")
}

pub fn now() -> String {
    Utc::now().to_rfc3339()
}

impl Vault {
    pub fn open(path: &Path, key: &[u8]) -> Result<Self> {
        if key.len() != 32 {
            bail!("Vault key must be 256 bits");
        }
        let db = Connection::open(path)?;
        // Key material contains only hex generated from bytes, never input SQL.
        db.execute_batch(&format!("PRAGMA key = \"x'{}'\";", hex::encode(key)))?;
        let cipher: String = db
            .query_row("PRAGMA cipher_version", [], |row| row.get(0))
            .context("SQLCipher is required; plaintext SQLite is not supported")?;
        if cipher.is_empty() {
            bail!("SQLCipher unavailable");
        }
        db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE, content TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('proposed','confirmed','disputed','superseded')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS memory_history(id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE, content TEXT NOT NULL, status TEXT NOT NULL, recorded_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, destination TEXT NOT NULL, scope TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, destination TEXT NOT NULL, memory_ids TEXT NOT NULL, created_at TEXT NOT NULL, grant_id TEXT, status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS interactions(id TEXT PRIMARY KEY, week TEXT NOT NULL, topic INTEGER NOT NULL, latency_bucket INTEGER NOT NULL, token_bucket INTEGER NOT NULL, success INTEGER NOT NULL, created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS interactions_week ON interactions(week);
            CREATE TABLE IF NOT EXISTS analytics_reports(week TEXT PRIMARY KEY, report_id TEXT NOT NULL UNIQUE, epsilon REAL NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);")?;
        crate::journal::initialize(&db)?;
        Ok(Self { db })
    }

    pub fn add_memory(
        &mut self,
        content: &str,
        status: &str,
        source: &str,
        metadata: &Value,
    ) -> Result<Memory> {
        check_content(content)?;
        if !valid_status(status) {
            bail!("Invalid memory status");
        }
        check_source(source)?;
        let source_id = Uuid::new_v4().to_string();
        let id = Uuid::new_v4().to_string();
        let timestamp = now();
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO sources VALUES(?1,?2,?3,?4,?5)",
            params![source_id, source, content, metadata.to_string(), timestamp],
        )?;
        tx.execute(
            "INSERT INTO memories VALUES(?1,?2,?3,?4,?5,?5)",
            params![id, source_id, content, status, timestamp],
        )?;
        audit_on(
            &tx,
            "memory_created",
            &AuditDetails {
                entity_id: Some(id.clone()),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok(Memory {
            id,
            source_id,
            content: content.into(),
            status: status.into(),
            created_at: timestamp.clone(),
            updated_at: timestamp,
            source: source.into(),
        })
    }

    pub fn memories(&self) -> Result<Vec<Memory>> {
        let mut stmt = self.db.prepare("SELECT m.id,m.source_id,m.content,m.status,m.created_at,m.updated_at,s.kind FROM memories m JOIN sources s ON s.id=m.source_id ORDER BY m.created_at DESC")?;
        let rows = stmt.query_map([], memory_row)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn update_memory(
        &mut self,
        id: &str,
        content: Option<&str>,
        status: Option<&str>,
    ) -> Result<Memory> {
        if let Some(content) = content {
            check_content(content)?;
        }
        if status.is_some_and(|s| !valid_status(s)) {
            bail!("Invalid memory status");
        }
        let existing = self
            .memories()?
            .into_iter()
            .find(|m| m.id == id)
            .context("Memory not found")?;
        let timestamp = now();
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO memory_history(memory_id,content,status,recorded_at) VALUES(?1,?2,?3,?4)",
            params![id, existing.content, existing.status, timestamp],
        )?;
        tx.execute(
            "UPDATE memories SET content=?1,status=?2,updated_at=?3 WHERE id=?4",
            params![
                content.unwrap_or(&existing.content),
                status.unwrap_or(&existing.status),
                timestamp,
                id
            ],
        )?;
        audit_on(
            &tx,
            "memory_updated",
            &AuditDetails {
                entity_id: Some(id.into()),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        self.memories()?
            .into_iter()
            .find(|m| m.id == id)
            .context("Memory not found")
    }

    pub fn delete_memory(&mut self, id: &str) -> Result<bool> {
        let source_id: Option<String> = self
            .db
            .query_row("SELECT source_id FROM memories WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?;
        if let Some(source) = source_id {
            let tx = self.db.transaction()?;
            tx.execute("DELETE FROM memories WHERE id=?1", [id])?;
            tx.execute("DELETE FROM sources WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM memories WHERE source_id=?1)",[source])?;
            audit_on(
                &tx,
                "memory_deleted",
                &AuditDetails {
                    entity_id: Some(id.into()),
                    ..Default::default()
                },
            )?;
            tx.commit()?;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn delete_source(&mut self, id: &str) -> Result<bool> {
        let tx = self.db.transaction()?;
        let removed = tx.execute("DELETE FROM sources WHERE id=?1", [id])? > 0;
        if removed {
            audit_on(
                &tx,
                "source_deleted",
                &AuditDetails {
                    entity_id: Some(id.into()),
                    ..Default::default()
                },
            )?;
        }
        tx.commit()?;
        Ok(removed)
    }

    pub fn add_capture(
        &mut self,
        raw: &str,
        kind: &str,
        metadata: &Value,
        proposals: Vec<String>,
    ) -> Result<(String, Vec<Memory>)> {
        check_content(raw)?;
        check_source(kind)?;
        if proposals.len() > 5 {
            bail!("At most five capture proposals are allowed");
        }
        let source_id = Uuid::new_v4().to_string();
        let timestamp = now();
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO sources VALUES(?1,?2,?3,?4,?5)",
            params![source_id, kind, raw, metadata.to_string(), timestamp],
        )?;
        let mut memories = vec![];
        for content in proposals {
            check_content(&content)?;
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO memories VALUES(?1,?2,?3,'proposed',?4,?4)",
                params![id, source_id, content, timestamp],
            )?;
            memories.push(Memory {
                id,
                source_id: source_id.clone(),
                content,
                status: "proposed".into(),
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
                source: kind.into(),
            });
        }
        audit_on(
            &tx,
            "capture_saved",
            &AuditDetails {
                entity_id: Some(source_id.clone()),
                count: Some(memories.len() as u64),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok((source_id, memories))
    }

    pub fn create_grant(
        &mut self,
        destination: &str,
        scope: Vec<String>,
        seconds: i64,
    ) -> Result<Grant> {
        if !(1..=86_400).contains(&seconds) {
            bail!("Grant lifetime must be 1–86400 seconds");
        }
        if scope.is_empty() || scope.len() > 128 {
            bail!("Grant scope must contain 1–128 memory IDs, or *");
        }
        if scope.iter().any(|s| s == "*") && scope.len() != 1 {
            bail!("Wildcard scope must stand alone");
        }
        let memories = self.memories()?;
        for id in &scope {
            if id != "*" && !memories.iter().any(|m| &m.id == id) {
                bail!("Grant references a missing memory");
            }
        }
        let grant = Grant {
            id: Uuid::new_v4().to_string(),
            destination: destination.into(),
            scope,
            expires_at: (Utc::now() + Duration::seconds(seconds)).to_rfc3339(),
            revoked_at: None,
            created_at: now(),
        };
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO grants VALUES(?1,?2,?3,?4,NULL,?5)",
            params![
                grant.id,
                grant.destination,
                serde_json::to_string(&grant.scope)?,
                grant.expires_at,
                grant.created_at
            ],
        )?;
        audit_on(
            &tx,
            "grant_created",
            &AuditDetails {
                entity_id: Some(grant.id.clone()),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok(grant)
    }

    pub fn grants(&self) -> Result<Vec<Grant>> {
        let mut stmt=self.db.prepare("SELECT id,destination,scope,expires_at,revoked_at,created_at FROM grants ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |r| {
            let scope: String = r.get(2)?;
            Ok(Grant {
                id: r.get(0)?,
                destination: r.get(1)?,
                scope: serde_json::from_str(&scope).unwrap_or_default(),
                expires_at: r.get(3)?,
                revoked_at: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn revoke(&mut self, id: &str) -> Result<bool> {
        let tx = self.db.transaction()?;
        let affected = tx.execute(
            "UPDATE grants SET revoked_at=COALESCE(revoked_at,?1) WHERE id=?2",
            params![now(), id],
        )? > 0;
        if affected {
            audit_on(
                &tx,
                "grant_revoked",
                &AuditDetails {
                    entity_id: Some(id.into()),
                    ..Default::default()
                },
            )?;
        }
        tx.commit()?;
        Ok(affected)
    }

    pub fn context(
        &self,
        grant_id: &str,
        destination: &str,
        query: Option<&str>,
    ) -> Result<Vec<Memory>> {
        let grant = self
            .grants()?
            .into_iter()
            .find(|g| g.id == grant_id)
            .context("Unknown grant")?;
        if grant.revoked_at.is_some() {
            bail!("Grant has been revoked");
        }
        if DateTime::parse_from_rfc3339(&grant.expires_at)? <= Utc::now() {
            bail!("Grant has expired");
        }
        if grant.destination != destination {
            bail!("Grant does not authorize this destination");
        }
        let query = query.unwrap_or("").to_lowercase();
        let mut budget = 12_000usize;
        let selected = self
            .memories()?
            .into_iter()
            .filter(|m| m.status == "confirmed")
            .filter(|m| grant.scope.iter().any(|s| s == "*" || s == &m.id))
            .filter(|m| query.is_empty() || m.content.to_lowercase().contains(&query))
            .filter(|m| {
                if m.content.len() > budget {
                    false
                } else {
                    budget -= m.content.len();
                    true
                }
            })
            .take(24)
            .collect();
        Ok(selected)
    }

    pub fn receipt(
        &mut self,
        destination: &str,
        memories: &[Memory],
        grant_id: Option<&str>,
    ) -> Result<Receipt> {
        let receipt = Receipt {
            id: Uuid::new_v4().to_string(),
            destination: destination.into(),
            memory_ids: memories.iter().map(|m| m.id.clone()).collect(),
            created_at: now(),
            grant_id: grant_id.map(str::to_string),
            status: "authorized".into(),
        };
        self.db.execute(
            "INSERT INTO receipts VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                receipt.id,
                receipt.destination,
                serde_json::to_string(&receipt.memory_ids)?,
                receipt.created_at,
                receipt.grant_id,
                receipt.status
            ],
        )?;
        Ok(receipt)
    }

    /// Revalidate the exact selected content immediately before recording a
    /// disclosure. A valid grant alone does not authorize an obsolete snapshot
    /// after a concurrent edit, deletion, or change of memory status.
    pub fn current_context_receipt(
        &mut self,
        destination: &str,
        grant_id: &str,
        selected: &[Memory],
    ) -> Result<Option<Receipt>> {
        let current = self.context(grant_id, destination, None)?;
        if current != selected {
            bail!("Memory context changed before sending; review the current memories and retry");
        }
        if selected.is_empty() {
            return Ok(None);
        }
        self.receipt(destination, selected, Some(grant_id))
            .map(Some)
    }

    pub fn receipt_status(&self, id: &str, status: &str) -> Result<()> {
        self.db.execute(
            "UPDATE receipts SET status=?1 WHERE id=?2",
            params![status, id],
        )?;
        Ok(())
    }
    pub fn receipts(&self) -> Result<Vec<Receipt>> {
        let mut stmt=self.db.prepare("SELECT id,destination,memory_ids,created_at,grant_id,status FROM receipts ORDER BY created_at DESC LIMIT 100")?;
        let rows = stmt.query_map([], |r| {
            let ids: String = r.get(2)?;
            Ok(Receipt {
                id: r.get(0)?,
                destination: r.get(1)?,
                memory_ids: serde_json::from_str(&ids).unwrap_or_default(),
                created_at: r.get(3)?,
                grant_id: r.get(4)?,
                status: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn set_consent(&mut self, enabled: bool) -> Result<()> {
        let tx = self.db.transaction()?;
        tx.execute("INSERT INTO settings VALUES('analytics_consent',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[if enabled{"1"}else{"0"}])?;
        audit_on(
            &tx,
            "analytics_consent_changed",
            &AuditDetails {
                enabled: Some(enabled),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn consent(&self, default: bool) -> Result<bool> {
        let v: Option<String> = self
            .db
            .query_row(
                "SELECT value FROM settings WHERE key='analytics_consent'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.map_or(default, |s| s == "1"))
    }
    pub fn analytics_stats(&self, default: bool) -> Result<Value> {
        let (n, epsilon): (i64, f64) = self.db.query_row(
            "SELECT count(*),COALESCE(sum(epsilon),0) FROM analytics_reports",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok(
            json!({"opt_in":self.consent(default)?,"budget_used":epsilon,"budget_limit":4,"reports":n,"epsilon_per_report":1,"unit":"installation; at most four weekly reports","automatic_export":false}),
        )
    }
    pub fn interaction(
        &self,
        week: &str,
        topic: u8,
        latency: u8,
        tokens: u8,
        success: bool,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        self.db.execute(
            "INSERT INTO interactions VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![id, week, topic, latency, tokens, success, now()],
        )?;
        Ok(id)
    }
    pub fn update_interaction_tokens(&self, id: &str, tokens: u8) -> Result<()> {
        self.db.execute(
            "UPDATE interactions SET token_bucket=?1 WHERE id=?2",
            params![tokens, id],
        )?;
        Ok(())
    }
    pub fn complete_interaction(&self, id: &str, tokens: u8) -> Result<()> {
        self.db.execute(
            "UPDATE interactions SET token_bucket=?1,success=1 WHERE id=?2",
            params![tokens, id],
        )?;
        Ok(())
    }
    pub fn interaction_count(&self) -> Result<i64> {
        Ok(self
            .db
            .query_row("SELECT count(*) FROM interactions", [], |r| r.get(0))?)
    }
}

fn memory_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: r.get(0)?,
        source_id: r.get(1)?,
        content: r.get(2)?,
        status: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
        source: r.get(6)?,
    })
}
fn check_content(s: &str) -> Result<()> {
    if s.trim().is_empty() || s.len() > 100_000 {
        bail!("Memory content must contain 1–100000 bytes");
    }
    Ok(())
}

pub fn check_source(source: &str) -> Result<()> {
    if source.trim().is_empty() || source.len() > 80 {
        bail!("Source kind must contain 1–80 UTF-8 bytes");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cipher_is_real_and_wrong_keys_fail() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        {
            let mut vault = Vault::open(&path, &[7; 32]).unwrap();
            vault
                .add_memory("SENSITIVE-CANARY-9087", "confirmed", "manual", &json!({}))
                .unwrap();
            vault
                .db
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
                .unwrap();
        }
        let bytes = std::fs::read(&path).unwrap();
        assert!(!bytes.starts_with(b"SQLite format 3"));
        assert!(!String::from_utf8_lossy(&bytes).contains("SENSITIVE-CANARY"));
        assert!(Vault::open(&path, &[8; 32]).is_err());
        assert!(Vault::open(&path, &[7; 32]).is_ok());
    }
    #[test]
    fn grants_are_destination_scoped_revocable_and_only_confirmed() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = Vault::open(&dir.path().join("v.db"), &[1; 32]).unwrap();
        let m = v
            .add_memory("Allowed fact", "confirmed", "manual", &json!({}))
            .unwrap();
        v.add_memory("Unconfirmed fact", "proposed", "manual", &json!({}))
            .unwrap();
        let g = v
            .create_grant("https://provider.test/v1", vec!["*".into()], 3600)
            .unwrap();
        assert_eq!(v.context(&g.id, &g.destination, None).unwrap().len(), 1);
        assert!(v.context(&g.id, "https://other.test/v1", None).is_err());
        v.revoke(&g.id).unwrap();
        assert!(v.context(&g.id, &g.destination, None).is_err());
        assert!(v.delete_memory(&m.id).unwrap());
        let n: i64 =
            v.db.query_row(
                "SELECT count(*) FROM sources WHERE id=?1",
                [m.source_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0);
    }
    #[test]
    fn history_and_source_are_deleted_together() {
        let d = tempfile::tempdir().unwrap();
        let mut v = Vault::open(&d.path().join("v.db"), &[4; 32]).unwrap();
        let m = v
            .add_memory("Old", "proposed", "manual", &json!({}))
            .unwrap();
        v.update_memory(&m.id, Some("New"), Some("confirmed"))
            .unwrap();
        v.delete_source(&m.source_id).unwrap();
        assert!(v.memories().unwrap().is_empty());
        assert_eq!(
            v.db.query_row("SELECT count(*) FROM memory_history", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn stale_memory_snapshots_cannot_receive_disclosure_receipts() {
        for change in ["edit", "dispute", "delete", "revoke", "expire"] {
            let dir = tempfile::tempdir().unwrap();
            let mut vault = Vault::open(&dir.path().join("vault.db"), &[5; 32]).unwrap();
            let memory = vault
                .add_memory("PRIVATE-STALE-CANARY", "confirmed", "manual", &json!({}))
                .unwrap();
            let grant = vault
                .create_grant("https://provider.test/v1", vec![memory.id.clone()], 3600)
                .unwrap();
            let selected = vault.context(&grant.id, &grant.destination, None).unwrap();
            match change {
                "edit" => {
                    vault
                        .update_memory(&memory.id, Some("Corrected fact"), None)
                        .unwrap();
                }
                "dispute" => {
                    vault
                        .update_memory(&memory.id, None, Some("disputed"))
                        .unwrap();
                }
                "delete" => {
                    vault.delete_memory(&memory.id).unwrap();
                }
                "revoke" => {
                    vault.revoke(&grant.id).unwrap();
                }
                "expire" => {
                    vault
                        .db
                        .execute(
                            "UPDATE grants SET expires_at='2000-01-01T00:00:00Z' WHERE id=?1",
                            [&grant.id],
                        )
                        .unwrap();
                }
                _ => unreachable!(),
            }
            assert!(
                vault
                    .current_context_receipt(&grant.destination, &grant.id, &selected)
                    .is_err(),
                "{change}"
            );
            assert!(vault.receipts().unwrap().is_empty(), "{change}");
        }
    }

    #[test]
    fn invalid_capture_source_does_not_persist_an_orphan() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::open(&dir.path().join("vault.db"), &[6; 32]).unwrap();
        assert!(vault
            .add_capture("Captured source", " ", &json!({}), vec!["A fact".into()])
            .is_err());
        assert_eq!(
            vault
                .db
                .query_row("SELECT count(*) FROM sources", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
