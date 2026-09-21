//! Local encrypted operational metadata. This ledger is independent of the DP
//! observations, released reports, and privacy budget. No API accepts a prompt,
//! response body, credential, or arbitrary log message.
use crate::{
    config::normalize_base,
    vault::{Memory, Vault},
};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct TokenRates {
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cached_input_per_million: Option<f64>,
    pub cache_write_input_per_million: Option<f64>,
    pub currency: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct InteractionStart {
    pub id: String,
    pub provider_id: String,
    pub provider_name: String,
    pub model: String,
    pub destination: String,
    pub operation: String,
    pub protocol: String,
    pub streaming: bool,
    pub grant_id: Option<String>,
    pub receipt_id: Option<String>,
    pub request_bytes: u64,
    pub context_bytes: u64,
    pub source_bytes_baseline: Option<u64>,
    pub estimated_context_tokens: Option<u64>,
    pub estimated_source_tokens: Option<u64>,
    pub started_at: Option<String>,
    pub rate_snapshot: Option<TokenRates>,
}
impl Default for InteractionStart {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            provider_id: String::new(),
            provider_name: String::new(),
            model: String::new(),
            destination: String::new(),
            operation: String::new(),
            protocol: String::new(),
            streaming: false,
            grant_id: None,
            receipt_id: None,
            request_bytes: 0,
            context_bytes: 0,
            source_bytes_baseline: None,
            estimated_context_tokens: None,
            estimated_source_tokens: None,
            started_at: None,
            rate_snapshot: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct InteractionFinish {
    pub status: String,
    pub http_status: Option<u16>,
    pub header_latency_ms: Option<u64>,
    pub total_latency_ms: Option<u64>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub response_bytes: u64,
    pub error_code: Option<String>,
    pub finished_at: Option<String>,
}
impl Default for InteractionFinish {
    fn default() -> Self {
        Self {
            status: "failed".into(),
            http_status: None,
            header_latency_ms: None,
            total_latency_ms: None,
            input_tokens: None,
            output_tokens: None,
            cached_tokens: None,
            cache_write_tokens: None,
            total_tokens: None,
            response_bytes: 0,
            error_code: None,
            finished_at: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct InteractionRecord {
    pub id: String,
    pub provider_id: String,
    pub provider_name: String,
    pub model: String,
    pub destination: String,
    pub operation: String,
    pub protocol: String,
    pub streaming: bool,
    pub grant_id: Option<String>,
    pub receipt_id: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub http_status: Option<u16>,
    pub header_latency_ms: Option<u64>,
    pub total_latency_ms: Option<u64>,
    pub request_bytes: u64,
    pub response_bytes: u64,
    pub context_bytes: u64,
    pub source_bytes_baseline: Option<u64>,
    pub estimated_context_tokens: Option<u64>,
    pub estimated_source_tokens: Option<u64>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub error_code: Option<String>,
    pub rate_snapshot: Option<TokenRates>,
    pub estimated_cost: Option<f64>,
    pub cost_currency: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct HistoryQuery {
    pub provider_id: Option<String>,
    pub status: Option<String>,
    pub model: Option<String>,
    pub search: Option<String>,
    pub period: Option<String>,
    pub limit: Option<u32>,
    pub offset: u64,
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct AuditQuery {
    pub provider_id: Option<String>,
    pub action: Option<String>,
    pub level: Option<String>,
    pub search: Option<String>,
    pub period: Option<String>,
    pub limit: Option<u32>,
    pub offset: u64,
}
#[derive(Debug, Serialize)]
pub(crate) struct JournalPage<T> {
    pub items: Vec<T>,
    pub total: u64,
    pub limit: u32,
    pub offset: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct AuditDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_days: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct AuditRecord {
    pub id: String,
    pub created_at: String,
    pub action: String,
    pub level: String,
    pub details: AuditDetails,
}
#[derive(Clone, Debug, Default, Serialize)]
pub(crate) struct TokenObservations {
    pub input: u64,
    pub output: u64,
    pub cached: u64,
    pub cache_write: u64,
    pub total: u64,
}
#[derive(Clone, Debug, Default, Serialize)]
pub(crate) struct UsageTotals {
    pub interactions: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub aborted: u64,
    pub pending: u64,
    pub streaming: u64,
    pub request_bytes: u64,
    pub response_bytes: u64,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub token_observations: TokenObservations,
    pub estimated_cost: Option<f64>,
    pub cost_currency: Option<String>,
    pub priced_interactions: u64,
}
#[derive(Debug, Serialize)]
pub(crate) struct ModelUsage {
    pub provider_id: String,
    pub provider_name: String,
    pub model: String,
    pub totals: UsageTotals,
}
#[derive(Debug, Default, Serialize)]
pub(crate) struct ContextComparison {
    pub interactions: u64,
    pub context_bytes: u64,
    pub source_bytes_baseline: u64,
    pub byte_reduction: i128,
    pub reduction_percent: Option<f64>,
    pub measurement: String,
}
#[derive(Debug, Serialize)]
pub(crate) struct UsageSummary {
    pub period: String,
    pub from: Option<String>,
    pub until: String,
    pub totals: UsageTotals,
    pub models: Vec<ModelUsage>,
    pub context_comparison: ContextComparison,
    pub token_estimation: String,
    pub cost_basis: String,
}
#[derive(Debug, Default, Serialize)]
pub(crate) struct RetentionResult {
    pub interactions_deleted: usize,
    pub audit_events_deleted: usize,
    pub retention_days: u16,
}

pub(crate) fn initialize(db: &Connection) -> Result<()> {
    db.execute_batch("BEGIN;
        CREATE TABLE IF NOT EXISTS journal_interactions(
            id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, provider_name TEXT NOT NULL,
            model TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, record TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS journal_interactions_time ON journal_interactions(started_at DESC,id DESC);
        CREATE INDEX IF NOT EXISTS journal_interactions_provider ON journal_interactions(provider_id,started_at DESC);
        CREATE INDEX IF NOT EXISTS journal_interactions_status ON journal_interactions(status,started_at DESC);
        CREATE TABLE IF NOT EXISTS journal_audit(
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, action TEXT NOT NULL, level TEXT NOT NULL,
            provider_id TEXT, model TEXT, entity_id TEXT, record TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS journal_audit_time ON journal_audit(created_at DESC,id DESC);
        INSERT INTO settings(key,value) VALUES('journal.schema_version','1') ON CONFLICT(key) DO NOTHING;
        COMMIT;")?;
    Ok(())
}

pub(crate) fn estimate_tokens(bytes: u64) -> u64 {
    bytes.div_ceil(4)
}

fn timestamp(value: Option<&str>) -> Result<String> {
    let time = match value {
        Some(value) => DateTime::parse_from_rfc3339(value)?.with_timezone(&Utc),
        None => Utc::now(),
    };
    Ok(time.to_rfc3339_opts(SecondsFormat::Millis, true))
}
fn bounded_metadata(value: &str, max: usize, name: &str) -> Result<()> {
    if value.trim().is_empty() || value.len() > max || value.chars().any(char::is_control) {
        bail!("Invalid {name} metadata");
    }
    Ok(())
}
fn identifier(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
    {
        bail!("Invalid metadata identifier");
    }
    Ok(())
}
fn metric(value: Option<u64>) -> Result<()> {
    if value.is_some_and(|value| value > i64::MAX as u64) {
        bail!("Metric exceeds the supported range");
    }
    Ok(())
}
fn sanitize_error(value: &str) -> String {
    match value {
        "provider_timeout"
        | "provider_unavailable"
        | "provider_http_error"
        | "invalid_response"
        | "response_too_large"
        | "stream_interrupted"
        | "stream_timeout"
        | "upstream_stream_error"
        | "upstream_stream_incomplete"
        | "client_disconnected"
        | "process_restarted"
        | "permission_denied"
        | "no_text_content"
        | "invalid_request"
        | "extractor_unavailable"
        | "extractor_invalid_output"
        | "storage_failure"
        | "unknown_error" => value.into(),
        _ => "unknown_error".into(),
    }
}
fn valid_status(status: &str) -> bool {
    matches!(
        status,
        "pending" | "streaming" | "succeeded" | "failed" | "aborted"
    )
}
fn terminal(status: &str) -> bool {
    matches!(status, "succeeded" | "failed" | "aborted")
}
fn valid_action(action: &str) -> bool {
    matches!(
        action,
        "memory_created"
            | "memory_updated"
            | "memory_deleted"
            | "source_deleted"
            | "grant_created"
            | "grant_revoked"
            | "capture_saved"
            | "analytics_consent_changed"
            | "analytics_report_prepared"
            | "analytics_report_sent"
            | "provider_created"
            | "provider_updated"
            | "provider_deleted"
            | "provider_probed"
            | "provider_models_refreshed"
            | "settings_updated"
            | "history_cleared"
            | "history_pruned"
            | "stream_aborted"
            | "access_denied"
            | "core_started"
    )
}
fn period_start(period: &str, until: DateTime<Utc>) -> Result<Option<String>> {
    let days = match period {
        "24h" => 1,
        "7d" => 7,
        "30d" => 30,
        "all" => return Ok(None),
        _ => bail!("Period must be 24h, 7d, 30d, or all"),
    };
    Ok(Some(
        (until - Duration::days(days)).to_rfc3339_opts(SecondsFormat::Millis, true),
    ))
}
fn pagination(limit: Option<u32>, offset: u64) -> Result<u32> {
    let limit = limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || offset > i64::MAX as u64 {
        bail!("Pagination requires limit 1–100 and a valid offset");
    }
    Ok(limit)
}
fn validate_rates(rates: &TokenRates) -> Result<()> {
    if rates.currency != "USD" {
        bail!("Manual token rates currently require USD");
    }
    for value in [
        Some(rates.input_per_million),
        Some(rates.output_per_million),
        rates.cached_input_per_million,
        rates.cache_write_input_per_million,
    ]
    .into_iter()
    .flatten()
    {
        if !value.is_finite() || value < 0. {
            bail!("Manual token rates must be finite and non-negative");
        }
    }
    Ok(())
}

fn estimated_cost(record: &InteractionRecord) -> Option<f64> {
    let rates = record.rate_snapshot.as_ref()?;
    let input = record.input_tokens?;
    let output = record.output_tokens?;
    // Missing cache counts are unknown, not zero. A known protocol may report
    // explicit zero for an inapplicable charge; an unknown provider may not.
    let cached = record.cached_tokens?;
    let written = record.cache_write_tokens?;
    let uncached = input.checked_sub(cached.checked_add(written)?)?;
    let cache_cost = if cached == 0 {
        0.
    } else {
        cached as f64 * rates.cached_input_per_million?
    };
    let write_cost = if written == 0 {
        0.
    } else {
        written as f64 * rates.cache_write_input_per_million?
    };
    let cost = (uncached as f64 * rates.input_per_million
        + output as f64 * rates.output_per_million
        + cache_cost
        + write_cost)
        / 1_000_000.;
    cost.is_finite().then_some(cost)
}

pub(crate) fn audit_on(db: &Connection, action: &str, details: &AuditDetails) -> Result<()> {
    if !valid_action(action) {
        bail!("Audit action is not allowlisted");
    }
    let mut details = details.clone();
    for value in [&details.provider_id, &details.entity_id]
        .into_iter()
        .flatten()
    {
        identifier(value)?;
    }
    if let Some(model) = &details.model {
        bounded_metadata(model, 200, "audit model")?;
    }
    if details
        .retention_days
        .is_some_and(|days| !(1..=365).contains(&days))
    {
        bail!("History retention must be 1–365 days");
    }
    if details
        .http_status
        .is_some_and(|value| !(100..=599).contains(&value))
    {
        bail!("Invalid audit HTTP status");
    }
    metric(details.count)?;
    details.error_code = details.error_code.as_deref().map(sanitize_error);
    let level = if details.error_code.is_some()
        || details.http_status.is_some_and(|status| status >= 400)
    {
        "error"
    } else if matches!(action, "access_denied" | "stream_aborted") {
        "warning"
    } else {
        "info"
    };
    let record = AuditRecord {
        id: Uuid::new_v4().to_string(),
        created_at: timestamp(None)?,
        action: action.into(),
        level: level.into(),
        details,
    };
    db.execute("INSERT INTO journal_audit(id,created_at,action,level,provider_id,model,entity_id,record) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![record.id,record.created_at,record.action,record.level,record.details.provider_id,record.details.model,record.details.entity_id,serde_json::to_string(&record)?])?;
    Ok(())
}

impl Vault {
    pub fn initialize_runtime_journal(&self) -> Result<()> {
        let recovered = self.journal_recover_interrupted()?;
        self.journal_audit(
            "core_started",
            &AuditDetails {
                count: Some(recovered as u64),
                ..Default::default()
            },
        )
    }
    fn journal_preferences(&self) -> Result<(bool, u16)> {
        let settings: Option<String> = self
            .db
            .query_row(
                "SELECT value FROM settings WHERE key='admin.settings'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let value: serde_json::Value = settings
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or_default();
        let enabled = value
            .get("history_enabled")
            .map(|v| v.as_bool().context("Invalid history enabled setting"))
            .transpose()?
            .unwrap_or(true);
        let days = value
            .get("history_retention_days")
            .map(|v| v.as_u64().context("Invalid history retention setting"))
            .transpose()?
            .unwrap_or(30);
        if !(1..=365).contains(&days) {
            bail!("History retention must be 1–365 days");
        }
        Ok((enabled, days as u16))
    }

    pub(crate) fn journal_start(&self, start: &InteractionStart) -> Result<bool> {
        self.journal_prune()?;
        if !self.journal_preferences()?.0 {
            return Ok(false);
        }
        for value in [&start.id, &start.provider_id] {
            identifier(value)?;
        }
        for value in [&start.grant_id, &start.receipt_id].into_iter().flatten() {
            identifier(value)?;
        }
        bounded_metadata(&start.provider_name, 200, "provider name")?;
        bounded_metadata(&start.model, 200, "model")?;
        bounded_metadata(&start.destination, 2048, "destination")?;
        let destination = normalize_base(&start.destination)?;
        if !matches!(start.operation.as_str(), "chat" | "gateway" | "capture") {
            bail!("Unknown journal operation");
        }
        if !matches!(start.protocol.as_str(), "openai" | "anthropic" | "local") {
            bail!("Unknown journal protocol");
        }
        for value in [
            Some(start.request_bytes),
            Some(start.context_bytes),
            start.source_bytes_baseline,
            start.estimated_context_tokens,
            start.estimated_source_tokens,
        ] {
            metric(value)?;
        }
        if start.context_bytes > start.request_bytes {
            bail!("Context bytes cannot exceed request payload bytes");
        }
        let context_tokens = estimate_tokens(start.context_bytes);
        let source_tokens = start.source_bytes_baseline.map(estimate_tokens);
        if start
            .estimated_context_tokens
            .is_some_and(|value| value != context_tokens)
            || start
                .estimated_source_tokens
                .is_some_and(|value| Some(value) != source_tokens)
        {
            bail!("Context token estimates must use ceil(UTF8 bytes / 4)");
        }
        if let Some(rates) = &start.rate_snapshot {
            validate_rates(rates)?;
        }
        let record = InteractionRecord {
            id: start.id.clone(),
            provider_id: start.provider_id.clone(),
            provider_name: start.provider_name.clone(),
            model: start.model.clone(),
            destination,
            operation: start.operation.clone(),
            protocol: start.protocol.clone(),
            streaming: start.streaming,
            grant_id: start.grant_id.clone(),
            receipt_id: start.receipt_id.clone(),
            started_at: timestamp(start.started_at.as_deref())?,
            finished_at: None,
            status: "pending".into(),
            http_status: None,
            header_latency_ms: None,
            total_latency_ms: None,
            request_bytes: start.request_bytes,
            response_bytes: 0,
            context_bytes: start.context_bytes,
            source_bytes_baseline: start.source_bytes_baseline,
            estimated_context_tokens: Some(context_tokens),
            estimated_source_tokens: source_tokens,
            input_tokens: None,
            output_tokens: None,
            cached_tokens: None,
            cache_write_tokens: None,
            total_tokens: None,
            error_code: None,
            rate_snapshot: start.rate_snapshot.clone(),
            estimated_cost: None,
            cost_currency: None,
        };
        self.db.execute("INSERT INTO journal_interactions(id,provider_id,provider_name,model,status,started_at,record) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![record.id,record.provider_id,record.provider_name,record.model,record.status,record.started_at,serde_json::to_string(&record)?])?;
        Ok(true)
    }

    pub(crate) fn journal_finish(&self, id: &str, finish: &InteractionFinish) -> Result<bool> {
        if !matches!(
            finish.status.as_str(),
            "streaming" | "succeeded" | "failed" | "aborted"
        ) {
            bail!("Unknown interaction completion status");
        }
        if finish
            .http_status
            .is_some_and(|value| !(100..=599).contains(&value))
        {
            bail!("Invalid provider HTTP status");
        }
        for value in [
            finish.header_latency_ms,
            finish.total_latency_ms,
            finish.input_tokens,
            finish.output_tokens,
            finish.cached_tokens,
            finish.cache_write_tokens,
            finish.total_tokens,
            Some(finish.response_bytes),
        ] {
            metric(value)?;
        }
        let previous: Option<String> = self
            .db
            .query_row(
                "SELECT record FROM journal_interactions WHERE id=?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(previous) = previous else {
            return Ok(false);
        };
        let mut record: InteractionRecord = serde_json::from_str(&previous)?;
        // Completion is immutable. A dropped stream guard must not overwrite a
        // successfully completed response, nor recreate cleared history.
        if terminal(&record.status) {
            return Ok(false);
        }
        if finish.response_bytes < record.response_bytes {
            bail!("Response byte counts cannot decrease");
        }
        if finish.status == "streaming" && !record.streaming {
            bail!("Only a streaming request can enter streaming status");
        }
        record.status = finish.status.clone();
        record.http_status = finish.http_status.or(record.http_status);
        record.header_latency_ms = finish.header_latency_ms.or(record.header_latency_ms);
        record.total_latency_ms = finish.total_latency_ms.or(record.total_latency_ms);
        if let (Some(headers), Some(total)) = (record.header_latency_ms, record.total_latency_ms) {
            if total < headers {
                bail!("Total latency cannot precede response headers");
            }
        }
        record.input_tokens = finish.input_tokens.or(record.input_tokens);
        record.output_tokens = finish.output_tokens.or(record.output_tokens);
        record.cached_tokens = finish.cached_tokens.or(record.cached_tokens);
        record.cache_write_tokens = finish.cache_write_tokens.or(record.cache_write_tokens);
        record.total_tokens = finish.total_tokens.or(record.total_tokens);
        record.response_bytes = finish.response_bytes;
        record.error_code = finish
            .error_code
            .as_deref()
            .map(sanitize_error)
            .or(record.error_code);
        if terminal(&record.status) {
            record.finished_at = Some(timestamp(finish.finished_at.as_deref())?);
        }
        record.estimated_cost = estimated_cost(&record);
        record.cost_currency = record.estimated_cost.map(|_| "USD".into());
        Ok(self.db.execute(
            "UPDATE journal_interactions SET status=?1,record=?2 WHERE id=?3 AND record=?4",
            params![record.status, serde_json::to_string(&record)?, id, previous],
        )? == 1)
    }

    pub(crate) fn journal_entry(&self, id: &str) -> Result<Option<InteractionRecord>> {
        self.journal_prune()?;
        let data: Option<String> = self
            .db
            .query_row(
                "SELECT record FROM journal_interactions WHERE id=?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        data.map(|record| serde_json::from_str(&record).map_err(Into::into))
            .transpose()
    }

    pub(crate) fn journal_history(
        &self,
        query: &HistoryQuery,
    ) -> Result<JournalPage<InteractionRecord>> {
        self.journal_prune()?;
        let limit = pagination(query.limit, query.offset)?;
        if query
            .status
            .as_deref()
            .is_some_and(|status| !valid_status(status))
        {
            bail!("Unknown history status");
        }
        if query
            .search
            .as_ref()
            .is_some_and(|search| search.len() > 200)
        {
            bail!("History search must not exceed 200 bytes");
        }
        let from = period_start(query.period.as_deref().unwrap_or("all"), Utc::now())?;
        let filter = " WHERE (?1 IS NULL OR provider_id=?1) AND (?2 IS NULL OR status=?2) AND (?3 IS NULL OR model=?3) AND (?4 IS NULL OR started_at>=?4) AND (?5 IS NULL OR instr(lower(provider_id||' '||provider_name||' '||model||' '||status),lower(?5))>0)";
        let total: i64 = self.db.query_row(
            &format!("SELECT count(*) FROM journal_interactions{filter}"),
            params![
                query.provider_id,
                query.status,
                query.model,
                from,
                query.search
            ],
            |row| row.get(0),
        )?;
        let mut statement = self.db.prepare(&format!("SELECT record FROM journal_interactions{filter} ORDER BY started_at DESC,id DESC LIMIT ?6 OFFSET ?7"))?;
        let rows = statement.query_map(
            params![
                query.provider_id,
                query.status,
                query.model,
                from,
                query.search,
                limit,
                query.offset as i64
            ],
            |row| row.get::<_, String>(0),
        )?;
        let items = rows
            .map(|row| Ok(serde_json::from_str(&row?)?))
            .collect::<Result<Vec<_>>>()?;
        Ok(JournalPage {
            items,
            total: total.try_into()?,
            limit,
            offset: query.offset,
        })
    }

    pub(crate) fn journal_source_bytes(&self, memories: &[Memory]) -> Result<u64> {
        let mut seen = HashSet::new();
        let mut total = 0u64;
        for memory in memories {
            if seen.insert(&memory.source_id) {
                let bytes: i64 = self.db.query_row(
                    "SELECT length(CAST(content AS BLOB)) FROM sources WHERE id=?1",
                    [&memory.source_id],
                    |row| row.get(0),
                )?;
                total = total
                    .checked_add(bytes.try_into()?)
                    .context("Source byte total overflow")?;
            }
        }
        Ok(total)
    }

    pub(crate) fn journal_audit(&self, action: &str, details: &AuditDetails) -> Result<()> {
        audit_on(&self.db, action, details)
    }

    pub(crate) fn journal_logs(&self, query: &AuditQuery) -> Result<JournalPage<AuditRecord>> {
        self.journal_prune()?;
        let limit = pagination(query.limit, query.offset)?;
        if query
            .action
            .as_deref()
            .is_some_and(|action| !valid_action(action))
        {
            bail!("Unknown audit action");
        }
        if query
            .level
            .as_deref()
            .is_some_and(|level| !matches!(level, "info" | "warning" | "error"))
        {
            bail!("Unknown audit level");
        }
        if query
            .search
            .as_ref()
            .is_some_and(|search| search.len() > 200)
        {
            bail!("Audit search must not exceed 200 bytes");
        }
        let from = period_start(query.period.as_deref().unwrap_or("all"), Utc::now())?;
        let filter = " WHERE (?1 IS NULL OR provider_id=?1) AND (?2 IS NULL OR action=?2) AND (?3 IS NULL OR level=?3) AND (?4 IS NULL OR created_at>=?4) AND (?5 IS NULL OR instr(lower(action||' '||COALESCE(provider_id,'')||' '||COALESCE(model,'')||' '||COALESCE(entity_id,'')),lower(?5))>0)";
        let total: i64 = self.db.query_row(
            &format!("SELECT count(*) FROM journal_audit{filter}"),
            params![
                query.provider_id,
                query.action,
                query.level,
                from,
                query.search
            ],
            |row| row.get(0),
        )?;
        let mut statement = self.db.prepare(&format!("SELECT record FROM journal_audit{filter} ORDER BY created_at DESC,id DESC LIMIT ?6 OFFSET ?7"))?;
        let rows = statement.query_map(
            params![
                query.provider_id,
                query.action,
                query.level,
                from,
                query.search,
                limit,
                query.offset as i64
            ],
            |row| row.get::<_, String>(0),
        )?;
        let items = rows
            .map(|row| Ok(serde_json::from_str(&row?)?))
            .collect::<Result<Vec<_>>>()?;
        Ok(JournalPage {
            items,
            total: total.try_into()?,
            limit,
            offset: query.offset,
        })
    }

    pub(crate) fn journal_prune(&self) -> Result<RetentionResult> {
        let (_, retention_days) = self.journal_preferences()?;
        let cutoff = (Utc::now() - Duration::days(retention_days as i64))
            .to_rfc3339_opts(SecondsFormat::Millis, true);
        let interactions_deleted = self.db.execute(
            "DELETE FROM journal_interactions WHERE started_at<?1",
            [&cutoff],
        )?;
        let audit_events_deleted = self
            .db
            .execute("DELETE FROM journal_audit WHERE created_at<?1", [&cutoff])?;
        Ok(RetentionResult {
            interactions_deleted,
            audit_events_deleted,
            retention_days,
        })
    }

    pub(crate) fn journal_delete_history(&mut self) -> Result<usize> {
        let transaction = self.db.transaction()?;
        let removed = transaction.execute("DELETE FROM journal_interactions", [])?;
        let event = AuditRecord {
            id: Uuid::new_v4().to_string(),
            created_at: timestamp(None)?,
            action: "history_cleared".into(),
            level: "info".into(),
            details: AuditDetails {
                count: Some(removed as u64),
                ..Default::default()
            },
        };
        transaction.execute(
            "INSERT INTO journal_audit(id,created_at,action,level,record) VALUES(?1,?2,?3,?4,?5)",
            params![
                event.id,
                event.created_at,
                event.action,
                event.level,
                serde_json::to_string(&event)?
            ],
        )?;
        transaction.commit()?;
        Ok(removed)
    }

    /// Invoke once when starting the core, before accepting new requests.
    pub(crate) fn journal_recover_interrupted(&self) -> Result<usize> {
        self.journal_prune()?;
        let records = {
            let mut statement = self.db.prepare(
                "SELECT record FROM journal_interactions WHERE status IN ('pending','streaming')",
            )?;
            let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
            rows.map(|row| Ok(serde_json::from_str::<InteractionRecord>(&row?)?))
                .collect::<Result<Vec<_>>>()?
        };
        let mut count = 0;
        for record in records {
            count += self.journal_finish(
                &record.id,
                &InteractionFinish {
                    status: "aborted".into(),
                    response_bytes: record.response_bytes,
                    error_code: Some("process_restarted".into()),
                    ..Default::default()
                },
            )? as usize;
        }
        Ok(count)
    }

    pub(crate) fn journal_usage(&self, period: &str) -> Result<UsageSummary> {
        self.journal_prune()?;
        let until = Utc::now();
        let from = period_start(period, until)?;
        let until = until.to_rfc3339_opts(SecondsFormat::Millis, true);
        let mut statement = self.db.prepare("SELECT record FROM journal_interactions WHERE (?1 IS NULL OR started_at>=?1) AND started_at<=?2 ORDER BY started_at,id")?;
        let rows = statement.query_map(params![from, until], |row| row.get::<_, String>(0))?;
        let mut totals = UsageTotals::default();
        let mut models = BTreeMap::<(String, String), ModelUsage>::new();
        let mut comparison = ContextComparison {
            measurement: "selected_context_vs_source_bytes".into(),
            ..Default::default()
        };
        for row in rows {
            let record: InteractionRecord = serde_json::from_str(&row?)?;
            totals.add(&record)?;
            let model = models
                .entry((record.provider_id.clone(), record.model.clone()))
                .or_insert_with(|| ModelUsage {
                    provider_id: record.provider_id.clone(),
                    provider_name: record.provider_name.clone(),
                    model: record.model.clone(),
                    totals: UsageTotals::default(),
                });
            model.totals.add(&record)?;
            // A capture is not an example of contextual compression, and an
            // absent baseline must not turn into a fabricated zero.
            if record.operation != "capture" && record.context_bytes > 0 {
                if let Some(source) = record.source_bytes_baseline {
                    add(&mut comparison.interactions, 1)?;
                    add(&mut comparison.context_bytes, record.context_bytes)?;
                    add(&mut comparison.source_bytes_baseline, source)?;
                }
            }
        }
        comparison.byte_reduction =
            comparison.source_bytes_baseline as i128 - comparison.context_bytes as i128;
        if comparison.source_bytes_baseline > 0 {
            comparison.reduction_percent = Some(
                100. * comparison.byte_reduction as f64 / comparison.source_bytes_baseline as f64,
            );
        }
        Ok(UsageSummary {
            period: period.into(),
            from,
            until,
            totals,
            models: models.into_values().collect(),
            context_comparison: comparison,
            token_estimation: "ceil(UTF8_bytes/4); not provider usage".into(),
            cost_basis: "manual_rate_snapshots; not a bill".into(),
        })
    }
}

fn add(total: &mut u64, value: u64) -> Result<()> {
    *total = total
        .checked_add(value)
        .context("Usage total exceeds the supported range")?;
    Ok(())
}
fn add_observation(total: &mut Option<u64>, count: &mut u64, value: Option<u64>) -> Result<()> {
    if let Some(value) = value {
        let mut sum = total.unwrap_or(0);
        add(&mut sum, value)?;
        *total = Some(sum);
        add(count, 1)?;
    }
    Ok(())
}
impl UsageTotals {
    fn add(&mut self, record: &InteractionRecord) -> Result<()> {
        add(&mut self.interactions, 1)?;
        match record.status.as_str() {
            "succeeded" => add(&mut self.succeeded, 1)?,
            "failed" => add(&mut self.failed, 1)?,
            "aborted" => add(&mut self.aborted, 1)?,
            "pending" => add(&mut self.pending, 1)?,
            "streaming" => add(&mut self.streaming, 1)?,
            _ => bail!("Invalid persisted interaction status"),
        }
        add(&mut self.request_bytes, record.request_bytes)?;
        add(&mut self.response_bytes, record.response_bytes)?;
        add_observation(
            &mut self.input_tokens,
            &mut self.token_observations.input,
            record.input_tokens,
        )?;
        add_observation(
            &mut self.output_tokens,
            &mut self.token_observations.output,
            record.output_tokens,
        )?;
        add_observation(
            &mut self.cached_tokens,
            &mut self.token_observations.cached,
            record.cached_tokens,
        )?;
        add_observation(
            &mut self.cache_write_tokens,
            &mut self.token_observations.cache_write,
            record.cache_write_tokens,
        )?;
        add_observation(
            &mut self.total_tokens,
            &mut self.token_observations.total,
            record.total_tokens,
        )?;
        if let Some(cost) = record.estimated_cost {
            let sum = self.estimated_cost.unwrap_or(0.) + cost;
            if !sum.is_finite() {
                bail!("Estimated cost total exceeds the supported range");
            }
            self.estimated_cost = Some(sum);
            self.cost_currency = Some("USD".into());
            add(&mut self.priced_interactions, 1)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn start(id: &str) -> InteractionStart {
        InteractionStart {
            id: id.into(),
            provider_id: "provider-a".into(),
            provider_name: "Local provider".into(),
            model: "test-model".into(),
            destination: "http://127.0.0.1:11434/v1".into(),
            operation: "chat".into(),
            protocol: "openai".into(),
            request_bytes: 120,
            context_bytes: 13,
            source_bytes_baseline: Some(80),
            ..Default::default()
        }
    }
    fn preferences(vault: &Vault, enabled: bool, days: u16) {
        vault.db.execute("INSERT INTO settings VALUES('admin.settings',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [json!({"history_enabled":enabled,"history_retention_days":days}).to_string()]).unwrap();
    }
    fn rates() -> TokenRates {
        TokenRates {
            input_per_million: 2.,
            output_per_million: 8.,
            cached_input_per_million: Some(0.5),
            cache_write_input_per_million: Some(3.),
            currency: "USD".into(),
        }
    }
    fn finish() -> InteractionFinish {
        InteractionFinish {
            status: "succeeded".into(),
            http_status: Some(200),
            header_latency_ms: Some(30),
            total_latency_ms: Some(80),
            response_bytes: 64,
            ..Default::default()
        }
    }

    #[test]
    fn encrypted_journal_persists_unknown_metrics_without_inventing_usage() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let vault = Vault::open(&path, &[20; 32]).unwrap();
        let mut input = start("event-persistent");
        input.provider_name = "JOURNAL-METADATA-CANARY".into();
        vault.journal_start(&input).unwrap();
        vault.journal_finish(&input.id, &finish()).unwrap();
        let original = vault.journal_entry(&input.id).unwrap().unwrap();
        assert_eq!(original.estimated_context_tokens, Some(4));
        assert_eq!(original.estimated_source_tokens, Some(20));
        assert_eq!(original.total_tokens, None);
        assert_eq!(original.input_tokens, None);
        assert_eq!(original.estimated_cost, None);
        vault
            .db
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .unwrap();
        drop(vault);
        let raw = std::fs::read(&path).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("JOURNAL-METADATA-CANARY"));
        let vault = Vault::open(&path, &[20; 32]).unwrap();
        assert_eq!(vault.journal_entry(&input.id).unwrap().unwrap(), original);
        let summary = vault.journal_usage("24h").unwrap();
        assert_eq!(summary.totals.total_tokens, None);
        assert_eq!(summary.totals.token_observations.total, 0);
        assert_eq!(summary.context_comparison.byte_reduction, 67);
        assert_eq!(
            summary.context_comparison.measurement,
            "selected_context_vs_source_bytes"
        );
        assert_eq!(
            serde_json::to_value(original).unwrap()["input_tokens"],
            serde_json::Value::Null
        );
    }

    #[test]
    fn provider_observations_and_manual_cache_rates_are_separate_from_estimates() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(&directory.path().join("vault.db"), &[21; 32]).unwrap();
        let mut input = start("priced");
        input.rate_snapshot = Some(rates());
        vault.journal_start(&input).unwrap();
        vault
            .journal_finish(
                "priced",
                &InteractionFinish {
                    input_tokens: Some(1000),
                    output_tokens: Some(100),
                    cached_tokens: Some(400),
                    cache_write_tokens: Some(100),
                    total_tokens: Some(1100),
                    ..finish()
                },
            )
            .unwrap();
        let priced = vault.journal_entry("priced").unwrap().unwrap();
        // 500 ordinary + 400 read-cache + 100 write-cache input tokens.
        assert!((priced.estimated_cost.unwrap() - 0.0023).abs() < 1e-12);
        assert_eq!(priced.estimated_context_tokens, Some(4));
        assert_eq!(priced.input_tokens, Some(1000));
        for (id, missing_rate, missing_count) in [
            ("unknown-cache-count", false, true),
            ("unknown-cache-write-price", true, false),
        ] {
            let mut input = start(id);
            let mut manual = rates();
            if missing_rate {
                manual.cache_write_input_per_million = None;
            }
            input.rate_snapshot = Some(manual);
            vault.journal_start(&input).unwrap();
            vault
                .journal_finish(
                    id,
                    &InteractionFinish {
                        input_tokens: Some(1000),
                        output_tokens: Some(100),
                        cached_tokens: Some(400),
                        cache_write_tokens: if missing_count { None } else { Some(100) },
                        total_tokens: Some(1100),
                        ..finish()
                    },
                )
                .unwrap();
            assert!(vault
                .journal_entry(id)
                .unwrap()
                .unwrap()
                .estimated_cost
                .is_none());
        }
        vault.journal_start(&start("unobserved")).unwrap();
        vault.journal_finish("unobserved", &finish()).unwrap();
        let summary = vault.journal_usage("all").unwrap();
        assert_eq!(summary.totals.interactions, 4);
        assert_eq!(summary.totals.input_tokens, Some(3000));
        assert_eq!(summary.totals.token_observations.input, 3);
        assert_eq!(summary.totals.token_observations.cache_write, 2);
        assert_eq!(summary.totals.priced_interactions, 1);
        assert!((summary.totals.estimated_cost.unwrap() - 0.0023).abs() < 1e-12);
    }

    #[test]
    fn history_filters_paginate_deterministically_and_search_literal_metadata() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(&directory.path().join("vault.db"), &[22; 32]).unwrap();
        for index in 0..5 {
            let mut input = start(&format!("event-{index}"));
            input.started_at = Some((Utc::now() - Duration::minutes(index)).to_rfc3339());
            if index == 4 {
                input.provider_id = "provider-b".into();
                input.model = "other-model".into();
            }
            vault.journal_start(&input).unwrap();
            vault.journal_finish(&input.id, &finish()).unwrap();
        }
        let page = vault
            .journal_history(&HistoryQuery {
                provider_id: Some("provider-a".into()),
                status: Some("succeeded".into()),
                model: Some("test-model".into()),
                search: Some("LOCAL".into()),
                period: Some("24h".into()),
                limit: Some(2),
                offset: 1,
            })
            .unwrap();
        assert_eq!(page.total, 4);
        assert_eq!(
            page.items
                .iter()
                .map(|row| row.id.as_str())
                .collect::<Vec<_>>(),
            vec!["event-1", "event-2"]
        );
        let wildcard = vault
            .journal_history(&HistoryQuery {
                search: Some("%".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(wildcard.total, 0);
        assert!(vault
            .journal_history(&HistoryQuery {
                limit: Some(101),
                ..Default::default()
            })
            .is_err());
        assert!(vault
            .journal_history(&HistoryQuery {
                limit: Some(0),
                ..Default::default()
            })
            .is_err());
        assert!(vault
            .journal_history(&HistoryQuery {
                status: Some("anything".into()),
                ..Default::default()
            })
            .is_err());
        assert!(vault.journal_usage("forever").is_err());
    }

    #[test]
    fn audit_allowlist_and_closed_types_exclude_bodies_credentials_and_raw_errors() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(&directory.path().join("vault.db"), &[23; 32]).unwrap();
        let secret = "RAW-ERROR-CONTAINS-PRIVATE-PROMPT-AND-KEY";
        vault
            .journal_audit(
                "provider_probed",
                &AuditDetails {
                    provider_id: Some("provider-a".into()),
                    model: Some("test-model".into()),
                    http_status: Some(401),
                    error_code: Some(secret.into()),
                    ..Default::default()
                },
            )
            .unwrap();
        vault
            .journal_audit("access_denied", &AuditDetails::default())
            .unwrap();
        assert!(vault
            .journal_audit(secret, &AuditDetails::default())
            .is_err());
        assert!(serde_json::from_value::<AuditDetails>(json!({"message":secret})).is_err());
        let mut start_value = serde_json::to_value(start("event-private")).unwrap();
        start_value["prompt"] = json!(secret);
        assert!(serde_json::from_value::<InteractionStart>(start_value).is_err());
        let mut finish_value = serde_json::to_value(finish()).unwrap();
        finish_value["api_key"] = json!(secret);
        assert!(serde_json::from_value::<InteractionFinish>(finish_value).is_err());
        vault.journal_start(&start("event-private")).unwrap();
        vault
            .journal_finish(
                "event-private",
                &InteractionFinish {
                    status: "failed".into(),
                    error_code: Some(secret.into()),
                    ..finish()
                },
            )
            .unwrap();
        let page = vault
            .journal_logs(&AuditQuery {
                level: Some("error".into()),
                provider_id: Some("provider-a".into()),
                search: Some("test-model".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(
            page.items[0].details.error_code.as_deref(),
            Some("unknown_error")
        );
        assert_eq!(
            vault
                .journal_logs(&AuditQuery {
                    level: Some("warning".into()),
                    ..Default::default()
                })
                .unwrap()
                .total,
            1
        );
        let mut statement=vault.db.prepare("SELECT record FROM journal_audit UNION ALL SELECT record FROM journal_interactions").unwrap();
        for row in statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
        {
            assert!(!row.unwrap().contains(secret));
        }
    }

    #[test]
    fn terminal_records_are_immutable_and_restart_recovers_only_incomplete_work() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(&directory.path().join("vault.db"), &[24; 32]).unwrap();
        let mut streaming = start("stream");
        streaming.streaming = true;
        vault.journal_start(&streaming).unwrap();
        vault
            .journal_finish(
                "stream",
                &InteractionFinish {
                    status: "streaming".into(),
                    response_bytes: 12,
                    input_tokens: Some(8),
                    ..Default::default()
                },
            )
            .unwrap();
        assert!(vault
            .journal_finish(
                "stream",
                &InteractionFinish {
                    response_bytes: 4,
                    ..finish()
                }
            )
            .is_err());
        vault.journal_finish("stream", &finish()).unwrap();
        assert!(!vault
            .journal_finish(
                "stream",
                &InteractionFinish {
                    status: "aborted".into(),
                    response_bytes: 64,
                    error_code: Some("client_disconnected".into()),
                    ..Default::default()
                }
            )
            .unwrap());
        assert_eq!(
            vault.journal_entry("stream").unwrap().unwrap().input_tokens,
            Some(8)
        );
        vault.journal_start(&start("pending")).unwrap();
        assert_eq!(vault.journal_recover_interrupted().unwrap(), 1);
        let interrupted = vault.journal_entry("pending").unwrap().unwrap();
        assert_eq!(interrupted.status, "aborted");
        assert_eq!(interrupted.error_code.as_deref(), Some("process_restarted"));
        assert!(interrupted.finished_at.is_some());
        assert_eq!(
            vault.journal_entry("stream").unwrap().unwrap().status,
            "succeeded"
        );
        assert_eq!(vault.journal_recover_interrupted().unwrap(), 0);
    }

    #[test]
    fn retention_and_explicit_clear_never_reset_dp_budget_or_delete_memory() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let mut vault = Vault::open(&path, &[25; 32]).unwrap();
        preferences(&vault, true, 365);
        let memory = vault
            .add_memory(
                "Private source remains in its vault",
                "confirmed",
                "manual",
                &json!({}),
            )
            .unwrap();
        vault.interaction("2026-W01", 2, 3, 4, true).unwrap();
        vault.set_consent(true).unwrap();
        let report = vault.prepare_report("2026-W01", false, true).unwrap();
        let mut old = start("old");
        old.started_at = Some((Utc::now() - Duration::days(40)).to_rfc3339());
        vault.journal_start(&old).unwrap();
        vault.journal_start(&start("recent")).unwrap();
        vault
            .journal_audit("provider_created", &AuditDetails::default())
            .unwrap();
        vault
            .db
            .execute(
                "UPDATE journal_audit SET created_at=?1 WHERE action='provider_created'",
                [(Utc::now() - Duration::days(40)).to_rfc3339()],
            )
            .unwrap();
        preferences(&vault, true, 7);
        let pruned = vault.journal_prune().unwrap();
        assert_eq!(pruned.interactions_deleted, 1);
        assert_eq!(pruned.audit_events_deleted, 1);
        assert_eq!(vault.journal_delete_history().unwrap(), 1);
        assert!(!vault.journal_finish("recent", &finish()).unwrap());
        assert_eq!(vault.memories().unwrap()[0].id, memory.id);
        assert_eq!(vault.interaction_count().unwrap(), 1);
        assert_eq!(
            vault.prepare_report("2026-W01", false, true).unwrap(),
            report
        );
        assert_eq!(vault.analytics_stats(false).unwrap()["budget_used"], 1.);
        assert_eq!(
            vault
                .journal_logs(&AuditQuery {
                    action: Some("history_cleared".into()),
                    ..Default::default()
                })
                .unwrap()
                .total,
            1
        );
        preferences(&vault, false, 7);
        assert!(!vault.journal_start(&start("disabled")).unwrap());
        drop(vault);
        let vault = Vault::open(&path, &[25; 32]).unwrap();
        assert!(!vault.journal_start(&start("still-disabled")).unwrap());
        preferences(&vault, true, 0);
        assert!(vault.journal_prune().is_err());
        preferences(&vault, true, 366);
        assert!(vault.journal_prune().is_err());
    }

    #[test]
    fn schema_upgrade_preserves_existing_encrypted_memory_and_dp_reports() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("vault.db");
        let mut vault = Vault::open(&path, &[26; 32]).unwrap();
        let memory = vault
            .add_memory("A legacy memory", "confirmed", "manual", &json!({}))
            .unwrap();
        vault.set_consent(true).unwrap();
        let report = vault.prepare_report("2026-W01", false, true).unwrap();
        // Remove only the new tables to reconstruct the preceding schema.
        vault.db.execute_batch("DROP TABLE journal_interactions; DROP TABLE journal_audit; DELETE FROM settings WHERE key='journal.schema_version';").unwrap();
        drop(vault);
        let mut vault = Vault::open(&path, &[26; 32]).unwrap();
        assert_eq!(vault.memories().unwrap()[0].id, memory.id);
        assert_eq!(
            vault.prepare_report("2026-W01", false, true).unwrap(),
            report
        );
        assert_eq!(vault.analytics_stats(false).unwrap()["budget_used"], 1.);
        vault.journal_start(&start("after-upgrade")).unwrap();
        assert_eq!(
            vault
                .journal_history(&HistoryQuery::default())
                .unwrap()
                .total,
            1
        );
    }

    #[test]
    fn source_baseline_counts_unique_utf8_sources_and_mutations_audit_no_content() {
        let directory = tempfile::tempdir().unwrap();
        let mut vault = Vault::open(&directory.path().join("vault.db"), &[27; 32]).unwrap();
        let raw = "PRIVATE-SOURCE-CANARY: 🦀é";
        let (source, memories) = vault
            .add_capture(
                raw,
                "manual_capture",
                &json!({}),
                vec!["First fact".into(), "Second fact".into()],
            )
            .unwrap();
        assert_eq!(
            vault.journal_source_bytes(&memories).unwrap(),
            raw.len() as u64
        );
        vault
            .update_memory(&memories[0].id, None, Some("confirmed"))
            .unwrap();
        let grant = vault
            .create_grant(
                "https://provider.example/v1",
                vec![memories[0].id.clone()],
                60,
            )
            .unwrap();
        vault.revoke(&grant.id).unwrap();
        vault.delete_source(&source).unwrap();
        let events = vault.journal_logs(&AuditQuery::default()).unwrap();
        assert_eq!(events.total, 5);
        let serialized = serde_json::to_string(&events).unwrap();
        assert!(!serialized.contains(raw));
        assert!(!serialized.contains("First fact"));
        for action in [
            "capture_saved",
            "memory_updated",
            "grant_created",
            "grant_revoked",
            "source_deleted",
        ] {
            assert!(events.items.iter().any(|event| event.action == action));
        }
    }
}
