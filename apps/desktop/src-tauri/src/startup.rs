//! Startup signals contain no credentials, paths, conversations, or vault data.
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use tauri::Manager;

#[derive(Default)]
pub struct StartupState {
    visible: AtomicBool,
    ready: AtomicBool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupPhase {
    Interface,
    Ready,
    Recovery,
}

#[tauri::command]
pub fn startup_report(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, StartupState>,
    phase: StartupPhase,
) -> Result<(), &'static str> {
    if window.label() != "main" {
        return Err("Startup reporting is available only to the main window.");
    }
    state.visible.store(true, Ordering::Release);
    if matches!(phase, StartupPhase::Recovery) {
        state.ready.store(false, Ordering::Release);
        println!("OMNI_STARTUP_RECOVERY {}", env!("CARGO_PKG_VERSION"));
    }
    if matches!(phase, StartupPhase::Ready) && !state.ready.swap(true, Ordering::AcqRel) {
        // The packaged smoke test requires this signal from its own child process.
        // Creating a database or keeping an empty native window alive is insufficient.
        println!("OMNI_STARTUP_READY {}", env!("CARGO_PKG_VERSION"));
    }
    Ok(())
}

pub fn watch(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(35));
            if app.state::<StartupState>().visible.load(Ordering::Acquire) {
                return;
            }
            eprintln!("OMNI_STARTUP_STALLED: the interface has not acknowledged startup.");
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || recover(&handle));
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
fn recover(app: &tauri::AppHandle) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSAlert;
    use objc2_foundation::NSString;
    if app.state::<StartupState>().visible.load(Ordering::Acquire) {
        return;
    }
    if app.get_webview_window("main").is_none() {
        return;
    }
    let Some(main_thread) = MainThreadMarker::new() else {
        return;
    };
    let alert = NSAlert::new(main_thread);
    alert.setMessageText(&NSString::from_str("OMNI could not open its interface."));
    alert.setInformativeText(&NSString::from_str(
        "Your saved vault has not been reset. Try reloading the interface. If it remains blank, quit OMNI, restart your Mac, then try again. Reinstalling or deleting your vault is not required."
    ));
    alert.addButtonWithTitle(&NSString::from_str("Reload interface"));
    alert.addButtonWithTitle(&NSString::from_str("Quit OMNI"));
    if alert.runModal() == 1000 {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.reload();
        }
        watch(app);
    } else {
        app.exit(0);
    }
}
