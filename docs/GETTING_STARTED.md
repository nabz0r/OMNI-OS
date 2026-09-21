# Your first useful conversation

OMNI gives your AI tools a local memory and a visible boundary. Start with one connection. Add only what is useful. Nothing in setup grants a model access to your memories automatically.

## Start once

From the cloned repository:

```bash
./run.sh --web
```

The launcher installs project dependencies, builds the core and opens the local interface. The browser uses a private, single-use connection link that expires two minutes after the core starts. It is removed from the address bar before the interface renders. You do not need to copy a token during this normal launch.

For the native Tauri window, use `./run.sh` instead. The native window receives its local session directly from its launcher environment. Keep the launcher running while using OMNI; stopping it stops the services it owns.

This is a source-distributed development MVP. Node.js 22.13+, npm and platform build tools are prerequisites; the launcher can install the minimal official Rust toolchain if it is missing. On macOS, Command Line Tools are required. Neither a signed public installer nor a bundled inference model is included.

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

For local inference, install and start [Ollama](https://ollama.com/download), then install a model suited to your device using its [official quickstart](https://docs.ollama.com/quickstart). The native **Get Ollama** link opens the official download page in your default browser. Back in OMNI, check the connection and select an installed model. OMNI does not silently download model weights, switch to a cloud provider, or create a provider account. Local memory extraction also needs a local model; select it in **Settings**.

For cloud inference, enter your provider API key in the connection form. An ordinary ChatGPT or Claude website login does not automatically configure an API credential. Keys are stored in the encrypted local vault and never returned by the administration API. Sending a question to a remote model discloses that question to the chosen provider and may incur its usage charges.

## Make memory useful, deliberately

You can chat with **No memory context** immediately. When you want a model to use something from your vault, open **Permissions**, select confirmed memories and the exact destination, and choose an expiry. Select that permission in the launcher before sending.

The visible conversation lasts for the interface session. Reloading or locking clears its turns and drafts. Follow-ups include up to ten previous exchanges within the content limit. Changing the model, destination, permission or authorized memory resets that conversation. Permanent memories, provider settings and retained operational records survive restarts.

Use **History** for request outcomes and disclosure receipts. Use **Usage** for tokens, payload sizes and carefully labeled estimates. Use **Logs** for structured local changes. The [administration guide](ADMINISTRATION.md) explains all settings and measurement boundaries.

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
| Ollama is unavailable                              | Start Ollama, install a local model, then use **Check connection** again.                                                             |
| A provider has no models or rejects authentication | Check its endpoint and API key in **Models**. You can enter an explicit model identifier if your compatible service does not list it. |
| The local core is temporarily offline              | The interface preserves its last loaded state and offers **Try again**; reopen the launcher if the service exited.                    |
| The interface cannot finish rendering              | Use **Reload OMNI**. This reconnects the UI without deleting saved vault content; unsaved drafts are transient.                       |
| The model request failed                           | Inspect **History** before retrying. A failure or a stopped wait does not prove the provider received nothing.                        |

There is no guarantee of a flawless device, network, dependency or external model. The MVP makes these boundaries visible and keeps recovery actions under your control. Current runtime evidence is recorded in [VALIDATION.md](VALIDATION.md).
