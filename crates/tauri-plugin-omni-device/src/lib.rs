use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(desktop)]
mod desktop;
mod error;
mod exports;
mod key_material;
#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
pub use desktop::OmniDevice;
pub use error::{Error, Result};
#[cfg(mobile)]
pub use mobile::OmniDevice;

/// Native-only access from an application, handle, or window.
pub trait OmniDeviceExt<R: Runtime> {
    fn omni_device(&self) -> &OmniDevice<R>;
}

impl<R: Runtime, T: Manager<R>> OmniDeviceExt<R> for T {
    fn omni_device(&self) -> &OmniDevice<R> {
        self.state::<OmniDevice<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("omni-device")
        // Returning true also prevents Tauri's automatic mobile-command fallback.
        // Native callers use PluginHandle directly; no key crosses webview IPC.
        .invoke_handler(|invoke| {
            invoke
                .resolver
                .reject("Device security operations are available only to the native application.");
            true
        })
        .setup(|app, api| {
            #[cfg(mobile)]
            let device = mobile::init(app, api)?;
            #[cfg(desktop)]
            let device = desktop::init(app, api)?;
            app.manage(device);
            Ok(())
        })
        .build()
}
