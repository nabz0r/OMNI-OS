<!-- omni:header -->
[OMNI](README.md) / [Field guide](docs/README.md) / Design & direction

> **Decision record** · The technical and product choices that keep the system inspectable.
<!-- /omni:header -->

# Five decisions behind OMNI

## 1. The person owns an explicit, correctable memory

OMNI represents preferences, observations and decisions with provenance and status. An inferred statement is not identity truth. Sources and derived memories remain local, searchable and deletable. Native applications use a random database key protected by their platform key-store adapter, with a separate application-data vault. They fail closed when an existing vault has no usable key. Hardware identifiers and biometric templates are not key material. Development file-key storage is explicitly labeled and belongs to the separate source-development workflow.

## 2. Authority is enforced at a boundary we actually control

Grants constrain destination, scope and lifetime. Independent request policies constrain content, text-file types and volume; local rules cannot override an operator-provisioned baseline. The core checks the final request and records a metadata decision before model egress. A grant never bypasses a rule. Regex is deterministic text matching, not a semantic security oracle. Fleet deployment and bypass prevention still require OS and network controls. [Exact policy contract](docs/POLICIES.md). Agent credentials cannot administer their own grants. Guided setup creates no implicit permission. Native UI requests use authenticated IPC to the embedded core without an HTTP listener by default; browser development startup uses a temporary single-use capability instead of exposing the owner token in the launch URL. The native interface lock clears transient UI state but is not OS authentication. Revocation stops subsequent OMNI-mediated requests, not copies already held by a provider. A remote provider necessarily receives the content selected for it. The collector has a separate, closed numeric schema. Neither Rust's type system nor local storage alone proves complete OS confinement.

## 3. Transport and semantic understanding are separate

Real WireGuard cryptography protects transport; explicit API/browser/MCP integrations supply semantic visibility. HTTPS is not decrypted by routing a packet. Production relay connections retain provider TLS. Port knocking is authenticated single-packet authorization with timestamps and replay protection, not a secret sequence of port numbers. The 1800-second rotation policy concerns client identity keys; WireGuard's native session rekeying remains independent. There is no IKE in this protocol.

## 4. Global statistics have bounded, stated privacy loss

Clients optionally release fixed-size noised histograms using OpenDP. A standalone native app starts without a collector; consent, preparation and sending remain unavailable until one is configured by the deployment. Three replacement-sensitive normalized histograms use epsilon 1/3 each and Laplace scale 6, giving epsilon 1 per weekly report. Four releases exhaust the pilot budget of epsilon 4 per installation. Retries reuse noise. No reset makes prior disclosures disappear. Differential privacy does not make re-identification cryptographically impossible, hide IP addresses, or prove the authenticity of submitted measurements. ZKP is not claimed or required for this release.

## 5. Resource use and evidence take priority over spectacle

Processing is event-driven; reports are batched; the UI pauses rendering while hidden. We measure resources rather than invent carbon savings, cognitive scores or global trends. Nebula distinguishes real local memories, decorative visuals, and synthetic test data. The console separates provider-reported tokens, measured payload bytes, manual-rate cost estimates and source-versus-context benchmarks. Its local journal excludes content and secrets; clearing it never resets the DP budget. The SaaS publishes cohort size and statistical uncertainty, and shows insufficient data until its threshold is met. The initial business hypothesis is a user-paid service, with no profile sales or advertisement-driven recommendations in the implementation.

<!-- omni:footer -->
---

**Continue reading** · [The architecture book](ARCHITECTURE.md) · [An atlas of the boundaries](DIAGRAMS.md) · [Our memory. Our authority.](MANIFESTO.md)

[All documentation](docs/README.md) · [Delivery and verification](docs/DELIVERY.md)
<!-- /omni:footer -->
