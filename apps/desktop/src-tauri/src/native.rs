use omni_core::runtime::{self, EmbeddedCore, EmbeddedOptions, EmbeddedResponse};
use serde::Serialize;
use std::sync::Arc;
use subtle::ConstantTimeEq;
use tauri::{Manager, State};
use tauri_plugin_omni_device::OmniDeviceExt;
use tokio::sync::{OnceCell, Semaphore};

#[derive(Clone, Serialize)]
pub struct NativeSessionInfo {
    token: String,
    mode: &'static str,
    core_url: String,
    collector_url: Option<String>,
    platform: &'static str,
}

struct NativeSession {
    info: NativeSessionInfo,
    core: Option<Arc<EmbeddedCore>>,
}

pub struct NativeState {
    session: OnceCell<NativeSession>,
    requests: Semaphore,
    gateway: tokio::sync::Mutex<Option<runtime::ClientGateway>>,
}

impl Default for NativeState {
    fn default() -> Self {
        Self {
            session: OnceCell::new(),
            requests: Semaphore::new(16),
            gateway: tokio::sync::Mutex::new(None),
        }
    }
}

fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("This window cannot access the local vault.".into())
    }
}

#[tauri::command]
pub async fn save_metadata(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    name: String,
    contents: String,
    mime: String,
) -> Result<String, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.omni_device()
            .save_export(&name, &contents, &mime)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "The export could not be saved. Try again.".to_owned())?
}

#[tauri::command]
pub async fn native_session(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, NativeState>,
) -> Result<NativeSessionInfo, String> {
    main_window(&window)?;
    let session = state.session.get_or_try_init(|| async {
        // Source development can deliberately connect to run.sh's simulation.
        // Installed applications otherwise start their own local encrypted core.
        #[cfg(desktop)]
        if std::env::var("OMNI_EXTERNAL_CORE").is_ok_and(|value| value == "1") {
            let token = std::env::var("OMNI_LOCAL_TOKEN")
                .map_err(|_| "The development launcher did not provide a session.".to_owned())?;
            if token.len() != 64 || !token.bytes().all(|value| value.is_ascii_hexdigit()) {
                return Err("The development launcher session is invalid.".into());
            }
            return Ok(NativeSession {
                info: NativeSessionInfo { token, mode: "external", core_url: "http://127.0.0.1:3007".into(), collector_url: Some("http://127.0.0.1:3008".into()), platform: std::env::consts::OS },
                core: None,
            });
        }
        let data_dir = app.path().app_local_data_dir()
            .map_err(|_| "The application's private storage is unavailable.".to_owned())?
            .join("vault-v1");
        let exists = data_dir.join("vault.db").exists();
        let key_app = app.clone();
        let (key, storage) = tauri::async_runtime::spawn_blocking(move || {
            let device = key_app.omni_device();
            device.vault_key(exists).map(|key| (key, device.storage_label().to_owned()))
                .map_err(|error| error.to_string())
        }).await.map_err(|_| "The system key store could not be opened.".to_owned())??;
        let mut options = EmbeddedOptions::new(data_dir, key, storage);
        #[cfg(desktop)]
        {
            options.managed_policy = omni_core::policy::managed_from_env()
                .map_err(|_| "The organization policy or its pinned digest could not be validated. Ask your administrator to repair the protected launch configuration; startup was refused.".to_owned())?;
        }
        options.listen = false;
        #[cfg(mobile)]
        {
            // Phones do not run a desktop Ollama installation. A cloud provider
            // remains unconfigured until its owner supplies a key and model.
            options.llm_base = "https://api.openai.com/v1".into();
            options.llm_model = String::new();
        }
        let core = runtime::start(options).await
            .map_err(|_| "Your local vault could not be opened. Check device storage and your system key store. Existing vault data has not been replaced.".to_owned())?;
        let info = NativeSessionInfo { token: core.owner_token().to_owned(), mode: "embedded", core_url: core.core_address().to_owned(), collector_url: None, platform: std::env::consts::OS };
        Ok::<_, String>(NativeSession { info, core: Some(Arc::new(core)) })
    }).await?;
    Ok(session.info.clone())
}

#[derive(Serialize)]
pub struct NativeResponse {
    status: u16,
    body: String,
}

#[tauri::command]
pub async fn core_request(
    window: tauri::WebviewWindow,
    state: State<'_, NativeState>,
    token: String,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<NativeResponse, String> {
    main_window(&window)?;
    let session = state
        .session
        .get()
        .ok_or("Open your local session first.")?;
    if !bool::from(token.as_bytes().ct_eq(session.info.token.as_bytes())) {
        return Ok(NativeResponse {
            status: 401,
            body: r#"{"error":"Session token not accepted"}"#.into(),
        });
    }
    let Some(core) = &session.core else {
        return Err("This development session uses its local HTTP service.".into());
    };
    let _permit = state.requests.try_acquire().map_err(|_| {
        "Too many requests are active. Wait for an existing request to finish.".to_owned()
    })?;
    let EmbeddedResponse { status, body } = core.request(&method, &path, body).await
        .map_err(|_| "The local request could not finish. Check History before retrying; it may have reached its destination.".to_owned())?;
    Ok(NativeResponse { status, body })
}

#[derive(serde::Serialize)]
pub struct GatewayStatus {
    enabled: bool,
    address: Option<String>,
    scope: &'static str,
}

#[tauri::command]
pub async fn client_gateway(
    window: tauri::WebviewWindow,
    state: State<'_, NativeState>,
    token: String,
    enabled: Option<bool>,
) -> Result<GatewayStatus, String> {
    main_window(&window)?;
    let session = state
        .session
        .get()
        .ok_or("Open your local session first.")?;
    if !bool::from(token.as_bytes().ct_eq(session.info.token.as_bytes())) {
        return Err("Session token not accepted".into());
    }
    let core = session
        .core
        .as_ref()
        .ok_or("This development session already uses its external gateway")?;
    let mut gateway = state.gateway.lock().await;
    if let Some(enabled) = enabled {
        if !enabled {
            *gateway = None;
        } else if gateway.is_none() {
            *gateway = Some(
                core.start_client_gateway()
                    .await
                    .map_err(|_| "Cannot open the local client gateway")?,
            );
        }
    }
    Ok(GatewayStatus {
        enabled: gateway.is_some(),
        address: gateway.as_ref().map(|g| g.address.clone()),
        scope: "loopback-approved-clients-only",
    })
}
