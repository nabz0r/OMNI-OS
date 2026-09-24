# macOS and Android MVP delivery

The local delivery lives at `deliverables/OMNI-0.1.0-mvp/`. Open `START-HERE.html` for the visual installation guide, or read the included `README.md`. The applications embed the Rust runtime: installing Node.js, Rust, Docker or an OMNI server is unnecessary for normal use. A working model endpoint or provider account is still required for inference.

| Package                              | Compatibility                                            | Distribution identity                                 |
| ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| `macOS/OMNI-0.1.0-macOS-arm64.dmg`   | Apple Silicon, macOS 14.4+                               | Ad-hoc resource seal; no Developer ID or notarization |
| `macOS/OMNI.app` and application ZIP | The same Apple Silicon application                       | Same identity as the disk-image application           |
| `Android/OMNI-0.1.0-android.apk`     | Android API 24+, ARM64 or x86_64; current System WebView | Development signing key; not a Play Store release     |

The delivery includes `delivery.json`, a SHA-256 inventory, native acceptance reports and screenshots from the actual Android APK. Source revisions are recorded separately for each package. Binaries and generated runtime evidence remain outside Git; the assembly procedure, tests and guide templates are versioned. Evaluation artifacts from GitHub Actions expire after 14 days, while the local delivery remains available on disk.

## Acceptance boundary

macOS requires successful package creation, a fresh encrypted vault initialized by the actual native application, a valid application resource seal and a valid DMG checksum. A linker-only Mach-O signature does not seal the completed `.app`: the build now explicitly applies an ad-hoc bundle signature and rejects a failed `codesign --verify --deep --strict` check. This verifies package integrity, not the publisher's Apple identity. Gatekeeper and existing-vault Keychain authorization remain normal OS decisions.

Android acceptance installs the exact APK on a deliberately selected disposable emulator. It verifies native initialization and restart, then drives the real Android WebView through the production Tauri bridge. The response provider is a loopback-only synthetic fixture forwarded through ADB. No native command, API response, gateway or vault is replaced by a mock. The run checks setup, discovery, inference, ungranted-memory exclusion, token history, the OS export chooser without selecting a recipient, metadata-only export, interface locking and persistence after process restart. A SHA-256 digest binds the report to the tested APK. Five separate Android Keystore instrumentation tests must also pass.

Android 15 AOSP ARM64 is the local acceptance environment. Passing on an emulator is not evidence for every physical phone, Android API level, vendor power policy or store review. The [validation report](VALIDATION.md) distinguishes these results from broader release milestones.

## Reproduce the Android acceptance run

Prepare the SDK and development APK using the [platform instructions](PLATFORMS.md). Start a dedicated Android emulator with an empty OMNI installation and supply its explicit serial. Existing OMNI installations are refused; the script never removes them automatically.

```bash
CI=true node scripts/qa-android.mjs \
  --serial emulator-5558 \
  --apk artifacts/platforms/android/app-universal-debug.apk \
  --output .omni/delivery-qa/android-native-acceptance.json
```

`ANDROID_HOME` must identify the SDK. Only `emulator-N` devices with the Android emulator property are accepted; physical devices are refused. Playwright attaches to the development APK's WebView. The check leaves a synthetic test vault on the selected emulator and closes the application and fixture when finished. It does not inspect an owner's personal vault.

Run the five Keystore instrumentation cases through the generated Gradle project's `:tauri-plugin-omni-device:connectedDebugAndroidTest` task, with `ANDROID_SERIAL` set to that emulator and `TAURI_ANDROID_PROJECT_PATH` set to the generated Android project. Review the resulting JUnit report, and record the successful five-case result in `android-keystore-tests.json`. APK signature output belongs in `android-apk-signature.txt`.

## Assemble verified packages

`node scripts/assemble-delivery.mjs` accepts six explicit inputs: `--macos`, `--android`, `--evidence`, `--macos-revision`, `--android-revision` and `--macos-run`. The first three are the directories containing platform build records and Android acceptance evidence. Revisions must be full Git commit IDs from those builds; the run URL identifies the macOS native startup check.

Assembly runs on macOS with `ANDROID_HOME` and Java configured. It requires successful build and runtime reports, verifies the APK against its exact acceptance digest, verifies the platform package hashes, checks the Android signature, extracts the Mac application, validates its resource seal and verifies the DMG. It then writes the visual guide, installation instructions, evidence and complete file inventory into the delivery folder. It refuses to overwrite an existing delivery.

To verify a received folder on a Mac:

```bash
cd deliverables/OMNI-0.1.0-mvp
shasum -a 256 -c SHA256SUMS
```

## Before broader distribution

A stable Developer ID and notarized macOS release, a protected persistent Android release key, physical-device testing and verified recovery remain release work. Development signing is not a durable public update strategy. Do not tell someone to uninstall their personal vault to fix an APK signature mismatch. Each installation owns a separate key and vault; complete cross-device backup and synchronization are not implemented.

The [included installation guide template](../scripts/delivery/README.md) describes OS permissions, supported hardware, provider setup and current boundaries in user-facing English.
