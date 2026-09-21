# Privacy protocol v1

## Threat model

The collector may observe or retain every released report. A configured AI provider receives the authorized prompt and context. A local attacker with access to an unlocked process, a compromised OS, or an authorized provider is not made harmless by database encryption. The authenticated VPN hub observes endpoints and traffic metadata. HTTPS remains necessary over the tunnel.

## First-run privacy

Guided setup discovers provider catalogs and optionally saves a confirmed local preference. It does not issue an inference request or create a sharing permission automatically. Conversation suggestions are local drafts until submitted. The browser launch capability is short-lived, single-use and removed from the URL before rendering; no owner token is embedded in the generated URL. This convenience does not provide protection against a compromised local browser or core.

Standalone native applications embed the core and use authenticated IPC without opening a listener. Each installation has a separate application-data vault and an OS-managed key-store adapter; the SQLCipher key is supplied only to native code. A native interface lock clears its token and transient conversation, but deliberately reopening on the device is not biometric or OS authentication. It does not erase a running core's key or recall an already dispatched provider request. [Platform boundaries →](PLATFORMS.md)

## Private operational metadata

**History**, **Usage** and **Logs** read a local SQLCipher journal. It records provider/model identifiers, destination, status, timings, body sizes, supplied token counts, price snapshots and structured audit actions. It never accepts prompt/response bodies, API keys or arbitrary diagnostic messages in its schema. Metadata can still reveal activity and remains private. An explicit export uses a browser download, native desktop `Documents/OMNI`, or the mobile system share sheet; it is not an analytics submission. A user-selected share destination may receive that file outside the vault's protection.

Request journaling is enabled by default with 30-day retention, configurable from 1 to 365 days or disabled for future requests. The minimal audit trail remains active and follows the same retention horizon. Clearing request history does not clear audit events, memories, grants, disclosure receipts, DP observations, privacy-budget entries or released reports. Deletion cannot refund privacy already spent. The collector's numeric schema has not expanded to include the operational journal.

Provider keys and configuration are encrypted in the same vault. Owner-authenticated administration exposes only whether a key is present, never its value. The interface handles a newly entered provider key transiently before submitting it through native IPC or, in browser development, authenticated loopback HTTP. The separate database encryption key is not exposed to the native webview. Local encryption and API field separation do not protect an already compromised webview or unlocked core.

## Local differential privacy

Participation defaults to off. The standalone native bootstrap configures no collector, so enabling analytics and preparing or sending a report fail before budget consumption. A deployment may explicitly supply a collector, subject to consent and the same privacy ledger. The development simulation uses a separate fixture collector and an explicitly synthetic opt-in scenario; it is not a hidden production telemetry configuration.

Each participating installation prepares one report for an ISO week. Three histograms have eight public categories each: topics, latency and token counts. Every histogram is normalized over observed interactions; missing measurements belong to an explicit unknown bin and no interactions belong to an inactive bin. No exact local interaction count is exported.

Under replacement of an installation's weekly history, each histogram has L1 sensitivity at most 2. With epsilon 1/3 per histogram, the Laplace scale is 6. Composition gives epsilon 1 per report and at most 4 for the four-report pilot. The implementation uses [OpenDP's Laplace measurement](https://docs.rs/opendp/latest/opendp/measurements/fn.make_laplace.html), including its discrete sampling treatment of finite-precision values. The ledger and immutable released value are persisted atomically. A retry returns that same value and identifier.

This protects report values under the documented replacement adjacency. It does not hide participation, IP address, account linkage created elsewhere, or timing chosen by an operator. The initial release is explicit/manual; it is not a participation-hiding autonomous scheduler. Reinstalling, cloning or restoring data can invalidate an installation-level accounting assumption; there is no global identity that silently promises multi-device privacy accounting.

## Wire schema

```json
{
  "schema_version": 1,
  "report_id": "e6131705-442c-4114-98cf-a4d20b7deffb",
  "week": "2026-W39",
  "epsilon": 1,
  "histograms": {
    "topics": [0, 0, 0, 0, 0, 0, 0, 0],
    "latency": [0, 0, 0, 0, 0, 0, 0, 0],
    "tokens": [0, 0, 0, 0, 0, 0, 0, 0]
  }
}
```

Zeros above illustrate the shape, not a valid privacy computation. Real coordinates are noised and may be negative. The server does not clip individual reports. Unknown fields, free text, invalid cardinalities, non-finite numbers and altered epsilon are rejected without echoing the supplied content. The collector accepts the current or previous week in production, supports idempotent retry, and rejects reuse of an identifier with different contents.

## Publication and uncertainty

Production publication requires at least 10,000 reports in a week. These are **reports, not verified distinct people**. The displayed pointwise 95% normal-approximation interval includes only the independent DP noise: half-width `1.96 × 6 × sqrt(2/n)`. At 10,000 reports this is approximately 16.6 percentage points; it does not justify narrow or precise claims. It excludes selection and classifier bias, and is not a simultaneous interval over all coordinates. Small synthetic cohorts use a visibly marked simulation threshold.

Clients can fabricate reports. Rate limits constrain abuse but are not Sybil resistance. No claim of a validated "global cognitive index" or global population representativeness is made.

## Deletion

Deleting a memory prevents its future selection and removes its corresponding source/derived references as implemented in the vault. Revoking a grant blocks new authorized requests. Previously disclosed provider content and already released aggregate contributions cannot be pulled back by local deletion. Backups and SSD physical erasure have distinct limitations. A copied database is not a recoverable backup without its usable key; native mobile device-bound keys can prevent restoration to another device. Preserve the privacy ledger and use a recovery policy appropriate to the deployment. There is no implemented cross-device privacy-budget synchronization or complete native backup wizard.

## Implementation details

Normalized contributions are quantized on an exact binary lattice of 1/65,536, with residual mass assigned to the other/unknown bin. This keeps each vector's sum exactly one. The sampler uses scale `6.00000000000001` so upward-rounded privacy-map arithmetic remains within the allocated one-third epsilon. The collector's displayed scale 6 is a rounded presentation of that conservative parameter. JSON round-trip support preserves floating-point values across retries.

Successive published aggregates can be differenced to recover an individual already-noised contribution. That is within the local-DP threat model and does not create an additional independent noise sample. This release therefore does not claim aggregate-only public observability, secure aggregation, participation hiding or zero-knowledge proofs.
