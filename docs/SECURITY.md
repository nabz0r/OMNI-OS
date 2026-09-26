<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Trust & evidence

> **Security reference** · Credentials, native custody, policy enforcement and the protections this MVP does not claim.
<!-- /omni:header -->

# Security boundaries

OMNI enforces explicit contracts around a local vault and supported request paths. An unlocked or compromised device remains inside the trust boundary. Use the sections below to evaluate a deployment; tests are evidence for particular behaviors, not independent security certification.

## 0.4.0 work authority and recovery

Work uses one dedicated installation per OS user/device, not a shared tenant service. Named client tokens are hash-stored, expiring, destination-constrained and revocable; grants may be bound to that client. Work disables the legacy integration token. A native opt-in listener exposes only named-client provider routes, rejects owner credentials and denies new admission on existing connections after stop. Already admitted requests are not recalled. [Authority and continuity](WORK.md).

Saved conversations are separate encrypted content tables, explicitly consented and destination/model/grant bound. Operational journals remain metadata-only. Authorisation precedes bounded history selection; there is no automatic model-to-memory promotion. Expiry is enforced at access, with lazy local pruning; SSD erasure, provider copies and backups are separate concerns.

Encrypted recovery contains provider keys and vault content. It is not a metadata export. Restoration is atomic into an unused installation, under its own key and identity, with grants revoked and no client credentials restored. The archive format and workflow still require independent review. [Recovery](RECOVERY.md) · [External review scope](EXTERNAL_REVIEW.md).

## Protect the installation and credentials

- Treat `.omni/`, native application-data vaults, vault keys, agent/console tokens, VPN enrollment files and report logs as private runtime data. Repository runtime paths are ignored by Git; native vaults live outside the checkout.
- The console token administers memory, grants, provider profiles, keys, settings and private operational metadata. The agent token must not acquire administrative authority. Use a separate grant per destination and revoke it when no longer needed.
- Native key operations are available only through the Rust device adapter, not frontend plugin commands. Native custody uses macOS/iOS Keychain, Windows Credential Manager, Linux Secret Service or Android Keystore wrapping as appropriate. Missing or corrupt key material for an existing vault fails closed; there is no plaintext native fallback. Android hardware backing depends on the device, and iOS device-only items are not a cross-device recovery mechanism. See [PLATFORMS.md](PLATFORMS.md).
- The native interface lock clears transient UI state but does not stop the core, destroy its key, revoke other credentials or authenticate the OS user again. The explicit device-unlock button reopens that interface. Protect the device session separately; the UI lock is not a new security boundary.
- SQLCipher protects storage at rest. An unlocked application necessarily processes plaintext. Development file-key storage protects file permissions but is weaker than an OS keychain against access by the same user.

## Enforce only the paths OMNI controls

- Request policy is enforced in the Rust gateway after context injection and before provider egress. Both local and managed layers must pass. The owner can administer local rules; the integration token cannot. A managed baseline is loaded at startup and cannot be weakened through the local API. Protect both its file and launch environment; an administrator controlling the process can bypass it. Regex and text-file validation are not a universal DLP, malware scanner or response filter. [Policy threat boundary](POLICIES.md).
- Provider discovery is explicit and authenticated. Catalog availability is not proof of successful inference. The owner may authorize a new HTTPS destination through a profile unless an explicit deployment allowlist forbids it. Changing the base URL drops the old key; redirects are disabled.
- The standalone native application opens no HTTP listener by default. Its main-window IPC bridge validates the owner token before calling the shared core router, which retains ordinary permission checks. Request paths, body sizes, response sizes, concurrency and waiting time are bounded. The optional listener and external development core bind only to loopback. Public deployment of the core is unsupported; CORS is not authentication.
- Browser capture is user-triggered and limited to supported, visible page content. It must not capture passwords or unrelated keystrokes.

## Keep exports and browser handoff bounded

- Operational history and audit schemas exclude conversation bodies and secrets. Model identifiers, destinations and usage are still private metadata. Ordinary operational exports include only the selected metadata page, selected usage totals or secret-free configuration. The separate passphrase-encrypted recovery archive intentionally contains vault content and provider keys. Native desktop writes under `Documents/OMNI`; mobile uses a system share sheet with temporary file access and no automatic recipient. Keep exported files private; they are outside SQLCipher protection.
- The native setup browser command accepts only the fixed `ollama` resource from the main window. It cannot open arbitrary URLs or files and runs no shell. Desktop launch removes credential-like environment variables before invoking the fixed browser helper; mobile uses the platform URL-opening API.
- Browser auto-opening uses a random 256-bit pairing capability in a URL fragment, never the owner bearer token in a query. The UI immediately removes the fragment and exchanges it once through `/api/session/claim`; the core accepts it only within 120 seconds and returns `Cache-Control: no-store`. The pairing state stores its hash and monotonic expiry behind a lock; a successful claim removes the ticket atomically. The original secret also enters through the core process environment, which remains within the local process trust boundary. A browser extension or local process that captures the live link is inside this threat boundary; it is not an authentication mechanism for a public server. Locking does not repeat the exchange.

## Separate transport from application trust

- Production providers use HTTPS; plain HTTP is permitted only for explicit loopback development services. Redirects must not bypass destination authorization.
- Port knocking is an additional exposure-control mechanism, not a replacement for WireGuard peer authentication. It uses authenticated messages, timestamps, nonces and replay rejection. Per-peer secrets must be rotated after compromise.
- Identity-key rotation every 1800 seconds is separate from native WireGuard session rekeying. The production supervisor and synthetic rotation test have different environments; see the VPN guide for availability and connection-transition details.

## Constrain analytics and test environments

- The collector accepts numeric reports only. It has no endpoint for source conversations. Standalone native startup supplies no collector, and analytics operations requiring one fail before any report is prepared. Operator reverse proxies may still see IP addresses; disable sensitive access logs and configure retention explicitly.
- The synthetic lab deliberately uses fictitious content and local providers. Never point its fixture hub at personal data or real external providers.

## Assurance and reporting

The core is not claimed to be a formally verified or independently audited privacy boundary. In native mode memory, gateway and application share a process; an OS-isolated vault helper is not delivered as a signed production component. Platform adapters do not imply mobile background execution, device-wide capture or a system VPN extension. Apple distribution requires actual signing credentials, with notarization for trusted macOS distribution; simulator artifacts are not iPhone distribution packages. Other targets also require their own installation and release checks. No quantum, zero-knowledge-proof, anonymity, psychological measurement or carbon-saving guarantee is implied.

Report suspected vulnerabilities privately to the repository owner before posting sensitive reproduction data in a public issue.

<!-- omni:footer -->
---

**Continue reading** · [Follow the data](PRIVACY.md) · [Evidence, by release](VALIDATION.md) · [Conversation-import evidence](PRO_MVP_VERIFICATION.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
