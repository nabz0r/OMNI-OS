use std::{
    fs::OpenOptions,
    process::{Command, Stdio},
};

use fs2::FileExt;
use rand::{rngs::OsRng, RngCore};
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Manager, Runtime};

use crate::{
    key_material::{load_or_create, KeyStore},
    Error, Result,
};

const OLLAMA_URL: &str = "https://ollama.com/download";

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<OmniDevice<R>> {
    Ok(OmniDevice(app.clone()))
}

/// Native-only access to the application's system credential store.
pub struct OmniDevice<R: Runtime>(AppHandle<R>);

struct SystemStore(keyring::Entry);

impl KeyStore for SystemStore {
    fn read(&self) -> Result<Option<Vec<u8>>> {
        match self.0.get_secret() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            // BadEncoding and platform errors may contain raw data. Discard them.
            Err(_) => Err(Error::SecureStoreUnavailable),
        }
    }

    fn write(&self, value: &[u8; 32]) -> Result<()> {
        self.0.set_secret(value).map_err(|_| Error::KeyPersistence)
    }
}

impl<R: Runtime> OmniDevice<R> {
    /// Saves a metadata export to Documents/OMNI without replacing an existing file.
    pub fn save_export(&self, name: &str, contents: &str, mime: &str) -> Result<String> {
        crate::exports::validate_export(name, contents, mime)?;
        let directory = self
            .0
            .path()
            .document_dir()
            .map_err(|_| Error::ExportUnavailable)?
            .join("OMNI");
        crate::exports::save_to_directory(&directory, name, contents, mime)
    }

    /// Call from a blocking worker: unlocking a credential store can prompt.
    pub fn vault_key(&self, vault_exists: bool) -> Result<[u8; 32]> {
        let directory = self
            .0
            .path()
            .app_local_data_dir()
            .map_err(|_| Error::LocalStorageUnavailable)?;
        std::fs::create_dir_all(&directory).map_err(|_| Error::LocalStorageUnavailable)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        // The lock contains no key and serializes creation across processes.
        let lock = options
            .open(directory.join("vault-key.lock"))
            .map_err(|_| Error::LocalStorageUnavailable)?;
        FileExt::try_lock_exclusive(&lock).map_err(|_| Error::Busy)?;
        let entry = keyring::Entry::new(&self.0.config().identifier, "vault-v1")
            .map_err(|_| Error::SecureStoreUnavailable)?;
        load_or_create(&SystemStore(entry), vault_exists, |key| {
            OsRng
                .try_fill_bytes(key)
                .map_err(|_| Error::RandomUnavailable)
        })
    }

    pub fn storage_label(&self) -> &'static str {
        #[cfg(target_os = "macos")]
        {
            "macos-keychain"
        }
        #[cfg(target_os = "windows")]
        {
            "windows-credential-manager"
        }
        #[cfg(target_os = "linux")]
        {
            "linux-secret-service"
        }
    }

    /// Opens one compiled-in official URL; no shell or caller-provided argument.
    pub fn open_ollama(&self) -> Result<()> {
        let (program, arguments) = browser_command();
        let status = Command::new(program)
            .args(arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|_| Error::BrowserUnavailable)?;
        if status.success() {
            Ok(())
        } else {
            Err(Error::BrowserUnavailable)
        }
    }
}

fn browser_command() -> (&'static str, &'static [&'static str]) {
    #[cfg(target_os = "macos")]
    {
        ("/usr/bin/open", &[OLLAMA_URL])
    }
    #[cfg(target_os = "linux")]
    {
        ("xdg-open", &[OLLAMA_URL])
    }
    #[cfg(target_os = "windows")]
    {
        ("rundll32.exe", &["url.dll,FileProtocolHandler", OLLAMA_URL])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_destination_is_fixed_and_has_no_shell() {
        let (program, arguments) = browser_command();
        assert!(!["sh", "bash", "cmd", "powershell"].contains(&program));
        assert_eq!(arguments.last(), Some(&OLLAMA_URL));
        assert_eq!(OLLAMA_URL, "https://ollama.com/download");
    }
}
