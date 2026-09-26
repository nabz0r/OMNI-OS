# OMNI business plan for the first commercial pilot

Planning proposal, 24 September 2026. The product evidence is verified separately in [EVIDENCE.md](EVIDENCE.md). Market, pricing and conversion assumptions below remain hypotheses.

## Product and customer problem

OMNI stores reviewable memories locally and controls which context goes to a chosen AI provider. The evaluation MVP also applies request policies to supported exchanges, including inspectable text files, and records disclosure and policy metadata. Its first commercial question is whether this improves an everyday workflow enough for someone to pay.

The proposed first customer is a fintech software company or specialist financial-services consultancy with a team of roughly 5-25 professionals using multiple AI tools. The initial job is preparing and revising technical documentation, internal procedures or integration notes using approved, non-sensitive material. A technical founder or engineering lead is the likely champion. A security or operations lead can veto adoption; a budget owner must be identified separately. These roles are an interview hypothesis, not observed customers.

Users currently repeat instructions, maintain context briefs or remain inside one provider's memory. Firms can also choose gateway guardrails and enterprise data-governance suites. OMNI must earn its place alongside these alternatives through a better workflow, clear controls and acceptable support costs.

## Proposed value

A professional can correct a memory, grant it to one destination, use it in a request, inspect the receipt and stop future sharing. Request rules can block a known sensitive marker before supported requests leave OMNI. Local storage reduces the need for an OMNI-hosted repository of conversation content. Remote inference still sends authorized content to the selected provider. The current app cannot force all device traffic through OMNI, and a local administrator can bypass local deployment controls.

The potential advantage is the combined user experience of editable local memory and deterministic disclosure rules. This is not a defensible moat by itself. Long-term differentiation would need maintained integrations, trusted release operations, measurable task utility and repeatable deployment. AGPL source supports inspection but also makes copying possible.

## Competitive alternatives

| Alternative | Relevant strength | OMNI proposition to test | Unresolved question |
| --- | --- | --- | --- |
| Manual context brief | Cheap, understandable and portable | Faster reuse with explicit permissions and receipts | Is saved effort larger than setup and correction effort? |
| Provider-native memory | Embedded in the user's existing tool | Continuity across supported providers under local control | Will users switch tools often enough to care? |
| [Mem0](https://mem0.ai/) | Memory infrastructure for agents and applications | End-user control and local workflow | Which needs require an app rather than a developer memory service? |
| [LiteLLM guardrails](https://docs.litellm.ai/docs/proxy/guardrails/quick_start) | Gateway policy integration | Memory permissions and personal review in the same flow | Would a gateway plus a context file be sufficient? |
| [Microsoft Purview](https://learn.microsoft.com/en-us/purview/ai-microsoft-purview) | Enterprise governance and security integrations | Small-team adoption with a local memory layer | Can OMNI coexist with enterprise controls without extra risk? |

Vendor descriptions were reviewed on 24 September 2026. No comparative product benchmark or claim of exclusive features is made. Do not use a checklist that assumes competitors lack features simply because they were not researched.

## Pricing and commercial path

Propose a four-week assisted pilot at **EUR 2,000 excluding tax**, covering up to ten consenting users and one agreed workflow. This tests a paid service proposition using the evaluation product. It does not sell an enterprise security guarantee. Start with synthetic data, then public or approved non-sensitive material under the customer's own assessment.

After successful pilots and release gates, test **EUR 500 per organisation per month excluding tax** for up to ten seats, maintained supported integrations and bounded support. Customers provide their model accounts and pay inference charges directly. Additional users, deployment work and response times require a defined offer. Billing is not implemented. Do not promise unlimited support or include model spending in subscription margins.

The model assumes initial pilots in April-June 2027 and recurring revenue from July 2027. Discovery and unpaid synthetic evaluations start earlier. Early interest, a signed non-binding letter, an invoice, cash collection and recurring revenue are different events. Track them separately.

## Market sizing through explicit assumptions

There is no researched, verified count of organisations willing and able to buy this exact product. Use a bottom-up sensitivity rather than a fabricated TAM:

| Planning scope | Assumed organisations | Annual contract value | Implied annual revenue pool |
| --- | ---: | ---: | ---: |
| Initial reachable segment | 200 | EUR 6,000 | EUR 1.2 million |
| Wider European segment | 5,000 | EUR 6,000 | EUR 30 million |
| Longer-term multi-sector scenario | 50,000 | EUR 6,000 | EUR 300 million |

All account counts and the price are illustrative assumptions. These rows are nested possibilities, not additive markets, a sales forecast or a claim that the named organisations exist. Replace counts with a deduplicated account list qualified for workflow, budget and permission to use the product. The first 20 interviews should establish whether the proposed segment is coherent.

## Acquisition and sales experiment

Build a first list of 50 named organisations from public ecosystem directories after the selection criteria are fixed. Seek introductions through LHoFT, Luxinnovation and Nexus, without claiming any of them as a partner. Ask for a short workflow interview, then an observed demo, then a bounded pilot. Keep owner, next step, objections, budget authority and permission to follow up in a private pipeline.

Proposed first funnel: 50 relevant organisations, 20 completed interviews, eight scoped demonstrations, three signed paid pilots and two recurring conversions. These targets are experiments; do not multiply them into a market forecast. Diagnose the first stage that fails. If interviewees have no recurring problem, change the workflow before building more integrations.

## Delivery and staffing

Plan around one founder responsible for product and discovery, a security/integration engineer starting in month four if funded, and specialist legal/security contractors. These are roles and budget assumptions, not existing hires. Keep one main customer workflow, two supported provider protocols and macOS plus Android evaluation coverage. Delay iOS public distribution, federation, knowledge-graph expansion and speculative infrastructure until the pilot demonstrates a need.

The owner must supply team biographies and actual time allocation. Fit 4 Start's two-person requirement cannot be satisfied by this staffing plan alone.

## Milestones and decision rules

By December 2026, seek 20 interviews and three pilot intents without labelling them customers. By March 2027, complete distribution/recovery gates and the agreed security review before wider real-data deployment. During April-June, deliver up to three paid pilot hypotheses. By September, evaluate renewal and contribution margin. By December, expand only the workflow that has both utility and repeat purchases.

Run the original roadmap utility comparison: 30 recruited participants, 20 completing four weeks and at least 200 paired tasks. Target a 30% median reduction in context preparation time without task success falling by more than five percentage points. Report sample size and uncertainty. The three-organisation commercial pilot does not automatically satisfy that study size. Stop expansion after two focused iterations without useful gains. Any unauthorized disclosure blocks affected release paths.

## Funding proposition

The proposed planning envelope is **EUR 350,000 over 18 months**, starting January 2027. It supports product reliability, customer validation and a limited commercial release. The [financial plan](FINANCIAL_PLAN.md) separates costs, cash timing and scenarios. This is not a confirmed fundraising mandate, valuation, investment offer or awarded grant. Finalise the amount with actual compensation, cash and corporate information.
