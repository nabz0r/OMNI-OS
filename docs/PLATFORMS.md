<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Build & operate

> **Reference** · Package targets, key custody, build procedures and measured platform coverage.
<!-- /omni:header -->

# Native platforms and deployment modes

OMNI shares one React/Three.js interface and Rust core across its desktop and mobile targets. The implementation includes native adapters for macOS, Windows, Linux, Android and iOS. This document describes source behavior and build procedures. A target appearing here does not certify a successful build, physical-device test, signed release or store acceptance; current evidence belongs in [VALIDATION.md](VALIDATION.md).

## Current macOS and Android delivery

The local 0.3.0 installers include the reviewed conversation importer and decoded-message policy inspection in the embedded Rust core. The macOS application targets Apple Silicon and macOS 14.4+; Android includes ARM64 and x86_64 with minimum API 24. Android version name is `0.3.0` and version code is `3000`. Both packages use the same clean source snapshot. Native startup on a fresh macOS runner, 38 Android acceptance checks, five Keystore tests and seven update checks from 0.2.0 passed. See [delivery](DELIVERY.md) for package paths and [validation](VALIDATION.md) for scope.

Distribution status is unchanged: the Mac application remains ad-hoc signed and not notarized; Android retains the same local development certificate used for the preceding delivery. The standalone app still has no HTTP listener by default. The separate browser extension therefore does not automatically pair with this native application; native users can explicitly import conversation files through Memory.

## Two deliberately separate modes

| Mode                             | What runs                                                                             | How the interface connects                            | Where the vault lives                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Standalone native application    | Tauri application, embedded Rust core and SQLCipher                                   | Authenticated native IPC; no HTTP listener by default | The OS application-local-data directory, under `vault-v1`                             |
| Source development with `run.sh` | Separate Rust core, Node.js collector and Vite UI; optional native development window | Loopback HTTP on the configured development services  | The development vault selected by the launcher; simulation has its own isolated vault |

The installed native application needs neither Node.js nor a separately installed Rust toolchain to run. Building from source still requires the appropriate toolchain and SDKs. A model service is a separate dependency: the package contains no inference model or model weights.

`./run.sh` explicitly supplies `OMNI_EXTERNAL_CORE=1` to its native development window. That window connects to the launcher-owned services instead of starting a second core. `./run.sh --web` uses the same services through the browser. The flag is a desktop development switch, not the default behavior of an installed application. These modes do not silently migrate or share personal vaults.

## The embedded request path

The main native window calls `native_session` to initialize its core once. Platform Rust code obtains the 32-byte vault key from the device adapter, starts the core with explicit options and returns an owner session capability to the interface. The SQLCipher key is not returned to JavaScript. Owner and restricted agent tokens are randomly generated for the process session rather than read from development token files.

`core_request` requires the main window and the owner token, checks that token in constant time, bounds concurrent requests, and calls the same Axum routes used by the external core. Existing destination policies, grant checks and metadata accounting still apply. The IPC helper limits request bodies to one MiB, response bodies to eight MiB and execution to 190 seconds. It returns a bounded response body to the UI; it is not an incremental browser SSE transport. The lower-level Router and optional HTTP listener retain the gateway's streaming behavior.

The runtime accepts only local request paths. It reports `core_address: "in-process"`, with no pretend `localhost:0` service. Its exclusive vault lease prevents a second embedded runtime from opening the same directory. Shutdown refuses new requests and signals an optional listener to stop; references held by active adapters retain the vault lease until they are dropped.

The reusable Rust runtime can explicitly enable an ephemeral loopback listener. The packaged application's bootstrap leaves that option off. External API clients, MCP clients and browser capture therefore use the separate, explicit gateway workflow in [INTEGRATIONS.md](INTEGRATIONS.md); installing the native app alone does not expose port 3007 to other applications.

## Key custody by platform

| Platform | Runtime label                | Implemented custody                                                                                                                                     | Operational boundary                                                                                                 |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| macOS    | `macos-keychain`             | System Keychain through the native credential adapter                                                                                                   | Keychain access can fail or require the user's OS interaction.                                                       |
| Windows  | `windows-credential-manager` | Windows Credential Manager                                                                                                                              | Access follows the signed-in user's system credential store; this is not an isolated vault process.                  |
| Linux    | `linux-secret-service`       | System Secret Service                                                                                                                                   | A working, unlocked Secret Service session is required; there is no plaintext file fallback.                         |
| Android  | `android-keystore`           | A non-exportable Android Keystore AES-GCM wrapping key protects the random SQLCipher key; private preferences hold the authenticated encrypted envelope | Hardware backing depends on the device. The SQLCipher key is unwrapped into native memory when needed.               |
| iOS      | `ios-keychain`               | Keychain generic password with `WhenUnlockedThisDeviceOnly`, synchronization disabled                                                                   | The item is device-bound and available while the device is unlocked; it is not a portable iCloud recovery mechanism. |

The adapters generate a random key only for a new vault. Missing or invalid key material for an existing database causes an error; it does not overwrite the key, recreate the database or fall back to a development key file. The device plugin rejects frontend invocation of its native key operations.

Hardware identifiers and biometric templates are never used as database keys. This release does not require biometric approval for each read or claim universal Secure Enclave/StrongBox protection. The unlocked native process must hold plaintext and the working SQLCipher key. The platform sandbox and credential store do not isolate the vault from compromise of that process.

## Model and analytics behavior

Desktop starts with a local Ollama profile; an installed, running compatible model is still required for inference. Mobile starts with an unconfigured remote profile and an empty model choice, so the owner must provide a credential and select a model. The app does not turn a website subscription into an API key, silently connect a provider or bundle a mobile local LLM.

Memory extraction remains strictly loopback-only. On a phone without a compatible local inference service, import still saves the source and proposes an excerpt for review. It does not send the source to a cloud extractor as a fallback. A desktop computer on the same Wi-Fi network is not phone loopback, and the existing local-only extraction rule does not authorize it.

Standalone native bootstrap configures no analytics collector and defaults participation to off. The core rejects enabling, preparing or sending analytics when no collector is configured, before creating a report or spending privacy budget. A custom deployment can supply an explicit collector URL to the runtime; it must still obtain consent and preserve the existing ledger. There is no built-in central service, automatic subscription or hidden default telemetry endpoint.

## Interface lock, lifecycle and exports

**Lock session** clears the interface token, conversation and drafts and stops waiting for its pending operations. Native **Unlock on this device** deliberately obtains the current local session again. This is an interface lock, not OS reauthentication, a biometric challenge, vault-key destruction or revocation of another client's credentials. A request already handed to a provider may continue; inspect History before retrying.

Local request policies and text attachments use the shared Rust/UI implementation on all source targets. Standalone desktop startup can load `OMNI_MANAGED_POLICY_FILE`; the standard mobile bootstrap has no MDM policy provisioning. Native IPC and HTTP requests share the same policy checks. The published 0.2.0 macOS/Android installers include these features; historical 0.1.0 packages predate them. Consult [delivery](DELIVERY.md) and the [policy guide](POLICIES.md).

Desktop supports the application launcher shortcut when the OS accepts it. Mobile uses touch controls and its ordinary application lifecycle. The mobile app is not a background daemon, system-wide VPN, keyboard monitor or cross-application traffic interceptor. OS suspension may interrupt work; no background completion guarantee follows from the embedded runtime.

Metadata exports are explicit user actions. Browsers use their download mechanism. Native desktop writes JSON or CSV files under `Documents/OMNI`, creating a new filename if one already exists. Native mobile presents the system share sheet; a successful presentation does not mean the user saved a file. No recipient is selected automatically. Exported metadata leaves SQLCipher protection and may be shared with another application at the owner's request. These exports do not contain a recoverable vault or its key. [Export scope and measurements →](ADMINISTRATION.md)

## Build from source

Use the platform build script from the repository root after installing Node.js 22.13+, npm, Rust and the target platform prerequisites:

```bash
npm ci
node scripts/build-platform.mjs macos
node scripts/build-platform.mjs windows
node scripts/build-platform.mjs linux
node scripts/build-platform.mjs android --debug
node scripts/build-platform.mjs ios
node scripts/build-platform.mjs ios --device
```

Run the command for the host and target you are preparing; these are not commands to execute on one arbitrary machine. Desktop targets require their native host; iOS requires macOS with full Xcode, and its default ARM64 simulator target requires an Apple Silicon Mac. The script merges the platform's Tauri configuration and replaces the generated output under `artifacts/platforms/<platform>/`, with `build-info.json` recording the version, source revision, dirty-source flag, artifact sizes, SHA-256 hashes, signing status and any startup check. Desktop builds default to release, with optional `--debug`; Android and both iOS targets use debug builds.

The default `ios` command targets `aarch64-apple-ios-sim` and writes to `artifacts/platforms/ios/`. `ios --device` targets `aarch64-apple-ios` and writes an **unsigned iPhone ARM64 app and archive** to `artifacts/platforms/ios-device/`. The build checks the archived application's platform rather than treating a simulator archive as a device build. Neither archive is evidence that it has run on an iPhone. The device archive requires an Apple signing identity and appropriate provisioning before installation or distribution; it is not a ready-to-install signed IPA.

`--dry-run` prints the intended configuration without building. `--init-only` prepares a mobile project without claiming a build. `--smoke` is restricted to disposable `CI=true` desktop or iOS simulator environments because launching creates a real app vault; it is unavailable for Android and `ios --device`. It removes OMNI development environment variables before launching the native app. Its recorded scope is a startup check, not full functional or security validation. A generated project is not a runnable application.

The startup check requires a fresh vault location and leaves any existing vault untouched. It waits for the native frontend, bridge, core and OS key store to initialize a database of at least 4,096 bytes, then checks that its first 16 bytes are neither a plaintext SQLite header nor all zeros. It records that evidence in `build-info.json`; it does not read decrypted content, invoke a provider or establish a complete conversation or recovery test. Merely keeping a window open is insufficient to pass this check.

| Target        | Build prerequisites                                                                                                                | Intended artifact and release boundary                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| macOS         | macOS, Rust, Xcode Command Line Tools and native build utilities; package minimum macOS 14.4                                       | App archive and DMG. Public trusted distribution requires Developer ID signing and notarization.                            |
| Windows       | Windows, Rust MSVC, Visual Studio C++ Build Tools, WebView2 and the build utilities needed by vendored OpenSSL                     | NSIS installer. Signing and clean-machine installation checks are separate release steps.                                   |
| Linux         | Supported Linux desktop, Rust/C toolchain, WebKitGTK 4.1 and Tauri system libraries, Perl/Make and Secret Service                  | Debian package and AppImage. Package creation does not prove compatibility with every distribution or desktop session.      |
| Android       | JDK 17 with `JAVA_HOME` and `PATH` configured, Android SDK 36, build-tools 36.0.0, NDK 28.2.13676358 and ARM64/x86_64 Rust targets | Debug APKs for ARM64 and x86_64; minimum Android API 24. Debug signing is not a Play Store release identity.                |
| iOS simulator | Apple Silicon macOS, full Xcode with the iOS simulator SDK, CocoaPods, XcodeGen and `aarch64-apple-ios-sim`                        | Unsigned ARM64 simulator app/archive; minimum iOS 17.4. It cannot run on an iPhone.                                         |
| iOS device    | macOS, full Xcode with the iPhoneOS SDK, CocoaPods, XcodeGen and `aarch64-apple-ios`                                               | Unsigned iPhone ARM64 app/archive; minimum iOS 17.4. Requires signing and provisioning before installation or distribution. |

macOS evaluation builds now receive an ad-hoc signature over the completed application bundle. Packaging verifies the resource seal and disk image. This is not Developer ID signing or notarization. A new binary can still trigger a Keychain authorization prompt when accessing an existing vault. Approve legitimate access through the OS itself; OMNI does not bypass that prompt or replace the key. A stable signed application identity is part of the production update path. The [delivery guide](DELIVERY.md) describes the macOS/Android package set and acceptance checks.

SDK licenses, production certificates, signing accounts and store credentials are external inputs. The build script does not invent them or silently install and accept every prerequisite. Follow [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/) and the platform toolchain's instructions. Vendored OpenSSL also requires native C build tools, Perl and Make where applicable; see the [Rust OpenSSL build documentation](https://docs.rs/openssl/latest/openssl/).

The current OpenDP 0.15.1 optional `use-openssl` feature pins an older `openssl-src` build dependency that conflicts with the repository's current vendored SQLCipher dependency. It is not enabled, and the build does not downgrade OpenSSL to resolve that conflict. This preserves the existing DP implementation; it is not evidence of a successful cross-target build. Compilers, SDKs and device execution remain part of platform validation.

## Interface transport verification

The fifth browser QA suite, `npm run test:native`, exercises the native frontend path with a mocked Tauri invocation bridge backed by a real isolated Rust core, encrypted temporary vault and synthetic provider. It checks mobile setup, request routing without direct browser API fetches, deliberate interface unlocking and metadata-only export calls. The native export presentation is mocked; this suite does not test an OS credential store, real Tauri IPC, platform packaging, a system share sheet or execution on a phone.

Run it with a built core and the development UI server available, alongside `test:ui`, `test:console`, `test:onboarding` and `test:setup`. See the [interface verification guide](../apps/desktop/README.md#browser-verification). Browser contract QA, embedded-runtime unit tests, package startup checks and physical-device validation cover different boundaries; their measured results remain in [VALIDATION.md](VALIDATION.md).

## Recovery and distribution limits

Preserve both the encrypted database and an actually recoverable key strategy. Copying a database to another device is not a restore procedure: Android wrapping keys and iOS device-only items may be unavailable there. Android backup is disabled in the platform application configuration. Losing or invalidating key material can make a vault permanently unreadable. There is no implemented cross-device synchronization, key export/import flow or complete backup-and-restore wizard.

Android debug signing keys can differ between disposable CI runners. The published 0.2.0 APK retains the original local 0.1.0 development signing identity, with a verified in-place emulator upgrade. Independent CI APKs do not have that continuity. A pilot release still needs a protected, persistent production signing key before personal vaults depend on long-term updates.

The [native platform workflow](../.github/workflows/platforms.yml) builds evaluation artifacts without production signing credentials. It is a reproducible procedure, not a published store release. Consult [VALIDATION.md](VALIDATION.md) for the exact revision, artifacts, device checks and outstanding blockers. Code generation, compilation, simulator execution, physical-device behavior and signed public distribution are different milestones.

<!-- omni:footer -->
---

**Continue reading** · [Connect a client](INTEGRATIONS.md) · [How a request travels](ARCHITECTURE.md) · [Operate an installation](OPERATIONS.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
