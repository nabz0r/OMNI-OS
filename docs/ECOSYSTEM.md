<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Design & direction

> **Proposed integration plan · 26 Sep 2026** · Planned engine distribution, compatibility levels and independently tested partner integration.
<!-- /omni:header -->

# From a useful application to an integrable engine

**Proposed architecture and acceptance plan · 26 September 2026.** Existing implementation remains governed by [Integrations](INTEGRATIONS.md), [Work](WORK.md) and the [supported evidence matrix](WORK_VERIFICATION.md). The SDK, administration service and partner packaging described here are planned.

## Product direction

OMNI should carry useful context between supported AI tools while preserving authority over every disclosure. The initial application proves the workflow. A reusable engine can later bring the same contract to software vendors, AI gateways and managed endpoints.

Broad reach means a stable contract with independently testable adapters. Every supported client, protocol, version and deployment retains a named owner, evidence and operating limits. Installation of OMNI never implies visibility into all encrypted traffic.

## Three proposed delivery surfaces

| Surface | Buyer and purpose | Existing starting point | Work before sale |
| --- | --- | --- | --- |
| Work application | Small teams using an approved recurring workflow | macOS/Android evaluation app, local vault, grants, receipts and bounded continuity | Trusted release, customer-tool acceptance, recovery, support and paid renewal |
| Embedded engine | Software/security vendors adding context controls to their product | Internal Rust core and native command interfaces | Stable SDK/API contract, packaging, licence review, conformance suite and external integration |
| Managed deployment | Organisations administering a supported device fleet | Dedicated per-device owner; managed file with separately pinned digest | Separate administrator authority, signed policy lifecycle, device identity, offboarding and minimal audit export |

Develop these sequentially around customer evidence. A shared hosted service is an additional deployment decision, requiring tenant isolation across identity, storage, retrieval, grants and audit before any multi-tenant claim. Existing single-owner installations must never be repurposed as shared organisational credentials.

## Proposed engine boundaries

| Module | Contract to stabilise | Invariant |
| --- | --- | --- |
| Identity and authority | Client/device identity, destination, operation, scope and expiry | Authenticate and authorise before selecting context; model output cannot grant itself authority |
| Context selection | Bounded deterministic selection, provenance, correction, retention and deletion | Preserve human/model attribution; treat imported content as data; report stale/conflicting facts |
| Disclosure preparation | Exact effective request, memory contribution, policy result and reason | Evaluate the final outgoing representation; transformations never bypass inspection |
| Adapter | Versioned mapping to an explicitly supported provider/client protocol | Reject unsupported state, references or modalities; never silently fall back to direct egress |
| Receipt and usage | Decision, policy/adapter revision, destination and usage provenance | Avoid raw chat logging; missing measurements remain unknown |
| Administration | Provisioning, policy updates, device revocation and incident evidence | An employer's subscription does not grant access to personal memory |

Start with one documented integration interface and reference bindings for the languages actually used by pilot partners. The current JavaScript and Python reference clients are test clients, not a supported SDK. Publish API versioning, error semantics, cancellation behaviour, migration policy and a security contact before marketing an SDK.

Later caching or context optimisation must preserve identity, destination, policy revision, deletion and revocation semantics. Cross-tenant semantic caches are outside the initial plan. No optimisation may weaken the authority check to improve a benchmark.

## Compatibility levels

| Level | Meaning | What may be claimed |
| --- | --- | --- |
| C0 — Candidate | A protocol or product is interesting to customers | Roadmap candidate only |
| C1 — Contract tested | Recorded version passes synthetic fixtures, including negative cases | Tested contract subset; no live-service certification |
| C2 — Live validated | Exact client/provider versions pass using authorised accounts and a named device | Supported configurations and limitations only |
| C3 — Operated | Customer use, upgrade/recovery and support procedures have been exercised | Commercial support within the contracted matrix |

These are proposed internal levels, not third-party certifications. An upstream change triggers revalidation; retain a last-tested date, fixtures and deprecation notice. Downgrade or disable an affected adapter when a security contract fails.

## Expansion order

1. **Current gateway paths.** Move the two selected real client workflows through Chat Completions/Messages from C1 to C2, then C3. Treat local endpoints, cloud endpoints, streams and tool fields as separate test cases. A base-URL setting alone proves no compatibility.
2. **Developer integration.** Package the engine after paid-pilot evidence. One external engineer should reproduce the approved loop, denial and revocation using published documentation. Existing MCP memory tools are a separate surface: accessing memory through MCP does not enforce all later model traffic or tool actions.
3. **Organisation operations.** Add the smallest administration and audit-export integration that a paying customer needs. Validate policy expiry, offline operation, rollback prevention, offboarding and access roles. Observability integrations export minimal metadata under an explicit policy.
4. **Customer-requested stateful APIs and frameworks.** Resolve effective context, server-held conversation state, attachments and tool results under an explicit contract. Responses, WebSocket, agent frameworks and cloud-specific adapters are candidates, not delivered compatibility. Reinspect retry and transformation paths.
5. **Managed browser workflows.** Treat explicit browser capture and enforcement of a website's send action separately. Require a versioned site adapter, deployable policy, bypass testing and a customer-controlled environment before an enforcement claim.

Priority comes from lost sales, recurring use and maintainable support. A new sector does not automatically require a new protocol. Consumer distribution, broad mobile capture and all-device HTTPS interception remain separately gated experiments.

## Adapter acceptance checklist

Each adapter release records client/provider/model versions, device/OS, build hash, authentication and allowed destinations; schemas, unsupported fields and size limits; streaming, cancellation, timeouts, retry and duplicate behaviour; attachment/tool/state coverage; denied upstream-arrival counts; receipt and counter provenance; update/recovery results; and a maintainer with a response process.

Test provider errors and disconnects as well as success. If only request filtering is supported, say so. Response inspection requires an explicit buffering/streaming contract that prevents delivery before a reported block. Actual tool execution requires separate action authority; a permitted prompt cannot authorise arbitrary external actions.

## The productisation threshold

Use [roadmap G2](../ROADMAP.md#commercial-and-ecosystem-gates--26-september-2026) for repeatable sales and G3 for integration readiness. Proposed G3 acceptance: an independent engineer completes a documented integration within one working day, with no custom core fork; conformance and denial tests pass; and one partner operates a bounded evaluation. Record elapsed time, assistance, missing documentation and ongoing support cost. This is a target, not an existing result.

The integration package should include a minimal working example, supported-version manifest, contract tests, deployment threat model, release/migration guide, software bill of materials and agreed licence terms. Internal code modularity alone does not establish commercial embeddability or legal permission to distribute a partner product.

## Commercial message

**Current:** local approved context and inspectable request controls for documented integrations, delivered as evaluation software.

**Direction:** the same context-authority engine available in a professional app and, after validation, inside partner ecosystems; resource efficiency measured per completed task.

**Evidence still required:** customer renewal, external integration, supported live-client coverage and net token/energy results. Avoid “works with every AI”, universal interception, automatic history sync and proven carbon savings until the corresponding evidence exists.

<!-- omni:footer -->
---

**Continue reading** · [The architecture book](../ARCHITECTURE.md) · [An atlas of the boundaries](../DIAGRAMS.md) · [Our memory. Our authority.](../MANIFESTO.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
