# OMNI venture review

Fintech product, commercial and funding assessment. Evidence cutoff: 24 September 2026. Outlook: 2027. Prepared from the current repository, the v0.2.0 evaluation release, the application package, new local checks and primary-source research.

## 1. Investment and product conclusion

**OMNI is a credible technical evaluation MVP with an unproven business. The next investment should buy customer and deployment evidence, not a broader architecture.** Its most promising initial proposition is controlled reuse of approved context in a recurring fintech engineering workflow. It is not yet substantiated as a bank-wide security platform, a regulated financial service, or a proven high-growth company.

The implementation is materially stronger than an idea-only pitch: there are native evaluation packages, encrypted local storage, explicit grants, disclosure receipts, request policies and reproducible tests. The new audit reran 81 Rust tests including two native application tests, 31 JavaScript tests including isolated Redis, three VPN script tests and 17 isolated runtime checks. Builds and static checks passed. These are bounded engineering observations; they do not establish complete security, physical-device reliability or commercial demand. [R1-R4]

| Decision | Assessment | Evidence needed to advance |
| --- | --- | --- |
| Continue focused development | Yes | Keep one buyer, one workflow and clear release gates |
| Seek design partners and programme feedback | Yes | Genuine team/contact details and honest demonstration |
| Run a paid, limited evaluation | Conditional | Approved data scope, signed terms, suitable release and named support owner |
| Claim enterprise-wide prevention or regulated production readiness | No | Managed identity, work separation, enforcement, recovery and external assessment |
| Claim product-market fit or a venture-scale growth engine | No evidence yet | Repeat use, collected revenue, renewal and a repeatable acquisition channel |

The primary bottleneck is uncertainty about willingness to adopt and pay. More infrastructure does not resolve that uncertainty. The secondary bottleneck is trust: a product promising persistent memory must have a credible response to a lost device, an update failure and an employee leaving.

No defensible assessment can guarantee total startup success or flawless operation. Success depends on buyers, execution, capital, external providers and future changes. This review defines observable conditions and decision rules rather than inventing a probability of success.

## 2. What business OMNI should attempt first

The repository's original story concerns a person's continuity across AI tools. The funding package proposes selling to organisations. Both can coexist eventually, but they imply different authorities, purchasing decisions, support duties and retention rules. The enterprise payer does not automatically acquire rights over personal memories. This is a product design decision, not a paragraph to solve at contracting time. [R1, R5]

**Recommended initial description:** OMNI helps small fintech engineering teams reuse approved context across supported AI tools, inspect what was shared and apply explicit request rules before sending.

The first job should be narrower still: revising integration documentation or a technical runbook from approved, non-sensitive context. The technical lead is a plausible champion, the budget owner must be identified, and security can veto the deployment. These roles remain hypotheses until interviews confirm them.

Use a single work-scoped evaluation environment with no mixing of personal content. This is an operating restriction for the pilot; it does not pretend the current app implements a work/personal vault product. If buyers require centrally enforced control over all AI use, OMNI must either build and validate that capability later, integrate with an approved enforcement layer, or decline that deployment.

Start with organisations able to evaluate a macOS application and approved model accounts. Do not assume Android availability solves desktop procurement. Windows has source adapters but no equivalent validated public installer in the reviewed release. Confirm the first buyers' actual devices before expanding platform work. [R2]

The initial commercial promise should be a measurable workflow service. Avoid promising a universal AI firewall, automatic compliance, model independence in every application, or a replacement for an organisation's existing security suite. The current integrations are explicit; they do not transparently govern all ChatGPT or Claude web sessions.

## 3. Pros: strengths worth preserving

1. **A usable implementation already exists.** macOS and Android evaluation packages, source and installation guidance provide a concrete basis for demonstrations. This lowers execution uncertainty relative to a concept, while leaving production distribution work open. [R1-R2]
2. **User control is expressed in product operations.** Memories can be reviewed, corrected and granted to a destination; receipts make disclosure inspectable. This is more concrete than a general privacy slogan. [R3]
3. **Checks sit in the shared Rust request path.** Policy enforcement is not only an interface checkbox. Tests exercise denied requests, injected context, attachments and managed/local precedence. [R3-R4]
4. **Local encrypted storage limits the need for an OMNI-hosted content database.** The native app uses platform key-store adapters and starts without an HTTP listener by default. This is a useful architectural property, not protection against an unlocked-process compromise. [R3]
5. **Technical claims are unusually explicit about their limits.** Documentation distinguishes differential privacy from ZKP, revocation from remote deletion, and a development signature from trusted public distribution. Preserve that discipline. [R3, R5]
6. **The integration approach leaves customer inference spending outside the proposed subscription.** That reduces one source of model-cost exposure, though it adds setup and support friction. [R5]
7. **The funding package is coherent and editable.** The brief, deck, application copy and financial model use compatible prices, milestones and assumptions. The files are usable working materials. [R5-R6]
8. **The roadmap contains measurable comparisons and stop rules.** A manual context brief is an appropriate baseline; returning use and payment are separated from downloads and installations. [R7]
9. **The Luxembourg financial ecosystem is relevant for learning.** Public research describes internal AI use and governance concerns; local support organisations offer access to potential evaluators. This is a route to discovery, not evidence of OMNI demand. [S1, S9]
10. **The open-source code can support technical diligence.** A prospective partner can inspect the implementation and reproduce checks. Commercial rights, contributor assignments and dependency obligations still need verification. [R1, R5]

The strongest combination is inspectable local context plus explicit sharing and supported-path rules. The valuable outcome is a better controlled workflow, not the number of technologies in the stack.

## 4. Cons: weaknesses and failure risks

| Priority | Weakness | Why it can prevent success |
| --- | --- | --- |
| Critical commercial | No authenticated demand, revenue or retention evidence supplied | A working app can remain a demonstration people admire but do not use |
| Critical product | Personal authority versus enterprise administration remains unresolved | Buyers may require controls incompatible with an implicit personal-memory design |
| High trust | No complete supported recovery flow | Loss of key material can destroy access to the very continuity being sold |
| High release | Evaluation signatures and incomplete device/upgrade evidence | Security review and ordinary installation may block adoption before value is tested |
| High security scope | No device-wide bypass prevention, fleet identity or signed policy distribution | Local request rules cannot support a universal organisational control claim |
| High differentiation | Strong substitutes and easily copied feature concepts | Local storage, memory and guardrails alone do not prove durable advantage |
| High economics | EUR 500 monthly pricing and support allowances are unvalidated | A small number of difficult deployments can eliminate contribution margin |
| High growth | The central forecast reaches only about EUR 66,347 annualised recurring revenue at month 18 | It finances learning but does not itself demonstrate a venture-scale growth engine |
| High team | Actual team, commitment, IP ownership and corporate records remain unknown | Investor diligence and programme eligibility cannot be completed truthfully |
| Medium execution | A broad stack and many platform ambitions compete for attention | Maintenance can consume capacity before any narrow workflow earns repeat payment |
| Medium adoption | Another launcher, provider configuration and permission steps add friction | Users may prefer existing tools and a context file even if OMNI offers more control |
| Medium signalling | VPN/ZKP history, broad vision and security imagery can overstate the product | Reviewers can misunderstand the scope or lose trust when details differ |

These are not all confirmed defects. Several are missing evidence or deliberate scope boundaries. The audit found no failing product assertion in the local checks it completed. That finding must not be converted into an assertion that the risks above are resolved.

The most dangerous strategic response would be adding agent autonomy, federation and more platforms to compensate for weak demand. The response should be a smaller paid experiment with a clear buying decision.

## 5. Fintech market: relevant, but not an automatic market

The CSSF/BCL survey covering 2024 received 461 responses. It reported 402 AI use cases, 92% of them internal, while 46% of respondents placed AI/DLT investment at group level only. These are historical observations from supervised financial institutions; they are not a 2027 forecast, an OMNI addressable-market count or a survey of independent fintech software teams. They nevertheless support testing an internal workflow and identifying where budget authority actually sits. [S1, pages 4 and 6]

The Bank of England/FCA 2024 survey had 118 respondents; 75% reported using AI. Data protection, resilience and security were important concerns. The sample concerns UK regulated firms, so it must not be extrapolated to Luxembourg buyers. Its value here is evidence that adoption and governance problems coexist, not proof that a new memory application will win procurement. [S2]

| Segment | Recommendation | Main reason |
| --- | --- | --- |
| Small fintech software builders with multiple approved AI tools | First hypothesis | Technical sponsor and recurring documentation work may be reachable |
| Specialist financial-services implementation consultancies | Second hypothesis | Context reuse may be frequent, but client confidentiality requires strict separation |
| Small supervised financial institutions | Later, selective | Small headcount does not remove procurement or resilience obligations |
| Large banks and insurance groups | Defer broad sales | Enterprise identity, distribution, audit and purchasing complexity exceed current evidence |
| Consumer personal memory | Separate experiment only | Different buyer, acquisition economics and feature expectations |

Qualify each account by workflow frequency, current alternative, device, approved provider, decision-maker, data scope and buying timetable. An enthusiastic employee without budget authority is a research participant, not a qualified sales opportunity.

Replace illustrative market counts with a deduplicated account list. The existing 200/5,000/50,000 organisation scenarios are useful arithmetic but not a sourced TAM. Do not sum nested scenarios or multiply a national AI adoption percentage by all companies to manufacture a revenue opportunity. [R5]

## 6. Competitive position and defensibility

| Substitute | What the buyer already gets | What OMNI must prove |
| --- | --- | --- |
| Maintained context brief and existing AI subscriptions | Familiar workflow and low switching cost | Net time saved after setup, review and correction |
| Provider-native memory | Convenience inside an existing tool | Cross-provider continuity is frequent and valuable enough to change behaviour |
| Mem0 | Vendor-described memory infrastructure, integrations and enterprise deployment options | A better user-controlled workflow for the selected buyer; local deployment alone is not an exclusive distinction |
| LiteLLM | Documented gateway guardrails | The combined memory workflow adds value beyond a gateway plus a context file |
| Microsoft Purview | Documented governance and data-protection capabilities for supported AI applications | Complementarity or a simpler narrow deployment with a clear cost/benefit case |

The competitor rows describe official positioning, not independent performance or security comparisons. No competitor was installed and benchmarked in this audit. Unknown features must remain unknown. Mem0's own current page describes private-cloud and air-gapped options; it would therefore be misleading to position every memory competitor as inherently cloud-only. [S3-S5]

A defensible advantage could emerge from a demonstrably superior workflow, accurate context handling, reliable supported integrations, trusted deployment and accumulated buyer relationships. It is not yet established. Customer data should not become a hidden asset used to justify a moat: that would conflict with the product's control promise.

Run a task comparison against at least the manual baseline and the buyer's current setup. Include setup time, correction time, unsupported cases, false policy blocks, operator effort and task quality. A token reduction that worsens quality or increases user work is not a business win.

Do not price only by feature count. The prospect buys an outcome and a support commitment. If the buyer wants only a request gateway, investigate an integration or channel offering before building a second broad product.

## 7. Security and regulated-buyer readiness

**The existing controls are meaningful, but their perimeter is narrow.** SQLCipher protects stored content; it does not protect plaintext in an unlocked compromised process. A grant governs future OMNI disclosure; it does not erase a provider's copy. Regex rules enforce known patterns on supported paths; they do not prove semantic sensitivity detection or prompt-injection resistance. [R3-R4]

| Requirement | Present evidence | Acceptance work still needed |
| --- | --- | --- |
| Key custody and recovery | Native key-store adapters, fail-closed tests | Lost-device, invalidated-key, restore and migration design with executable drills |
| Trusted releases | Versioned assets, checksums, source CI | Production signing, notarization where applicable, update identity, rollback and support lifetime |
| Organisational authority | Owner/agent distinction and provisioned baseline | Work/personal separation, named administrators and appropriate offboarding |
| Policy lifecycle | Local validation, precedence and revision conflicts | Signed distribution, stale/offline behaviour, acknowledgements and rollback protection |
| Enforcement coverage | Supported API and native request paths | Explicit device/network controls if the contract promises mandatory routing |
| Operational evidence | Local bounded metadata | Customer-approved audit export, retention, incident handling and exit procedures |
| Robustness | Unit, integration and synthetic runtime checks | External assessment, adversarial corpus and real supported-device/provider matrix |

DORA has applied to covered EU financial entities since 17 January 2025. The CSSF highlights ICT risk, incidents, resilience testing and third-party risk. The practical implication is that a financial buyer may require service, continuity, subcontracting, audit and exit evidence. This does not make OMNI automatically regulated in the same way as its customer, and no product certification follows from the architecture. [S6]

For personal data, establish roles, lawful processing, minimisation, retention, provider contracts and transfer arrangements for the actual deployment. For the AI Act, assess intended use and product role against operative law; a general documentation tool and creditworthiness decisions are different propositions. The Commission's current overview has a phased timetable; there is no single useful blanket label of '2027 compliant'. [S7-S8]

The first pilot should exclude customer financial records, identity files and consequential automated decisions. Do not buy an expensive certification simply for a slide; first obtain a buyer's actual requirements and implement the controls behind any future assurance claim.

## 8. Audit of the delivered application materials

The package is a strong preparation set, not a completed application or a validated business. Its strongest editorial choice is separating delivered features, forecast assumptions and missing owner facts. The final attachments' hashes match their manifest. The workbook's central cash schedule was independently recalculated again in this review. [R5-R6]

| Deliverable | What works | What must improve before its next use |
| --- | --- | --- |
| Pitch deck, 13 slides | Clear product, real synthetic UI, restrained security claims | Add real team, one observed customer problem and verified usage; tailor the ask to the programme |
| One-page brief | Compact and consistent with the deck | Replace general hypothesis with a specific buyer example when evidence exists |
| Financial workbook | Live formulas, cases, cash lag, financing separate from revenue | Add actual opening position, validated costs, hiring sensitivity and a measurable acquisition driver |
| Business plan | Narrow proposed workflow and honest pricing assumptions | Replace hypothetical market counts and funnel with account evidence |
| Pilot proposal | Bounded data and measurements; clear exclusions | Set a support-hour cap, authorised signatories, actual terms and acceptance responsibilities |
| Security brief | Documents real controls and boundaries | Turn proposed processes into owned, tested operational records |
| Programme answer banks | Relevant reusable language | Complete live fields, founder facts and genuine video; no guessed answers |
| Roadmap | Near-term commercial gates plus longer vision | Resolve resource dependencies and explicitly choose one commercial experiment |
| Logos and attachments | Required formats exist; deck is below the Nexus size limit | Check live portal requirements and public-use rights immediately before filing |
| Offline reader and archive | Portable navigation and integrity inventory | Reader has structural checks; no fresh browser visual verification of local-file rendering |

Deck-specific priorities: slides 2 and 6 need an observed example of pain and a named buyer role; slide 5's engineering evidence must remain separate from traction; slide 7 should evolve from a feature discussion to a measured workflow comparison; slide 11 needs real cost and fundraising authority; slide 12 is the main diligence gap because founder credentials and commitment are not supplied. [R6]

The brief and deck correctly avoid fabricated traction, but repeated caveats can make the external story sound like a research proposal. Resolve that through real customer evidence and a sharper opening, not by deleting material limits. The application answer bank is not a substitute for reading the live form.

## 9. Financial diagnosis

The supplied model assumes EUR 350,000 arriving in January 2027, zero illustrative opening cash and no grants. It is a validation budget, not proof of available runway. The 18-month fixed costs are EUR 272,300; a 10% cost allowance adds EUR 27,230. These assumptions remain unquoted and uncommitted. [R5-R6]

| Case | June 2028 MRR | Annualised final MRR | Closing cash |
| --- | ---: | ---: | ---: |
| Downside | EUR 1,398.65 | EUR 16,783.83 | EUR 53,707.78 |
| Base | EUR 5,528.93 | EUR 66,347.21 | EUR 76,651.71 |
| Upside | EUR 14,769.97 | EUR 177,239.60 | EUR 122,227.41 |

A positive closing balance does not mean profitability. In the base case it is primarily the consequence of assumed financing. Even the upside ends below the approximate steady operating break-even under the current cost assumptions.

At EUR 500 monthly price, EUR 100 support, EUR 20 hosting and 2% payment cost, contribution is EUR 370 per organisation, or 74%, before fixed payroll and research. Ordinary fixed monthly cash expense from month four is EUR 15,100; including the 10% allowance, EUR 16,610. Dividing by EUR 370 yields approximately **45 organisations, EUR 22,500 MRR or EUR 270,000 ARR**. This excludes new costs needed to serve that scale, exceptional review costs, taxes and other omitted items; it is a planning threshold, not a forecast.

A base-case stress with fixed expenses 30% higher, keeping the 10% reserve rate, ends at **negative EUR 13,207.29**, first turning negative in month 18. Delaying subscriptions by three months while keeping pilots and costs unchanged ends at EUR 66,611.93. With no financing, the stated zero-opening-cash plan is unfunded from month one. Stress calculations are additional analytical cases; the delivered workbook itself remains unchanged.

One new organisation a month with 1.5% monthly churn converges mathematically to about 66.7 organisations under unchanged assumptions. It does not create exponential growth. EUR 1 million ARR at EUR 6,000 annual contract value needs 167 paying organisations; a path to that level needs a channel and capacity model, not an arbitrary higher growth cell.

## 10. Pricing, support and customer value

The proposed EUR 2,000 pilot and EUR 500 subscription are sensible hypotheses to test, not externally validated price points. Selling implementation help can produce early revenue while concealing an uneconomic software proposition. Separate one-time delivery hours from recurring support and record founder time even when it is not invoiced. [R5]

The model's EUR 100 monthly support allowance buys only **80 minutes at an illustrative EUR 75 fully loaded hourly cost**. Neither that hourly cost nor the allowance is a quote. A customer needing four support hours would cost EUR 300 on the same assumption, leaving EUR 170 monthly contribution after hosting and payment costs, instead of EUR 370. The corresponding simple steady break-even would rise to 98 organisations before added scale costs.

The pilot's EUR 500 direct delivery allowance buys about 6.7 hours at EUR 75/hour. Installation, four weekly reviews, measurement and reporting may exceed that. Track hours by activity and decide whether to raise the price, narrow scope or automate. Do not call the apparent pilot margin fully allocated profitability when founder delivery sits in fixed payroll.

For a ten-user customer valuing time at an illustrative EUR 60/hour, EUR 500 equals 50 minutes saved per user per month before implementation, inference, supervision and change-management costs. A proposed three-times-fee gross value target would be 150 minutes. These are value arithmetic, not cash savings or measured productivity. Fewer active users raise the burden on each remaining user.

A 30% decrease in context-preparation time is not a 30% improvement in the whole job. Record total task time, correction time, success quality and actual use. Keep model/version, budget and task comparable. Repeated tasks from one person are correlated; do not present 200 task observations as 200 independent customers.

Avoid publishing lifetime value from assumed churn. The base 1.5% monthly churn implies roughly 83.4% annual organisation retention, but no cohort supports that assumption yet. Acquisition cost, payback and expansion should be measured after real spending and renewals exist.

## 11. Roadmap and operating capacity

The current roadmap is directionally sound: discovery precedes paid trials, security gates override dates, and federation is not presented as delivered. Its weaknesses are the breadth of the long-term story and the unresolved capacity behind the near-term calendar. [R7]

The Q1 2027 plan includes trusted distribution, recovery and security assessment, while the engineer starts in April in the financial model. Unless the founder can deliver the Q1 engineering and discovery load, these are inconsistent capacity expectations. Either price earlier specialist capacity, narrow the Q1 scope or move the milestone. Do not quietly assume unpaid contractors.

The same founder cannot promise full programme attendance in Luxembourg and San Francisco while also running every pilot and release process. Assign actual people and time, decide which route takes priority if selected, and model travel and any corporate restructuring. Programme acceptance should not trigger commitments that have not been costed.

Before more complex features, establish a release owner, weekly support triage, a documented supported-configuration matrix and a simple recovery procedure that genuinely works. Expand to Windows when qualified buyers make it a gating need; do not market unverified installers. Keep Android as evaluation coverage unless field use justifies equal commercial investment.

Defer federation, a semantic graph, autonomous external actions, mass-market scaling and broad binary document parsing. Each creates a separate verification burden. Improve memory accuracy through a bounded corpus of stale, conflicting and malicious content before adding more sources. Maintain explicit selection as a fallback if automatic context handling performs poorly.

The next 90 days should finish with a buyer decision and a release plan backed by real costs, not merely a longer feature list. The detailed [action plan](ACTION_PLAN.md) separates work that can start now, prerequisites for paid deployment and later expansion.

## 12. Go-to-market and the first 90 days

**Days 1-14:** settle the initial job, permitted data, target hardware and decision-maker. Prepare a list of 50 qualified organisations from public directories, without presenting them as leads until a contact and fit are verified. Conduct five observed problem interviews; ask for the last real task, current alternative and buying process. Record objections and refusals, not only positive comments.

**Days 15-30:** complete ten further interviews and four demonstrations based on the customer's own approved examples. Compare OMNI with the current process. Obtain two written evaluations of what would prevent adoption. Price one bounded pilot and request an explicit budget decision through the authorised commercial process. A non-binding expression of interest is not revenue.

**Days 31-60:** complete 20 interviews and eight demonstrations cumulatively. Run at most two synthetic or approved non-sensitive evaluations while the release gates are being addressed. Agree pilot measurement and support limits, complete recovery design and obtain external review/signing quotes. Prepare founder and company records privately for applications.

**Days 61-90:** seek three pilot commitments conditional on the actual release gates. If the product is ready and a customer signs, a paid evaluation may start earlier than April; the existing forecast date should not delay customer learning. If the gates are unmet, continue bounded synthetic work and update the calendar. Make a documented continue, narrow, change-segment or stop decision.

Proposed allocation before paid pilots: protect meaningful founder time for discovery every week, assign one person to release reliability and use specialists for bounded review. The exact allocation depends on the actual team and funding, which remain unknown. A grant application must not consume the time needed to learn whether anyone wants the product.

Introduce a weekly pipeline review with real buyer, workflow, next decision, expected timing and primary objection. Introduce a monthly cash review using reconciled balances. Keep customer material private and obtain permission before naming a customer or displaying its logo. No prospect was contacted during this audit.

## 13. Funding and programme assessment

| Route | Recommended objective | Main weakness to resolve |
| --- | --- | --- |
| Nexus 2027 | Demonstrate the bounded product and recruit evaluators | A concise buyer story and genuine founder/contact data |
| Luxinnovation / Fit 4 Start | Check eligibility and support a disciplined validation programme | Actual two-person team, full-time commitment and future-call terms |
| LHoFT | Obtain relevant workflow and procurement feedback | Evidence that fintech buyers have this problem |
| YC | Build a credible founder-led company and ambitious learning narrative | Founder distinction, customer insight and a plausible scalable distribution path |
| Techstars | Screen programme-specific strategic value | Actual cohort terms, attendance and dilution versus benefit |
| EIC Accelerator | Revisit after deeper validation | Current evidence does not establish the required breakthrough and maturity case |

The official YC page currently gives 2 November 2026 at 20:00 Pacific as the on-time deadline, corresponding to 3 November at 05:00 in Luxembourg. The batch is January-March in San Francisco. Its standard USD 500,000 investment consists of USD 125,000 for 7% plus a USD 375,000 uncapped MFN SAFE; total dilution is not simply 7%. Corporate structure and travel belong in the decision. [S10-S11]

Nexus closes on 16 November 2026 at noon CET. Treat its event access and advertised prize value separately from committed cash. Fit 4 Start #18 has a notification route, but no verified filing deadline in this review. Current eligibility requires at least two actual people and one full-time participant; a hiring forecast is not an existing team. [S12-S14]

The EUR 350,000 envelope can be defended as a proposal to buy 18 months of product and market evidence after actual costs are validated. It should not be described as an objectively required amount, a valuation, funds raised or a guaranteed runway. Stage commitments: discovery first, reliability next, additional capacity after financing and buyer evidence. Do not lock into an unfunded hiring plan.

A convincing funding update should show what was learned, the resulting product decision, measured use, money collected and the next risk to remove. Reformatting the deck without new evidence will have diminishing returns. No acceptance probability is estimated.

## 14. What success must mean and when to stop

Success should be earned in stages. These are proposed management gates, not results, certification criteria or universal industry benchmarks.

| Gate | Required evidence | Decision if unmet |
| --- | --- | --- |
| Recurring problem | At least five qualified organisations independently describe the same weekly job and its cost among 20 interviews | Narrow or change the workflow before extending features |
| Usable first run | At least 8 of 10 target users complete setup and an approved task within 15 minutes on supported configurations | Fix activation before adding channels |
| Useful workflow | Net task benefit with quality maintained; report per-user results, corrections and uncertainty | Rework the workflow after two focused iterations without useful gains |
| Controlled disclosure | All exercised denials stop provider delivery; no unresolved high/critical bypass on scoped release paths | Pause affected distribution immediately |
| Recoverability | Demonstrated restoration of synthetic content on each advertised recovery path, with failure cases and documented limits | Do not sell durable memory or rely on it as the only copy |
| Early willingness to pay | Three signed and paid pilots, plus at least two paid continuations | Diagnose price, utility and support before widening sales |
| Repeatability | Observe the paid cohort for at least three months, with net contribution and support time recorded | Adjust scope, price or delivery model |
| Growth readiness | A repeatable acquisition source and delivery capacity that stay economic as volume increases | Keep growth spending limited |

The existing 70% week-four useful-session pilot target should retain a clear denominator and definition. Two renewals out of three pilots are encouraging but statistically too small to establish product-market fit. Report the exact counts, and distinguish renewal intent, invoice and collected cash.

A mature success case combines sustained utility, respected user authority, reliable recovery, tolerable support effort and a company able to fund its obligations. Programme admission, press, GitHub stars and a beautiful interface are useful opportunities or signals; none alone satisfies that definition.

The action order is therefore: settle buyer and authority; gather demand evidence; make the chosen deployment trustworthy; price and measure delivery; win and renew paid work; expand only what has earned expansion.

## 15. Evidence, scope and source register

All sources below were accessed or rechecked on 24 September 2026 unless a limitation is stated. Forecasts and recommendations are this review's analysis. The source checkout is `98dfd581582049e106da84c7f772e834117b4814`; released installer source is `a5458a484cab949d22bbe6b44faf9f954dc8d688`. Their evidence is not interchangeable. No application, investor communication or customer outreach was submitted.

### Repository and deliverable references

- R1: [Project README](../../README.md) and [public release](https://github.com/nabz0r/OMNI-OS/releases/tag/v0.2.0). Live GitHub metadata confirms the prerelease and six assets; new binary downloads were not needed for this review.
- R2: [Validation](../VALIDATION.md), [delivery](../DELIVERY.md) and [platform boundaries](../PLATFORMS.md). Android 28/5/7 acceptance figures are prior emulator evidence, not newly rerun physical-device tests.
- R3: [Security](../SECURITY.md), [policies](../POLICIES.md), [vault implementation](../../crates/omni-core/src/vault.rs) and [request-policy tests](../../crates/omni-core/src/http/tests/policy_http_tests.rs).
- R4: [New verification record](VERIFICATION.md) and [live successful CI run](https://github.com/nabz0r/OMNI-OS/actions/runs/35983746338). Fresh local checks are listed separately from historical CI.
- R5: [Funding package](../funding/README.md), [business plan](../funding/BUSINESS_PLAN.md), [pilot](../funding/PILOT_PROPOSAL.md), [financial assumptions](../funding/FINANCIAL_PLAN.md) and [unverified owner facts](../funding/READINESS.md).
- R6: Local `deliverables/OMNI-funding-2027/`: pitch deck PPTX/PDF, one-page DOCX/PDF and financial XLSX. Review used unchanged files verified against their SHA-256 manifest. Source authoring and earlier visual QA are distinguished from new calculations.
- R7: [Roadmap](../../ROADMAP.md). This review adds recommendations; it does not label future milestones as implemented.

### Primary external references

- S1: [CSSF/BCL AI survey for 2024](https://www.cssf.lu/wp-content/uploads/Thematic_report_AI_2024.pdf), pages 4 and 6. Historical Luxembourg supervised-entity sample, not target-customer demand.
- S2: [Bank of England/FCA AI survey 2024](https://www.bankofengland.co.uk/report/2024/artificial-intelligence-in-uk-financial-services-2024). Historical UK respondent sample, not a Luxembourg market size.
- S3: [Mem0 official product positioning](https://mem0.ai/). Vendor claims, not independently verified performance or assurance.
- S4: [LiteLLM guardrail documentation](https://docs.litellm.ai/docs/proxy/guardrails/quick_start). Feature scope, not comparative benchmark.
- S5: [Microsoft Purview for AI](https://learn.microsoft.com/en-us/purview/ai-microsoft-purview). Supported governance capabilities depend on integration and configuration.
- S6: [CSSF DORA guidance](https://www.cssf.lu/en/ict-and-cyber-risk-for-dora-entities/). Regulatory context and diligence topics, not an OMNI approval.
- S7: [European Commission AI Act overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai). Check operative legislation for an actual deployment and intended use.
- S8: [Official GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng). Automated access encountered a robot check; the text was not freshly extracted. GDPR discussion is a diligence plan, not a legal conclusion from a complete article review.
- S9: [LHoFT services](https://lhoft.com/services/). Ecosystem and incubation offer, not an existing partnership or guaranteed financing.
- S10: [YC application](https://www.ycombinator.com/apply). Public deadline and attendance; authenticated form not completed.
- S11: [YC standard deal](https://www.ycombinator.com/deal). Terms must be applied to the actual corporate structure and documents.
- S12: [Nexus awards 2027](https://nexusluxembourg.com/startups-awards-2027). Public deadline and programme positioning.
- S13: [Fit 4 Start eligibility](https://luxinnovation.lu/assess-and-accelerate/fit4start/eligibility). Team and establishment criteria; future cohort rules require a new check.
- S14: [Fit 4 Start #18 notification route](https://luxinnovation.lu/fit-4-start-pre-register-now). Does not establish an open application deadline.

No production incident history, actual accounts, signed customer records, founder biographies, physical devices or independent penetration-test report was supplied. Those limits remain visible in the conclusions.
