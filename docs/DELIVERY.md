# macOS and Android MVP delivery

The updated **0.3.0 evaluation delivery** is available locally in `deliverables/OMNI-0.3.0-mvp/`. Open `START-HERE.html` for the offline installation guide. The complete folder is also archived as `deliverables/OMNI-0.3.0-mvp.zip`. This local delivery is distinct from the preserved [public 0.2.0 release](https://github.com/nabz0r/OMNI-OS/releases/tag/v0.2.0); no 0.3.0 public release is claimed.

| Package | Compatibility | Distribution identity |
| --- | --- | --- |
| `macOS/OMNI-0.3.0-macOS-arm64.dmg` | Apple Silicon, macOS 14.4+ | Ad-hoc resource seal; no Developer ID or notarization |
| `macOS/OMNI.app` and application ZIP | The same Apple Silicon application | Same identity as the disk-image application |
| `Android/OMNI-0.3.0-android.apk` | Android API 24+, ARM64 or x86_64; current System WebView | Development signing key; not a Play Store release |

Both applications embed the Rust runtime and encrypted vault; Node.js, Rust, Docker and a separate OMNI server are unnecessary for normal use. A working model endpoint or provider account is required for inference. This update adds explicit conversation import from supported ChatGPT, Claude and neutral JSON files, review before extraction, proposed memories without sharing grants, and policy inspection of decoded imported messages. See [the import guide](CONVERSATION_IMPORT.md) and [release notes](releases/v0.3.0.md).

The folder contains `delivery.json`, SHA-256 checksums, native acceptance reports, Android screenshots and `OMNI-0.3.0-source.zip`, the exact source snapshot for both applications. Binaries and generated evidence remain outside Git. Retained local packages are separate from Actions artifacts, which expire after 14 days.

## Source feature versions

Both 0.3.0 applications were built from the same clean snapshot, `fe7dbf5c9cf0412a32f5a1977cfc51f30941b5e1`. This is the verified merge snapshot of application commit `a2f582592da58f843f139342ba02f10172188f30` with the previous main branch. The source archive preserves it independently of the pull request. Later delivery-documentation edits do not change the compiled application. The previous 0.1.0 and 0.2.0 delivery folders remain preserved.

## Acceptance boundary

macOS requires successful package creation, a fresh encrypted vault initialized by the actual native application, a valid application resource seal and a valid DMG checksum. A linker-only Mach-O signature does not seal the completed `.app`: the build now explicitly applies an ad-hoc bundle signature and rejects a failed `codesign --verify --deep --strict` check. This verifies package integrity, not the publisher's Apple identity. Gatekeeper and existing-vault Keychain authorization remain normal OS decisions.

Android acceptance installs the exact APK on a deliberately selected disposable emulator. It verifies native initialization and restart, then drives the real Android WebView through the production Tauri bridge. The response provider is a loopback-only synthetic fixture forwarded through ADB. No native command, API response, gateway or vault is replaced by a mock. The run checks setup, discovery, inference, ungranted-memory exclusion, token history, the OS export chooser without selecting a recipient, metadata-only export, interface locking and persistence after process restart. A SHA-256 digest binds the report to the tested APK. The 0.3.0 run passed 38 checks, including native policy editing, allowed file types, blocked-provider non-delivery, reviewed conversation import, decoded-message policy denial and import persistence. Five separate Android Keystore instrumentation tests also passed. A seven-check in-place upgrade run installed 0.3.0 over the 0.2.0 APK with the same signing certificate and verified preservation of synthetic memory and settings.

Android 15 AOSP ARM64 is the local acceptance environment. Passing on an emulator is not evidence for every physical phone, Android API level, vendor power policy or store review. The [validation report](VALIDATION.md) distinguishes these results from broader release milestones.

## Reproduce the Android acceptance run

Prepare the SDK and development APK using the [platform instructions](PLATFORMS.md). Start a dedicated Android emulator with an empty OMNI installation and supply its explicit serial. Existing OMNI installations are refused; the script never removes them automatically.

```bash
CI=true node scripts/qa-android.mjs \
  --serial emulator-5558 \
  --apk artifacts/platforms/android/app-universal-debug.apk \
  --output .omni/delivery-qa-0.3.0/android-native-acceptance.json
```

`ANDROID_HOME` must identify the SDK. Only `emulator-N` devices with the Android emulator property are accepted; physical devices are refused. Playwright attaches to the development APK's WebView. The check leaves a synthetic test vault on the selected emulator and closes the application and fixture when finished. It does not inspect an owner's personal vault.

Run the five Keystore instrumentation cases through the generated Gradle project's `:tauri-plugin-omni-device:connectedDebugAndroidTest` task, with `ANDROID_SERIAL` set to that emulator and `TAURI_ANDROID_PROJECT_PATH` set to the generated Android project. Review the resulting JUnit report, and record the successful five-case result in `android-keystore-tests.json`. APK signature output belongs in `android-apk-signature.txt`.

## Reproduce the in-place Android upgrade

Use a separate disposable emulator with no OMNI installation. The script refuses an existing installation and does not uninstall anything. It installs the supplied old APK, creates only synthetic data, applies the new APK with `adb install -r`, then verifies the original memory, settings and new policy console.

```bash
CI=true node scripts/qa-android-upgrade.mjs \
  deliverables/OMNI-0.2.0-mvp/Android/OMNI-0.2.0-android.apk \
  --serial emulator-5558 \
  --apk artifacts/platforms/android/app-universal-debug.apk \
  --output .omni/delivery-qa-0.3.0/android-upgrade.json
```

`ANDROID_HOME`, JDK 17 and `PATH` must be configured. The two APKs must have the same signing certificate. A successful test leaves its synthetic vault on the test emulator. Fresh-install acceptance needs a different empty test installation; never remove a personal vault to make a test pass.

## Assemble verified packages

`node scripts/assemble-delivery.mjs` accepts seven explicit inputs: `--macos`, `--android`, `--evidence`, `--macos-revision`, `--android-revision`, `--macos-run` and `--previous-delivery`. The previous-delivery directory identifies and verifies the exact older APK used for the upgrade check. The first three are the directories containing platform build records and Android acceptance evidence. Revisions must be full Git commit IDs from those builds; the run URL identifies the macOS native startup check.

Assembly runs on macOS with `ANDROID_HOME` and Java configured. It requires successful build and runtime reports, verifies the APK against its exact acceptance digest, verifies the platform package hashes and the previous APK against the upgrade report, checks the Android signature, extracts the Mac application, validates its resource seal and verifies the DMG. It then writes the versioned visual guide, installation instructions, exact source archive, evidence and complete file inventory into the delivery folder. It derives the destination version from the application configuration, requires both clean-source build records to match that version and the same source revision, and checks policy and upgrade evidence against the delivered APK. It refuses to overwrite an existing delivery.

To verify a received folder on a Mac:

```bash
cd deliverables/OMNI-0.3.0-mvp
shasum -a 256 -c SHA256SUMS
```

## Before broader distribution

A stable Developer ID and notarized macOS release, a protected persistent Android release key, physical-device testing and verified recovery remain release work. Development signing is not a durable public update strategy. Do not tell someone to uninstall their personal vault to fix an APK signature mismatch. Each installation owns a separate key and vault; complete cross-device backup and synchronization are not implemented.

The [included installation guide template](../scripts/delivery/README.md) describes OS permissions, supported hardware, provider setup and current boundaries in user-facing English.

## Existing public-release workflow

This workflow was used for the preserved 0.2.0 release. The 0.3.0 delivery above remains local, with its source and documentation proposed in the delivery branch.

The [evaluation publication workflow](../.github/workflows/publish-evaluation.yml) accepts public package inputs on an explicitly pushed `codex/publish-*` branch. The temporary branch carries only a manifest, release notes and bounded chunks of an archive containing the six release assets. It contains no vault, signing key or runtime credential. Application code and documentation remain on `main`; installers are attached to the version tag, not committed to `main`.

The [publisher](../scripts/publish-evaluation.py) verifies the tag, source revisions, clean build records, package hashes, native policy acceptance, upgrade evidence and Keystore report. It then creates a draft pre-release, verifies every uploaded asset's GitHub SHA-256 digest, and publishes only after those checks pass. `--verify-only` performs the checks locally without publication. The short-lived workflow token is used only inside Actions. Once the published assets have been independently checked, the input branch can be removed; the release assets remain available.
