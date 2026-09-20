# Security boundaries

- Treat `.omni/`, vault keys, agent/console tokens, VPN enrollment files and report logs as private runtime data. They are ignored by Git.
- The console token administers memory and grants. The agent token must not acquire administrative authority. Use a separate grant per destination and revoke it when no longer needed.
- The local service binds to loopback. Public deployment of the core is unsupported. CORS is not authentication; bearer checks are mandatory.
- SQLCipher protects storage at rest. An unlocked application necessarily processes plaintext. Development file-key storage protects file permissions but is weaker than an OS keychain against access by the same user.
- Production providers use HTTPS; plain HTTP is permitted only for explicit loopback development services. Redirects must not bypass destination authorization.
- Port knocking is an additional exposure-control mechanism, not a replacement for WireGuard peer authentication. It uses authenticated messages, timestamps, nonces and replay rejection. Per-peer secrets must be rotated after compromise.
- Identity-key rotation every 1800 seconds is separate from native WireGuard session rekeying. The production supervisor and synthetic rotation test have different environments; see the VPN guide for availability and connection-transition details.
- The collector accepts numeric reports only. It has no endpoint for source conversations. Operator reverse proxies may still see IP addresses; disable sensitive access logs and configure retention explicitly.
- The synthetic lab deliberately uses fictitious content and local providers. Never point its fixture hub at personal data or real external providers.
- Browser capture is user-triggered and limited to supported, visible page content. It must not capture passwords or unrelated keystrokes.

The development core is not claimed to be a formally verified or independently audited privacy boundary. Memory and gateway share a core process; an OS-isolated vault helper is not delivered as a signed production component. The native desktop requires signing/notarization for trusted distribution. No quantum, zero-knowledge-proof, anonymity, psychological measurement or carbon-saving guarantee is implied.

Report suspected vulnerabilities privately to the repository owner before posting sensitive reproduction data in a public issue.
