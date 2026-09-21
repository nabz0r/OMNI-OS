pub type Result<T> = std::result::Result<T, Error>;

/// Only fixed, non-sensitive messages cross the application boundary.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    #[error("The vault key is missing from your system key store. Existing vault data has not been replaced. Restore its original key to reopen it.")]
    MissingKey,
    #[error("The stored vault key is invalid. Existing vault data has not been replaced.")]
    InvalidKey,
    #[error("Your system key store is unavailable or locked. Unlock it and try again. On Linux, a running Secret Service is required.")]
    SecureStoreUnavailable,
    #[error("The system key store could not save and verify the vault key. The vault has not been opened.")]
    KeyPersistence,
    #[error("The application's private storage is unavailable. Check its permissions and available disk space.")]
    LocalStorageUnavailable,
    #[error("Another OMNI window is initializing the vault. Wait for it to finish and try again.")]
    Busy,
    #[error("The device could not generate a secure random vault key. Try again after restarting the app.")]
    RandomUnavailable,
    #[error("The official Ollama page could not be opened. Visit https://ollama.com/download in your browser.")]
    BrowserUnavailable,
    #[error("The device security bridge is unavailable. Restart the app and try again.")]
    NativeBridgeUnavailable,
    #[error(
        "Choose an OMNI JSON or CSV metadata export of at most 2 MiB with a simple file name."
    )]
    InvalidExport,
    #[error("The export could not be saved or shared. Check available storage and try again.")]
    ExportUnavailable,
}

#[cfg(mobile)]
impl From<tauri::plugin::mobile::PluginInvokeError> for Error {
    fn from(error: tauri::plugin::mobile::PluginInvokeError) -> Self {
        use tauri::plugin::mobile::PluginInvokeError;
        // Native errors can contain untrusted key-store data. Never format them.
        match error {
            PluginInvokeError::InvokeRejected(error) => match error.code.as_deref() {
                Some("missing_key") => Self::MissingKey,
                Some("invalid_key") => Self::InvalidKey,
                Some("store_unavailable") => Self::SecureStoreUnavailable,
                Some("key_persistence") => Self::KeyPersistence,
                Some("random_unavailable") => Self::RandomUnavailable,
                Some("browser_unavailable") => Self::BrowserUnavailable,
                Some("invalid_export") => Self::InvalidExport,
                Some("export_unavailable") => Self::ExportUnavailable,
                _ => Self::NativeBridgeUnavailable,
            },
            _ => Self::NativeBridgeUnavailable,
        }
    }
}
