#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn local_session_token(window: tauri::WebviewWindow) -> Option<String> {
    if window.label() != "main" { return None; }
    std::env::var("OMNI_LOCAL_TOKEN").ok().filter(|value| !value.is_empty())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![local_session_token])
        .setup(|app| {
            let shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space);
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, registered, event| {
                        if registered == &shortcut && event.state() == ShortcutState::Pressed {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                let _ = window.eval("window.dispatchEvent(new Event('omni:launcher'))");
                            }
                        }
                    })
                    .build(),
            )?;
            // A conflicting OS shortcut does not make the local vault inaccessible.
            if let Err(error) = app.global_shortcut().register(shortcut) {
                eprintln!("OMNI global shortcut unavailable: {error}. Use Command/Ctrl+K in the window.");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("OMNI could not start the desktop window");
}
