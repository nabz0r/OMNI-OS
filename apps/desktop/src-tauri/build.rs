fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["local_session_token", "open_setup_resource"]),
    ))
    .expect("Could not build the restricted desktop command manifest");
}
