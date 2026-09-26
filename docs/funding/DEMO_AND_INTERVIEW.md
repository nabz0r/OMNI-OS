# Product demonstration and interview guide

## Three-minute product demonstration

Use only an isolated synthetic evaluation environment. Follow the repository [getting-started guide](../GETTING_STARTED.md) or the [released installation guide](../DELIVERY.md). The reproducible browser demonstration command is `./run.sh --web --simulate`; it uses simulated model replies and real local control components. Clearly identify both. Never show personal vault contents, provider credentials or private connection links in a recording.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00-0:25 | A fictional project memory | Rebuilding useful context is the problem being tested |
| 0:25-0:55 | Correct and confirm the memory | The user can inspect what the system remembers |
| 0:55-1:25 | Grant that memory to one configured provider and send a request | Sharing is explicit and limited to a destination |
| 1:25-1:55 | Inspect the disclosure receipt, then revoke access and retry | Future sharing stops through OMNI; prior provider copies remain outside recall |
| 1:55-2:25 | Add a local rule blocking the synthetic marker `DEMO_SECRET_123`, preview it, then demonstrate a denial | Supported-path checks happen before provider egress; this is not universal secret detection |
| 2:25-2:45 | History or usage metadata | Observability excludes conversation bodies in those schemas; simulation is not customer traction |
| 2:45-3:00 | State the next experiment | Recruit design partners and measure utility before broader distribution |

Rehearse against the exact build and confirm the actual result at each step. If a rule or provider route differs, fix the demonstration setup before recording. The supplied screenshots are existing repository images with synthetic data. A video must show actual execution; do not present an edited animation as a working demonstration.

## Sixty-second event pitch

OMNI keeps useful AI context in a local, reviewable memory. A user chooses which memories a provider can receive, sees a disclosure receipt and can stop future sharing. The evaluation app also checks supported requests and text attachments against explicit policies before sending them.

We have macOS and Android evaluation packages with documented engineering checks. Our next test is a recurring documentation workflow with small fintech teams. We will compare OMNI with a manual context brief and ask buyers to pay for an assisted pilot. The proposed subscription would cover maintained integrations and support, with customers paying their model providers directly.

We are looking for design partners and feedback on the controls buyers need. Productivity, retention and commercial demand remain results to establish.

## Investor questions and grounded answers

| Question | Answer to develop |
| --- | --- |
| Why will someone pay? | This is unproven. The pilot tests preparation time, repeat use and a real buying decision against a manual brief. |
| Why not just use a gateway? | A gateway addresses request controls. OMNI's hypothesis adds a user-owned memory workflow; test whether that combination matters. |
| Is this a ZKP product? | No. Optional analytics use differential privacy through OpenDP. Zero-knowledge proofs are not implemented. |
| Does it protect every AI request? | No. It controls supported OMNI paths. Direct device/provider bypass remains an enterprise deployment gap. |
| Can a provider retain data after revocation? | Yes, subject to its terms. Revocation stops future sharing through OMNI and cannot retrieve existing copies. |
| What is the moat? | No proven moat yet. The potential is measured utility, reliable integration maintenance and trust earned through operations. |
| Why fintech? | It is a proposed segment with repeated knowledge work and explicit governance needs. We need interviews and paid pilots to validate it. |
| What is traction? | State actual dated records supplied by the owner. Engineering tests and synthetic installations are separate. |
| Who built this and who owns it? | Supply verified founder contributions, development methods and IP assignments. Public source does not resolve all ownership questions. |
| How much are you raising? | EUR 350,000 is the current planning envelope. Confirm the owner's financing decision, instrument and actual runway before stating a live raise. |
| What could stop the project? | No measurable benefit, no willingness to pay, an unresolved disclosure bypass or support costs that make the offer uneconomic. |

## Recording and demo handoff

Record the product walkthrough separately from YC's founder video. Include a visible synthetic-data label, readable UI, clear sound and a final statement of limits. Test viewing access without a logged-in account before placing a link in a form. No founder recording or public upload has been fabricated or performed in this preparation.
