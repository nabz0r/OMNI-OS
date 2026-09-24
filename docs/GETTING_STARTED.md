# Your first useful conversation

OMNI gives your AI tools a local memory and a visible boundary. Start with one connection. Add only what is useful. Nothing in setup grants a model access to your memories automatically.

## Open the native application

For the macOS and Android MVP package set, open `deliverables/OMNI-0.1.0-mvp/START-HERE.html` on the delivery machine. The folder contains installers, an extracted Mac application, checksums and acceptance evidence. The [delivery guide](DELIVERY.md) explains installation, supported devices and OS permissions.

A standalone native build opens its own local Rust core inside the application. It does not need a separately running terminal, Node.js server or port 3007. Its encrypted vault lives in the operating system's application-data directory and uses the platform key store. The current source targets and build instructions are in [PLATFORMS.md](PLATFORMS.md); actual package and device checks are recorded in [VALIDATION.md](VALIDATION.md), not implied by the presence of source code.

For iOS source builds, the default target is the ARM64 simulator. `node scripts/build-platform.mjs ios --device` targets an unsigned iPhone ARM64 archive under `artifacts/platforms/ios-device/`; it still needs Apple signing and provisioning before installation. A simulator app, an unsigned device archive and a tested installation on an iPhone are different deliverables. Consult the platform guide before attempting to install an artifact.

The native app opens its device session directly. If you select **Lock session**, it clears the interface conversation and drafts. Select **Unlock on this device** to deliberately reopen it. This is an interface lock, not a biometric challenge or OS security boundary; the local engine may still finish a request it already started.

No model is bundled. Desktop setup begins with a local Ollama connection; mobile starts with an unconfigured remote connection and requires your own provider credential and model choice. The app contains no system-wide mobile VPN or background traffic monitor.

## Run the source development stack

From the cloned repository:

```bash
./run.sh --web
```

The launcher installs project dependencies, builds the core and opens the local interface. The browser uses a private, single-use connection link that expires two minutes after the core starts. It is removed from the address bar before the interface renders. You do not need to copy a token during this normal launch.

For a native Tauri window connected to these same development services, use `./run.sh` instead. The script explicitly sets `OMNI_EXTERNAL_CORE=1` and provides its owner session. This external development mode is separate from the standalone native application and its vault. Keep the launcher running while using this mode; stopping it stops the services it owns.

The source development stack requires Node.js 22.13+, npm and platform build tools; the launcher can install the minimal official Rust toolchain if it is missing. On macOS, Command Line Tools are required. An installed native package does not need these source-build tools. Signed public distribution and store acceptance remain separate release steps.

To inspect this device before launching:

```bash
./run.sh --doctor
```

The diagnostic checks tools, dependency freshness, local ports and the local Ollama catalog. It does not install anything, stop another process, read your vault keys or contact a cloud provider.

## Connect → remember → continue

A fresh, unused vault opens **Guided setup**. You can skip it and return from **Overview → Guided setup** at any time.

1. **Connect.** Choose an existing connection or create one for Ollama, OpenAI, Anthropic or a compatible API. Save the connection, check its catalog and choose the model you want. Continuing makes it the primary connection.
2. **Remember.** Optionally save one preference that you explicitly confirm. It stays in your local vault. Setup creates no sharing permission.
3. **Continue.** Open your first conversation. The starter suggestions fill the message box; they do not send anything until you press **Send**.

**Check connection** makes discovery requests, not an inference request. A reachable catalog does not guarantee that every model supports the selected chat protocol or that your account has inference quota. Model failures remain visible and leave your message available for a deliberate retry.

For desktop local inference, install and start [Ollama](https://ollama.com/download), then install a model suited to your device using its [official quickstart](https://docs.ollama.com/quickstart). The native **Get Ollama** link opens the official download page in your default browser. Back in OMNI, check the connection and select an installed model. OMNI does not silently download model weights, switch to a cloud provider, or create a provider account. Local memory extraction also needs a local model; select it in **Settings**. A phone does not inherit a desktop's Ollama installation. Without a compatible service on phone loopback, imports retain their source and propose an excerpt instead of using a cloud extractor.

For cloud inference, enter your provider API key in the connection form. An ordinary ChatGPT or Claude website login does not automatically configure an API credential. Keys are stored in the encrypted local vault and never returned by the administration API. Sending a question to a remote model discloses that question to the chosen provider and may incur its usage charges.

## Make memory useful, deliberately

You can chat with **No memory context** immediately. When you want a model to use something from your vault, open **Permissions**, select confirmed memories and the exact destination, and choose an expiry. Select that permission in the launcher before sending.

The visible conversation lasts for the interface session. Reloading or locking clears its turns and drafts. Follow-ups include up to ten previous exchanges within the content limit. Changing the model, destination, permission or authorized memory resets that conversation. Permanent memories, provider settings and retained operational records survive restarts.

Use **History** for request outcomes and disclosure receipts. Use **Usage** for tokens, payload sizes and carefully labeled estimates. Use **Logs** for structured local changes. The [administration guide](ADMINISTRATION.md) explains all settings and measurement boundaries.

Standalone native applications have no analytics collector configured by default. Analytics remains unavailable there until a deployment supplies one; memory, permissions and model requests do not depend on participation. Metadata export uses browser downloads, `Documents/OMNI` on native desktop, or the system share sheet on mobile. Exporting a report is not a complete vault backup.

## Try without an AI account

```bash
./run.sh --web --simulate
```

This opens a separate synthetic vault and runs six clients against local fake providers. SQLCipher, WireGuard, permissions and differential-privacy computations are real code; the model answers and identities are fictional. The simulation banner stays visible. Existing personal vaults are not converted into demo data.

For CI, remote shells or manual opening, use `./run.sh --web --simulate --no-open`. This starts services without opening a browser or native window. Manually open `http://localhost:3006` and enter the private session token from `.omni/runtime/admin-token`. The same manual route is available after a link expires or you explicitly lock the interface. Do not share or publish that file.

## When something needs attention

| What you see                                       | Next step                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A prerequisite is missing                          | Run `./run.sh --doctor` and follow the specific local instruction. Then launch again.                                                 |
| A port is already occupied                         | Keep the existing session, or stop that known session before launching another. OMNI does not kill an unrelated application.          |
| A connection link expired or was already used      | Use the local token for manual unlock, or restart your own OMNI session for a new launch link.                                        |
| The native interface is locked                     | Select **Unlock on this device**. This reopens the interface; it does not promise an OS authentication prompt.                        |
| The native key store is unavailable                | Unlock or repair the operating system's credential store and retry. Do not replace a missing key for an existing vault.               |
| A vault copy cannot be opened on another device    | Restore requires its original usable key. Device-bound mobile keys and database copies are not an implemented migration workflow.     |
| Ollama is unavailable                              | Start Ollama, install a local model, then use **Check connection** again.                                                             |
| A provider has no models or rejects authentication | Check its endpoint and API key in **Models**. You can enter an explicit model identifier if your compatible service does not list it. |
| The local core is temporarily offline              | The interface preserves its last loaded state and offers **Try again**; reopen the launcher if the service exited.                    |
| The interface cannot finish rendering              | Use **Reload OMNI**. This reconnects the UI without deleting saved vault content; unsaved drafts are transient.                       |
| The model request failed                           | Inspect **History** before retrying. A failure or a stopped wait does not prove the provider received nothing.                        |

There is no guarantee of a flawless device, network, dependency or external model. The MVP makes these boundaries visible and keeps recovery actions under your control. Current runtime evidence is recorded in [VALIDATION.md](VALIDATION.md).

For source contributors, `npm run test:native` is the fifth browser QA suite. Its mocked native bridge uses real isolated core responses to check the frontend contract. It does not replace a native package, OS key-store or device test; setup and prerequisites are in the [interface verification guide](../apps/desktop/README.md#browser-verification).
