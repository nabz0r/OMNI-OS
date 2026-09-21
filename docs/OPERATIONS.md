# Operations

## Local application

`./run.sh --web` starts the gateway, collector and local UI. The default real inference endpoint is Ollama on `127.0.0.1:11434/v1`. On a new vault, `OMNI_LLM_MODEL` seeds the model choice. Thereafter use **Models** to manage persistent provider profiles and **Settings** to manage the extractor and local history. `./run.sh --web --simulate` substitutes explicitly marked local fixtures and runs the synthetic scenario. Runtime material goes under the ignored `.omni/` directory. The launcher starts only its own processes and terminates them on exit.

The native shell is available through `./run.sh`. On macOS, Command Line Tools suffice for desktop compilation; trusted public distribution needs a Developer ID and notarization. The server-side VPN and privileged macOS interface setup have their own explicit commands in [VPN.md](VPN.md).

## Daily administration

Use the [console guide](ADMINISTRATION.md) for the complete operator workflow. Check provider discovery timestamps before treating a catalog or loaded-model list as current. A successful model-list request confirms discovery access, not that every listed model supports chat or that an inference request will succeed.

History defaults to 30 days and is enabled locally. Retention controls request metadata and audit events; disabling new request history does not disable the minimal audit trail. Pruning runs during journal operations, and interrupted in-flight records are marked aborted at core restart. Clearing History removes request records and their derived local usage totals without touching privacy accounting. Export configuration for inspection, not as a complete vault backup: secrets are excluded and there is no configuration-import feature.

Provider profiles, rates and extractor settings are stored inside the vault. Initial environment values seed a new vault only. Deployment settings such as the loopback binding, key storage, collector destination, SOCKS transport and explicit upstream allowlist remain process configuration and require restart. Preserve the vault and its key to preserve these settings.

## Collector deployment

On a Linux host with Docker Compose and a DNS name pointing to it, export `OMNI_PUBLIC_HOST` with that actual name, then run:

```bash
docker compose up --build -d
docker compose ps
```

Caddy obtains HTTPS certificates; only ports 80/443 are public. Redis and the collector run on an internal network. The API process is unprivileged, read-only, and has no access to local user vaults. Use an appropriately protected server, filesystem backups and restricted operator access. Persist Redis AOF and monitor disk space; `appendfsync everysec` can lose approximately the last second of writes on an unclean host failure, so retries must reuse the original report ID and noise.

No production endpoint is deployed automatically by publishing source code. VPN and collector can be deployed independently. Real credentials, DNS configuration and operating-system permissions are inputs, not generated substitutes.

## Interface inventory

| Endpoint                                                                  | Authentication                            | Role                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Core `/health`                                                            | None; loopback                            | Liveness                                                        |
| Core `/api/state`                                                         | Console token                             | Vault, grants, disclosure and usage view                        |
| Core `/api/memories`                                                      | Console token                             | Review and manage memory                                        |
| Core `/api/grants`                                                        | Console token                             | Destination/scope/lifetime management                           |
| Core `/api/admin`, `/api/admin/settings`                                  | Console token                             | Persistent local settings and read-only deployment policy       |
| Core `/api/providers`, `/api/providers/{id}`, `/api/providers/{id}/probe` | Console token                             | Provider profiles, write-only keys and explicit discovery       |
| Core `/api/interactions`, `/api/usage`, `/api/logs`                       | Console token                             | Metadata history, measured/estimated usage and structured audit |
| Core `/api/chat`                                                          | Console token                             | Context-aware interaction                                       |
| Core `/v1/chat/completions`, `/v1/messages`                               | Agent or console token + applicable grant | Provider-compatible requests                                    |
| Core `/mcp`                                                               | Agent or console token                    | Explicitly authorized memory tools                              |
| Core `/api/analytics/prepare`                                             | Console token, opt-in                     | Immutable local noised report                                   |
| Core `/api/analytics/send`                                                | Console token, opt-in                     | Send the locally prepared report through Rust                   |
| Core `/api/capture`, `/api/capture/status`                                | Agent or console token                    | Explicit local extraction into reviewable proposals             |
| Collector `/api/v1/analytics`                                             | Strict numeric schema and rate limit      | Opt-in report intake                                            |
| Collector `/api/v1/global`                                                | Public                                    | Thresholded aggregate                                           |
| Collector `/api/v1/events`                                                | Public WebSocket                          | Published aggregate notifications                               |

The collector has no personal account cookie or subscription token. Rate limiting is exposure control, not authentication of unique humans. If deploying behind multiple proxies, configure trusted source-IP handling intentionally; never blindly trust user-provided forwarding headers.

## Synthetic validation

`npm run simulate` creates separate temporary installation directories under `.omni/simulations/`. It starts six actual core processes with encrypted vaults, fictitious providers on two loopback ports, and an isolated collector. It checks unauthorized requests, agent privilege escalation, scoped context, revocation, deletion, DP idempotency, local journal attribution, payload accounting, absence of content in operational records, and rejection of raw telemetry. It then runs the Rust WireGuard simulation with authenticated knocking, random replacement keys and malicious-packet scenarios.

The simulation persists evidence and exits nonzero on failure. Its reduced analytics threshold, fixed fake identities, accelerated rotation clock and fixture LLM responses are test mechanisms; none establishes population statistics or real-model quality. Do not reuse its credentials or data in production.

## Resource and operational metrics

Track CPU time, resident memory, processing latency, bytes transmitted and queue lengths. Do not turn these into a carbon figure without an energy and electricity-intensity measurement method. Pause visualization when hidden, and choose small local models where measured accuracy is sufficient. A large model that is left resident consumes device resources even though there is no cloud invoice.

## Backups and upgrades

Back up encrypted vaults and their recoverable key material separately; loss of a key makes the vault unreadable. Never commit live databases, model weights, tokens or enrollment secrets. Preserve the privacy ledger together with the vault when restoring, and treat concurrent cloned installations as separate privacy-accounting risks. Keep dependency locks and run the full checks before updating the network or DP implementation.
