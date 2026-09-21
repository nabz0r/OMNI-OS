use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};
use zeroize::Zeroizing;

use crate::{key_material::decode_key, Result};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_omni_device);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<OmniDevice<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("local.omni.device", "OmniDevicePlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_omni_device)?;
    Ok(OmniDevice(handle))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultKeyRequest {
    vault_exists: bool,
}

// Deliberately no Debug: this response contains transient secret material.
#[derive(Deserialize)]
struct VaultKeyResponse {
    key: Vec<u8>,
}

#[derive(Serialize)]
struct ExportRequest<'a> {
    name: &'a str,
    contents: &'a str,
    mime: &'a str,
}

/// Called directly by Rust, never by a frontend invoke.
pub struct OmniDevice<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> OmniDevice<R> {
    pub fn save_export(&self, name: &str, contents: &str, mime: &str) -> Result<String> {
        crate::exports::validate_export(name, contents, mime)?;
        self.0.run_mobile_plugin::<serde::de::IgnoredAny>(
            "saveExport",
            ExportRequest {
                name,
                contents,
                mime,
            },
        )?;
        Ok("Choose a destination in the system share sheet.".to_owned())
    }

    /// Run outside the UI thread; native secure-store operations may block.
    pub fn vault_key(&self, vault_exists: bool) -> Result<[u8; 32]> {
        let response: VaultKeyResponse = self
            .0
            .run_mobile_plugin("vaultKey", VaultKeyRequest { vault_exists })?;
        decode_key(&Zeroizing::new(response.key))
    }

    pub fn storage_label(&self) -> &'static str {
        #[cfg(target_os = "android")]
        {
            "android-keystore"
        }
        #[cfg(target_os = "ios")]
        {
            "ios-keychain"
        }
    }

    pub fn open_ollama(&self) -> Result<()> {
        self.0
            .run_mobile_plugin::<serde::de::IgnoredAny>("openOllama", ())?;
        Ok(())
    }
}
