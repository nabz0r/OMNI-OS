<!-- omni:header -->
[OMNI](../../README.md) / [Field guide](../README.md) / Evaluation & funding

> **Evidence · 24 Sep 2026** · The source checks, recalculations and limitations behind the venture review.
<!-- /omni:header -->

# Verification record

Audit date: 24 September 2026. Host: macOS ARM64. Source checkout: `98dfd581582049e106da84c7f772e834117b4814`. Existing funding-document changes were present before this audit. No application code was changed by this review.

## Fresh local checks

| Check | Observed result | Scope and limit |
| --- | --- | --- |
| Rust workspace tests | 79 passed: 72 core and 7 VPN | Includes SQLCipher, permissions, policy and integration cases; not a complete penetration test |
| Native application Rust tests | 2 passed | Native application code tests, not a new OS-keychain or physical-device acceptance run |
| JavaScript collector/extension tests | 10 passed initially; isolated Redis subsequently passed | 11 distinct tests total; Redis used a temporary loopback instance, not an existing database |
| Startup/lifecycle/Android-smoke harness tests | 20 passed | Test harness and lifecycle behaviour; does not mean a phone was exercised |
| VPN configuration script tests | 3 passed | Used the repository's configured binary path; no host VPN was activated |
| Formatting and shell syntax | Passed | Rust formatting and syntax of startup/VPN shell scripts |
| Clippy | Passed with warnings denied | Workspace and all targets under the checked host/toolchain |
| Rust build | Passed with locked dependencies | Source binaries; no new production-signed installer |
| Frontend/collector build | Passed | TypeScript/Vite production build and collector syntax checks |
| Production npm advisory scan | 0 reported vulnerabilities | Registry advisory snapshot; excludes dev dependencies and Rust advisories, and cannot detect unknown vulnerabilities |
| Isolated compiled runtime | 17 checks passed | Temporary encrypted vault, development file key, local synthetic provider and separate loopback port |
| Browser observation | Local access page loaded and was visually legible | No fresh full browser workflow or real-provider session was performed |

JavaScript checks used bundled Node 24.19.0. The initial read-only startup diagnostic used the system Node 26.7.0. Existing ports 3006/3007/3008/4101/4102 were occupied, so the running session was preserved and the runtime audit used separate temporary resources. The startup diagnostic's dependency-stamp refresh message did not prevent the fresh locked-source/build checks; a clean-machine installation remains separate evidence.

The first VPN script invocation omitted the configured binary path and failed before exercising enrollment. It passed after supplying the same build-path variable used by the repository verification script. This was a harness configuration issue, not evidence of a product defect. An audit-only runtime harness cleanup condition was also corrected and the full 17-check run completed with exit code zero. Neither correction modified OMNI product code.

## Isolated runtime checks

1. Compiled core becomes healthy on an isolated loopback port.
2. Unauthenticated state access is denied.
3. An agent token cannot administer memories.
4. A confirmed synthetic memory is created.
5. A destination-scoped grant is created.
6. An authorised request completes with a receipt.
7. The synthetic provider observes authorised memory.
8. The sent disclosure receipt is retained.
9. A revoked grant is rejected.
10. A revoked request does not reach the provider.
11. A managed restricted-classification rule rejects the request.
12. The managed denial does not reach the provider.
13. The policy decision trail omits the blocked text.
14. Request history omits the synthetic memory body.
15. Memory persists after stopping and restarting the core.
16. Revocation persists after restarting the core.
17. The vault file has neither a plaintext SQLite header nor the known synthetic plaintext marker.

These checks use fictitious material. They do not exercise production credentials, OS credential custody, adversarial administrators, every protocol extension or external model quality.

## GitHub and release evidence

The live [source verification run](https://github.com/nabz0r/OMNI-OS/actions/runs/35983746338) reports success for all six jobs at the audited revision: Linux and macOS Rust, application, desktop, collector image and Linux VPN. This is remote CI evidence, not six fresh local runs.

The live [v0.2.0 release](https://github.com/nabz0r/OMNI-OS/releases/tag/v0.2.0) is a prerelease published on 24 September 2026 and contains six assets. Asset names, sizes and published SHA-256 metadata were reread. New remote installer downloads, fresh physical-device tests and new notarization checks were not performed. Historical installer acceptance remains in [VALIDATION.md](../VALIDATION.md).

## Funding deliverable review

- All files in the funding bundle matched its existing SHA-256 inventory. PPTX, DOCX and XLSX ZIP-package integrity checks passed.
- Recalculated all 18 base-case monthly cash balances independently and matched the workbook within EUR 0.000001.
- Recomputed all three scenario endpoints and added cost, timing and funding sensitivity cases in this review. The original financial workbook was not edited.
- Examined the 13-slide deck's substance, the brief, source documents, pricing, targets and missing-fact register. Prior full visual review applies to the unchanged file hashes; it is not a fresh native PowerPoint/Word/Excel execution.
- The new report has its own PDF render and page inspection. The new Markdown links, report calculations and final package integrity are checked before delivery.

The earlier package reader's local-file browser preview was unavailable under browser policy. This review does not claim a browser visual check of that reader or attempt another route around the restriction.

## What remains unverified

Actual founder identity, founder contributions and availability; legal entity and capitalisation; IP assignments; actual cash and liabilities; paid customers and usage; contract enforceability; customer permissions; independent security assurance; physical-device coverage; real-provider compatibility across every advertised configuration; Rust dependency advisory coverage; production signing and safe upgrade/recovery; load/soak/energy behaviour; and live authenticated application fields.

Passing checks support the tested behaviours. They cannot establish universal correctness, regulatory approval, product-market fit or future business success. There is no evidence basis for declaring all those dimensions perfect.

<!-- omni:footer -->
---

**Continue reading** · [The venture assessment](README.md) · [The fintech venture review](VENTURE_REVIEW.md) · [The 26-action plan](ACTION_PLAN.md)

[All documentation](../README.md) · [Delivery and verification](../DELIVERY.md)
<!-- /omni:footer -->
