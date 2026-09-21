# Product thesis and conversation decisions

OMNI is a personal representative across AI agents and services: a correctable memory, a boundary for disclosure and a source of bounded authority. A VPN, database or model is a means to deliver that experience, not the definition of the product.

The product should help a person continue work across providers while knowing which context was disclosed and which operations were authorized. It must distinguish declared preferences, observations, proposals and externally attested facts. There is no universal vector that defines a person's identity.

## What already exists

- [Solid](https://solidproject.org/about) separates personal data from applications.
- [Inrupt Charlie](https://www.inrupt.com/blog/charlie-the-agent-that-works-for-the-consumer-and-the-bank) announces a personal intermediary, portable context and consent, including bank distribution.
- [OpenMemory](https://mem0.ai/blog/introducing-openmemory-mcp) provides cross-client AI memory.
- [Brave](https://brave.com/brave-rewards/) demonstrates a model of on-device advertising selection.

These are vendor-described capabilities, not independent proof of adoption or privacy. OMNI's differentiation must be demonstrated through useful independent control, not a claim that this category is new.

## Business hypothesis

Initially test a user-paid subscription for useful memory continuity, maintained integrations and transparent control. A price such as €12/month is a research hypothesis, not validated willingness to pay. Partner distribution may reduce acquisition friction but must not give the partner silent authority over personal memory. Profile sales and covert pay-to-rank recommendations conflict with the intended representation role; neither is implemented.

## Evaluation

Compare conversation-only context, selected project documents and additional authorized sources, keeping model and task budget constant. Measure task success, time, corrections, incorrect memory injection, unnecessary disclosure, latency and resource use. Broader device access provides no defensible fixed percentage improvement before this experiment. Users should be able to export and leave without losing their history.

## Scope chosen for this repository

Local analysis, actual provider integrations, explicit permissions, a genuine VPN transport and a synthetic network laboratory. Analytics is an opt-in experiment with a finite privacy budget. All networking is classical. Production deployment, Apple signing, third-party API credentials and user consent remain real external requirements.

## An inspectable daily workspace

The delivered console makes provider choice, loaded local models, individual requests, permissions, token observations and configuration visible in one place. This is the first measurement surface for the product hypothesis: it exposes what happened without pretending that fewer context bytes prove better task outcomes. Costs require explicit rates; cloud API catalogs do not imply surveillance of ChatGPT or Claude website sessions. See the [administration guide](ADMINISTRATION.md).

The guided first run reduces setup to a chosen connection, an optional local preference and a first conversation. It does not invent an account, a cloud credential, an installed model or a permission on the user's behalf. Startup diagnostics and visible recovery paths are part of the experience; signed installation and broader device validation remain release gates.
