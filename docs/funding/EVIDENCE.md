# Product and claims evidence

Research cutoff: 24 September 2026. Audited checkout: `98dfd581582049e106da84c7f772e834117b4814`. Released installer source: `a5458a484cab949d22bbe6b44faf9f954dc8d688`. These are different revisions and must not be conflated.

The GitHub connector confirmed the [v0.2.0 pre-release](https://github.com/nabz0r/OMNI-OS/releases/tag/v0.2.0), six assets and their published SHA-256 metadata. It also confirmed a successful [Verify OMNI workflow](https://github.com/nabz0r/OMNI-OS/actions/runs/35983746338) for the audited checkout. The GitHub `latest` endpoint excludes pre-releases, so the tag-specific endpoint is the correct evidence route. This preparation did not repeat physical-device testing or an independent security assessment.

| Claim | Evidence | Safe application wording | Boundary |
| --- | --- | --- | --- |
| Executable MVP | [Release](https://github.com/nabz0r/OMNI-OS/releases/tag/v0.2.0), [delivery guide](../DELIVERY.md) | macOS and Android evaluation packages are available | Development/ad-hoc signatures; no store or notarization claim |
| Encrypted local memory | [Vault implementation](../../crates/omni-core/src/vault.rs), [platform guide](../PLATFORMS.md) | Local SQLCipher vault with platform key-store adapters | Plaintext exists in an unlocked process; no OS-isolated vault process |
| Scoped sharing and revocation | [Integration contract](../INTEGRATIONS.md), [HTTP implementation](../../crates/omni-core/src/http.rs) | Selected memories are disclosed under destination-scoped grants | Revocation prevents future OMNI disclosure, not recall of provider copies |
| Policies before provider egress | [Policy engine](../../crates/omni-core/src/policy.rs), [gateway tests](../../crates/omni-core/src/http/tests/policy_http_tests.rs) | Regex and inspectable-text rules check supported OMNI request paths | No universal DLP, response filtering or device-wide enforcement |
| Optional numeric analytics | [Privacy protocol](../PRIVACY.md), [analytics code](../../crates/omni-core/src/analytics.rs) | Optional OpenDP analytics with a persistent budget | Not a zero-knowledge proof; default native app has no collector |
| Android execution | [Validation](../VALIDATION.md) and released acceptance report | Reported 28 native acceptance checks, five Keystore checks and seven upgrade checks | Android 15 ARM64 emulator and synthetic provider; not physical-phone coverage |
| Current source verification | [CI run](https://github.com/nabz0r/OMNI-OS/actions/runs/35983746338) | Six CI jobs succeeded for the audited source revision | Passing tests do not establish all-threat security |
| Provider interoperability | [Integrations](../INTEGRATIONS.md) | Explicit launcher, API and MCP integrations | No blanket interception of ChatGPT/Claude website sessions |
| User interface | [Screenshots](../images/nebula.png), [policies](../images/policies.png) | Screenshots of actual UI with synthetic demonstration data | Never present as customer activity |

## Facts the repository cannot establish

Revenue, incorporation, full-time founder commitment, team composition, cash balance, customer count, signed design partners, legal ownership of all code, independent audit, certifications and public release signing remain unverified. Code contributors are not automatically employees or cofounders. Download counts and stars are not usage or retention measures.

## Wording to retire from applications

| Avoid | Replace with |
| --- | --- |
| ZKP analytics or zero-knowledge guarantee | Optional differential privacy analytics using OpenDP |
| Cognitive VPN protects all AI use | Local memory and request controls for supported integrations |
| GDPR/DORA/AI Act compliant or certified | Controls intended to support a customer's governance process, subject to deployment and legal assessment |
| Bank-grade, unhackable or anonymous | Specific documented controls and threat boundaries |
| Proven token savings or 30% productivity improvement | Planned controlled comparison; no measured improvement claimed |
| Enterprise-ready policy management | Local policies and a provisioned baseline; fleet identity/distribution are planned |
| One million users | Long-term reach scenario in the roadmap; no adoption claim |
| Patented or proprietary moat | Public AGPL source; differentiation and chain of title still need validation |

## Roadmap audit conclusion

The original roadmap already distinguishes targets from measurements, includes comparison-based utility tests and preserves security release gates. Its weakness for applications was the absence of a dated, resourced near-term commercial plan. The added 2026-2027 execution section supplies that plan without relabelling the long-term architecture as delivered. The new enterprise pilot route is a proposed market experiment, not evidence of a customer pivot already validated.
