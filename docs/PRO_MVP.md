# OMNI Pro: controlled AI requests and reusable work context

Decision brief, 26 September 2026. The recommended initial product is a local AI gateway for a bounded professional workflow. The first increment in this change is reviewed conversation import, not a completed enterprise security platform.

## Product promise

Help a professional reuse approved work context across supported AI tools while checking what leaves the device, restricting destinations and keeping a disclosure trail. A useful demonstration must show both a better task outcome and a blocked disclosure. The potential is a hypothesis to validate with users; more intercepted traffic is not itself customer value.

Use one work-only OMNI instance for the initial pilot. The current vault has one owner and an integration credential; it is not a multi-tenant service or a product with enforced work/personal partitions. An employer paying for the service does not thereby acquire access to personal chats.

## Three different technical surfaces

| Surface | What OMNI can do | Boundary and decision |
| --- | --- | --- |
| Explicit API gateway | Inspect supported decoded requests, check policy and grants, inject approved memory, then call a configured provider | Primary MVP path; the client must use OMNI's endpoint |
| Browser context capture | Read rendered ChatGPT/Claude messages or selected text after a user action; Z.AI currently supports selection only | Context acquisition, not prevention of the site's own sends; no background collection |
| VPN / network routing | Carry network traffic and optionally constrain configured egress | Encrypted HTTPS bodies are not made readable by a VPN; interception would require a separate trusted endpoint/proxy architecture |

TLS is designed to protect application traffic against passive observation. Adding a tunnel does not remove that protection. Managed TLS interception would add certificate deployment, client trust, pinning/QUIC behavior, protocol compatibility and considerable operational responsibility. This is a later, separately validated deployment decision, not a shortcut to universal chat access. [TLS reference](https://datatracker.ietf.org/doc/html/rfc8446).

Chrome's ordinary Manifest V3 extension model does not offer unrestricted synchronous request blocking. The documented blocking permission remains available to policy-installed extensions, and declarative rules have their own scope. An extension that captures a visible chat therefore must not be advertised as a complete inline firewall. [Chrome webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest), [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

“AI request firewall” describes the intended checked request boundary more precisely than a general WAF claim. The present engine checks deterministic patterns and supported text attachments. It is not proof of semantic data-loss prevention or resistance to every prompt injection. Responses are currently forwarded without content filtering.

## Context from ChatGPT, Claude and Z.AI

| Need | MVP route | What must not be assumed |
| --- | --- | --- |
| Existing ChatGPT conversations | User-provided JSON in the supported mapping layout, or explicit rendered/selected browser text | An OpenAI API credential does not establish access to that person's entire ChatGPT web history |
| Existing Claude conversations | User-provided JSON in the supported chat_messages layout, or explicit rendered/selected browser text | Export authority depends on account and organisation; arbitrary member access is not implied |
| Existing Z.AI conversations | Selected text from chat.z.ai, reviewed paste, or conversion to the documented neutral JSON format | No native Z.AI bulk export schema or automatic account connector was validated |
| New API interactions | Supported clients point to OMNI; only granted memories are injected | A browser subscription, API account and API conversation store are separate integration surfaces |
| Continuous memory updates | A future explicit opt-in that queues scoped proposals with retention and deletion controls | Interception must not silently turn every exchange or AI assertion into durable user memory |

OpenAI documents API-managed conversation state, including application-created conversation objects. That documentation is not a general connector contract for ChatGPT website history. [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state).

Claude documents personal exports and reserves organisation export access to the Primary Owner for Team/Enterprise. This increment accepts a file already supplied by its authorised holder; it does not log into those accounts or request an export. Export availability and layout require verification for the actual customer. [Claude export documentation](https://support.claude.com/en/articles/9450526-export-your-claude-data).

## Implemented increment

- **Memory → Import text → Import chats** reads local JSON or pasted JSON, lists conversations, and lets the user select individual messages.
- ChatGPT imports follow current_node; an ambiguous tree without a selected branch is rejected. Claude structured text is preferred over duplicate legacy text.
- User messages are selected by default. AI replies are excluded by default and remain labelled if explicitly selected. Role labels are file-supplied claims, not authenticated identities.
- Unsupported content, hidden/analysis messages identified by supported fields, off-branch nodes and attachment entries are omitted and counted. No recursive extraction of arbitrary strings from tools or files occurs. The importer cannot recognise undisclosed reasoning falsely labelled as ordinary text.
- The selected conversation becomes quoted, role-labelled text. Nothing is saved until **Extract for review**. Existing Rust capture policies run before local extraction and persistence. Resulting memories remain proposed and require confirmation; no sharing grant is created.
- Rust validates the reviewed-conversation envelope and includes decoded message text in policy inspection. The readable final preview keeps technical JSON formatting out of the review flow. Choosing **Edit as text** deliberately returns to plain-text capture.
- The source kind distinguishes reviewed ChatGPT, Claude and neutral imports. Editing the prepared text changes the kind to manual_capture. Closing the dialog clears the draft; application locking unmounts the session. No raw export is stored in browser storage by this feature.
- The extension adds exact-origin chat.z.ai selection support without increasing permissions. It also retains short rendered replies and rechecks the target origin inside the injected function.

See [the import contract and neutral schema](CONVERSATION_IMPORT.md). The importer is a context ingestion feature, not a chat history browser, sync service or new enforcement boundary. It is tested with synthetic export fixtures; real customer exports and signed native packages remain separate acceptance work.

## MVP priorities and acceptance gates

| Priority | Capability | Current status | Evidence required before claiming completion |
| --- | --- | --- | --- |
| P0 | Text gateway for the first two supported client workflows | Chat Completions and Anthropic Messages paths exist | Contract tests for real chosen clients, streaming, cancellation, tool fields and limits; unsupported schemas visibly rejected |
| P0 | Reviewed context ingestion and provenance | Initial UI/parser/extension increment implemented here | Demonstrated selection, no unintended persistence, proposed status, and denial before extractor traffic |
| P0 | Work authority and identity | Single-owner baseline only | Decide personal/work ownership; implement per-user/app identity, revocation and isolation before shared deployment |
| P0 | Destination and request restrictions | Configured upstream allowlist plus managed/local policy layers exist | Protected launch configuration; known denied requests never reach any upstream; no direct fallback |
| P0 | Useful secret/data controls | Regex and bounded text-file inspection exist | Representative customer-approved corpus, Unicode/encoding evasions, false-positive review; precise supported claims |
| P0 | Context quality | User confirmation and scoped grants exist | Test stale/conflicting facts, provenance and user correction; never promote model guesses automatically |
| P0 | Distribution and recovery | Evaluation delivery and platform key adapters exist | Trusted release/update identity, backup/restore and lost-device drills before ordinary work-data reliance |
| P0 | Measured utility and operating cost | Not demonstrated by this change | Compare the same task with existing tools; record setup, corrections, support and paid continuation |
| P1 | Response checks | Not implemented | Decide buffering versus streaming; prohibited content must not already have been delivered when a block is reported |
| P1 | Redaction/pseudonymisation | Not implemented | Preview exact transformations; protect any token map, preserve API semantics and define unrecoverable fields |
| P1 | Scoped conversation continuity | Current UI history is transient; reviewed imports are captured sources | Explicit consent, work/project scope, deduplication, TTL, deletion and a verified retrieval-authorisation boundary |
| P1 | Managed browser deployment | Explicit capture only | One versioned site adapter, managed policy, site-change detection and bypass tests; no universal prevention claim |
| P1 | Fleet administration | No SSO/MDM/signed distribution service | Authenticated administrators, policy signing/expiry/rollback, device acknowledgement and safe offboarding |
| Later | Broad HTTPS interception and more protocols | Not implemented | A real procurement need, threat model, deployable trust architecture, client matrix and external assessment |

Do not add Responses/WebSocket, file-upload or browser protocol support as opaque pass-through and then claim the same inspection coverage. Their effective context can include server-held state or opaque references; resolve and inspect it under an explicit contract, or reject unsupported forms. The current source does not expose /v1/responses.

The same restriction applies to tools. A permitted prompt is not authorisation for a model to browse, send messages or execute an external action. The gateway must explicitly define which tool paths it understands.

## Next implementation sequence

1. **Demonstrate the complete controlled-context loop.** Import a synthetic work preference, review and confirm it, grant a single destination, send through OMNI, inspect the receipt, revoke, then prove denied traffic does not reach the provider. Test with two approved clients before expanding protocols.
2. **Settle and implement professional authority.** Choose per-device work instances versus a shared service. For a shared service, isolate identities, grants, storage, retrieval and audit at the tenant boundary; do not reuse the current single-owner token across an organisation.
3. **Harden the release and real workflow.** Recovery, supported provider/device matrix, protected policy provisioning and external review follow the chosen deployment. Measure policy overhead separately from model latency; establish an observed baseline before committing to an SLA.
4. **Introduce optional continuity with controls.** Store only opted-in scoped conversations, separate human statements from model suggestions, define deduplication and retention, and expose review/deletion. Retrieval must apply authorisation before selecting context. Start with bounded deterministic selection before making semantic retrieval promises.
5. **Run a bounded paid pilot.** Define participants, permitted data, support hours and success criteria. Expand only if useful task outcomes and paid continuation justify the operating burden.

## Z.AI configuration path

The official Z.AI SDK guide documents an OpenAI-compatible endpoint at https://api.z.ai/api/paas/v4/. In **Models**, add an OpenAI-compatible provider using that base URL, a separately authorised Z.AI API credential and a model available to that account. If the deployment enforces OMNI_UPSTREAM_ALLOWLIST, the operator must explicitly include the normalized base https://api.z.ai/api/paas/v4. Keep existing authorised destinations and the configured default base in the list.

Use OMNI's launcher or a supported client routed through the local gateway. Do not point the client straight at Z.AI and expect OMNI policy checks to run. This is a documented configuration route, not a live Z.AI compatibility certification; no paid provider call was made in this change. [Z.AI official SDK guide](https://docs.z.ai/guides/develop/openai/python).

## Relationship to the broader plan

This professional focus narrows the [roadmap](../ROADMAP.md) and the [venture assessment](assessment/VENTURE_REVIEW.md); it does not make prior company, funding or security gaps disappear. The immediate differentiation to test is the combination of approved reusable context and inspectable request control in a workflow users already perform. Neither “VPN” branding nor collecting a large history proves that advantage.

Sources checked on 26 September 2026. Future programme terms, provider features and export layouts require fresh verification before a customer commitment.
