# Operations

## Standalone native application

The native application owns an embedded Rust core and SQLCipher vault. Its UI dispatches through authenticated native IPC, with no HTTP listener, Node.js collector or Vite server by default. The vault is under the OS application-local-data directory in `vault-v1`, separate from development and synthetic vaults. Native key custody and platform prerequisites are documented in [PLATFORMS.md](PLATFORMS.md).

Native startup uses explicit runtime options rather than reading the development environment. Missing key material for an existing vault fails closed. The default package has no analytics collector configured: memory and model requests work independently, while analytics consent, preparation and sending remain unavailable. An exclusive runtime lease prevents concurrent embedded access to the same vault directory. The optional listener in the Rust runtime is a deployment feature; the packaged bootstrap does not enable it.

The interface lock clears transient UI state; it does not stop the engine, remove its key from memory or perform OS reauthentication. Mobile suspension is controlled by the operating system. Do not operate the app as a guaranteed background service or mobile VPN; neither is implemented. Actual package and device results belong in [VALIDATION.md](VALIDATION.md).

## Source development stack

`./run.sh --web` starts the gateway, collector and local UI. The default real inference endpoint is Ollama on `127.0.0.1:11434/v1`. On a new vault, `OMNI_LLM_MODEL` seeds the model choice. Thereafter use **Models** to manage persistent provider profiles and **Settings** to manage the extractor and local history. `./run.sh --web --simulate` substitutes explicitly marked local fixtures and runs the synthetic scenario. Runtime material goes under the ignored `.omni/` directory. The launcher starts only its own processes and terminates them on exit. `--web` opens the browser after readiness through an expiring, single-use pairing link; `--no-open` suppresses browser and native opening. `--doctor` runs a read-only startup diagnostic and exits. See [GETTING_STARTED.md](GETTING_STARTED.md) for the user path.

The native development window is available through `./run.sh`, which sets `OMNI_EXTERNAL_CORE=1` to use the services it just started. It does not open the standalone native vault. On macOS, Command Line Tools suffice for desktop compilation; trusted public distribution needs a Developer ID and notarization. The server-side VPN and privileged macOS interface setup have their own explicit commands in [VPN.md](VPN.md).

JavaScript dependencies are refreshed with `npm ci` when the installation stamp no longer matches the root/workspace manifests, lockfile, runtime or platform. The stamp is written only after installation succeeds. Native build prerequisites remain platform-specific.

## Daily administration

Use the [console guide](ADMINISTRATION.md) for the complete operator workflow. Check provider discovery timestamps before treating a catalog or loaded-model list as current. A successful model-list request confirms discovery access, not that every listed model supports chat or that an inference request will succeed.

History defaults to 30 days and is enabled locally. Retention controls request metadata and audit events; disabling new request history does not disable the minimal audit trail. Pruning runs during journal operations, and interrupted in-flight records are marked aborted at core restart. Clearing History removes request records and their derived local usage totals without touching privacy accounting. Export configuration for inspection, not as a complete vault backup: secrets are excluded and there is no configuration-import feature.

Provider profiles, rates and extractor settings are stored inside the vault. Initial configuration seeds a new vault only: environment values for the external development core, explicit options for the embedded runtime. Transport exposure, key custody, collector destination, SOCKS transport and explicit upstream allowlist remain deployment configuration and require restart. Preserve the vault and its usable key to preserve these settings.

Native desktop metadata exports go to `Documents/OMNI`; mobile exports open the system share sheet with no automatic recipient. Browser mode uses a normal download. Exported files contain private metadata outside SQLCipher protection. They are neither a complete memory export nor a vault backup; cancelling a mobile share sheet does not save a file.

## Managed request policies

The owner edits local rules under **Policies**. For an operator-enforced baseline, provision `OMNI_MANAGED_POLICY_FILE` and an administrator-controlled policy file. A missing or invalid configured file refuses startup. Changes require a process restart; there is no automatic remote policy fetch. Protect the launch environment and enforce routing outside OMNI if direct provider bypass must be prevented. The [policy guide](POLICIES.md) supplies a complete example, precedence, API contracts and operational limits.

## Collector deployment

On a Linux host with Docker Compose and a DNS name pointing to it, export `OMNI_PUBLIC_HOST` with that actual name, then run:

```bash
docker compose up --build -d
docker compose ps
```

Caddy obtains HTTPS certificates; only ports 80/443 are public. Redis and the collector run on an internal network. The API process is unprivileged, read-only, and has no access to local user vaults. Use an appropriately protected server, filesystem backups and restricted operator access. Persist Redis AOF and monitor disk space; `appendfsync everysec` can lose approximately the last second of writes on an unclean host failure, so retries must reuse the original report ID and noise.

No production endpoint is deployed automatically by publishing source code. VPN and collector can be deployed independently. Real credentials, DNS configuration and operating-system permissions are inputs, not generated substitutes.

## Interface inventory

These routes describe the shared core router. The native UI calls them through its authenticated IPC bridge; the HTTP addresses apply only to an explicitly running external core or opt-in embedded listener. Browser pairing is disabled in the standalone embedded runtime.

| Endpoint                                                                  | Authentication                                               | Role                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Core `/api/session/claim`                                                 | Single-use launch secret; local Origin required when present | Return the owner session once, within 120 seconds; no-store                 |
| Core `/health`                                                            | None; loopback                                               | Liveness                                                                    |
| Core `/api/state`                                                         | Console token                                                | Vault, grants, disclosure and usage view                                    |
| Core `/api/memories`                                                      | Console token                                                | Review and manage memory                                                    |
| Core `/api/grants`                                                        | Console token                                                | Destination/scope/lifetime management                                       |
| Core `/api/policies`, `/api/policies/test`, `/api/policies/decisions`     | Console token                                                | Revisioned local rules, baseline inspection, preview and metadata decisions |
| Core `/api/admin`, `/api/admin/settings`                                  | Console token                                                | Persistent local settings and read-only deployment policy                   |
| Core `/api/providers`, `/api/providers/{id}`, `/api/providers/{id}/probe` | Console token                                                | Provider profiles, write-only keys and explicit discovery                   |
| Core `/api/interactions`, `/api/usage`, `/api/logs`                       | Console token                                                | Metadata history, measured/estimated usage and structured audit             |
| Core `/api/chat`                                                          | Console token                                                | Context-aware interaction                                                   |
| Core `/v1/chat/completions`, `/v1/messages`                               | Agent or console token + applicable grant                    | Provider-compatible requests                                                |
| Core `/mcp`                                                               | Agent or console token                                       | Explicitly authorized memory tools                                          |
| Core `/api/analytics/prepare`                                             | Console token, opt-in                                        | Immutable local noised report                                               |
| Core `/api/analytics/send`                                                | Console token, opt-in                                        | Send the locally prepared report through Rust                               |
| Core `/api/capture`, `/api/capture/status`                                | Agent or console token                                       | Explicit local extraction into reviewable proposals                         |
| Collector `/api/v1/analytics`                                             | Strict numeric schema and rate limit                         | Opt-in report intake                                                        |
| Collector `/api/v1/global`                                                | Public                                                       | Thresholded aggregate                                                       |
| Collector `/api/v1/events`                                                | Public WebSocket                                             | Published aggregate notifications                                           |

The collector has no personal account cookie or subscription token. Rate limiting is exposure control, not authentication of unique humans. If deploying behind multiple proxies, configure trusted source-IP handling intentionally; never blindly trust user-provided forwarding headers.

## Synthetic validation

`npm run simulate` creates separate temporary installation directories under `.omni/simulations/`. It starts six actual core processes with encrypted vaults, fictitious providers on two loopback ports, and an isolated collector. It checks unauthorized requests, agent privilege escalation, scoped context, revocation, deletion, DP idempotency, local journal attribution, payload accounting, absence of content in operational records, and rejection of raw telemetry. It then runs the Rust WireGuard simulation with authenticated knocking, random replacement keys and malicious-packet scenarios.

The simulation persists evidence and exits nonzero on failure. Its reduced analytics threshold, fixed fake identities, accelerated rotation clock and fixture LLM responses are test mechanisms; none establishes population statistics or real-model quality. Do not reuse its credentials or data in production.

## Resource and operational metrics

Track CPU time, resident memory, processing latency, bytes transmitted and queue lengths. Do not turn these into a carbon figure without an energy and electricity-intensity measurement method. Pause visualization when hidden, and choose small local models where measured accuracy is sufficient. A large model that is left resident consumes device resources even though there is no cloud invoice.

## Backups and upgrades

An encrypted database copy is useful only with an actually recoverable key. Native Android wrapping keys and iOS device-only Keychain items do not supply a cross-device recovery flow; Android automatic backup is disabled in the platform application configuration. No complete key migration or backup-and-restore wizard is implemented. Loss or invalidation of a key can make the vault unreadable, and the app will not replace a missing key for an existing database.

Never commit live databases, model weights, tokens or enrollment secrets. Preserve the privacy ledger together with the vault when restoring, and treat concurrent cloned installations as separate privacy-accounting risks. Keep dependency locks and run the full checks before updating the network or DP implementation. Source development, desktop packaging, simulator execution, physical-device testing and signed public distribution each need their own evidence.
