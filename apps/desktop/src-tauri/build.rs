fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "native_session",
            "core_request",
            "save_metadata",
            "open_setup_resource",
        ]),
    ))
    .expect("Could not build the restricted desktop command manifest");
}
