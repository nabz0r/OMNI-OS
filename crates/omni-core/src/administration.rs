//! Owner-managed configuration stored inside the encrypted vault.
use crate::{
    config::{is_loopback_url, normalize_base, Config},
    vault::Vault,
};
use anyhow::{bail, Context, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct AdminSettings {
    pub history_enabled: bool,
    pub history_retention_days: u16,
    pub extractor_base: String,
    pub extractor_model: String,
    pub primary_provider_id: String,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SettingsPatch {
    pub history_enabled: Option<bool>,
    pub history_retention_days: Option<u16>,
    pub extractor_base: Option<String>,
    pub extractor_model: Option<String>,
    pub primary_provider_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Rates {
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cached_input_per_million: Option<f64>,
    pub cache_write_input_per_million: Option<f64>,
    pub currency: String,
}
impl Rates {
    fn validate(&self) -> Result<()> {
        if self.currency != "USD"
            || [
                Some(self.input_per_million),
                Some(self.output_per_million),
                self.cached_input_per_million,
                self.cache_write_input_per_million,
            ]
            .into_iter()
            .flatten()
            .any(|n| !n.is_finite() || !(0.0..=1_000_000.0).contains(&n))
        {
            bail!("Rates must be finite, non-negative USD amounts per million tokens");
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Discovery {
    pub status: String,
    pub checked_at: Option<String>,
    pub models: Vec<String>,
    pub loaded_models: Option<Vec<Value>>,
    pub error: Option<String>,
}
impl Discovery {
    pub fn unchecked() -> Self {
        Self {
            status: "not_checked".into(),
            ..Self::default()
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    // Serialize only into SQLCipher. HTTP handlers must use public().
    pub(crate) api_key: String,
    pub rates: Option<Rates>,
    pub discovery: Discovery,
}
impl Provider {
    pub fn public(&self, config: &Config) -> Value {
        json!({"id":self.id,"label":self.label,"kind":self.kind,"base_url":self.base_url,"model":self.model,"enabled":self.enabled,"has_api_key":!self.api_key.is_empty(),"rates":self.rates,"status":self.discovery.status,"checked_at":self.discovery.checked_at,"models":self.discovery.models,"loaded_models":self.discovery.loaded_models,"error":self.discovery.error,"policy_allowed":self.policy_allowed(config)})
    }
    pub fn policy_allowed(&self, config: &Config) -> bool {
        !config.allowlist_enforced || config.allowlist.contains(&self.base_url)
    }
    fn validate(&mut self) -> Result<()> {
        self.label = bounded_text(&self.label, "Provider label", 80)?;
        self.model = if self.model.trim().is_empty() {
            String::new()
        } else {
            bounded_text(&self.model, "Model", 200)?
        };
        self.base_url = normalize_base(&self.base_url)?;
        if !matches!(
            self.kind.as_str(),
            "ollama" | "openai" | "anthropic" | "compatible"
        ) {
            bail!("Unsupported provider kind");
        }
        if self.kind == "ollama" && !is_loopback_url(&self.base_url) {
            bail!("Ollama discovery requires a local loopback endpoint");
        }
        if self.api_key.len() > 8192 || self.api_key.bytes().any(|c| !c.is_ascii_graphic()) {
            bail!("API key must contain visible ASCII characters without spaces");
        }
        if let Some(rates) = &self.rates {
            rates.validate()?;
        }
        Ok(())
    }
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderPatch {
    pub label: Option<String>,
    pub kind: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub enabled: Option<bool>,
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
    #[serde(default, deserialize_with = "optional_rates")]
    pub rates: Option<Option<Rates>>,
    #[serde(default)]
    pub clear_rates: bool,
}

fn optional_rates<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<Option<Rates>>, D::Error> {
    Ok(Some(Option::<Rates>::deserialize(deserializer)?))
}

fn bounded_text(raw: &str, name: &str, max: usize) -> Result<String> {
    let value = raw.trim();
    if value.is_empty() || value.len() > max || value.chars().any(char::is_control) {
        bail!("{name} must contain 1–{max} characters without control characters");
    }
    Ok(value.into())
}

impl Vault {
    fn admin_read<T: serde::de::DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let value: Option<String> = self
            .db
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |row| {
                row.get(0)
            })
            .optional()?;
        value
            .map(|raw| {
                serde_json::from_str(&raw).context("Invalid encrypted administration settings")
            })
            .transpose()
    }
    fn admin_write<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        self.db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,serde_json::to_string(value)?])?;
        Ok(())
    }
    pub fn initialize_admin(&self, config: &Config) -> Result<()> {
        if self
            .admin_read::<Vec<Provider>>("admin.providers")?
            .is_some()
        {
            return Ok(());
        }
        let local = is_loopback_url(&config.llm_base);
        let kind = if local && config.llm_base.contains(":11434") {
            "ollama"
        } else if config.llm_base == "https://api.openai.com/v1" {
            "openai"
        } else {
            "compatible"
        };
        let mut providers = vec![Provider {
            id: "default".into(),
            label: if config.simulation {
                "Synthetic provider".into()
            } else if local {
                "Local model".into()
            } else {
                "Primary provider".into()
            },
            kind: kind.into(),
            base_url: config.llm_base.clone(),
            model: config.llm_model.clone(),
            enabled: true,
            api_key: config.llm_key.clone(),
            rates: None,
            discovery: Discovery::unchecked(),
        }];
        if config.llm_base != "https://api.openai.com/v1" {
            providers.push(Provider {
                id: "openai".into(),
                label: "OpenAI".into(),
                kind: "openai".into(),
                base_url: "https://api.openai.com/v1".into(),
                model: "gpt-4.1-mini".into(),
                enabled: false,
                api_key: String::new(),
                rates: None,
                discovery: Discovery::unchecked(),
            });
        }
        providers.push(Provider {
            id: "anthropic".into(),
            label: "Anthropic".into(),
            kind: "anthropic".into(),
            base_url: config.anthropic_base.clone(),
            model: "claude-sonnet-4-20250514".into(),
            enabled: is_loopback_url(&config.anthropic_base) || !config.anthropic_key.is_empty(),
            api_key: config.anthropic_key.clone(),
            rates: None,
            discovery: Discovery::unchecked(),
        });
        let settings = AdminSettings {
            history_enabled: true,
            history_retention_days: 30,
            extractor_base: config.extractor_base.clone(),
            extractor_model: config.extractor_model.clone(),
            primary_provider_id: "default".into(),
        };
        // Both rows are committed together to avoid partially initialized state.
        let tx = self.db.unchecked_transaction()?;
        self.admin_write("admin.providers", &providers)?;
        self.admin_write("admin.settings", &settings)?;
        tx.commit()?;
        Ok(())
    }
    pub fn admin_settings(&self) -> Result<AdminSettings> {
        self.admin_read("admin.settings")?
            .context("Administration has not been initialized")
    }
    pub fn providers(&self) -> Result<Vec<Provider>> {
        self.admin_read("admin.providers")?
            .context("Administration has not been initialized")
    }
    pub fn provider(&self, id: &str) -> Result<Provider> {
        self.providers()?
            .into_iter()
            .find(|p| p.id == id)
            .context("Provider not found")
    }
    pub fn patch_admin_settings(&self, patch: SettingsPatch) -> Result<AdminSettings> {
        let mut settings = self.admin_settings()?;
        if let Some(value) = patch.history_enabled {
            settings.history_enabled = value;
        }
        if let Some(value) = patch.history_retention_days {
            if !(1..=365).contains(&value) {
                bail!("History retention must be between 1 and 365 days");
            }
            settings.history_retention_days = value;
        }
        if let Some(value) = patch.extractor_base {
            let base = normalize_base(&value)?;
            if !is_loopback_url(&base) {
                bail!("Memory extraction is local-only");
            }
            settings.extractor_base = base;
        }
        if let Some(value) = patch.extractor_model {
            settings.extractor_model = bounded_text(&value, "Extractor model", 200)?;
        }
        if let Some(value) = patch.primary_provider_id {
            let provider = self.provider(&value)?;
            if !provider.enabled || provider.model.is_empty() {
                bail!("The primary provider must be enabled and have a model selected");
            }
            settings.primary_provider_id = value;
        }
        self.admin_write("admin.settings", &settings)?;
        Ok(settings)
    }
    pub fn save_provider(&self, id: Option<&str>, patch: ProviderPatch) -> Result<Provider> {
        if patch.clear_api_key && patch.api_key.is_some() {
            bail!("Set a key or clear it, not both");
        }
        if patch.clear_rates && patch.rates.is_some() {
            bail!("Set rates or clear them, not both");
        }
        let mut providers = self.providers()?;
        if id.is_none() && providers.len() >= 32 {
            bail!("At most 32 provider profiles are supported");
        }
        let mut p = if let Some(id) = id {
            self.provider(id)?
        } else {
            Provider {
                id: Uuid::new_v4().to_string(),
                label: String::new(),
                kind: "compatible".into(),
                base_url: String::new(),
                model: String::new(),
                enabled: true,
                api_key: String::new(),
                rates: None,
                discovery: Discovery::unchecked(),
            }
        };
        let before = (p.base_url.clone(), p.kind.clone(), p.api_key.clone());
        let previous_model = p.model.clone();
        let replacement_rates = patch.rates.is_some();
        if let Some(value) = patch.label {
            p.label = value;
        }
        if let Some(value) = patch.kind {
            p.kind = value;
        }
        if let Some(value) = patch.base_url {
            let base = normalize_base(&value)?;
            if base != p.base_url {
                p.api_key.clear();
            }
            p.base_url = base;
        }
        if let Some(value) = patch.model {
            p.model = value;
        }
        if let Some(value) = patch.enabled {
            p.enabled = value;
        }
        if patch.clear_api_key {
            p.api_key.clear();
        }
        if let Some(value) = patch.api_key {
            p.api_key = value;
        }
        if patch.clear_rates {
            p.rates = None;
        }
        if let Some(value) = patch.rates {
            p.rates = value;
        }
        p.validate()?;
        if p.model != previous_model && !replacement_rates {
            p.rates = None;
        }
        if (!p.enabled || p.model.is_empty()) && self.admin_settings()?.primary_provider_id == p.id
        {
            bail!("The primary provider must stay enabled with a model selected");
        }
        if before != (p.base_url.clone(), p.kind.clone(), p.api_key.clone()) {
            p.discovery = Discovery::unchecked();
        }
        if let Some(index) = providers.iter().position(|existing| existing.id == p.id) {
            providers[index] = p.clone();
        } else {
            providers.push(p.clone());
        }
        self.admin_write("admin.providers", &providers)?;
        Ok(p)
    }
    pub fn delete_provider(&self, id: &str) -> Result<bool> {
        if self.admin_settings()?.primary_provider_id == id {
            bail!("Select another primary provider before deleting this profile");
        }
        let mut providers = self.providers()?;
        let before = providers.len();
        providers.retain(|p| p.id != id);
        self.admin_write("admin.providers", &providers)?;
        Ok(before != providers.len())
    }
    pub fn save_discovery(&self, original: &Provider, discovery: Discovery) -> Result<Provider> {
        let mut providers = self.providers()?;
        let p = providers
            .iter_mut()
            .find(|p| p.id == original.id)
            .context("Provider was deleted during discovery")?;
        if p.base_url != original.base_url
            || p.api_key != original.api_key
            || p.kind != original.kind
        {
            bail!("Provider changed during discovery; retry");
        }
        p.discovery = discovery;
        let result = p.clone();
        self.admin_write("admin.providers", &providers)?;
        Ok(result)
    }
    pub fn selected_provider(
        &self,
        id: Option<&str>,
        anthropic: Option<bool>,
        config: &Config,
    ) -> Result<Provider> {
        let settings = self.admin_settings()?;
        let providers = self.providers()?;
        let matches =
            |p: &&Provider| p.enabled && anthropic.is_none_or(|a| (p.kind == "anthropic") == a);
        let provider = if let Some(id) = id {
            providers
                .iter()
                .find(|p| p.id == id)
                .context("Provider not found")?
        } else {
            providers
                .iter()
                .filter(matches)
                .find(|p| p.id == settings.primary_provider_id)
                .or_else(|| providers.iter().find(matches))
                .context("No enabled provider supports this protocol")?
        };
        if !provider.enabled {
            bail!("Provider is disabled");
        }
        if anthropic.is_some_and(|a| (provider.kind == "anthropic") != a) {
            bail!("Provider does not support this protocol");
        }
        if !provider.policy_allowed(config) {
            bail!("Provider blocked by the environment upstream allowlist");
        }
        Ok(provider.clone())
    }
}
