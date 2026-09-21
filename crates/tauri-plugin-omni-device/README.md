# OMNI native device bridge

This internal Tauri plugin provides system key custody, one fixed browser link, and owner-requested metadata exports. It has no JavaScript API or frontend permissions. Its invoke handler rejects every webview call, including Tauri's mobile fallback path. The application calls it directly from Rust.

## Native API

```rust
use tauri_plugin_omni_device::OmniDeviceExt;

// Register tauri_plugin_omni_device::init() on the application builder.
let device = app.omni_device();
let key: [u8; 32] = device.vault_key(vault_exists)?;
let storage: &str = device.storage_label();
device.open_ollama()?;
let status = device.save_export(
    "omni-history.json",
    "{\"items\":[]}",
    "application/json",
)?;
```

Call these methods from a blocking worker. Key-store prompts, native callbacks, browser helpers, and file writes must not block the UI thread. `vault_exists` must reflect the actual encrypted database before requesting a key. The caller must not display or return the key to JavaScript.

## Key custody

| Platform | Storage label                | Implementation                                                                                |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| macOS    | `macos-keychain`             | System Keychain through `keyring` 3.6.3, `apple-native`                                       |
| Windows  | `windows-credential-manager` | Credential Manager through `windows-native`                                                   |
| Linux    | `linux-secret-service`       | A session Secret Service through `sync-secret-service` and `crypto-rust`                      |
| Android  | `android-keystore`           | AndroidKeyStore AES-GCM wrapping key; encrypted SQLCipher-key envelope in private preferences |
| iOS      | `ios-keychain`               | A non-synchronizing Keychain item with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`         |

Desktop entries use the application identifier as their service and `vault-v1` as their account. A file lock containing no secret serializes first creation across desktop processes. Android serializes its native operations and takes an empty private file lock. iOS creates its Keychain item atomically and reads a concurrent creator's item without replacing it.

A missing key for an existing vault, a malformed saved key, a locked store, or an unavailable store stops startup. There is no plaintext-key file fallback and no silent recovery by replacing the key. Newly created keys are read back before a vault can be created.

The SQLCipher key is 32 random bytes. It is not derived from a fingerprint, machine identifier, password, or device biometric. SQLCipher needs the plaintext key in native process memory. The mobile callback also serializes those bytes internally between Swift/Kotlin and Rust; this is not a hardware-isolated memory boundary. The plugin does not log keys, native exception text, or export contents. Rust errors exposed to the application use fixed messages.

Android uses a non-exportable 256-bit AES key, a fresh GCM IV, a 128-bit authentication tag, and fixed version-specific associated data. Its envelope contains only `version`, `iv`, and `ciphertext`. Hardware backing depends on the device; the implementation does not require or claim StrongBox. These distinctions follow the [Android Keystore model](https://developer.android.com/privacy-and-security/keystore).

The iOS key is available while the device is unlocked and does not migrate to another device. See [Apple's accessibility definition](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly). The desktop feature selection is explicit; a Linux installation needs a working, unlocked Secret Service rather than a plaintext fallback. See the [keyring feature list](https://docs.rs/crate/keyring/3.6.3/features).

Copying a database or restoring application files is not a complete backup of its system key. Android hosts should disable automatic application backup; restoring an envelope without its AndroidKeyStore key fails closed. Device loss, key-store reset, key invalidation, and moving an iOS vault to a different device require a separate recovery design. This plugin does not implement key export, synchronization, rotation, or recovery.

## Fixed browser destination

`open_ollama()` opens only `https://ollama.com/download`. It accepts no URL, executable, command, or path. Desktop uses a fixed platform browser helper without a shell; Android and iOS use their system URL-opening APIs. Opening the page does not install Ollama, and the page does not imply that a desktop Ollama server runs on a phone.

## Metadata exports

`save_export(name, contents, mime)` accepts only:

- An ASCII name beginning with `omni-`, at most 120 bytes, containing letters, digits, hyphens, underscores, or periods, with no `..` sequence.
- A `.json` file with `application/json`, or a `.csv` file with `text/csv`.
- At most 2 MiB of UTF-8 content.

Validation runs in Rust and again in each mobile implementation. The host application remains responsible for selecting metadata and excluding secrets before invoking the plugin; file validation cannot prove that arbitrary JSON contains no sensitive data.

On desktop, exports are written to `Documents/OMNI`. Exclusive file creation preserves existing exports and adds a numbered suffix when necessary. Unix export files are created with mode `0600`. The result names the saved location.

On Android, the plugin prepares a file in its private cache and opens a system chooser. A non-exported FileProvider exposes only the export cache subtree, using a temporary read grant for the selected recipient. Files can remain in the application cache until the operating system or application storage cleanup removes them.

On iOS, the plugin prepares a protected temporary file and presents `UIActivityViewController`, including an iPad popover anchor. It deletes that temporary export after the sheet completes. The user chooses whether to save or share and can cancel. Both mobile implementations return `Choose a destination in the system share sheet.` when presentation succeeds; this does not claim a file was saved or a recipient received it.

Exports are deliberately readable files outside the encrypted vault. Their contents leave the application's control when the owner saves or shares them. No recipient is selected automatically.

## Validation

```sh
cargo test --manifest-path crates/tauri-plugin-omni-device/Cargo.toml
cargo clippy --manifest-path crates/tauri-plugin-omni-device/Cargo.toml --all-targets -- -D warnings
```

The Rust tests cover missing and corrupted key handling, store and random-source failures, first creation and reuse, durable readback, the fixed browser destination, export path validation, UTF-8 byte limits, and preservation of existing export files. They use an in-memory credential store and do not alter a developer's Keychain.

Android instrumentation tests use isolated temporary aliases to exercise real AndroidKeyStore wrapping, persistence across store instances, malformed and tampered envelopes, a missing wrapping key, and refusal to replace an existing vault's missing key. They require an Android device or emulator and must run separately from Rust tests.

A successful desktop Rust build does not verify Android JNI, an iOS app build, mobile share-sheet behavior, Linux Secret Service availability, or Windows credential persistence. Platform compilation and runtime smoke tests are separate acceptance checks.
