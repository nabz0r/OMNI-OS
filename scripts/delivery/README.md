# OMNI · Your personal context, on your device

This folder contains the macOS and Android MVP applications, installation instructions, checksums and the evidence used to accept this delivery. Open **START-HERE.html** for the visual installation guide.

The application embeds its Rust engine and encrypted database. You do not need Node.js, Rust, Docker or a local OMNI server to run it. Connect your own AI provider or an existing model endpoint during guided setup. No model weights, API account, subscription or provider credit are included.

## Install on a Mac

Requires an **Apple Silicon Mac (M1 or later), macOS 14.4 or later**. This build does not support Intel Macs.

1. Open `macOS/OMNI-{{VERSION}}-macOS-arm64.dmg`.
2. Drag **OMNI** into **Applications**, then open it there. The extracted `macOS/OMNI.app` and ZIP contain the same application.
3. Follow **Guided setup**. Use an existing local Ollama model, or add your own provider key in **Models**.

This evaluation build has a verified ad-hoc signature, without an Apple Developer ID or notarization. macOS may request permission to open it. Use macOS **Privacy & Security → Open Anyway** only for a package you recognize and whose checksum matches. Do not disable Gatekeeper or remove quarantine globally. If an existing OMNI vault triggers a Keychain prompt, authorize legitimate access directly through macOS. Never delete the vault or its key to dismiss that prompt.

## Install on Android

Requires **Android 7 or later** on **ARM64** or **x86_64**. The native acceptance run used Android 15; older supported API levels have not been device-tested. A current Android System WebView is required. ARM32-only phones are not supported by this APK.

1. Copy `Android/OMNI-{{VERSION}}-android.apk` to your phone and open it.
2. If Android asks, allow installation from the specific browser or file manager you are using, then install **OMNI**. You can revoke that install permission afterward.
3. Open OMNI and follow **Guided setup**. Supply your provider API key and choose a model. In **Models**, a compatible remote endpoint is also supported; use HTTPS outside loopback.

This APK uses a development signing key and is not a Google Play release. Keep the same signing identity for updates. If Android reports an incompatible installed package, do not uninstall a personal vault just to proceed: uninstalling removes app data, and copying the encrypted database alone is not a recoverable backup. A separately signed APK needs a deliberate migration plan.

On a phone, `localhost` refers to the phone. It does not point to your Mac's Ollama installation. A ChatGPT or Claude web subscription is not an API credential.

## Your first conversation

1. **Connect.** Check your provider connection and select the exact model.
2. **Remember.** Optionally save a preference. It remains local until you grant sharing permission.
3. **Continue.** Send a message. **History** records the destination and outcome; **Usage** shows the token counters the provider reports.

Use **Memory** to correct your context, **Permissions** to control disclosure, **Policies** to restrict text patterns and attachment types, **Models** for connections, and **Settings** for local preferences. Metadata exports contain request records, not conversation bodies. An interface lock hides your space; it is not biometric authentication.

## Import a previous conversation

Open **Memory → Import text → Import chats**. Choose an extracted ChatGPT or Claude JSON export, or a neutral OMNI conversation file. JSON paste is also available. Select a conversation, review its messages, then choose **Use selected messages** and **Extract for review**.

Only user messages are selected by default. AI replies are optional context. Imported memories remain **proposed** and do not create sharing permissions. Review and confirm them before granting access. Files must be valid UTF-8 JSON, at most 5 MB; the selected text must fit the 100,000-byte capture limit. Images, attachments, tool output and hidden reasoning are omitted. Repeating an import can create duplicates.

This is an explicit import of a file you provide. It does not sign in to ChatGPT or Claude, synchronize accounts, or intercept other applications. A compatible local extractor may propose memories; when unavailable, OMNI stores a bounded excerpt for review. The complete selected source is retained in the encrypted vault.

## Update an existing installation

Close OMNI before replacing the Mac application. On Android, install the APK over the previous application using the same signing identity. The {{PREVIOUS_VERSION}} → {{VERSION}} Android update preserved synthetic memory and settings in the tested emulator. Do not uninstall a personal vault or delete its system key to fix an update error. macOS may ask the owner to authorize access to the existing Keychain item; that upgrade authorization was not exercised for this exact package.

## Work with approved clients and deliberate continuity

Open **Work** to enroll a dedicated single-owner work installation. Do not enroll a vault containing personal data: enrollment labels the existing vault rather than creating a new partition. Approve each API client separately for an exact destination and expiry; use selected confirmed memories and a client-bound permission for context. The optional local gateway is closed by default and can be started and stopped here. Interface lock does not stop it.

Scoped conversations require explicit storage consent, a project label, one provider/model/permission and 1–30 days of retention. Human statements and model suggestions remain separate. Review and delete them in Work. Selection rechecks authority and uses at most ten complete exchanges and 40,000 bytes; it does not perform semantic search or automatic memory promotion.

For recovery, export an encrypted archive with a separately stored passphrase. It includes provider credentials and vault content; capacity is 400,000 bytes of serialized data and 10,000 records. Restore only into an unused installation: its new key and identity remain, all recovered grants are revoked, old client credentials are absent and analytics is off. Large-vault backup, independent review and physical lost-device drills remain release gates.

## What was verified

- The delivered macOS package passed native startup and fresh encrypted-vault initialization on a macOS runner. Its application resource seal, disk image and delivery checksums are verified. An earlier native build also completed real local Ollama inference, history, export and reopening on the project Mac.
- The exact delivered Android APK passed fresh installation and encrypted-vault reopening, followed by **{{ANDROID_CHECKS}} native acceptance checks**: actual WebView/IPC, model setup and discovery, synthetic-provider inference, private memory boundaries, token history, the native export share sheet, metadata-only export, lock/reload and persistence after process restart. Conversation import additionally passed selection, readable review, proposed-memory creation, decoded-text policy denial and restart checks. Work passed enrollment, explicit gateway start/stop, one-time client approval and revocation, storage consent, role preservation and conversation deletion. All **five Android Keystore instrumentation tests** also passed.
- Two approved reference clients completed the actual core controlled-context loop, including receipts and revocation. All 16 checks passed, with zero additional provider arrivals for denied traffic. The provider was synthetic; `Evidence/controlled-loop.json` records the source and local timing baseline.
- Android screenshots in `Evidence/` come from that installed APK on an emulator. The response model is explicitly synthetic. These checks do not establish physical-phone compatibility with every vendor, minimum-OS compatibility, app-store approval or absence of every possible defect.

The included `OMNI-{{VERSION}}-source.zip` contains the exact source snapshot used for both applications, including build instructions and lockfiles.

`delivery.json` identifies the source revisions and package hashes. `Evidence/` preserves the machine-readable build and acceptance reports. Run `shasum -a 256 -c SHA256SUMS` from this folder on a Mac to verify every delivered file.

## Current boundaries

Each installation has its own encrypted vault. Work provides bounded encrypted recovery into an unused installation, with revoked permissions and no recovered client credentials. Cross-device synchronization is not implemented. The standalone app does not enable an analytics collector. The mobile app does not install a system-wide VPN or automatically capture other applications. Inference requires the selected provider or model to be available; remote providers receive the prompt and any context you explicitly authorize.

For reproducible builds and detailed limitations, see the repository's [platform guide](https://github.com/nabz0r/OMNI-OS/blob/main/docs/PLATFORMS.md) and [validation report](https://github.com/nabz0r/OMNI-OS/blob/main/docs/VALIDATION.md).
