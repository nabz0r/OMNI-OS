<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Build & operate

> **Contributor guide** · Edit one Markdown source, rebuild the portal and verify links and diagrams.
<!-- /omni:header -->

# Maintain this field guide

Markdown is the source of truth. The portal adds navigation, search and visual structure without creating a second set of product claims.

## Build and preview

```bash
npm ci
npm run docs:build
npm run docs:check
npm run docs:serve
```

The build writes only to `artifacts/docs-site/`. Open `index.html` directly for offline use, or visit `http://127.0.0.1:3057` while the preview server is running. The server binds to loopback. Stop it with Ctrl+C. No external font, script, telemetry endpoint or CDN is needed to read the portal.

## Add or edit a guide

1. Edit the relevant Markdown file in clear English. Preserve API names, supported limits, source revisions and dated evidence.
2. Add a new page to `docs/catalog.json` with its title, section, summary and status. The catalogue controls the portal's navigation and search metadata.
3. Run `npm run docs:sync` to update the standard Markdown navigation and reading links. This command updates managed header/footer blocks only; it does not rewrite the document body.
4. Build and check the site. Inspect changed pages at desktop and mobile widths before publishing.

Every reader-facing Markdown guide is catalogued. `AGENTS.md` remains repository instruction material and is copied as an auxiliary document; it is not restyled. The installation template has no repository-relative navigation because assembly copies it into a portable package.

## Preserve the meaning of status

| Label | Meaning |
| --- | --- |
| Guide / Reference | The documented implementation contract, subject to its stated limits |
| Evidence | A dated result for a named source, package and environment |
| Implementation + targets | Both current and future behavior; in-body labels remain authoritative |
| Planning / Unsubmitted draft | A hypothesis or prepared document, not a completed commercial action |
| Historical | Earlier reasoning or an older release; not a claim about current behavior |
| Packaging template | Source material rendered during application delivery assembly |

Do not turn test counts into security certification, a simulated exchange into customer traction, or a target into an implemented feature. Keep the public 0.2.0 release distinct from the local 0.3.0 delivery.

## Diagrams and images

Mermaid source remains in Markdown. The portal uses committed SVG renderings under `docs/assets/diagrams/`; `manifest.json` binds each drawing to a SHA-256 of its source. The build refuses missing or stale drawings.

To update renderings, provide Mermaid CLI 11.17.0 or a deliberately reviewed compatible renderer:

```bash
MMDC_BIN=/path/to/mmdc npm run docs:diagrams
```

If Chromium needs an explicit executable, set `MERMAID_PUPPETEER_CONFIG` to a local Puppeteer configuration file. These tool paths are build-time configuration, not portal dependencies. The renderer writes temporary inputs under `artifacts/docs-diagrams/`. After rendering, inspect the SVGs and run the documentation checks again.

Use the existing OMNI mark and the visual system in `docs/site/`. Screenshots in `docs/images/` show the real interface with synthetic data. Conceptual illustrations must say so; do not present generated product concepts as screenshots of delivered behavior.

## What the checks cover

The checker resolves local Markdown links, custom and generated anchors, catalogue completeness, diagram source hashes, generated HTML links, local assets and duplicate IDs. It checks the output for unresolved installation-template values only on ordinary guides; the explicitly labelled packaging-template page preserves its source placeholders. Repository source links are pinned to the commit recorded at build time when they point outside the documentation bundle.

The documentation workflow runs these checks on pull requests, verifies that managed Markdown navigation is current and uploads the portable site as a build artifact. It does not deploy a public website.

Checks do not verify the continuing availability or truth of external websites. Dated funding, legal and competitor references need fresh primary-source research before a new application or customer commitment. Documentation style changes do not rerun native device acceptance or create a new application release.

## Distribute the result

`artifacts/docs-site/` is a portable static folder. A ZIP of that folder can be read offline after extraction. No deployment is performed by the build. Application installers and their existing checksum inventories remain separate release artifacts; do not rewrite a verified delivery folder just to refresh its styling.

<!-- omni:footer -->
---

**Continue reading** · [Connect a client](INTEGRATIONS.md) · [How a request travels](ARCHITECTURE.md) · [Native platforms](PLATFORMS.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
