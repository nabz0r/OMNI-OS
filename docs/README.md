<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Start

> **Documentation** · Choose a path through the product, integration contracts and evidence.
<!-- /omni:header -->

# The OMNI field guide

A practical map of the product, the contracts and the evidence. Start with the experience you need; follow the implementation details when they become useful.

## Four ways in

| Your task | Read first | Then go deeper |
| --- | --- | --- |
| **Use OMNI** | [Your first conversation](GETTING_STARTED.md) | [Conversation import](CONVERSATION_IMPORT.md) · [Workspace administration](ADMINISTRATION.md) |
| **Connect a tool** | [Integration contracts](INTEGRATIONS.md) | [Request policies](POLICIES.md) · [Implementation map](ARCHITECTURE.md) |
| **Operate a deployment** | [Native platforms](PLATFORMS.md) | [Operations](OPERATIONS.md) · [Security](SECURITY.md) · [Optional VPN](VPN.md) |
| **Evaluate the venture** | [Professional MVP](PRO_MVP.md) | [Evidence](VALIDATION.md) · [Venture assessment](assessment/README.md) · [Application package](funding/README.md) |

## Understand before you rely on it

- **Local memory, explicit disclosure.** A remote provider receives the request and any context you authorize. [Follow the data](PRIVACY.md).
- **Native app and external gateway are separate modes.** Installing the app does not expose port 3007 to other clients. [Choose an integration](INTEGRATIONS.md).
- **Evidence belongs to a build and an environment.** The local 0.3.0 package and the public 0.2.0 release are different deliveries. [Read the delivery record](DELIVERY.md).
- **A target is not a feature.** The architecture book and roadmap include work that has not been implemented. [See the roadmap](../ROADMAP.md).

## Explore the system

| Guide | Question it answers |
| --- | --- |
| [Product thesis](PRODUCT.md) | What problem should OMNI solve, and for whom? |
| [Architecture map](ARCHITECTURE.md) | What runs today, and how does a request travel? |
| [Architecture book](../ARCHITECTURE.md) | What are the deeper principles and target design? |
| [Diagram atlas](../DIAGRAMS.md) | Where are the boundaries between systems? |
| [Five decisions](../DECISIONS.md) | Which choices hold the design together? |
| [Manifesto](../MANIFESTO.md) | What commitments guide the product? |
| [FAQ](FAQ.md) | What is the precise answer to a common question? |

## Find the right release

**0.3.0 · Local evaluation.** Reviewed conversation import and decoded-message policy inspection in matched macOS and Android packages. [Release notes](releases/v0.3.0.md).

**0.2.0 · Preserved public evaluation.** Request policies and text attachments. It predates the new importer. [Release notes](releases/v0.2.0.md).

The [validation register](VALIDATION.md) preserves dates, source revisions, checksums and limits. Historical results are not silently replaced with newer numbers.

## Read the business documents in context

The [venture assessment](assessment/README.md) and [funding package](funding/README.md) were prepared on **24 September 2026**. Their research cutoff, forecasts, unverified owner facts and unsubmitted application status remain visible. The newer product delivery is documented separately; it does not create customer traction or complete company records.

## Keep a copy that works offline

Run `npm ci` and `npm run docs:build` from the repository root. Open `artifacts/docs-site/index.html` directly, or use `npm run docs:serve` for a loopback preview. The portal includes local search, section navigation, rendered diagrams and the same Markdown sources used on GitHub. It loads no remote fonts, scripts or analytics.

The [documentation contributor guide](DOCUMENTATION.md) explains the catalogue, visual assets, rendering and link checks. Earlier [network](../NETWORK_DESIGN_NOTES.md) and [protocol](../PROTOCOL_NOTES.md) notes stay in the design-history section.

<!-- omni:footer -->
---

**Continue reading** · [Your context. Your authority.](../README.md) · [Your first useful conversation](GETTING_STARTED.md) · [What OMNI is for](PRODUCT.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
