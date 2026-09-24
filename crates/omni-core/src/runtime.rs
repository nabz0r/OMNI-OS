//! An in-process core for native applications. Platform code owns secure key
//! storage; this module never loads development key files or environment tokens.

use crate::{
    config::{is_loopback_url, normalize_base, Config, PairingGate},
    http::{self, AppState},
    vault::Vault,
};
use anyhow::{bail, Context, Result};
use axum::{
    body::{to_bytes, Body},
    http::{header, Method, Request, StatusCode, Uri},
    middleware,
    response::IntoResponse,
    Router,
};
use rand::RngCore;
use std::{
    fs::{self, File, OpenOptions},
    net::Ipv4Addr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{sync::watch, task::JoinHandle};
use tower::ServiceExt;
use zeroize::Zeroizing;

const REQUEST_LIMIT: usize = 1024 * 1024;
const RESPONSE_LIMIT: usize = 8 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(190);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

/// Explicit native application settings. No process environment is read or
/// changed. The caller must retrieve `vault_key` from its platform secure store
/// and keep the same key for subsequent launches of this data directory.
pub struct EmbeddedOptions {
    pub managed_policy: Option<Arc<crate::policy::CompiledPolicy>>,
    pub data_dir: PathBuf,
    vault_key: Zeroizing<[u8; 32]>,
    pub key_storage: String,
    /// False keeps all UI requests in-process. Enable explicitly for local API
    /// clients; the listener then binds only to an ephemeral loopback port.
    pub listen: bool,
    pub llm_base: String,
    pub llm_model: String,
    pub llm_key: String,
    pub anthropic_base: String,
    pub anthropic_key: String,
    pub extractor_base: String,
    pub extractor_model: String,
    /// None means no collector is configured; analytics cannot be enabled.
    pub collector_url: Option<String>,
    /// None allows destinations explicitly saved by the owner. Some enforces
    /// this exact list in addition to the existing disclosure-grant checks.
    pub upstream_allowlist: Option<Vec<String>>,
    pub origins: Vec<String>,
    pub socks_proxy: Option<String>,
    pub vpn_required: bool,
}

impl EmbeddedOptions {
    pub fn new(data_dir: PathBuf, vault_key: [u8; 32], key_storage: impl Into<String>) -> Self {
        Self {
            managed_policy: None,
            data_dir,
            vault_key: Zeroizing::new(vault_key),
            key_storage: key_storage.into(),
            listen: false,
            llm_base: "http://127.0.0.1:11434/v1".into(),
            llm_model: "qwen3:0.6b".into(),
            llm_key: String::new(),
            anthropic_base: "https://api.anthropic.com/v1".into(),
            anthropic_key: String::new(),
            extractor_base: "http://127.0.0.1:11434/v1".into(),
            extractor_model: "qwen3:0.6b".into(),
            collector_url: None,
            upstream_allowlist: None,
            origins: vec![
                "tauri://localhost".into(),
                "http://tauri.localhost".into(),
                "https://tauri.localhost".into(),
            ],
            socks_proxy: None,
            vpn_required: false,
        }
    }

    fn config(&self, port: u16) -> Result<Config> {
        if !self.data_dir.is_absolute() {
            bail!("The native vault directory must be an absolute application-data path");
        }
        if self.key_storage.is_empty()
            || self.key_storage.len() > 64
            || !self
                .key_storage
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
            || matches!(self.key_storage.as_str(), "file" | "development-file")
        {
            bail!(
                "Native runtimes require a platform secure-store label, not a development key file"
            );
        }
        let llm_base = normalize_base(&self.llm_base)?;
        let anthropic_base = normalize_base(&self.anthropic_base)?;
        let extractor_base = normalize_base(&self.extractor_base)?;
        if !is_loopback_url(&extractor_base) {
            bail!("Memory extraction is local-only; the extractor must use loopback");
        }
        let allowlist = self
            .upstream_allowlist
            .as_ref()
            .map(|urls| {
                urls.iter()
                    .map(|url| normalize_base(url))
                    .collect::<Result<Vec<_>>>()
            })
            .transpose()?
            .unwrap_or_else(|| vec![llm_base.clone(), anthropic_base.clone()]);
        if !allowlist.contains(&llm_base) {
            bail!("The primary provider must be included in the explicit upstream allowlist");
        }
        if self.vpn_required && self.socks_proxy.is_none() {
            bail!("A required VPN needs a SOCKS proxy; direct remote fallback is forbidden");
        }
        if let Some(proxy) = &self.socks_proxy {
            let url = reqwest::Url::parse(proxy).context("Invalid SOCKS proxy URL")?;
            if url.scheme() != "socks5h" || url.host_str().is_none() {
                bail!("The SOCKS proxy must use socks5h:// for proxy-side DNS");
            }
        }
        for origin in &self.origins {
            let url = reqwest::Url::parse(origin).context("Invalid native UI origin")?;
            if origin == "null"
                || origin.contains('*')
                || !url.username().is_empty()
                || url.password().is_some()
                || url.host_str().is_none()
                || url.query().is_some()
                || url.fragment().is_some()
                || !matches!(url.path(), "" | "/")
                || origin.parse::<header::HeaderValue>().is_err()
            {
                bail!(
                    "Native UI origins must be explicit origins without credentials or wildcards"
                );
            }
        }
        Ok(Config {
            managed_policy: self.managed_policy.clone(),
            data_dir: self.data_dir.clone(),
            port,
            local_token: random_token()?,
            agent_token: random_token()?,
            pairing: PairingGate::default(),
            llm_base,
            llm_model: self.llm_model.clone(),
            llm_key: self.llm_key.clone(),
            anthropic_base,
            anthropic_key: self.anthropic_key.clone(),
            allowlist,
            allowlist_enforced: self.upstream_allowlist.is_some(),
            origins: self.origins.clone(),
            analytics_opt_in: false,
            simulation: false,
            key_storage: self.key_storage.clone(),
            socks_proxy: self.socks_proxy.clone(),
            vpn_required: self.vpn_required,
            extractor_base,
            extractor_model: self.extractor_model.clone(),
            analytics_url: self
                .collector_url
                .as_deref()
                .map(normalize_base)
                .transpose()?
                .unwrap_or_default(),
        })
    }
}

fn random_token() -> Result<String> {
    let mut bytes = Zeroizing::new([0u8; 32]);
    rand::rngs::OsRng
        .try_fill_bytes(bytes.as_mut())
        .map_err(|_| {
            anyhow::anyhow!("The operating system could not generate a secure session token")
        })?;
    Ok(hex::encode(bytes.as_ref()))
}

fn vault_lease(dir: &Path) -> Result<File> {
    if let Ok(metadata) = fs::symlink_metadata(dir) {
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            bail!("The native vault directory must be a real directory");
        }
    }
    fs::create_dir_all(dir).context("Cannot create the native vault directory")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
    }
    for filename in ["runtime.lock", "vault.db", "vault.db-wal", "vault.db-shm"] {
        if let Ok(metadata) = fs::symlink_metadata(dir.join(filename)) {
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                bail!("Native vault files must be regular files, not symbolic links");
            }
        }
    }
    let mut options = OpenOptions::new();
    options.create(true).read(true).write(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let lease = options.open(dir.join("runtime.lock"))?;
    lease
        .try_lock()
        .map_err(|_| anyhow::anyhow!("This native vault is already open in another runtime"))?;
    Ok(lease)
}

/// A trusted native IPC result. Streaming API responses are collected only for
/// this bounded UI helper; `router()` preserves streaming for native adapters.
pub struct EmbeddedResponse {
    pub status: u16,
    pub body: String,
}

pub struct EmbeddedCore {
    config: Arc<Config>,
    router: Router,
    endpoint: Option<String>,
    core_address: String,
    closing: watch::Sender<bool>,
    server: Option<JoinHandle<std::io::Result<()>>>,
}

/// Initialize a SQLCipher vault and the same permission-checked router used by
/// the CLI. No network socket is created unless `options.listen` is true.
pub async fn start(options: EmbeddedOptions) -> Result<EmbeddedCore> {
    let mut config = options.config(0)?;
    let listener = if options.listen {
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .context("Cannot start the optional local API listener")?;
        config.port = listener.local_addr()?.port();
        Some(listener)
    } else {
        None
    };
    let endpoint = listener
        .as_ref()
        .map(|_| format!("http://127.0.0.1:{}", config.port));
    let core_address = endpoint.clone().unwrap_or_else(|| "in-process".into());
    let (client, local_client) = http::clients(&config)?;
    let config = Arc::new(config);
    let vault_config = config.clone();
    let vault = tokio::task::spawn_blocking(move || -> Result<Vault> {
        let lease = vault_lease(&vault_config.data_dir)?;
        let mut vault = Vault::open(
            &vault_config.data_dir.join("vault.db"),
            options.vault_key.as_ref(),
        )
        .context("Cannot unlock the native vault with the supplied secure-store key")?;
        vault.hold_runtime_lease(lease);
        vault.initialize_admin(&vault_config)?;
        vault.initialize_runtime_journal()?;
        Ok(vault)
    })
    .await
    .context("Native vault initialization was interrupted")??;
    let state = AppState {
        config: config.clone(),
        vault: Arc::new(Mutex::new(vault)),
        client,
        local_client,
    };
    let (closing, receiver) = watch::channel(false);
    let gate = receiver.clone();
    let router = http::app(state).layer(middleware::from_fn(
        move |request: Request<Body>, next: middleware::Next| {
            let closed = *gate.borrow();
            async move {
                if closed {
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        "The local core is shutting down",
                    )
                        .into_response()
                } else {
                    next.run(request).await
                }
            }
        },
    ));
    let server = listener.map(|listener| {
        let app = router.clone();
        let mut receiver = receiver;
        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = receiver.wait_for(|closed| *closed).await;
                })
                .await
        })
    });
    Ok(EmbeddedCore {
        config,
        router,
        endpoint,
        core_address,
        closing,
        server,
    })
}

impl EmbeddedCore {
    pub fn endpoint(&self) -> Option<&str> {
        self.endpoint.as_deref()
    }
    pub fn core_address(&self) -> &str {
        &self.core_address
    }
    pub fn owner_token(&self) -> &str {
        &self.config.local_token
    }
    pub fn agent_token(&self) -> &str {
        &self.config.agent_token
    }

    /// Retains normal bearer and origin checks. Do not expose this Rust object
    /// to untrusted web content; native IPC must authenticate its caller first.
    pub fn router(&self) -> Router {
        self.router.clone()
    }

    /// An owner-authorized native UI bridge, not a public unauthenticated API.
    /// The native command must verify the caller's owner token before calling.
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<String>,
    ) -> Result<EmbeddedResponse> {
        if path.len() > 8192
            || !path.starts_with('/')
            || path.starts_with("//")
            || path.contains('#')
        {
            bail!("Native API requests require a bounded local path");
        }
        let uri: Uri = path.parse().context("Invalid native API path")?;
        if uri.scheme().is_some() || uri.authority().is_some() {
            bail!("Native API requests cannot select another host");
        }
        let method: Method = method.parse().context("Invalid native API method")?;
        if !matches!(
            method,
            Method::GET | Method::POST | Method::PATCH | Method::DELETE
        ) {
            bail!("Unsupported native API method");
        }
        let body = body.unwrap_or_default();
        if body.len() > REQUEST_LIMIT {
            bail!("Native API request exceeds the 1 MiB limit");
        }
        let request = Request::builder()
            .method(method)
            .uri(uri)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.owner_token()),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body))?;
        let router = self.router.clone();
        tokio::time::timeout(REQUEST_TIMEOUT, async move {
            let response = router.oneshot(request).await?;
            let status = response.status().as_u16();
            let bytes = to_bytes(response.into_body(), RESPONSE_LIMIT)
                .await
                .context("Native API response exceeded its limit or was interrupted")?;
            let body =
                String::from_utf8(bytes.to_vec()).context("Native API response was not UTF-8")?;
            Ok(EmbeddedResponse { status, body })
        })
        .await
        .context("Native API request timed out")?
    }

    pub fn begin_shutdown(&self) {
        self.closing.send_replace(true);
    }

    pub async fn shutdown(mut self) -> Result<()> {
        self.begin_shutdown();
        if let Some(mut server) = self.server.take() {
            match tokio::time::timeout(SHUTDOWN_TIMEOUT, &mut server).await {
                Ok(result) => result.context("Local API listener task failed")??,
                Err(_) => {
                    server.abort();
                    let _ = server.await;
                    bail!("Local API shutdown timed out; outstanding connections were closed");
                }
            }
        }
        Ok(())
    }
}

impl Drop for EmbeddedCore {
    fn drop(&mut self) {
        self.begin_shutdown();
        if let Some(mut server) = self.server.take() {
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                runtime.spawn(async move {
                    if tokio::time::timeout(SHUTDOWN_TIMEOUT, &mut server)
                        .await
                        .is_err()
                    {
                        server.abort();
                    }
                });
            } else {
                server.abort();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn options(dir: &Path) -> EmbeddedOptions {
        EmbeddedOptions::new(dir.to_path_buf(), [37; 32], "platform-secure-store")
    }

    async fn json_request(
        core: &EmbeddedCore,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> (u16, Value) {
        let response = core
            .request(method, path, body.map(|body| body.to_string()))
            .await
            .unwrap();
        (
            response.status,
            serde_json::from_str(&response.body).unwrap(),
        )
    }

    #[tokio::test]
    async fn ipc_preserves_authentication_and_native_storage_identity() {
        let directory = tempfile::tempdir().unwrap();
        let core = start(options(directory.path())).await.unwrap();
        assert_eq!(core.endpoint(), None);
        assert_eq!(core.core_address(), "in-process");
        assert_eq!(core.owner_token().len(), 64);
        assert_eq!(core.agent_token().len(), 64);
        assert_ne!(core.owner_token(), core.agent_token());
        for token in [None, Some(core.agent_token())] {
            let mut request = Request::builder().uri("/api/state");
            if let Some(token) = token {
                request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
            }
            let response = core
                .router()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
        let (status, state) = json_request(&core, "GET", "/api/state", None).await;
        assert_eq!(status, 200);
        assert_eq!(state["vault"]["key_storage"], "platform-secure-store");
        assert_eq!(state["analytics"]["opt_in"], false);
        let (_, admin) = json_request(&core, "GET", "/api/admin", None).await;
        assert_eq!(admin["runtime"]["core_address"], "in-process");
        assert!(admin["runtime"]["listen_address"].is_null());
        assert_eq!(admin["runtime"]["analytics_configured"], false);
        let response = core
            .router()
            .oneshot(
                Request::builder()
                    .uri("/api/state")
                    .header(
                        header::AUTHORIZATION,
                        format!("Bearer {}", core.owner_token()),
                    )
                    .header(header::ORIGIN, "https://untrusted.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        for name in ["vault.key", "local-token", "agent-token"] {
            assert!(!directory.path().join(name).exists());
        }
        core.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn ipc_policy_revision_persists_and_enforcement_uses_managed_baseline() {
        use crate::policy::{CompiledPolicy, PolicySpec, Rule, RuleAction};
        let directory = tempfile::tempdir().unwrap();
        let mut config = options(directory.path());
        config.managed_policy = Some(Arc::new(
            CompiledPolicy::compile(PolicySpec {
                rules: vec![Rule {
                    id: "native-rule".into(),
                    name: "Native rule".into(),
                    pattern: "NATIVE-CANARY".into(),
                    action: RuleAction::BlockMatch,
                    enabled: true,
                }],
                ..Default::default()
            })
            .unwrap(),
        ));
        let managed = config.managed_policy.clone();
        let first = start(config).await.unwrap();
        let (status, saved) = json_request(
            &first,
            "POST",
            "/api/policies",
            Some(json!({"expected_revision":0,"policy":PolicySpec::default()})),
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(saved["revision"], 1);
        let (status, denied) = json_request(
            &first,
            "POST",
            "/api/chat",
            Some(json!({"message":"NATIVE-CANARY"})),
        )
        .await;
        assert_eq!(status, 403);
        assert!(!denied.to_string().contains("NATIVE-CANARY"));
        first.shutdown().await.unwrap();
        let mut config = options(directory.path());
        config.managed_policy = managed;
        let second = start(config).await.unwrap();
        let (_, policy) = json_request(&second, "GET", "/api/policies", None).await;
        assert_eq!(policy["revision"], 1);
        let (_, trail) = json_request(&second, "GET", "/api/policies/decisions", None).await;
        assert_eq!(trail["retained"], 1);
        assert_eq!(trail["items"][0]["layer"], "managed");
        second.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn ipc_restart_preserves_encrypted_data_and_rotates_session_capabilities() {
        let directory = tempfile::tempdir().unwrap();
        let first = start(options(directory.path())).await.unwrap();
        let previous_token = first.owner_token().to_owned();
        let (status, memory) = json_request(
            &first,
            "POST",
            "/api/memories",
            Some(json!({"content":"Private native memory", "status":"confirmed"})),
        )
        .await;
        assert_eq!(status, 200);
        assert!(start(options(directory.path())).await.is_err());
        first.shutdown().await.unwrap();
        let mut wrong_key = options(directory.path());
        wrong_key.vault_key = Zeroizing::new([99; 32]);
        assert!(start(wrong_key).await.is_err());
        assert!(!directory.path().join("vault.key").exists());
        let second = start(options(directory.path())).await.unwrap();
        assert_ne!(previous_token, second.owner_token());
        let (_, state) = json_request(&second, "GET", "/api/state", None).await;
        assert_eq!(state["memories"][0]["id"], memory["id"]);
        let old_auth = Request::builder()
            .uri("/api/state")
            .header(header::AUTHORIZATION, format!("Bearer {previous_token}"))
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            second.router().oneshot(old_auth).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
        second.shutdown().await.unwrap();
        let data = fs::read(directory.path().join("vault.db")).unwrap();
        assert!(!data.starts_with(b"SQLite format 3"));
        assert!(!data
            .windows(b"Private native memory".len())
            .any(|window| window == b"Private native memory"));
    }

    #[tokio::test]
    async fn ipc_instances_are_isolated_and_shutdown_closes_exported_routers() {
        let first_dir = tempfile::tempdir().unwrap();
        let second_dir = tempfile::tempdir().unwrap();
        let first = start(options(first_dir.path())).await.unwrap();
        let second = start(options(second_dir.path())).await.unwrap();
        json_request(
            &first,
            "POST",
            "/api/memories",
            Some(json!({"content":"First device only"})),
        )
        .await;
        let (_, state) = json_request(&second, "GET", "/api/state", None).await;
        assert_eq!(state["memories"], json!([]));
        let exported = first.router();
        first.begin_shutdown();
        assert_eq!(
            first.request("GET", "/health", None).await.unwrap().status,
            503
        );
        first.shutdown().await.unwrap();
        // An adapter still holding the router also retains the vault lease.
        assert!(start(options(first_dir.path())).await.is_err());
        assert_eq!(
            exported
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/health")
                        .body(Body::empty())
                        .unwrap()
                )
                .await
                .unwrap()
                .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        drop(exported);
        start(options(first_dir.path()))
            .await
            .unwrap()
            .shutdown()
            .await
            .unwrap();
        second.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn ipc_missing_collector_cannot_enable_or_spend_analytics_budget() {
        let directory = tempfile::tempdir().unwrap();
        let core = start(options(directory.path())).await.unwrap();
        for (path, body) in [
            ("/api/analytics/consent", json!({"enabled":true})),
            ("/api/analytics/prepare", json!({})),
            ("/api/analytics/send", json!({})),
        ] {
            let (status, value) = json_request(&core, "POST", path, Some(body)).await;
            assert_eq!(status, 400);
            assert!(value["error"]["message"]
                .as_str()
                .unwrap()
                .contains("collector"));
        }
        let (_, state) = json_request(&core, "GET", "/api/state", None).await;
        assert_eq!(state["analytics"]["opt_in"], false);
        assert_eq!(state["analytics"]["reports"], 0);
        assert_eq!(
            json_request(
                &core,
                "POST",
                "/api/analytics/consent",
                Some(json!({"enabled":false}))
            )
            .await
            .0,
            200
        );
        core.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn ipc_rejects_unbounded_requests_and_remote_paths() {
        let directory = tempfile::tempdir().unwrap();
        let core = start(options(directory.path())).await.unwrap();
        for path in [
            "https://example.org/api/state",
            "//example.org/api/state",
            "/api/state#secret",
        ] {
            assert!(core.request("GET", path, None).await.is_err());
        }
        assert!(core.request("CONNECT", "/api/state", None).await.is_err());
        assert!(core
            .request("POST", "/api/memories", Some("a".repeat(REQUEST_LIMIT + 1)))
            .await
            .is_err());
        assert!(core
            .request("GET", &format!("/{}", "a".repeat(8192)), None)
            .await
            .is_err());
        core.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn ipc_restart_keeps_consent_and_retries_the_same_private_report() {
        let directory = tempfile::tempdir().unwrap();
        let configured = || {
            let mut options = options(directory.path());
            options.collector_url = Some("https://collector.example/api/v1/analytics".into());
            options
        };
        let first = start(configured()).await.unwrap();
        assert_eq!(
            json_request(
                &first,
                "POST",
                "/api/analytics/consent",
                Some(json!({"enabled":true}))
            )
            .await
            .0,
            200
        );
        let (status, report) =
            json_request(&first, "POST", "/api/analytics/prepare", Some(json!({}))).await;
        assert_eq!(status, 200);
        first.shutdown().await.unwrap();
        let second = start(configured()).await.unwrap();
        let (status, retry) =
            json_request(&second, "POST", "/api/analytics/prepare", Some(json!({}))).await;
        assert_eq!(status, 200);
        assert_eq!(report, retry);
        let (_, state) = json_request(&second, "GET", "/api/state", None).await;
        assert_eq!(state["analytics"]["opt_in"], true);
        assert_eq!(state["analytics"]["reports"], 1);
        assert_eq!(state["analytics"]["budget_used"], 1.0);
        second.shutdown().await.unwrap();
    }

    #[test]
    fn native_options_preserve_local_extraction_and_explicit_network_policy() {
        let directory = tempfile::tempdir().unwrap();
        let mut config = options(directory.path());
        config.extractor_base = "https://remote.example/v1".into();
        assert!(config.config(0).is_err());
        config.extractor_base = "http://127.0.0.1:11434/v1".into();
        config.vpn_required = true;
        assert!(config.config(0).is_err());
        config.socks_proxy = Some("socks5://127.0.0.1:1080".into());
        assert!(config.config(0).is_err());
        config.socks_proxy = Some("socks5h://127.0.0.1:1080".into());
        assert!(config.config(0).is_ok());
        config.upstream_allowlist = Some(vec!["https://other.example/v1".into()]);
        assert!(config.config(0).is_err());
        config.upstream_allowlist = Some(vec![config.llm_base.clone()]);
        assert!(config.config(0).unwrap().allowlist_enforced);
        config.key_storage = "file".into();
        assert!(config.config(0).is_err());
        assert!(
            EmbeddedOptions::new(PathBuf::from("relative"), [0; 32], "secure-store")
                .config(0)
                .is_err()
        );
    }

    #[tokio::test]
    async fn explicit_listener_uses_ephemeral_loopback_and_closes_on_shutdown() {
        let directory = tempfile::tempdir().unwrap();
        let mut config = options(directory.path());
        config.listen = true;
        let core = start(config).await.unwrap();
        let endpoint = core.endpoint().unwrap().to_owned();
        assert!(endpoint.starts_with("http://127.0.0.1:"));
        assert!(!endpoint.ends_with(":0"));
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        assert_eq!(
            client
                .get(format!("{endpoint}/health"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        assert_eq!(
            client
                .get(format!("{endpoint}/api/state"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        core.shutdown().await.unwrap();
        assert!(client
            .get(format!("{endpoint}/health"))
            .send()
            .await
            .is_err());
    }
}
