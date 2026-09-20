# Five decisions behind OMNI

## 1. The person owns an explicit, correctable memory

OMNI represents preferences, observations and decisions with provenance and status. An inferred statement is not identity truth. Sources and derived memories remain local, searchable and deletable. Encryption uses a random database key protected by the operating-system key store; hardware identifiers and biometric templates are not key material. Development file-key storage is explicitly labeled and permission-restricted.

## 2. Authority is enforced at a boundary we actually control

Grants constrain destination, scope and lifetime. Agent credentials cannot administer their own grants. Revocation stops subsequent OMNI-mediated requests, not copies already held by a provider. A remote provider necessarily receives the content selected for it. The collector has a separate, closed numeric schema. Neither Rust's type system nor local storage alone proves complete OS confinement.

## 3. Transport and semantic understanding are separate

Real WireGuard cryptography protects transport; explicit API/browser/MCP integrations supply semantic visibility. HTTPS is not decrypted by routing a packet. Production relay connections retain provider TLS. Port knocking is authenticated single-packet authorization with timestamps and replay protection, not a secret sequence of port numbers. The 1800-second rotation policy concerns client identity keys; WireGuard's native session rekeying remains independent. There is no IKE in this protocol.

## 4. Global statistics have bounded, stated privacy loss

Clients optionally release fixed-size noised histograms using OpenDP. Three replacement-sensitive normalized histograms use epsilon 1/3 each and Laplace scale 6, giving epsilon 1 per weekly report. Four releases exhaust the pilot budget of epsilon 4 per installation. Retries reuse noise. No reset makes prior disclosures disappear. Differential privacy does not make re-identification cryptographically impossible, hide IP addresses, or prove the authenticity of submitted measurements. ZKP is not claimed or required for this release.

## 5. Resource use and evidence take priority over spectacle

Processing is event-driven; reports are batched; the UI pauses rendering while hidden. We measure resources rather than invent carbon savings, cognitive scores or global trends. Nebula distinguishes real local memories, decorative visuals, and synthetic test data. The SaaS publishes cohort size and statistical uncertainty, and shows insufficient data until its threshold is met. The initial business hypothesis is a user-paid service, with no profile sales or advertisement-driven recommendations in the implementation.
