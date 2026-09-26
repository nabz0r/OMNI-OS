<!-- omni:header -->
[OMNI](../../../README.md) / [Field guide](../../README.md) / Evaluation & funding

> **Unsubmitted draft · 24 Sep 2026** · Reusable draft answers and a register of founder facts still needed.
<!-- /omni:header -->

# Y Combinator application answer bank

Prepared for Winter 2027 using public [application](https://www.ycombinator.com/apply), [deal](https://www.ycombinator.com/deal) and [video](https://www.ycombinator.com/video) guidance checked on 24 September 2026. The authenticated form was not inspected. Labels below cover typical topics and must be mapped to the live form without claiming identical field names or limits.

## Company name

OMNI

## Description of 50 characters or fewer

Local AI memory with explicit sharing controls

## What are you making

OMNI lets people keep useful context locally and decide what each AI provider receives. Users review memories, grant selected context to a destination and inspect a receipt after disclosure. The application also checks supported requests and text files against explicit policies before sending them. We have a macOS and Android evaluation MVP. Our next step is to test one recurring workflow with small fintech engineering and operations teams, then charge for maintained integrations, deployment and support if the value is demonstrated.

## What is the problem

People using several AI tools repeat project background and preferences. They also have limited visibility into which remembered context a request includes. A manual context brief solves part of the problem but needs maintenance. We want to find out whether reviewable local memory and explicit sharing permissions improve a real workflow enough to justify a separate product.

## How far along are you

The public v0.2.0 evaluation release runs on macOS and Android. It includes an encrypted local vault, scoped sharing, disclosure receipts, request policies, supported text attachments and model administration. The release has documented native acceptance tests, and the audited source revision passed six CI jobs. Public production signing, recoverable backup, physical-device coverage and managed enterprise deployment remain work. Verified customer and revenue data will be entered separately.

## Technology

The application uses Rust, SQLCipher, React, Three.js and Tauri. The native runtime embeds the core without starting a local HTTP listener by default and uses platform key-store adapters. Supported integrations include OpenAI-compatible Chat Completions, Anthropic-compatible Messages and MCP memory tools. Optional analytics use OpenDP; the standalone app has no analytics collector configured. These engineering choices support the local-control approach but are not a substitute for customer evidence.

## Users and revenue

`OWNER INPUT F05`: enter actual users, active users with a definition, paying customers and monthly revenue as requested. The repository contains synthetic demonstrations and test installations. They cannot support user or revenue claims. If actual commercial usage is zero, state zero after checking the records. If it is unknown, do not submit guessed figures.

## Why this idea and why you

The product thesis is that useful context should survive a change of AI provider while the user controls future disclosure. The repository shows implementation work toward that thesis.

`OWNER INPUT F01/F02/F11`: add the real founder experience that exposed this problem, what users actually said, relevant skills, how the founders met, how long each person has worked on it and who built which parts. Do not turn the manifesto into an invented founder anecdote. Accurately describe AI-assisted development if asked, including the founder's own design, testing and review responsibility.

## Competitors and what you understand

The closest alternative is often a well-maintained context brief. Provider-native memory, memory infrastructure such as Mem0 and gateways such as LiteLLM address parts of the same need. Enterprise suites such as Microsoft Purview have broader governance capabilities. Our hypothesis is that some users want a local, inspectable memory workflow spanning supported providers. We have not yet demonstrated that this difference drives retention or payment.

## Business model

We propose to start with a EUR 2,000 assisted four-week pilot, then test EUR 500 per organisation per month for up to ten users, maintained integrations and bounded support. Customers pay their model providers directly. These prices are hypotheses, not revenue. The code is AGPL-licensed; a commercial offering must respect that licence and verified IP rights. Billing is not implemented.

## Market and growth

We intend to begin with small fintech software teams and specialist consultancies using several AI tools for recurring work. The first goal is 20 customer interviews, eight scoped demonstrations and three paid pilot experiments. These are future targets. We will expand only if measured utility and repeat purchase justify it. The business plan includes explicit account-count scenarios rather than a claimed external TAM.

## Location and commitment

`OWNER INPUT F03/F07`: give the true current location, planned company location, full-time availability and ability to attend the January-March 2027 programme in San Francisco. Do not use the repository owner's timezone as proof of legal residence. A possible Luxembourg operation and a possible YC parent structure require a concrete compatibility review.

## Equity and fundraising

`OWNER INPUT F04/F06/F12`: supply actual ownership, legal entities, instruments, money raised, commitments and current runway. The EUR 350,000 model is a proposed operating envelope. It must not be entered as money already raised. The YC standard deal is USD 500,000 with 7% plus additional SAFE dilution, not a flat 7% total. Do not add its USD amount to the EUR model without currency and timing assumptions.

## Other common founder fields

Past achievements, education, work history, previous companies, cofounder relationships, founder equity, prior accelerator participation, prior YC applications and reasons for choosing YC require factual owner input. No answer should be manufactured from a GitHub handle, project ambition or proposed roadmap. Keep exact dates and amounts consistent across founder profiles.

## One-minute founder video talking points

Use these prompts spontaneously, with all actual founders speaking. The official guidance requests a one-minute founder conversation, not a demo, promotional montage or recited script.

- First 10 seconds: names, roles and one true relevant accomplishment or experience.
- Next 15 seconds: the recurring problem in concrete terms, preferably grounded in a real example.
- Next 20 seconds: what OMNI does and the working evaluation product.
- Final 15 seconds: the most meaningful actual learning or progress, and what the team is testing next.

Do not claim customers or growth without records. Record the genuine founders and check audio and link access. The separate product demonstration follows [DEMO_AND_INTERVIEW.md](../DEMO_AND_INTERVIEW.md).

## Final form review

Cutoff and timezone conversion appear in [PROGRAMMES.md](../PROGRAMMES.md). Complete founder-specific fields, video and legal/traction information, then check all live requirements. The pitch deck is supplementary material, not a substitute for YC's written application. Retain the final answers and receipt privately after submission.

<!-- omni:footer -->
---

**Continue reading** · [The venture assessment](../../assessment/README.md) · [The fintech venture review](../../assessment/VENTURE_REVIEW.md) · [The action plan](../../assessment/ACTION_PLAN.md)

[All documentation](../../README.md) · [Delivery and verification](../../DELIVERY.md)
<!-- /omni:footer -->
