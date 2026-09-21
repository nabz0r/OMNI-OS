#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn local_session_token(window: tauri::WebviewWindow) -> Option<String> {
    if window.label() != "main" {
        return None;
    }
    std::env::var("OMNI_LOCAL_TOKEN")
        .ok()
        .filter(|value| !value.is_empty())
}

const SETUP_OPEN_ERROR: &str =
    "The browser could not be opened. Visit https://ollama.com/download in your browser.";

fn setup_resource_command(
    window_label: &str,
    resource: &str,
    platform: &str,
) -> Result<(&'static str, &'static [&'static str]), &'static str> {
    if window_label != "main" || resource != "ollama" {
        return Err("This setup resource is unavailable.");
    }
    match platform {
        "macos" => Ok(("/usr/bin/open", &["https://ollama.com/download"])),
        "linux" => Ok(("xdg-open", &["https://ollama.com/download"])),
        "windows" => Ok((
            "rundll32.exe",
            &["url.dll,FileProtocolHandler", "https://ollama.com/download"],
        )),
        _ => Err(SETUP_OPEN_ERROR),
    }
}

fn browser_environment_key(key: &std::ffi::OsStr) -> bool {
    let key = key.to_string_lossy().to_ascii_uppercase();
    !["TOKEN", "SECRET", "API_KEY", "PASSWORD"]
        .iter()
        .any(|sensitive| key.contains(sensitive))
}

fn launch_setup_browser(program: &str, arguments: &[&str]) -> Result<(), String> {
    let mut command = Command::new(program);
    command
        .args(arguments)
        .env_clear()
        .envs(std::env::vars_os().filter(|(key, _)| browser_environment_key(key)))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0200); // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    }
    let mut child = command.spawn().map_err(|_| SETUP_OPEN_ERROR.to_owned())?;
    let deadline = Instant::now() + Duration::from_millis(1500);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(SETUP_OPEN_ERROR.to_owned())
                };
            }
            Err(_) => return Err(SETUP_OPEN_ERROR.to_owned()),
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Ok(None) => {
                // Some Linux launchers remain attached to their browser. Reap
                // that process later without blocking the interface or closing it.
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                return Ok(());
            }
        }
    }
}

#[tauri::command]
async fn open_setup_resource(window: tauri::WebviewWindow, resource: String) -> Result<(), String> {
    let (program, arguments) =
        setup_resource_command(window.label(), &resource, std::env::consts::OS)
            .map_err(str::to_owned)?;
    tauri::async_runtime::spawn_blocking(move || launch_setup_browser(program, arguments))
        .await
        .map_err(|_| SETUP_OPEN_ERROR.to_owned())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            local_session_token,
            open_setup_resource
        ])
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
                                let _ =
                                    window.eval("window.dispatchEvent(new Event('omni:launcher'))");
                            }
                        }
                    })
                    .build(),
            )?;
            // A conflicting OS shortcut does not make the local vault inaccessible.
            if let Err(error) = app.global_shortcut().register(shortcut) {
                eprintln!(
                    "OMNI global shortcut unavailable: {error}. Use Command/Ctrl+K in the window."
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("OMNI could not start the desktop window");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_resources_are_fixed_destinations_from_the_main_window_only() {
        for platform in ["macos", "linux", "windows"] {
            let (program, arguments) = setup_resource_command("main", "ollama", platform).unwrap();
            assert!(["/usr/bin/open", "xdg-open", "rundll32.exe"].contains(&program));
            assert_eq!(arguments.last(), Some(&"https://ollama.com/download"));
            for resource in [
                "https://example.com",
                "file:///etc/passwd",
                "ollama;id",
                "",
                "Ollama",
            ] {
                assert_eq!(
                    setup_resource_command("main", resource, platform).unwrap_err(),
                    "This setup resource is unavailable."
                );
            }
            assert!(setup_resource_command("other", "ollama", platform).is_err());
        }
        assert!(setup_resource_command("main", "ollama", "unsupported").is_err());
    }

    #[test]
    fn external_browser_does_not_inherit_application_credentials() {
        for key in [
            "OMNI_LOCAL_TOKEN",
            "OMNI_PAIRING_SECRET",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "PASSWORD",
        ] {
            assert!(!browser_environment_key(std::ffi::OsStr::new(key)));
        }
        for key in ["PATH", "HOME", "DISPLAY", "LANG"] {
            assert!(browser_environment_key(std::ffi::OsStr::new(key)));
        }
    }
}
