<!-- omni:header -->
[OMNI](../../README.md) / [Field guide](../README.md) / Evaluation & funding

> **Planning · 24 Sep 2026** · What was checked during preparation and what remains unverified.
<!-- /omni:header -->

# Delivery checks and limits

Prepared 24 September 2026. This record describes checks actually performed during preparation. It is not an independent audit or a submission receipt.

## Product and research evidence

- Reviewed repository documentation, current implementation boundaries, the public v0.2.0 prerelease, release asset metadata and the successful six-job source-verification run. [EVIDENCE.md](EVIDENCE.md) identifies the source and release revisions separately.
- Researched 26 primary programme, regulatory, product and competitor sources. [SOURCES.md](SOURCES.md) records dates, links and what each source supports. Edition 17 Fit 4 Start conditions are reference material, not verified edition 18 terms.
- Opened the public Nexus application and inspected its first page, including attachment requirements. No application data was entered. Later steps and authenticated YC fields remain unverified.
- Converted the YC deadline with the America/Los_Angeles and Europe/Luxembourg timezones for the actual deadline date. Internal preparation targets are distinguished from organiser deadlines.
- Retained the distinction between engineering tests, synthetic demonstrations, forecasts and actual business traction. No new product acceptance, physical-device or independent security test was performed for this documentation task.

## Documents and presentation

- Generated a 13-slide editable PowerPoint with four native tables, speaker notes and source context. Package integrity, layout geometry, font policy and re-import checks passed without findings.
- Exported the PowerPoint through the bundled LibreOffice runtime to a 13-page PDF and visually reviewed every slide. The PDF is below the Nexus 20 MB upload limit.
- Generated a one-page Word brief, rendered it through the bundled runtime and reviewed the final page. Included the resulting one-page PDF.
- Used the existing application mark to supply a vector SVG and transparent PNG. No third-party brand or customer logo was invented.
- Checked 96 Markdown links to local files and anchors across 19 new or modified documents, with no broken targets. No Mermaid diagram was changed, so no diagram rendering was required.
- Checked the offline reader structurally for complete sections, internal anchors and attachment links. A browser visual preview was unavailable because the browser policy blocks local file URLs; no alternative browser route was used.
- The presentation and document were not tested in native Microsoft PowerPoint or Word. The financial workbook was not tested in native Microsoft Excel.

## Financial model

- Recalculated all three scenarios, a zero-financing case, a missing selected scenario input, an unselected blank input and a changed final-month sales input. Restored the delivered workbook to the base scenario.
- Verified that a missing selected input surfaces as `n.a.` and is not silently treated as zero. Scanned the final workbook for spreadsheet errors; none were found.
- Independently reconciled fixed expenses of EUR 272,300 and the EUR 27,230 operating reserve. The model separates recurring revenue from pilots and financing from sales, with a one-month collection lag.
- Recalculated a scratch copy in LibreOffice Calc and compared 1,320 numeric cells with the delivered workbook: no differences or formula errors. Independently checked all 18 base-case monthly closing cash balances.
- Visually inspected all three sheets and the cash chart. Inputs, formula outputs, units, periods and modelling limitations are labelled.

| Scenario | Closing cash, June 2028 | Final-month MRR | Annualised final-month MRR |
| --- | ---: | ---: | ---: |
| Downside | EUR 53,707.78 | EUR 1,398.65 | EUR 16,783.83 |
| Base | EUR 76,651.71 | EUR 5,528.93 | EUR 66,347.21 |
| Upside | EUR 122,227.41 | EUR 14,769.97 | EUR 177,239.60 |

These are conditional forecasts with EUR 350,000 financing in January 2027 and illustrative zero opening cash. They are not actual balances or committed revenue. Setting financing to zero produces a first-month cash shortfall of EUR 9,460 under the base operating plan.

## Portable package and remaining boundary

The local review bundle includes final attachments, this written package, the roadmap, an offline reader and file hashes. It excludes source-code vaults, personal records, builder scripts and temporary render files. The original English Markdown remains available in the repository. Nothing has been submitted, emailed, purchased or published as part of this work.

The package is ready for owner review. Formal submission still requires authentic founder/company facts, actual financial and traction records, a genuine YC founder video, verified live form requirements and acceptance of the applicable terms. The [readiness register](READINESS.md) lists these exact prerequisites. They cannot be resolved from software or replaced with fabricated answers.

<!-- omni:footer -->
---

**Continue reading** · [The venture assessment](../assessment/README.md) · [The fintech venture review](../assessment/VENTURE_REVIEW.md) · [The 26-action plan](../assessment/ACTION_PLAN.md)

[All documentation](../README.md) · [Delivery and verification](../DELIVERY.md)
<!-- /omni:footer -->
