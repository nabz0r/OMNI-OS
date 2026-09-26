//! Explicitly opted-in, destination-bound text continuity. No semantic retrieval.
use crate::{
    journal::{audit_on, AuditDetails},
    vault::{now, Vault},
    work::label,
};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Conversation {
    pub id: String,
    pub title: String,
    pub scope: String,
    pub provider_id: String,
    pub destination: String,
    pub model: String,
    pub grant_id: Option<String>,
    pub created_at: String,
    pub expires_at: String,
    pub revision: i64,
    pub pending_request: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConversationInput {
    pub title: String,
    pub scope: String,
    pub provider_id: String,
    pub model: String,
    pub grant_id: Option<String>,
    pub retention_days: u16,
    pub consent: bool,
}
pub(crate) struct PreparedConversation {
    pub id: String,
    pub request_id: String,
    pub hash: String,
    pub revision: i64,
    pub message: String,
    pub history: Vec<Value>,
    pub replay: Option<Value>,
}
pub(crate) fn initialize(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS continuity_threads(id TEXT PRIMARY KEY,title TEXT NOT NULL,scope TEXT NOT NULL,provider_id TEXT NOT NULL,destination TEXT NOT NULL,model TEXT NOT NULL,grant_id TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revision INTEGER NOT NULL,pending_request TEXT);
    CREATE TABLE IF NOT EXISTS continuity_turns(thread_id TEXT NOT NULL REFERENCES continuity_threads(id) ON DELETE CASCADE,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,user_text TEXT NOT NULL,assistant_text TEXT NOT NULL,receipt_id TEXT,interaction_id TEXT NOT NULL,created_at TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(thread_id,request_id),UNIQUE(thread_id,position));")?;
    Ok(())
}
impl Vault {
    pub(crate) fn prune_conversations(&self) -> Result<()> {
        self.db.execute(
            "DELETE FROM continuity_threads WHERE expires_at<=?1",
            [now()],
        )?;
        Ok(())
    }
    pub(crate) fn conversations(&self) -> Result<Vec<Conversation>> {
        self.prune_conversations()?;
        let mut stmt=self.db.prepare("SELECT id,title,scope,provider_id,destination,model,grant_id,created_at,expires_at,revision,pending_request FROM continuity_threads ORDER BY created_at DESC,id")?;
        let result = Ok(stmt
            .query_map([], |r| {
                Ok(Conversation {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    scope: r.get(2)?,
                    provider_id: r.get(3)?,
                    destination: r.get(4)?,
                    model: r.get(5)?,
                    grant_id: r.get(6)?,
                    created_at: r.get(7)?,
                    expires_at: r.get(8)?,
                    revision: r.get(9)?,
                    pending_request: r.get(10)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?);
        result
    }
    pub(crate) fn conversation(&self, id: &str) -> Result<Conversation> {
        self.conversations()?
            .into_iter()
            .find(|c| c.id == id)
            .context("Conversation is missing or expired")
    }
    pub(crate) fn create_conversation(
        &mut self,
        input: ConversationInput,
        destination: &str,
    ) -> Result<Conversation> {
        if !input.consent {
            bail!("Conversation storage requires explicit opt-in");
        }
        if !(1..=30).contains(&input.retention_days) {
            bail!("Conversation retention must be 1–30 days");
        }
        if self.conversations()?.len() >= 64 {
            bail!("Delete an existing conversation before storing more than 64");
        }
        if let Some(grant) = &input.grant_id {
            self.context(grant, destination, None)?;
        }
        let title = label(&input.title)?;
        let scope = label(&input.scope)?;
        let model = label(&input.model)?;
        let id = Uuid::new_v4().to_string();
        let created = now();
        let expires = (Utc::now() + Duration::days(input.retention_days.into())).to_rfc3339();
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO continuity_threads VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,0,NULL)",
            params![
                id,
                title,
                scope,
                input.provider_id,
                destination,
                model,
                input.grant_id,
                created,
                expires
            ],
        )?;
        audit_on(
            &tx,
            "conversation_created",
            &AuditDetails {
                entity_id: Some(id.clone()),
                retention_days: Some(input.retention_days),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        self.conversation(&id)
    }
    pub(crate) fn conversation_messages(&self, id: &str) -> Result<Value> {
        let conversation = self.conversation(id)?;
        let mut stmt=self.db.prepare("SELECT request_id,user_text,assistant_text,receipt_id,interaction_id,created_at,position FROM continuity_turns WHERE thread_id=?1 ORDER BY position")?;
        let turns=stmt.query_map([id],|r|Ok(json!({"request_id":r.get::<_,String>(0)?,"human_statement":r.get::<_,String>(1)?,"model_suggestion":r.get::<_,String>(2)?,"receipt_id":r.get::<_,Option<String>>(3)?,"interaction_id":r.get::<_,String>(4)?,"created_at":r.get::<_,String>(5)?,"position":r.get::<_,i64>(6)?})))?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(
            json!({"conversation":conversation,"turns":turns,"selection":"Last complete exchanges in chronological order, at most 10 pairs and 40000 UTF-8 bytes"}),
        )
    }
    pub(crate) fn delete_conversation(&mut self, id: &str) -> Result<bool> {
        let tx = self.db.transaction()?;
        let found = tx.execute("DELETE FROM continuity_threads WHERE id=?1", [id])? > 0;
        if found {
            audit_on(
                &tx,
                "conversation_deleted",
                &AuditDetails {
                    entity_id: Some(id.into()),
                    ..Default::default()
                },
            )?;
        }
        tx.commit()?;
        Ok(found)
    }
    pub(crate) fn clear_conversation_attempt(
        &self,
        id: &str,
        expected_request: &str,
    ) -> Result<()> {
        if self.db.execute("UPDATE continuity_threads SET pending_request=NULL,revision=revision+1 WHERE id=?1 AND pending_request=?2",params![id,expected_request])?!=1 {bail!("Pending request changed; reload the conversation");}
        Ok(())
    }
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn prepare_conversation(
        &mut self,
        id: &str,
        request_id: &str,
        revision: i64,
        provider_id: &str,
        destination: &str,
        model: &str,
        grant: Option<&str>,
        message: &str,
    ) -> Result<PreparedConversation> {
        Uuid::parse_str(request_id).context("A fresh request UUID is required")?;
        if message.trim().is_empty() || message.len() > 60_000 {
            bail!("Saved conversation messages must contain 1–60000 UTF-8 bytes");
        }
        let conversation = self.conversation(id)?;
        if conversation.provider_id != provider_id
            || conversation.destination != destination
            || conversation.model != model
            || conversation.grant_id.as_deref() != grant
        {
            bail!("This conversation authorizes a different provider, model or permission; start a separate conversation");
        }
        // Authorisation precedes both replay lookup and deterministic selection.
        if let Some(grant) = grant {
            self.context(grant, destination, None)?;
        }
        let hash = hex::encode(Sha256::digest(message.as_bytes()));
        let previous:Option<(String,String,Option<String>,String)>=self.db.query_row("SELECT request_hash,assistant_text,receipt_id,interaction_id FROM continuity_turns WHERE thread_id=?1 AND request_id=?2",params![id,request_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
        let replay = if let Some((old_hash, reply, receipt, interaction)) = previous {
            if old_hash != hash {
                bail!("Request UUID was already used for different content");
            }
            Some(
                json!({"reply":reply,"receipt_id":receipt,"interaction_id":interaction,"provider_id":provider_id,"model":model,"replayed":true,"conversation_id":id,"conversation_revision":conversation.revision,"stored":true}),
            )
        } else {
            None
        };
        let mut prepared = PreparedConversation {
            id: id.into(),
            request_id: request_id.into(),
            hash,
            revision,
            message: message.into(),
            history: vec![],
            replay,
        };
        if prepared.replay.is_some() {
            return Ok(prepared);
        }
        if conversation.pending_request.is_some() {
            bail!("A previous request is pending or uncertain. Inspect History before clearing that attempt");
        }
        if conversation.revision != revision {
            bail!("Conversation changed; reload before sending");
        }
        if revision >= 100 {
            bail!("A conversation retains at most 100 exchanges; start a new scoped conversation");
        }
        let mut stmt=self.db.prepare("SELECT user_text,assistant_text FROM continuity_turns WHERE thread_id=?1 ORDER BY position DESC LIMIT 10")?;
        let rows = stmt.query_map([id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        let mut budget = 40_000usize;
        let mut pairs = vec![];
        for row in rows {
            let (user, assistant) = row?;
            let size = user.len() + assistant.len();
            if size > budget {
                break;
            }
            budget -= size;
            pairs.push((user, assistant));
        }
        for (user, assistant) in pairs.into_iter().rev() {
            prepared.history.push(json!({"role":"user","content":user}));
            prepared
                .history
                .push(json!({"role":"assistant","content":assistant}));
        }
        self.db.execute("UPDATE continuity_threads SET pending_request=?1 WHERE id=?2 AND revision=?3 AND pending_request IS NULL",params![request_id,id,revision])?;
        Ok(prepared)
    }
    pub(crate) fn finish_conversation(
        &mut self,
        prepared: &PreparedConversation,
        reply: &str,
        receipt: Option<&str>,
        interaction: &str,
    ) -> Result<bool> {
        if reply.len() > 100_000 {
            bail!("Provider answered, but the reply exceeds the saved-conversation limit. Inspect History before retrying");
        }
        let Ok(conversation) = self.conversation(&prepared.id) else {
            return Ok(false);
        };
        if conversation.pending_request.as_deref() != Some(&prepared.request_id)
            || conversation.revision != prepared.revision
        {
            return Ok(false);
        }
        if DateTime::parse_from_rfc3339(&conversation.expires_at)? <= Utc::now() {
            return Ok(false);
        }
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO continuity_turns VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                prepared.id,
                prepared.request_id,
                prepared.hash,
                prepared.message,
                reply,
                receipt,
                interaction,
                now(),
                prepared.revision + 1
            ],
        )?;
        tx.execute(
            "UPDATE continuity_threads SET pending_request=NULL,revision=revision+1 WHERE id=?1",
            [&prepared.id],
        )?;
        audit_on(
            &tx,
            "conversation_saved",
            &AuditDetails {
                entity_id: Some(prepared.id.clone()),
                ..Default::default()
            },
        )?;
        tx.commit()?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deterministic_bounds_and_deleted_or_uncertain_turns_never_resurrect() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::open(&dir.path().join("vault.db"), &[58; 32]).unwrap();
        let make = || ConversationInput {
            title: "Synthetic".into(),
            scope: "Only this project".into(),
            provider_id: "p".into(),
            model: "m".into(),
            grant_id: None,
            retention_days: 1,
            consent: true,
        };
        let c = vault
            .create_conversation(make(), "https://example.test/v1")
            .unwrap();
        for revision in 0..12 {
            let prepared = vault
                .prepare_conversation(
                    &c.id,
                    &Uuid::new_v4().to_string(),
                    revision,
                    "p",
                    "https://example.test/v1",
                    "m",
                    None,
                    &format!("Human {revision}"),
                )
                .unwrap();
            assert_eq!(
                prepared.history.len(),
                usize::min(revision as usize, 10) * 2
            );
            if revision == 11 {
                assert_eq!(prepared.history[0]["content"], "Human 1");
            }
            vault
                .finish_conversation(&prepared, &format!("Model {revision}"), None, "fixture")
                .unwrap();
        }
        let pending = vault
            .prepare_conversation(
                &c.id,
                &Uuid::new_v4().to_string(),
                12,
                "p",
                "https://example.test/v1",
                "m",
                None,
                "Pending",
            )
            .unwrap();
        assert!(vault
            .prepare_conversation(
                &c.id,
                &Uuid::new_v4().to_string(),
                12,
                "p",
                "https://example.test/v1",
                "m",
                None,
                "Concurrent"
            )
            .is_err());
        vault
            .clear_conversation_attempt(&c.id, &pending.request_id)
            .unwrap();
        assert!(!vault
            .finish_conversation(&pending, "Late reply", None, "fixture")
            .unwrap());
        let pending = vault
            .prepare_conversation(
                &c.id,
                &Uuid::new_v4().to_string(),
                13,
                "p",
                "https://example.test/v1",
                "m",
                None,
                "Pending",
            )
            .unwrap();
        vault.delete_conversation(&c.id).unwrap();
        assert!(!vault
            .finish_conversation(&pending, "Late reply", None, "fixture")
            .unwrap());
        let c = vault
            .create_conversation(make(), "https://example.test/v1")
            .unwrap();
        let pending = vault
            .prepare_conversation(
                &c.id,
                &Uuid::new_v4().to_string(),
                0,
                "p",
                "https://example.test/v1",
                "m",
                None,
                "Pending",
            )
            .unwrap();
        vault
            .db
            .execute(
                "UPDATE continuity_threads SET expires_at='2000-01-01T00:00:00+00:00'",
                [],
            )
            .unwrap();
        assert!(!vault
            .finish_conversation(&pending, "Expired reply", None, "fixture")
            .unwrap());
        assert!(vault.conversations().unwrap().is_empty());
    }
}
