# Historical Protocol Notes

> Historical note: these translated working notes preserve earlier proposals, including superseded privacy parameters and unimplemented ideas. They are not a description of delivered guarantees. For the current implementation and target architecture, read the [README](README.md) and [architecture guide](ARCHITECTURE.md).

## Privacy guarantees and a proposed first protocol

The concept is defensible as local personal memory, explicit control over context sent to AI systems, and an opt-in statistical observatory. The current wording conflates three distinct guarantees: storage privacy, communications privacy, and statistical privacy.

### Essential corrections

1. DP does not make identification “cryptographically impossible.” It bounds the influence of a contribution on output probabilities. State the protected unit, adjacency relation, ε, δ, maximum contributions, and composition. Adding noise without bounding the data or accounting for privacy expenditure does not establish a defensible guarantee. The Laplace mechanism uses b = Δ₁/ε; budgets for successive releases add up. Dwork–Roth, chapter 3.
2. A budget reset every day does not protect an entire life. A guarantee per event protects less than a guarantee covering all of a person's data. Multiple devices, restores, and reinstallations further complicate accounting. NIST also identifies naive floating-point implementations of mechanisms as a real risk. NIST SP 800-226, §§2.4 and 5.2.
3. “Only the DP module has network access” contradicts calls to AI providers. Separate two egress paths: an AI connector authorized to send selected context to the provider, and a telemetry exporter authorized to send only DP reports to the SaaS. Separating Rust modules helps auditing; confinement also requires separate processes and OS permissions.
4. A cloud provider receives the prompt and context it must process. Encrypting them in transit does not prevent that provider from accessing them. An honest promise: “OMNI never receives your conversations.” The promise that “no raw data leaves the machine” applies only to fully local inference.
5. DP and ZKP serve different purposes. A zero-knowledge proof establishes a statement without revealing its witness; it does not automatically make a statistic private. Foundational paper by Goldwasser–Micali–Rackoff.

### Proposed v1 protocol

The following figures are design choices to evaluate, not universal security thresholds.

- A voluntary, single-device pilot cohort. Telemetry is disabled by default, with consent separate from memory use and provider access.
- Entirely local memory. Documents, prompts, responses, embeddings, people, chronology, and preferences remain in the vault. A personal embedding is still sensitive data; it is not an anonymous substitute for text.
- One fixed-size weekly contribution. Locally compute a normalized histogram over eight stable public categories, including “no activity,” and two bounded means: provider latency and token volume. No free-form category, excerpt, document identifier, visited domain, or precise location.
- A per-report guarantee covering all device activity during the week. A histogram lies in the simplex: maximum L1 sensitivity is 2 when replacing the history. Each numeric metric is normalized to [0,1], with maximum sensitivity 1. Fix latency and token bounds publicly before collection.
- An example budget that can be tested: ε = 1 per report, allocated as 0.5 to the histogram and 0.25 to each of the two means, with δ = 0 for the theoretical mechanisms. This gives a Laplace scale of 4 in each group. Use an implementation that explicitly handles numerical precision; do not present a simple homemade inverse-CDF sampler as a proof.
- At most four reports in the pilot, giving a composed bound of ε ≤ 4. Keep a persistent counter and spend the budget atomically before export; stop at the limit without an automatic reset. Extending the pilot increases the cumulative bound: consent does not erase it. State “per installation/device” until composition across devices is resolved.
- Create a noisy report once and reuse it for network retries. Do not draw fresh noise on each attempt. Deduplicate using a random identifier specific to the report, with no stable personal identifier.
- Transport separate from application identity. No account cookies or subscription tokens in analytics. A production deployment seeking to hide the IP address from the collector must use an independent relay, such as OHTTP, and examine size, timing, and correlation. OHTTP assumes separation between parties and does not eliminate all traffic analysis. RFC 9458.

For the backend, retain noisy sums, the count of accepted reports, and the protocol version; do not expose queryable individual data in the product. Publish at fixed times after a cohort threshold set independently of private values, with uncertainty intervals. The animation may be fluid, but it must not pretend that personal data is continuously being transmitted.

### Statistical and product limitations

- With b = 4, the standard deviation contributed by noise to a mean of n independent reports is 4√(2/n). At n = 10,000, an approximate normal 95% interval adds about ±11 percentage points for a proportion, before other errors. This is my calculation from the proposed protocol. A small beta therefore cannot honestly produce fine-grained trends.
- Estimates describe the observed voluntary participants, not “humanity.” Uncertainty from noise does not correct recruitment, language, or classification biases.
- Do not clip each noisy report to [0,1] before averaging: that post-processing can bias the estimator. A constrained final display is possible, but inference must account for it.
- “Thinking time,” “frustration,” and “cognitive load” are not direct measurements. Use observable names: drafting time in the launcher, edits, abandonment, retries, and self-reported satisfaction. One experimental stress study uses hardware that measures key pressure; it does not validate general inference of frustration from typing tempo alone. Microsoft Research / CHI 2014.
- The first product advantage should be individually verifiable: less repetition of context, correctable memory, control over what is sent, and continuity across models. Global statistics can wait until they have sufficient statistical power.

### ZKP and verification

V1 does not need ZKP. Later, a proof could concern an anonymous credential or a bounded computation. On its own, it does not prove that interactions actually occurred, that a user has only one device, or that their random generator was honest.

Verifiable criteria:

- Network captures and sensitive canaries: no raw text or embedding in SaaS traffic, logs, error reports, or crash reports.
- Data-flow analysis and OS confinement: the vault and classifier cannot contact the SaaS; the provider connector receives only approved context.
- A sensitivity and composition analysis for each protocol version, plus tests of bounds, budgets, concurrency, retries, and restarts. Statistical tests alone do not prove DP.
- Utility simulation before activation: intervals, coverage, classification bias, and required sample size.
- A published threat model: protection against a curious or compromised analytics server; limitations against local malware, a provider receiving the prompt, relay collusion, and clients fabricating reports. DP does not guarantee data authenticity.

_Sunday, 11:52 PM_

## Local memory and the value of additional access

The OMNI engine should run primarily on the device. I would separate source ingestion, memory, and context selection from the model that formulates the response. The first three functions remain local; the last may be local or remote. A remote model receives only selected, authorized context. The OMNI SaaS manages software distribution and voluntary statistics without hosting personal memory.

Memory should not be a single “identity vector.” I would propose four layers in an encrypted vault:

- Sources and events: conversations, authorized documents, and observed changes, with origin and date.
- Temporal facts: “has worked at X since June,” proposed or confirmed status, provenance, validity period, and sharing restrictions.
- Search indexes: recomputable embeddings linked to their sources and subject to the same permissions.
- Summaries: compact views for a particular task, never treated as more reliable than their sources.

The useful “entropy” to track would primarily be disorder in this memory: duplicates, outdated facts, contradictions, ambiguous information, and unsupported inferences. It is not a single score of understanding. Contradictory new information must create a version or an explicit conflict, rather than silently rewrite history. Missing data remains unknown. Imported content remains a source to analyze, never an instruction authorizing new actions.

Each derived memory retains its dependencies. Deleting a source triggers deletion or recomputation of the corresponding facts, summaries, and embeddings; backups require their own deletion policy.

It is impossible to honestly assign a percentage to full device access without an experiment. Access creates the potential for information; it does not measure the ability to select the right information.

I would use an ablation study:

1. Conversations only.
2. Conversations and selected folders.
3. Add explicitly authorized calendars and applications.
4. Add further sources one category at a time.

Use the same model, tasks, and context budget; compare within each user and alternate the order. Measure task success, required corrections, time saved, false or outdated memories, unnecessarily disclosed information, latency, and resource consumption.

The desired result: which permissions produce a measurable benefit for which tasks? If adding a source contributes little utility but substantially increases errors or exposure, it remains disabled by default.

_Sunday, 11:59 PM · Worked for 47s_

## Personal authority and the limits of revocation

OMNI can be authoritative over what it holds and authorizes; its power becomes conditional once information is disclosed.

Locally, I would build a personal permission authority: each agent requests information or an action with a recipient, purpose, scope, and duration. OMNI applies a deterministic policy before transmission: deny, provide a minimal answer, supply authorized context, or request confirmation. The LLM proposes; it cannot change its own rights. This authority covers access that actually passes through OMNI.

After disclosure, revoking authorization cuts off future access but cannot retrieve copies already received. OAuth revocation invalidates tokens; it does not erase data obtained with them. Immediate termination also depends on how the recipient server operates. RFC 7009.

The interface should therefore distinguish “access revoked,” “deletion requested,” and “deletion reported by the provider.” Guaranteeing external erasure requires cooperation, verifiable commitments, and external controls. An expiration date written in a prompt is not a technical safeguard.

Standards can provide parts of the protocol:

- GNAP organizes the request, negotiation, and management of delegated authorization. Use existing services' OAuth mechanisms; GNAP requires their support. RFC 9635.
- ODRL expresses permissions, prohibitions, and usage obligations. It is a language for policies; enforcing them requires a system that applies them. W3C ODRL 2.2.
- Verifiable Credentials and ZK, with compatible mechanisms and issuers, can present an attribute or prove a predicate without revealing a complete identity—for example, being above an age threshold without disclosing a date of birth. A proof verifies a statement's authenticity; it does not automatically make the statement true. W3C VC 2.0.

OMNI should distinguish declared preferences, observations, inferences, and external attestations. Users control their representative; that does not make them a recognized issuer of every degree or status.

My economic choice: a user subscription, transparent pricing, complete export, and auditable service rankings. Having the user pay helps, but it is not sufficient: profile sales, routing commissions, and advertising can still create competing interests. I would prohibit the sale of personal data and payments that silently influence recommendations. Any advertising would use local selection without giving the advertiser access to the vault.

_12:03 AM_

## Proposed v1 scope

V1 scope: a local vault authoritative for exchanges passing through OMNI, with explicit AI connectors and voluntary analytics.

### Vault and memory

- SQLite through SQLCipher; a random 256-bit key kept in the OS keychain. Biometrics authorize its use; no derivation from a hardware or biometric fingerprint.
- Four objects: `Source`, `MemoryFact`, `Grant`, and `DisclosureReceipt`. Each fact contains a value, provenance, observation and validity dates, a status of `proposed | confirmed | disputed | superseded`, and source references.
- Embeddings and summaries are derived views with recorded dependencies. Contradictions create explicit versions; an inference remains identified as an inference.
- Interfaces: `ingest(source)`, `search(query, scope)`, `confirm(fact_id)`, `supersede(fact_id, replacement)`, and `delete_source(source_id)`. Delete derived data transactionally or recompute it from remaining sources; use a separate backup policy. Do not promise immediate physical erasure of SSD blocks.

### Permissions and disclosures

- A `Grant` defines the recipient, allowed sources or categories, operations, and expiration. No implicit renewal or additional delegation.
- `prepare_context(request, grant_id)` returns proposed excerpts and their provenance; `authorize_send(preparation_id)` rechecks permissions and expiration before transmission.
- `revoke(grant_id)` immediately blocks future operations within OMNI. A request already sent cannot be withdrawn from the provider.
- A `DisclosureReceipt` locally records the recipient, date, disclosed references, and authorization. Distinguish revoked access, externally requested deletion, and the provider's reported response.
- The model proposes context; a deterministic policy decides permissions. Imported text never creates authorization.

### Process separation

- A vault and memory worker without network access; a provider connector without direct vault access; an analytics exporter receiving only a serialized DP report.
- Closed-schema IPC, without arbitrary analytics fields. Exclude secrets and conversations from logs.
- Apply OS restrictions to signed helpers as well. Rust types provide an architectural boundary, not proof of confinement. Documentation must distinguish verified guarantees from the limitations of an unconfined development execution.

### DP analytics

- Disabled by default; a single-device pilot, at most four weekly contributions, and a maximum composed budget of ε = 4.
- Weekly report: a normalized local histogram over eight fixed categories, bounded mean latency, and bounded mean token count. No permanent identifier, text, embedding, or free-form category.
- Per-report allocation: ε = 0.5 for the histogram and ε = 0.25 for each mean. Respective sensitivities of 2, 1, and 1 after normalization; Laplace scale 4, using an established DP library that handles numerical precision.
- Spend the budget atomically, persist the noisy report, and reuse it on retries. No automatic reset. Use HTTPS transport and explicitly document the lack of IP anonymity.
- Publish only with the sample size and uncertainty displayed; do not present a “cognitive index” as a validated measurement.

### Acceptance

Test encryption, provenance and contradictions, deletion of derived data, rejection across unauthorized destinations, expiration and revocation, recovery after crashes, concurrent enforcement of the DP limit, deduplication, and absence of sensitive canaries in traffic and logs. Include the sensitivity and composition analysis; distribution tests do not constitute a DP proof.

_12:08 AM_

## Revised calculation: three histograms

Mathematically valid: three simplex vectors, each with L1 sensitivity 2, and ε = 1/3 ⇒ Laplace scale 6; composition gives ε = 1 per report and then ε ≤ 4 per installation.

Points to settle:

- Define the denominator: attempted interactions; incomplete timings and missing token counts go into “unknown.” Zero interactions produce only “inactive.”
- Never separately transmit activity, the local count, present categories, or precise timestamps.
- The sending schedule must be independent of activity. The guarantee protects reported values; it does not automatically hide participation, network presence, or IP addresses.
- Retain noisy reports without clipping individual values for estimation.
- 10,000 reports remains an operational threshold, not a precision guarantee: at scale 6, uncertainty from noise alone reaches approximately ±16.6 percentage points at 95% confidence per coordinate.
- Distinguish pointwise intervals from simultaneous intervals over 24 coordinates; count deduplicated reports without claiming distinct users or protection across devices.
