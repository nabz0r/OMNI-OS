<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Trust & evidence

> **Evidence record** · Two executable clients, denied-traffic evidence and the supported matrix.
<!-- /omni:header -->

# Controlled work: evidence and supported scope

Evidence dated 26 September 2026. OMNI 0.4.0 uses a per-installation, single-owner authority model. This page separates tested contracts from commercial-provider and device claims.

## Reproduce the two-client loop

```bash
cargo build --workspace --locked
node scripts/verify-work-context.mjs target/debug/omni-core
```

When a build uses `CARGO_TARGET_DIR`, supply that binary path. The harness creates a disposable encrypted vault, starts the actual core on loopback, imports a role-labelled synthetic work preference, confirms it, creates two independently approved identities and binds separate grants to one destination. A JavaScript fetch client and a Python standard-library client each send over HTTP, receive context and return a receipt matched against the owner's disclosure records.

A counted synthetic provider verifies foreign-client denial, rejection of the legacy work token, grant revocation and client revocation. Denied requests produce **zero additional provider arrivals**. Sixteen checks pass. The scripts are maintained at `examples/work-clients/` and `scripts/verify-work-context.mjs`. Tokens are never printed in the report; Python receives test configuration on stdin rather than command-line arguments.

The provider and extractor responses are synthetic. These are two executable reference clients, not certifications of Cursor, Claude Desktop, ChatGPT, Z.AI or arbitrary SDK versions. The demonstration establishes request control and provenance, not customer utility or commercial traction.

## Automated contracts

The core suite has 80 passing tests at the implementation checkpoint. Added tests cover client/installation separation, narrow native listener routes, old keep-alive denial after stop, contextual grants and receipts, consent, role preservation, idempotency, revoked-context denial, bounded deterministic selection, uncertain/concurrent attempts, expiry and late-response deletion, pinned policy loading and authenticated recovery with rollback. Existing streaming, policy, authentication, SQLCipher and analytics contracts continue to run.

The Work interface was also exercised through a real browser against an isolated 0.4.0 core and synthetic provider: enrollment, opted-in conversation creation, successful send with distinct roles and deletion. At 390 CSS pixels, no horizontal document overflow was observed and visible Work buttons were at least 44 pixels high. This browser check does not establish actual Android IPC or Keystore behavior; installer acceptance is recorded separately in [Validation](VALIDATION.md).

## Observed local cost

The two-client harness includes 40 sequential, warmed observations on a fixed small synthetic prompt. This baseline uses the built-in default policy with no custom regex rules; it does not measure a large rule set. It records preflight and policy timings in the core and end-to-end time in the client. The synthetic provider deliberately waits 25 ms; this is **not model inference latency**. Policy is a subset of preflight, including local rule compilation/evaluation and decision persistence. Preflight also includes context preparation and local request journaling, but excludes credential middleware, provider I/O and later response processing.

The [archived report](evidence/0.4.0-controlled-loop.json) provides sample counts, min/median/p95/max, CPU, runtime versions, source revision and dirty state. Do not subtract percentiles, generalise a debug build's numbers to production, or promise an SLA from this baseline. Real workload sizes, policy complexity, concurrency, cold starts, battery modes and device/provider variability still require measurement.

The [release evidence](releases/v0.4.0.md) links the recorded baseline and exact package scope.

Observed on Apple M2 Max, macOS ARM64, Node v24.19.0 and Python 3.9.6, debug core, one concurrent request. Revision `c43a9e61de62f28a3a3b36c755ae0101b18f6ef0` was clean. Native packaging later uses the main checkpoint recorded in its manifests; the core code is unchanged between those checkpoints.

| Observation | Median | p95 | Samples |
| --- | --- | --- | --- |
| Policy checks | 0.379 ms | 0.457 ms | 40 |
| Local preflight | 1.322 ms | 1.532 ms | 40 |
| End to end, including synthetic delay | 32.264 ms | 32.867 ms | 40 |

## Provider, client and device matrix

| Surface | Verified now | Remaining boundary |
| --- | --- | --- |
| JavaScript fetch reference | Actual HTTP core, independently approved credential, destination grant, receipt, revocation denial | Fixed non-streaming synthetic Chat Completions fixture |
| Python urllib reference | Independent process and equivalent control loop | Same bounded fixture; not an SDK compatibility certification |
| Chat Completions / Anthropic Messages | Rust HTTP/streaming contracts, byte limits, supported text inspection and completion/error handling | Commercial accounts and every provider/model variation not exercised |
| Work saved conversations | Actual core and browser; owner only; deterministic text continuation | No files, semantic retrieval, cross-conversation or cross-device sync |
| Native macOS | Shared implementation; native build/startup evidence linked per artifact | Trusted Developer ID/notarization and physical customer workflow remain gates |
| Native Android | Shared implementation; native acceptance linked per exact APK | Emulator coverage is not a physical-device/minimum-API/background-service claim |
| Z.AI compatible configuration | Documented provider setup route | No live paid Z.AI call or history connector certification |
| Browser import/capture | Reviewed supported JSON and explicit visible text paths | No automatic account sync or prevention of a website's direct sends |
| Responses, WebSocket, opaque binary uploads | Not supported by this gateway contract | Do not introduce opaque pass-through under an existing inspection claim |
| Shared organisation service | Not implemented or deployed | Requires a different tenant architecture; never share the owner token |

## Remaining release gates

Independent review is prepared in [the assessment scope](EXTERNAL_REVIEW.md). Production signing, independent review execution, physical-device restore/update drills, live provider acceptance, bypass resistance at OS level and a measured customer pilot remain open. None can be replaced by a stronger README claim.

<!-- omni:footer -->
---

**Continue reading** · [Know the security boundary](SECURITY.md) · [Follow the data](PRIVACY.md) · [Evidence, by release](VALIDATION.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
