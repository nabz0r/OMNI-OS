<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Start

> **Product thesis** · The product, the people it serves and the value still to be demonstrated.
<!-- /omni:header -->

# Product thesis and conversation decisions

OMNI is a personal representative across AI agents and services: a correctable memory, a boundary for disclosure and a source of bounded authority. A VPN, database or model is a means to deliver that experience, not the definition of the product.

The product should help a person continue work across providers while knowing which context was disclosed and which operations were authorized. It must distinguish declared preferences, observations, proposals and externally attested facts. There is no universal vector that defines a person's identity.

## What already exists

- [Solid](https://solidproject.org/about) separates personal data from applications.
- [Inrupt Charlie](https://www.inrupt.com/blog/charlie-the-agent-that-works-for-the-consumer-and-the-bank) announces a personal intermediary, portable context and consent, including bank distribution.
- [OpenMemory](https://mem0.ai/blog/introducing-openmemory-mcp) provides cross-client AI memory.
- [Brave](https://brave.com/brave-rewards/) demonstrates a model of on-device advertising selection.

These are vendor-described capabilities, not independent proof of adoption or privacy. OMNI's differentiation must be demonstrated through useful independent control, not a claim that this category is new.

## Current professional focus

The professional MVP tests a narrower, inspectable proposition: reviewed context imports, destination-scoped permissions and policy checks on supported AI request paths. It is intended for teams that need useful AI assistance with control over disclosure. It does not silently intercept every browser or mobile application.

The [professional MVP](PRO_MVP.md) defines the implemented boundary and remaining work. The [pilot proposal](funding/PILOT_PROPOSAL.md) describes an unvalidated commercial offer, not a signed customer commitment. Buyer demand, team administration and production assurance still need evidence.

## Earlier consumer business hypothesis

The earlier consumer direction proposed a user-paid subscription for useful memory continuity, maintained integrations and transparent control. A price such as €12/month remains a research hypothesis, not a current priced offer or validated willingness to pay. Partner distribution may reduce acquisition friction but must not give the partner silent authority over personal memory. Profile sales and covert pay-to-rank recommendations conflict with the intended representation role; neither is implemented.

## Evaluation

Compare conversation-only context, selected project documents and additional authorized sources, keeping model and task budget constant. Measure task success, time, corrections, incorrect memory injection, unnecessary disclosure, latency and resource use. Broader device access provides no defensible fixed percentage improvement before this experiment. Users should be able to export and leave without losing their history.

## Scope chosen for this repository

Local analysis, actual provider integrations, explicit permissions, a genuine optional VPN transport and a synthetic network laboratory. The native application embeds its Rust core, uses authenticated IPC and platform key stores, and keeps a separate local vault per installation. Source targets cover macOS, Windows, Linux, Android and iOS; [platform evidence](VALIDATION.md) determines what has actually been built and exercised. There is no bundled mobile model, system-wide mobile VPN or background capture service.

Analytics is an opt-in experiment with a finite privacy budget. The standalone native app configures no collector, so its personal workspace works without an analytics service. All networking is classical. Production deployment, signing and store credentials, third-party API credentials and user consent remain real external requirements. Metadata export does not yet constitute complete memory portability or verified cross-device recovery.

## An inspectable daily workspace

The delivered console makes provider choice, loaded local models, individual requests, permissions, token observations and configuration visible in one place. This is the first measurement surface for the product hypothesis: it exposes what happened without pretending that fewer context bytes prove better task outcomes. Costs require explicit rates; cloud API catalogs do not imply surveillance of ChatGPT or Claude website sessions. See the [administration guide](ADMINISTRATION.md).

The guided first run reduces setup to a chosen connection, an optional local preference and a first conversation. It does not invent an account, a cloud credential, an installed model or a permission on the user's behalf. The native interface can be locked and deliberately reopened on the device; this is a convenience boundary, not OS reauthentication. Startup diagnostics and visible recovery paths are part of the experience; signed installation, key recovery and broader device validation remain release gates. [Platform architecture and limits →](PLATFORMS.md)

<!-- omni:footer -->
---

**Continue reading** · [Your context. Your authority.](../README.md) · [The OMNI field guide](README.md) · [Your first useful conversation](GETTING_STARTED.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
