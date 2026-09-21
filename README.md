# 🧠 OMNI-OS · Compression of Comprehension.

### Your AI changes. Your memory stays.

**OMNI is a local personal memory and a controlled gateway to your AI tools.** It keeps the context you choose, lets you correct it, and shares only the memories you authorize for a specific provider.

> Models provide the computation. You keep the history and set the rules.

[Manifesto](MANIFESTO.md) · [Architecture](ARCHITECTURE.md) · [Diagrams](DIAGRAMS.md) · [Roadmap](ROADMAP.md)

![Nebula — the actual interface, showing explicitly synthetic demonstration memories](docs/images/nebula.png)

## The problem in one sentence

Changing AI tools should not mean rebuilding your entire relationship with them.

Services may already have their own memory. OMNI aims to give you continuity that you control across tools: your preferences, projects, corrections, and boundaries. The goal is **compression of comprehension**: provide useful context without copying your entire life. Savings in time and tokens, and improvements in quality, must be measured.

## Three steps

1. **Remember.** Add a fact or explicitly capture a conversation. Local extraction proposes memories for you to review.
2. **Authorize.** Choose the memories, the provider, and how long access lasts. Unconfirmed proposals stay out of shared context.
3. **Continue.** Ask your model through the launcher or a compatible integration. The launcher carries recent exchanges forward, formats code and tables, and lets you copy replies. Review disclosure receipts and revoke access when it is no longer needed.

Use **Import text** to turn notes into reviewable proposals. Filter memories by status, correct them, and confirm what represents you. Changing authorized memories resets the launcher conversation; locking your space clears its history and drafts.

Revocation blocks future sharing through OMNI. It cannot retrieve copies a provider has already received.

## Try it

Requirements: **Node.js 22.13+**, npm, and your platform's build tools. On macOS, install Command Line Tools. The first launch downloads dependencies and installs Rust if it is missing.

```bash
git clone https://github.com/nabz0r/OMNI-OS.git
cd OMNI-OS
./run.sh --web --simulate
```

The local interface opens automatically with a private, single-use connection link. No token copy is needed in this normal launch. For headless operation, add `--no-open`; manual unlock uses the private token in `.omni/runtime/admin-token`. [First-run guide →](docs/GETTING_STARTED.md)

The demo uses a separate synthetic vault with a development file key, leaving existing personal and Keychain-backed vaults untouched. It creates **six clients, two simulated providers, and a test VPN hub**. LLM responses are fictional; WireGuard encryption, SQLCipher vaults, permissions, and OpenDP calculations run as actual code. No AI account or provider key is required. Results appear in **Connections** and **Collective**. The viewer also sends synthetic exchanges through both configured providers, populating **History** and **Usage** with measured request metadata.

On macOS, `./run.sh --simulate` opens the native Tauri window. To use your own models, omit `--simulate` and follow **Guided setup**: connect a provider, optionally save a first memory, and open a conversation. The default local profile points to Ollama; choose an installed model or configure your own API connection. Run `./run.sh --doctor` for a read-only startup check. [Integration guide →](docs/INTEGRATIONS.md)

## A first run that leads somewhere

**Connect → Remember → Continue.** A guided setup opens for a fresh vault. Connect a model without searching through settings, keep an optional preference locally, and start your first conversation. Setup grants no memory access and sends no inference request on your behalf. The home screen then gives you a direct **Start a conversation** action, with draft-only suggestions inside the launcher.

![Guided setup — the actual interface connected to an isolated synthetic local provider](docs/images/setup.png)

## One place to run your AI connections

Open **Models** to connect Ollama, OpenAI, Anthropic, or a compatible endpoint. Store a key in the encrypted vault, check the connection, choose an available model, and make it your default. The launcher can switch provider and model for a new conversation.

| Your question                                          | Where to look                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Which models can I use? Which ones are loaded locally? | **Models** — provider catalogs and Ollama's loaded models, checked on demand                                       |
| Which model handled a request, and what happened?      | **History** — destination, operation, status, timing, tokens and payload bytes; separate disclosure receipts       |
| What am I consuming?                                   | **Usage** — reported input/output/cache tokens, observation coverage, per-model totals and optional cost estimates |
| What changed in my installation?                       | **Logs** — structured local audit events without conversation content or secrets                                   |
| How is my space configured?                            | **Settings** — history retention, local extraction, analytics consent, display preferences and deployment details  |

**Savings must be earned, not invented.** Usage compares selected source size with inserted context as a clearly labeled benchmark. It does not claim to measure internet bandwidth saved or a better answer. Missing provider counters stay unknown. Cost estimates require your own rates and sufficient usage data; they are not invoices. ChatGPT and Claude website sessions are not automatically monitored. [Console guide →](docs/ADMINISTRATION.md)

![OMNI model administration — actual application with explicitly synthetic local providers](docs/images/console.png)

## Where does the information go?

```mermaid
flowchart LR
  User["You"] --> Omni["Local OMNI<br/>Memory and permissions"]
  Omni <--> Vault[("Encrypted vault")]
  Omni -->|"Request and authorized context"| Model["Chosen model<br/>local or remote"]
  Model -->|"Response"| Omni
  Omni -->|"Response and sharing controls"| User
  Omni -->|"Noised report, with consent"| Stats["Analytics collector<br/>no conversations in its schema"]
```

The remote provider receives the request it needs to do its work, protected by HTTPS in transit. The analytics collector receives a separate numeric report. **Analytics is disabled by default outside simulation.** Differential privacy bounds statistical disclosure; it does not promise absolute anonymity.

## Already in the repository

| Capability          | Current implementation                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Local memory        | SQLCipher, provenance, history, correction, and deletion                                                        |
| Authority           | Permissions scoped to destinations and memories, expiration, revocation, and receipts                           |
| Integrations        | Launcher, Chat Completions and Messages APIs, MCP tools, and explicit browser capture                           |
| Interface           | Three.js Nebula, Tauri shell, model administration, history, usage, logs, settings and low-energy mode          |
| Optional transport  | WireGuard/BoringTun, authenticated knocking, replay protection, and identity-key rotation every 30 minutes      |
| Local observability | Encrypted request metadata, bounded retention, structured audit, model discovery and manual-rate estimates      |
| Voluntary analytics | OpenDP, persistent budget, retries without new noise; Fastify and Redis collector                               |
| Verification        | Reproducible simulation, Linux/macOS tests, server build, and BoringTun ↔ Linux WireGuard interoperability test |

**A working development release.** The VPN does not decrypt HTTPS applications, and the demo does not reconfigure your network. A semantic knowledge graph, distinct agent identities, an OS-isolated vault, SingleStore, Kubernetes deployment, and federation are [roadmap](ROADMAP.md) milestones. Public deployment and signed macOS distribution remain to be completed.

## Read, understand, build

| Document                                                                                            | What it covers                                                  |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [MANIFESTO.md](MANIFESTO.md)                                                                        | The origin, conviction, and commitments                         |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                                  | Trust boundaries, memory, and technical contracts               |
| [DIAGRAMS.md](DIAGRAMS.md)                                                                          | Request flows, knowledge graph, containers, and VPN             |
| [ROADMAP.md](ROADMAP.md)                                                                            | From individual value to a million users, with measurable gates |
| [Getting started](docs/GETTING_STARTED.md)                                                          | First launch, guided setup and recovery                         |
| [Administration](docs/ADMINISTRATION.md)                                                            | Models, settings, history, logs and measurement definitions     |
| [Operations](docs/OPERATIONS.md) · [VPN](docs/VPN.md)                                               | Startup, enrollment, and deployment                             |
| [Privacy](docs/PRIVACY.md) · [Security](docs/SECURITY.md)                                           | Precise guarantees and limitations                              |
| [Validation](docs/VALIDATION.md) · [CI](https://github.com/nabz0r/OMNI-OS/actions/workflows/ci.yml) | Observed results and revision checks                            |

Code lives in `crates/omni-core`, `crates/omni-vpn`, `apps/desktop`, `apps/extension`, and `services/collector`. Startup scripts are at the repository root; infrastructure lives in `infra/`.

To reproduce the checks, stop the demo first, then run `./scripts/verify.sh`. The Redis test requires a dedicated test database; prerequisites are detailed in the validation report.

**The proposed business model: users pay OMNI to represent their interests.** Continuity, maintained integrations, and private deployments are the services being considered. Selling profiles and behavioral advertising are outside this doctrine; billing is not implemented yet.

All repository documentation, interface copy, examples, and code comments are written in English for an international audience. The [repository guidance](AGENTS.md) preserves this policy for future contributions.

[AGPL-3.0](LICENSE). [Network design notes](NETWORK_DESIGN_NOTES.md) and [protocol notes](PROTOCOL_NOTES.md) preserve the design history. The documents above distinguish implemented behavior from target architecture.
