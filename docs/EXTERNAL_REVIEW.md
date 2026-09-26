<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Trust & evidence

> **Review plan** · A concrete assessment handoff; independent review remains open.
<!-- /omni:header -->

# External assessment scope

**Status: prepared for an independent reviewer; no independent review has been commissioned or completed by this implementation.** Automated tests and the author's own review are useful evidence, not an external security certification.

## Decision and assets

Review OMNI 0.4.0 as a dedicated, single-owner work installation on macOS and Android. Do not assume multi-tenant hosting, SSO, fleet management or a device-wide egress boundary. The owner process, platform account and its OS administrators are trusted. An approved client and a provider response are not trusted to act as the owner.

Protect: owner capabilities, named client tokens, provider keys, confirmed memories and original sources, grant bindings, conversation provenance, policy integrity, audit correlation, the encrypted vault and encrypted recovery archives. Include native IPC and the optional loopback listener in scope. Use synthetic records and non-production provider credentials only.

## Required adversarial work

| Area | Review and demonstrate |
| --- | --- |
| Authority | Another installation's credential; expired/revoked client; foreign/unbound grant; destination confusion; duplicate headers; malformed origins; owner and legacy credentials on the narrow listener |
| Admission races | Revocation, listener stop and core shutdown against fresh requests, reused connections, streams and concurrent sends; distinguish already admitted requests from future admission |
| Context | Authorisation before scoped SQL selection; proposed/disputed/deleted facts; stale snapshots; memory instruction injection and hidden provider-held context |
| Continuity | Cross-conversation IDs, swapped provider/model/grant, replay UUID with changed body, concurrent revisions, uncertain failures, clear/delete/expiry during response, byte/pair bounds, source-role preservation |
| Recovery | Passphrase handling and offline attack assumptions; nonce/salt generation; header/ciphertext modification; KDF denial of service; complete schema; atomic rollback; OS-key rotation; client/grant revocation; cloning and analytics ledger rollback |
| Managed policy | Protected file plus independently protected launch digest, symlink/path replacement, group/world write checks, stale process state, missing files and invalid digest; no claimed signed rollout or rollback protection |
| Native | Main-window/token checks, command exposure, owner secrets across lock/unmount, OS-key denial and invalidation, update identity, deep links, export destinations, mobile suspension |
| Supply chain | Locked dependency review, SBOM/vulnerability triage, CI trust, package signatures, checksum provenance and an independently reproduced release |

## Evidence bundle

Start with [Work](WORK.md), [Recovery](RECOVERY.md), [Security](SECURITY.md), [Policies](POLICIES.md), [Validation](VALIDATION.md) and [the measured workflow](WORK_VERIFICATION.md). Read the implementation in `work.rs`, `continuity.rs`, `recovery.rs`, the HTTP routes, runtime and native bridge. Run core tests and the two-client fixture from a clean revision, then inspect the exact installer manifests and source archive.

Record for every finding: revision and artifact hash, tested device/provider, reproduction steps using synthetic input, expected/actual traffic, impact, severity rationale, suggested remediation and a retest result. Redact bearer credentials and full conversation bodies from the report. Report privately through the repository's documented security route; do not post operational secrets in public issues.

## Gates before work-data reliance

No unresolved critical/high finding that permits unauthorised disclosure, identity confusion or undetected recovery corruption. Test the actual signing/update route and a restore drill on each claimed device. Publish a narrowly supported provider/client matrix, known limitations and incident ownership. A qualified reviewer must independently assess the crypto integration and threat model; a passing local suite cannot close this gate.

An owner with a production signing identity must complete Developer ID/notarization and protected Android release-key provisioning. Organisational procurement, DPA/legal review, real provider API acceptance and paid pilot recruitment require accountable external participants. They are explicitly outside the delivered local test evidence.

<!-- omni:footer -->
---

**Continue reading** · [Know the security boundary](SECURITY.md) · [Follow the data](PRIVACY.md) · [Evidence, by release](VALIDATION.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
