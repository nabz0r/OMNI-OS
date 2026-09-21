#[cfg(target_os = "macos")]
use anyhow::Context;
use anyhow::{bail, Result};
use rand::RngCore;
#[cfg(target_os = "macos")]
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::Write,
    net::IpAddr,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct Config {
    pub data_dir: PathBuf,
    pub port: u16,
    pub local_token: String,
    pub agent_token: String,
    pub llm_base: String,
    pub llm_model: String,
    pub llm_key: String,
    pub anthropic_base: String,
    pub anthropic_key: String,
    pub allowlist: Vec<String>,
    pub origins: Vec<String>,
    pub analytics_opt_in: bool,
    pub simulation: bool,
    pub key_storage: String,
    pub socks_proxy: Option<String>,
    pub vpn_required: bool,
    pub extractor_base: String,
    pub extractor_model: String,
    pub analytics_url: String,
}

fn flag(name: &str) -> bool {
    env::var(name).is_ok_and(|s| s == "1" || s == "true")
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let data_dir = env::var_os("OMNI_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env::var_os("HOME").unwrap_or_default()).join(".local/share/omni-os")
            });
        fs::create_dir_all(&data_dir)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700))?;
        }
        let llm_base = normalize_base(
            &env::var("OMNI_LLM_BASE").unwrap_or_else(|_| "http://127.0.0.1:11434/v1".into()),
        )?;
        let anthropic_base = normalize_base(
            &env::var("OMNI_ANTHROPIC_BASE")
                .unwrap_or_else(|_| "https://api.anthropic.com/v1".into()),
        )?;
        let allowlist = env::var("OMNI_UPSTREAM_ALLOWLIST")
            .ok()
            .map(|s| s.split(',').map(normalize_base).collect::<Result<Vec<_>>>())
            .transpose()?
            .unwrap_or_else(|| vec![llm_base.clone(), anthropic_base.clone()]);
        if !allowlist.contains(&llm_base) {
            bail!("OMNI_LLM_BASE must be included in OMNI_UPSTREAM_ALLOWLIST");
        }
        let mut origins = vec![
            "http://localhost:3006".into(),
            "http://127.0.0.1:3006".into(),
            "tauri://localhost".into(),
            "http://tauri.localhost".into(),
        ];
        if let Ok(origin) = env::var("OMNI_EXTENSION_ORIGIN") {
            origins.push(origin);
        }
        let key_storage = env::var("OMNI_KEY_STORAGE").unwrap_or_else(|_| {
            if cfg!(target_os = "macos") {
                "keychain".into()
            } else {
                "file".into()
            }
        });
        if key_storage != "keychain" && key_storage != "file" {
            bail!("OMNI_KEY_STORAGE must be keychain or file");
        }
        let socks_proxy = env::var("OMNI_SOCKS_PROXY").ok().filter(|s| !s.is_empty());
        let vpn_required = flag("OMNI_VPN_REQUIRED");
        if vpn_required && socks_proxy.is_none() {
            bail!(
                "OMNI_VPN_REQUIRED requires OMNI_SOCKS_PROXY; direct remote fallback is forbidden"
            );
        }
        if let Some(proxy) = &socks_proxy {
            let url = reqwest::Url::parse(proxy)?;
            if url.scheme() != "socks5h" {
                bail!("OMNI_SOCKS_PROXY must use socks5h:// for proxy-side DNS");
            }
        }
        let extractor_base = normalize_base(
            &env::var("OMNI_EXTRACTOR_BASE").unwrap_or_else(|_| "http://127.0.0.1:11434/v1".into()),
        )?;
        if !is_loopback_url(&extractor_base) {
            bail!("Memory extraction is local-only; OMNI_EXTRACTOR_BASE must be loopback");
        }
        let analytics_url = normalize_base(
            &env::var("OMNI_ANALYTICS_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:3008/api/v1/analytics".into()),
        )?;
        let llm_key = env::var("OMNI_LLM_API_KEY").unwrap_or_else(|_| {
            if is_loopback_url(&llm_base) {
                String::new()
            } else {
                env::var("OPENAI_API_KEY").unwrap_or_default()
            }
        });
        let local_token = load_token(&data_dir, "local-token", "OMNI_LOCAL_TOKEN")?;
        let agent_token = load_token(&data_dir, "agent-token", "OMNI_AGENT_TOKEN")?;
        validate_tokens(&local_token, &agent_token)?;
        Ok(Self {
            local_token,
            agent_token,
            port: env::var("OMNI_CORE_PORT")
                .unwrap_or_else(|_| "3007".into())
                .parse()?,
            data_dir,
            llm_base,
            anthropic_base,
            allowlist,
            origins,
            key_storage,
            socks_proxy,
            vpn_required,
            extractor_base,
            analytics_url,
            extractor_model: env::var("OMNI_EXTRACTOR_MODEL")
                .unwrap_or_else(|_| "qwen3:0.6b".into()),
            llm_model: env::var("OMNI_LLM_MODEL").unwrap_or_else(|_| "qwen3:0.6b".into()),
            llm_key,
            anthropic_key: env::var("ANTHROPIC_API_KEY").unwrap_or_default(),
            analytics_opt_in: flag("OMNI_ANALYTICS_OPT_IN"),
            simulation: flag("OMNI_SIMULATION"),
        })
    }

    pub fn load_vault_key(&self) -> Result<Vec<u8>> {
        if self.key_storage == "file" {
            if self.data_dir.join("vault.db").exists() && !self.data_dir.join("vault.key").exists()
            {
                bail!("Vault exists but its development key file is missing; restore the original key");
            }
            return load_or_create_secret(&self.data_dir.join("vault.key"), 32);
        }
        #[cfg(target_os = "macos")]
        {
            use security_framework::passwords::{get_generic_password, set_generic_password};
            let account = hex::encode(Sha256::digest(
                self.data_dir.canonicalize()?.to_string_lossy().as_bytes(),
            ));
            match get_generic_password("org.omni-os.vault", &account) {
                Ok(key) if key.len() == 32 => Ok(key),
                Ok(_) => bail!("Invalid vault key in macOS Keychain"),
                Err(error) if error.code() == -25300 => {
                    if self.data_dir.join("vault.db").exists() { bail!("Vault exists but its Keychain key is missing; restore the key before opening it"); }
                    let mut key = vec![0u8;32]; rand::rngs::OsRng.fill_bytes(&mut key);
                    set_generic_password("org.omni-os.vault", &account, &key).context("Cannot write Keychain; explicit OMNI_KEY_STORAGE=file is available for development")?;
                    Ok(key)
                },
                Err(error) => Err(anyhow::anyhow!("Cannot read macOS Keychain: {error}; unlock Keychain, or explicitly use OMNI_KEY_STORAGE=file for development")),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            bail!("Keychain backend requires macOS; use OMNI_KEY_STORAGE=file for development")
        }
    }
}

fn validate_tokens(owner: &str, agent: &str) -> Result<()> {
    if owner == agent {
        bail!("Owner and agent tokens must be different; sharing a token removes the permission boundary");
    }
    for token in [owner, agent] {
        if token.trim() != token || !token.bytes().all(|byte| byte.is_ascii_graphic()) {
            bail!("Local bearer tokens must contain only visible ASCII characters without spaces");
        }
    }
    Ok(())
}

fn load_token(dir: &Path, filename: &str, env_name: &str) -> Result<String> {
    if let Ok(token) = env::var(env_name) {
        if token.len() < 16 {
            bail!("{env_name} must contain at least 16 characters");
        }
        return Ok(token);
    }
    Ok(hex::encode(load_or_create_secret(&dir.join(filename), 32)?))
}

pub fn load_or_create_secret(path: &Path, size: usize) -> Result<Vec<u8>> {
    if path.exists() {
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            bail!("Secret path must be a regular file");
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if metadata.permissions().mode() & 0o077 != 0 {
                bail!("Secret file permissions must be 0600: {}", path.display());
            }
        }
        let bytes = fs::read(path)?;
        if bytes.len() != size {
            bail!("Invalid secret size for {}", path.display());
        }
        return Ok(bytes);
    }
    let mut bytes = vec![0u8; size];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(path)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    Ok(bytes)
}

pub fn normalize_base(raw: &str) -> Result<String> {
    let url = reqwest::Url::parse(raw.trim())?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!("Provider URL cannot contain credentials, query, or fragment");
    }
    let local = url_is_loopback(&url);
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        bail!("Providers require HTTPS; HTTP is allowed only for loopback addresses");
    }
    Ok(url.as_str().trim_end_matches('/').into())
}

pub fn is_loopback_url(base: &str) -> bool {
    reqwest::Url::parse(base)
        .ok()
        .is_some_and(|url| url_is_loopback(&url))
}

fn url_is_loopback(url: &reqwest::Url) -> bool {
    url.host_str().is_some_and(|host| {
        // URL hosts retain brackets around IPv6 literals; IpAddr does not.
        let host = host.trim_start_matches('[').trim_end_matches(']');
        host == "localhost" || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_local_http_and_no_url_credentials() {
        assert!(normalize_base("http://127.0.0.1:11434/v1").is_ok());
        assert!(normalize_base("http://[::1]:11434/v1").is_ok());
        assert!(is_loopback_url("http://[::1]:11434/v1"));
        assert!(!is_loopback_url("https://[2001:db8::1]/v1"));
        assert!(normalize_base("http://[2001:db8::1]/v1").is_err());
        assert!(normalize_base("http://192.168.1.1/v1").is_err());
        assert!(normalize_base("https://key:secret@example.org/v1").is_err());
        assert!(normalize_base("https://example.org/v1?q=secret").is_err());
    }
    #[test]
    fn integration_tokens_cannot_be_owner_tokens_or_invalid_headers() {
        assert!(validate_tokens("owner-token-01234567", "agent-token-01234567").is_ok());
        assert!(validate_tokens("shared-token-0123456", "shared-token-0123456").is_err());
        assert!(validate_tokens("owner-token-01234567", "agent-token\r\nsecret").is_err());
        assert!(validate_tokens("owner-token-01234567", "agent token 01234567").is_err());
    }
}
