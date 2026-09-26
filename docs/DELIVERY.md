<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Releases

> **Delivery reference** · Find the local 0.4.0 packages, retained public release and reproducible acceptance procedure.
<!-- /omni:header -->

# macOS and Android evaluation delivery

OMNI 0.4.0 adds Work authority, approved clients, explicit text continuity and bounded encrypted recovery to the shared native applications. Application source, documentation, test recipes and release records are on `main`. Generated installers are stored in the local delivery folder and GitHub Actions artifacts; they are not committed as large binaries in Git.

## Open the local package

Open `deliverables/OMNI-0.4.0-mvp/START-HERE.html` on the delivery machine. The ignored folder is not present in a fresh clone. It contains installers, an extracted Mac app, a portable installation guide, exact-source archive, checksums and native acceptance evidence. The preserved [public 0.2.0 release](https://github.com/nabz0r/OMNI-OS/releases/tag/v0.2.0) predates Work and conversation import; no public 0.4.0 release is claimed here.

| Package | Target | Distribution identity |
| --- | --- | --- |
| `macOS/OMNI-0.4.0-macOS-arm64.dmg` | Apple Silicon, macOS 14.4+ | Ad-hoc resource seal; no Developer ID or notarization |
| `macOS/OMNI.app` and application ZIP | Same Apple Silicon application | Same identity as the disk-image application |
| `Android/OMNI-0.4.0-android.apk` | Android API 24+, ARM64/x86_64; current System WebView | Development signing key; not a Play Store release |

Both applications embed the Rust runtime and SQLCipher vault. No separate OMNI server, Node.js, Rust or Docker is needed for ordinary use. Inference still needs your chosen model endpoint/API account. Read [Work](WORK.md) and [Recovery](RECOVERY.md) before adding work data. Work enrollment labels the current single-owner vault; use a dedicated installation rather than mixing personal and employer records.

## Provenance and evidence

`delivery.json` identifies each package hash, source revision, signing scope, exact Android acceptance digest and macOS CI run. `OMNI-0.4.0-source.zip` preserves the clean source checkpoint used for both applications. Later documentation commits do not change those binaries. `SHA256SUMS` inventories the files. Native and controlled-loop records are summarised in [Validation](VALIDATION.md) and [Work verification](WORK_VERIFICATION.md).

macOS acceptance requires native startup with fresh OS-key-backed encrypted-vault initialization, a sealed application bundle and a verified DMG. It does not certify a real provider workflow or a physical recovery drill. A linker-only Mach-O signature is insufficient; assembly verifies the entire application resource seal.

Android acceptance uses the exact delivered APK on a dedicated Android 15 AOSP ARM64 emulator, the real WebView, native IPC, encrypted vault and Keystore. A loopback synthetic provider verifies request behavior without paid model calls. The suite covers setup, requests, policies, import, metadata export, lock/restart, Work enrollment, explicit native gateway start/stop, client approval/revocation and consented conversation storage/deletion. Keystore instrumentation and an in-place update from the exact local 0.3.0 APK are separate records. Build targets are not evidence for every API level, physical phone or mobile background policy.

Old local delivery directories and dated evidence remain preserved. Actions artifacts expire after 14 days; retained local delivery folders are separate copies.

## Reproduce Android verification

Prepare the SDK, JDK 17, Node.js and native targets described in [Platforms](PLATFORMS.md). Use a deliberately selected disposable emulator with no OMNI installation. The scripts refuse an existing installation and never remove it automatically.

```bash
CI=true node scripts/qa-android.mjs \
  --serial emulator-5560 \
  --apk artifacts/platforms/android/app-universal-debug.apk \
  --output .omni/delivery-qa-0.4.0/android-native-acceptance.json
```

`ANDROID_HOME` must identify the SDK. Only explicit `emulator-N` devices with the emulator property are accepted. The test leaves its synthetic vault on that device. No personal vault or commercial provider is used.

Run `:tauri-plugin-omni-device:connectedDebugAndroidTest` in the generated Gradle project with `ANDROID_SERIAL` set to the same disposable emulator and `TAURI_ANDROID_PROJECT_PATH` set to the generated project. Inspect the actual five-case JUnit report before writing `android-keystore-tests.json`; it must contain no failures, errors or skips. Preserve the JUnit XML and APK signature evidence.

Use a **different empty emulator** for the update:

```bash
CI=true node scripts/qa-android-upgrade.mjs \
  deliverables/OMNI-0.3.0-mvp/Android/OMNI-0.3.0-android.apk \
  --serial emulator-5562 \
  --apk artifacts/platforms/android/app-universal-debug.apk \
  --output .omni/delivery-qa-0.4.0/android-upgrade.json
```

The old and new APK must share the same signing certificate. The test creates synthetic old-version memory/settings, updates without uninstalling and checks preservation, new schema/UI availability, no implicit work enrollment and no implicit conversation storage consent. Never uninstall a personal vault to make a signature mismatch disappear.

## Assemble and verify

`node scripts/assemble-delivery.mjs` requires `--macos`, `--android`, `--evidence`, `--macos-revision`, `--android-revision`, `--macos-run` and `--previous-delivery`. The platform inputs must be clean, matching-version builds from the same source revision. The macOS run is the native startup evidence. The older local delivery identifies the exact APK used for the update check.

Assembly verifies the inputs, APK signing, exact acceptance digest, update source/destination hashes, mandatory native checks, Keystore result, Mac bundle and DMG integrity. It copies evidence and the source archive, writes the guide and inventories the completed folder. It refuses to overwrite an existing delivery.

```bash
cd deliverables/OMNI-0.4.0-mvp
shasum -a 256 -c SHA256SUMS
```

Build directories can contain unrelated old or failed attempts; only artifacts referenced by a successful manifest belong in the delivery. Do not reuse another binary's passing test report.

## Remaining distribution gates

Developer ID/notarization, a protected persistent Android production key, physical-device acceptance, actual lost-device recovery drills, commercial-provider workflows and independent security assessment remain open. The encrypted archive is a bounded implemented mechanism, not certification of every recovery scenario. See [the external assessment scope](EXTERNAL_REVIEW.md).

## Existing public-release workflow

The preserved 0.2.0 release used the [evaluation publication workflow](../.github/workflows/publish-evaluation.yml) and [verifying publisher](../scripts/publish-evaluation.py). Publication is distinct from this local delivery: it verifies manifests and asset digests before creating a tagged pre-release. Application source stays on `main`; versioned installers belong in release assets, not the Git source tree. No publication of 0.4.0 is implied by a local successful build.

<!-- omni:footer -->
---

**Continue reading** · [OMNI 0.3.0](releases/v0.3.0.md) · [OMNI 0.2.0](releases/v0.2.0.md) · [Offline installation guide template](../scripts/delivery/README.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
