# OMNI — From the First Thread of Continuity to Personal Infrastructure

The journey from zero to a million people begins with one person choosing to return.

This roadmap has three phases: **Genesis**, **Sovereign Agent**, **Global Mesh**. The cohort sizes and thresholds below are proposed experimental targets. They describe neither existing adoption, commercial forecasts nor demonstrated capacity. Progress between phases depends on evidence; no date makes it automatic.

| Phase           | Illustrative target scale      | The question to answer                                                         |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Genesis         | 0 → 100 voluntary participants | Does memory under the user's control actually improve existing workflows?      |
| Sovereign Agent | 100 → 10,000 active users      | Can people delegate within boundaries they understand and the system enforces? |
| Global Mesh     | 10,000 → 1,000,000 people      | Can that autonomy endure across devices, providers and independent operators?  |

Installations, accounts, subscriptions, study participants and active users remain distinct measures. Their counting methods will be published with the results. The current collector receives installation reports; it does not count unique people. Pilot measurement will use separate consent, without making telemetry a condition of using OMNI.

## The Starting Point — An Executable v1 With Explicit Boundaries

The repository contains a **SQLCipher** vault, memories with provenance and status, sharing permissions bounded by destination, scope and expiry, disclosure receipts, and explicit connections to the OpenAI and Anthropic protocols. Browser capture requires a deliberate action. Local extraction proposes memories for review.

The v1 also includes **OpenDP**, a persistent budget, analytics export through a closed numeric schema, and a collector with deduplication and a publication threshold. Analytics participation is optional. The pilot protocol permits at most four weekly reports, with a stated cumulative privacy loss; this cap does not silently reset.

Transport uses **WireGuard/BoringTun**, admission through an authenticated packet (_Single Packet Authorization_), replay protection and a **30-minute** client identity-key rotation policy. The semantic layer relies on application integrations. Carrying HTTPS through a tunnel does not reveal its content.

**React, Three.js and Tauri** make memory and its permissions inspectable. The administration console adds persisted model profiles, discovery, per-request history, structured audit, token and payload accounting, manual cost estimates and local retention settings. Context compression is displayed as a benchmark; verified task-quality and network-saving claims remain evaluation work. The laboratory uses synthetic data labeled as such. Its checks and interoperability tests provide evidence for the scenarios tested, not a measure of adoption or resistance to every compromise.

Still **to be built or evaluated**: a vault process isolated through OS permissions, a temporal semantic graph, granular authority per agent and action, personal synchronization across devices, and federation between operators. **SingleStore, Kubernetes and federation are not implemented components of this v1.** Their value must be established through a demonstrated need and a comparative trial. The detailed technical state remains documented in the [architecture](ARCHITECTURE.md), [privacy protocol](docs/PRIVACY.md), [VPN transport](docs/VPN.md) and [validation evidence](docs/VALIDATION.md).

The shared native application now embeds the Rust engine, uses authenticated IPC without a listener by default, and has key-store adapters for macOS, Windows, Linux, Android and iOS. Each application installation owns a separate local vault. Build tooling targets desktop packages, Android debug APKs, an unsigned iOS simulator app and a distinct unsigned iPhone ARM64 archive through `ios --device`. That device archive still requires signing and provisioning before installation; source support, an unsigned archive or a passing desktop build does not establish phone readiness. The [platform guide](docs/PLATFORMS.md) states the architecture and prerequisites, while [validation evidence](docs/VALIDATION.md) records measured results. There is no bundled mobile inference model, background capture service or mobile VPN extension.

The fifth browser QA suite, `test:native`, exercises native frontend behavior through a mocked Tauri invocation bridge backed by a real isolated core and encrypted vault. It adds evidence for routing, setup, lock behavior and metadata-only export calls. Actual Tauri IPC, OS key stores, native share sheets, package execution and physical devices remain separate verification boundaries.

## Phase I — Genesis: Earn a Place in the Day

**The promise to test:** continue a task across several AIs with less repetition while knowing what was shared.

The proposed first audience is independent professionals, developers and small teams using several assistants on ongoing projects. Distribution begins with supported pilots in professional communities the team can reach. Each participant brings real work and chooses their sources. One complete use case is worth more than a long list of connectors.

The guided first run now connects a provider, optionally saves one confirmed memory without granting access, and opens a first conversation. The browser development launch uses an expiring, single-use pairing exchange; standalone native startup creates an in-process owner session. A read-only development diagnostic and dependency freshness checks improve recovery. The home screen places conversation and guided setup beside the private memory view. Public signing, notarization, device validation and store acceptance remain separate release gates.

The product must continue to make it simple to correct a first memory, grant limited permission, send a request with context and inspect the resulting receipt. Metadata export is distinct from complete memory portability or a recoverable encrypted backup. Verified key recovery and vault restoration remain work to complete before a public beta, particularly for device-bound mobile keys. Withdrawing permission must be understandable without reading code.

Platform release work must test cold start, key-store denial, existing-vault recovery, app suspension, network loss, touch and keyboard input, metadata export and reopening after an explicit interface lock on each claimed target. Windows and Linux need their own packaging checks; Apple device distribution requires actual signing credentials. None of these gates is satisfied merely by generating a project or an unsigned simulator artifact.

### Evidence Required Before Expanding

- **Utility:** recruit at least 30 participants, complete 20 four-week participant journeys and compare 200 tasks. Alternate the order between OMNI and a manually prepared context brief, using the same model and task budget. Target a median reduction of at least 30% in time spent rebuilding context, with no drop in task success greater than five percentage points. Publish distributions and their uncertainty.
- **Accuracy:** across the tasks reviewed, target a rate of false or outdated memory injections no higher than 2%. Disagreements between evaluators and sensitive categories remain visible; a favorable average must not hide a serious incident.
- **Control:** no unauthorized access in the adversarial test suite defined before the pilot. Every observed disclosure must correspond to an applicable permission. A failure blocks distribution of the affected version until it is corrected and checked again.
- **Installation and continuity:** on explicitly supported hardware, at least 90% of participants reach a first useful interaction in under ten minutes. Every tested backup scenario must restore memories and their permissions without silent loss.
- **Energy:** establish reproducible measurements on two published reference configurations. At idle, with the window hidden and excluding the response model, target no more than 0.5% average total CPU usage over ten minutes and 350 MiB of resident memory. Measure the cost of local extraction separately; also publish consumption for the complete workflow, including the model.
- **Economic value:** offer a subscription at a price announced before the test and obtain at least ten real payments, followed by a majority renewing at the first renewal date. Interviews, purchase intentions and free trials will be counted separately.

These thresholds are decision tools. They remain operating hypotheses, never public guarantees made before measurement.

**Stop rule:** after two focused iterations without a useful gain in the comparison, stop expanding the segment and reconsider the use case. If access to a source adds little utility while increasing errors or exposure, remove it from the default workflow. If participants return only for the visual demonstration, refocus on the everyday work OMNI should improve.

## Phase II — Sovereign Agent: Delegate Without Surrendering Authority

**The promise to test:** a person can entrust a task to an agent, inspect the limits of that delegation and cut off its future access.

This phase turns today's context permissions into more precise authority. It must distinguish an agent's identity, the requested resource, the destination, the permitted operation and its duration. Actions with external effects need their own rules: spending limits, appropriate confirmations, safe retries and an inspectable history. The model may propose an action; the authorization decision must remain deterministic and separate from its interpretation of messages.

The target memory system becomes temporal and connected to its sources: changes, contradictions, dependencies and summaries can be revised. The process holding the vault must be isolated from network egress at the OS level, with narrow channels to authorized components. That confinement remains an objective to verify; the current organization of Rust modules does not provide it.

Distribution may grow through agent integrations and selected partners. Funding remains centered on a service paid for by its users. An organization-funded subscription must keep personal spaces, workspaces and their respective rights explicit. The payer receives no implicit access to the personal vault.

### Evidence Required Before Broadening Delegation

- **Authority:** an independent assessment covers injection through documents and tools, agent impersonation, privilege escalation and retries after revocation. Any critical or high-severity vulnerability that permits a bypass continues to block release of the affected version.
- **Confinement:** tests on every supported OS demonstrate that the vault process cannot establish a direct outbound connection and that an agent cannot administer its own rights. Publish the limits of protection against a compromised OS.
- **Memory fidelity:** across at least 1,000 test episodes covering changes and contradictions, 100% of selected derived memories must have provenance that can be resolved. A memory without a valid source is excluded from transmitted context.
- **Sustained use:** observe at least 200 users who have completed their first useful task, then target at least 50% retention at eight weeks and usage across at least two integrations for 30% of that cohort. Define a useful task and an active week in advance.
- **Reliability and resources:** for supported connections, target an OMNI-attributable failure rate below 1% over a 30-day window. For selecting context that is already indexed, target local p95 overhead below 150 ms on the published configurations, without relaxing permission rules. Each new source must deliver a measured gain relative to its energy cost.
- **Viability:** across a paying cohort observed for three months, achieve a positive contribution margin after hosting, payment costs and directly attributable support. Publish the costs excluded from this calculation, including research and development. Test demand through renewals rather than inferring it from downloads.

**Stop rule:** an authority bypass suspends the affected operations. Repeated memory errors suspend automatic context injection, reverting to explicit selection. If integrations change faster than the team can maintain them reliably, reduce the advertised coverage. Growth must wait for understandable delegation and a sustainable service.

## Phase III — Global Mesh: Let Continuity Travel, Preserve the Boundaries

**The promise to test:** a person can preserve continuity across devices and operators without becoming captive to a new center.

The target network connects personal authorities. It lets people move their memory, synchronize what needs synchronizing and grant access across compatible systems. Its design must address conflicts, a lost device, key revocation, recovery and migration. Each of these operations must remain understandable to the person.

Any future federation must work with independent operators and published protocols. Its value will depend on real ways to leave: change operators, migrate a vault, revoke a device, continue with another agent.

Collective analytics will remain optional. The v1 pilot cap alone does not support continuous observation at this scale. Any evolution will require a revised protocol, explicit accounting for successive disclosures and an examination of the multi-device case. Methods for reducing metadata exposure or resisting fabricated contributions must be evaluated separately. None of these protections emerges automatically from a growing user count.

### Evidence Required Before Each Increase in Scale

- **Portability:** before declaring federation available, complete a round-trip migration involving two independent operators using a versioned corpus. No memory, provenance link or permission may be silently lost or broadened.
- **Recovery:** demonstrate lost-device, revoked-key and post-incident restoration scenarios. Recovery requirements and their trust tradeoffs must be presented before synchronization is enabled.
- **Capacity:** pass separate trials representing 10,000, 100,000 and then 1,000,000 simulated installations. At each stage, publish event frequency, concurrency, report sizes, hardware, latencies, error rates and cost. A million simulated clients will never be presented as a million acquired users.
- **Operations:** before each commercial expansion, meet the published target for managed services, proposed at 99.9% availability, for 30 days, then perform a verified restoration. A SaaS outage must not prevent people from reading or exporting their local memories.
- **Statistics:** keep an insufficient-data state whenever publication is not justified. The v1 already requires 10,000 weekly reports in production, but that threshold guarantees neither representativeness nor sufficient precision. Set the required precision for each question, then assess noise, bias and sample size before publishing a conclusion.
- **Economics and energy:** maintain a positive contribution margin, measure energy and cost per useful task, and verify that each infrastructure expansion actually improves the result. SingleStore, Kubernetes or federated computation enter the selected architecture only after a reproducible comparison with a simpler solution.

**Stop rule:** defer a stage if cost, energy, recovery or control deteriorate beyond the announced thresholds. Suspend a statistic if it does not support the conclusion shown. Reject a partnership that requires implicit access to memories or hidden influence over recommendations. A federation that prevents people from leaving would defeat its own purpose.

## The Measures That Span All Three Phases

We will track time saved rebuilding context, tasks completed, corrections required, unnecessary disclosures, correctly denied access, incidents, retention, renewals, and cost and energy per useful task. These measures must remain individually legible. No single score for “understanding the person” can replace them.

Every experiment will state its comparison, duration, thresholds and stop criteria before it begins. Unfavorable results will have a place in the next decision.

A million is a horizon for reach. The promise to preserve remains personal: recover your continuity, choose your boundaries, keep the freedom to leave.
