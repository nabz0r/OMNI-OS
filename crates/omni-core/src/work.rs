//! A single-owner work installation, never an organisation-wide tenant service.
use crate::{
    journal::{audit_on, AuditDetails},
    vault::{now, Vault},
};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Principal {
    Owner,
    Legacy,
    Client(String),
}
impl Principal {
    pub fn id(&self) -> &str {
        match self {
            Self::Owner => "owner-workspace",
            Self::Legacy => "legacy-integration",
            Self::Client(id) => id,
        }
    }
}
#[derive(Serialize)]
pub(crate) struct WorkClient {
    pub id: String,
    pub label: String,
    pub destinations: Vec<String>,
    pub expires_at: String,
    pub revoked_at: Option<String>,
    pub created_at: String,
}
pub(crate) fn initialize(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS work_instance(id INTEGER PRIMARY KEY CHECK(id=1),instance_id TEXT NOT NULL,label TEXT NOT NULL,enabled INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS work_clients(id TEXT PRIMARY KEY,label TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,destinations TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_grants(grant_id TEXT PRIMARY KEY REFERENCES grants(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES work_clients(id));
    CREATE TABLE IF NOT EXISTS work_requests(interaction_id TEXT PRIMARY KEY,principal_id TEXT NOT NULL,receipt_id TEXT,preflight_us INTEGER NOT NULL,policy_us INTEGER NOT NULL,created_at TEXT NOT NULL);")?;
    db.execute(
        "INSERT OR IGNORE INTO work_instance VALUES(1,?1,'My installation',0)",
        [Uuid::new_v4().to_string()],
    )?;
    Ok(())
}
pub(crate) fn label(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 120 || value.chars().any(char::is_control) {
        bail!("Use a name of 1–120 UTF-8 bytes without control characters");
    }
    Ok(value.into())
}
impl Vault {
    pub(crate) fn work_enabled(&self) -> Result<bool> {
        Ok(self
            .db
            .query_row("SELECT enabled FROM work_instance WHERE id=1", [], |r| {
                r.get(0)
            })?)
    }
    pub(crate) fn work_view(&self) -> Result<Value> {
        let (id, label, enabled): (String, String, bool) = self.db.query_row(
            "SELECT instance_id,label,enabled FROM work_instance WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        Ok(
            json!({"instance_id":id,"label":label,"enabled":enabled,"authority":"per-device-single-owner","shared_service":false,"clients":self.work_clients()?,"requests":self.work_requests()?}),
        )
    }
    pub(crate) fn enable_work(&mut self, name: &str) -> Result<()> {
        let name = label(name)?;
        let tx = self.db.transaction()?;
        tx.execute(
            "UPDATE work_instance SET label=?1,enabled=1 WHERE id=1",
            [name],
        )?;
        audit_on(
            &tx,
            "work_enabled",
            &AuditDetails {
                enabled: Some(true),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn work_clients(&self) -> Result<Vec<WorkClient>> {
        let mut stmt=self.db.prepare("SELECT id,label,destinations,expires_at,revoked_at,created_at FROM work_clients ORDER BY created_at DESC,id")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, String>(5)?,
            ))
        })?;
        rows.map(|r| {
            let (id, label, destinations, expires_at, revoked_at, created_at) = r?;
            Ok(WorkClient {
                id,
                label,
                destinations: serde_json::from_str(&destinations)?,
                expires_at,
                revoked_at,
                created_at,
            })
        })
        .collect()
    }
    pub(crate) fn create_work_client(
        &mut self,
        name: &str,
        destinations: Vec<String>,
        seconds: i64,
    ) -> Result<Value> {
        if !self.work_enabled()? {
            bail!("Enable this installation for work before approving a client");
        }
        if destinations.is_empty()
            || destinations.len() > 16
            || !(60..=2_592_000).contains(&seconds)
        {
            bail!("Choose 1–16 destinations and a lifetime of 60 seconds to 30 days");
        }
        let count: i64 = self.db.query_row(
            "SELECT count(*) FROM work_clients WHERE revoked_at IS NULL",
            [],
            |r| r.get(0),
        )?;
        if count >= 32 {
            bail!("Revoke an existing client before approving more than 32 clients");
        }
        let name = label(name)?;
        let id = Uuid::new_v4().to_string();
        let mut bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        let token = hex::encode(bytes);
        let hash = hex::encode(Sha256::digest(token.as_bytes()));
        let expiry = (Utc::now() + Duration::seconds(seconds)).to_rfc3339();
        let timestamp = now();
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO work_clients VALUES(?1,?2,?3,?4,?5,NULL,?6)",
            params![
                id,
                name,
                hash,
                serde_json::to_string(&destinations)?,
                expiry,
                timestamp
            ],
        )?;
        audit_on(
            &tx,
            "client_approved",
            &AuditDetails {
                entity_id: Some(id.clone()),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok(json!({"id":id,"token":token,"expires_at":expiry,"shown_once":true}))
    }
    pub(crate) fn authenticate_client(&self, token: &str) -> Result<Option<Principal>> {
        if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Ok(None);
        }
        let hash = hex::encode(Sha256::digest(token.as_bytes()));
        let id: Option<String> = self
            .db
            .query_row(
                "SELECT id FROM work_clients WHERE token_hash=?1",
                [hash],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(id) = id {
            if self.active_client(&id).is_ok() {
                return Ok(Some(Principal::Client(id)));
            }
        }
        Ok(None)
    }
    fn active_client(&self, id: &str) -> Result<WorkClient> {
        if !self.work_enabled()? {
            bail!("This work installation is not enabled");
        }
        let client = self
            .work_clients()?
            .into_iter()
            .find(|c| c.id == id)
            .context("Unknown client")?;
        if client.revoked_at.is_some()
            || DateTime::parse_from_rfc3339(&client.expires_at)? <= Utc::now()
        {
            bail!("Client access has expired or been revoked");
        }
        Ok(client)
    }
    pub(crate) fn revoke_client(&mut self, id: &str) -> Result<bool> {
        let tx = self.db.transaction()?;
        let found = tx.execute(
            "UPDATE work_clients SET revoked_at=COALESCE(revoked_at,?1) WHERE id=?2",
            params![now(), id],
        )? > 0;
        if found {
            tx.execute("UPDATE grants SET revoked_at=COALESCE(revoked_at,?1) WHERE id IN (SELECT grant_id FROM work_grants WHERE client_id=?2)",params![now(),id])?;
            audit_on(
                &tx,
                "client_revoked",
                &AuditDetails {
                    entity_id: Some(id.into()),
                    ..Default::default()
                },
            )?;
        }
        tx.commit()?;
        Ok(found)
    }
    pub(crate) fn bind_work_grant(
        &self,
        grant: &str,
        client: &str,
        destination: &str,
    ) -> Result<()> {
        if !self
            .active_client(client)?
            .destinations
            .iter()
            .any(|d| d == destination)
        {
            bail!("Client is not approved for this destination");
        }
        self.db.execute(
            "INSERT INTO work_grants VALUES(?1,?2)",
            params![grant, client],
        )?;
        Ok(())
    }
    pub(crate) fn authorize_principal(
        &self,
        principal: &Principal,
        destination: &str,
        grant: Option<&str>,
    ) -> Result<()> {
        match principal {
            Principal::Owner => Ok(()),
            Principal::Legacy => {
                if self.work_enabled()? {
                    bail!("Work installations require an individually approved client");
                }
                Ok(())
            }
            Principal::Client(id) => {
                if !self
                    .active_client(id)?
                    .destinations
                    .iter()
                    .any(|d| d == destination)
                {
                    bail!("Client is not approved for this destination");
                }
                if let Some(grant) = grant {
                    let binding: Option<String> = self
                        .db
                        .query_row(
                            "SELECT client_id FROM work_grants WHERE grant_id=?1",
                            [grant],
                            |r| r.get(0),
                        )
                        .optional()?;
                    if binding.as_deref() != Some(id.as_str()) {
                        bail!("This permission does not authorize this client");
                    }
                }
                Ok(())
            }
        }
    }
    pub(crate) fn record_work_request(
        &self,
        interaction: &str,
        principal: &Principal,
        receipt: Option<&str>,
        preflight: u64,
        policy: u64,
    ) -> Result<()> {
        self.db.execute(
            "INSERT INTO work_requests VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                interaction,
                principal.id(),
                receipt,
                i64::try_from(preflight)?,
                i64::try_from(policy)?,
                now()
            ],
        )?;
        self.db.execute("DELETE FROM work_requests WHERE interaction_id NOT IN (SELECT id FROM journal_interactions)",[])?;
        Ok(())
    }
    fn work_requests(&self) -> Result<Vec<Value>> {
        let mut stmt=self.db.prepare("SELECT interaction_id,principal_id,receipt_id,preflight_us,policy_us,created_at FROM work_requests ORDER BY created_at DESC,interaction_id LIMIT 100")?;
        let result = Ok(stmt.query_map([],|r|Ok(json!({"interaction_id":r.get::<_,String>(0)?,"principal_id":r.get::<_,String>(1)?,"receipt_id":r.get::<_,Option<String>>(2)?,"preflight_us":r.get::<_,i64>(3)?,"policy_us":r.get::<_,i64>(4)?,"created_at":r.get::<_,String>(5)?})))?.collect::<rusqlite::Result<Vec<_>>>()?);
        result
    }
}
