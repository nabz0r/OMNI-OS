<!-- omni:header -->
[OMNI](../../README.md) / [Field guide](../README.md) / Evaluation & funding

> **Planning · 24 Sep 2026** · A planning brief for customer assessment; no compliance certification is claimed.
<!-- /omni:header -->

# Security and regulatory diligence brief

Prepared 24 September 2026 for programme reviewers and pilot buyers. This is a product boundary and diligence plan, not a legal opinion, certification or assurance report. The initial proposition is software for AI workflow control. The actual business activity and deployment determine legal obligations.

## Current data flow

| Data | Location and recipient | Current control | Remaining limit |
| --- | --- | --- | --- |
| Memories and captured source text | Local SQLCipher vault | Review, correction, deletion and platform key custody | Unlocked process handles plaintext; complete recovery still a release gate |
| Authorized context and prompts | Selected model provider, or a local model | Scoped grants and supported-path request policies; HTTPS for remote providers | Provider receives content; its own terms, retention and location matter |
| Usage and decision metadata | Local encrypted records | Bounded retention and metadata-only export | Destination/model identifiers may still be sensitive; exports leave vault protection |
| Optional analytics | Configured collector | Numeric schema, consent and OpenDP budget | Default native configuration has no collector; differential privacy is not absolute anonymity |
| Support and pilot measurement | Proposed operational process | Minimise data and use separate consent/scope | No verified support processor inventory or signed data-processing terms yet |

Refer to [Security](../SECURITY.md), [Privacy](../PRIVACY.md), [Policies](../POLICIES.md) and [Platforms](../PLATFORMS.md) for exact contracts. Local user permissions are product controls, not a determination of the legal basis for processing another person's data.

## Buyer controls and evidence gaps

| Buyer topic | Implemented evidence | Needed before the relevant promise |
| --- | --- | --- |
| Encryption at rest | SQLCipher and platform key-store adapters | Key custody and recovery validation on every supported release platform |
| Access and disclosure | Owner/agent separation, grants, receipts | Independent review and enterprise identity if centrally administered |
| Egress rules | Regex/text-file checks on supported routes | OS/network bypass controls before claiming enforced organisational routing |
| Change control | Versioned code, tests, checksums and CI | Trusted signing, update and rollback process, support lifetime |
| Incident handling | Local audit and request metadata | Named response owner, reporting process and contractual response commitments |
| Data portability | Metadata export | Complete encrypted vault export/restore and tested exit procedures |
| Managed deployment | Provisioned baseline | Signed policy distribution, rollback protection, fleet acknowledgements and work/personal separation |
| Assurance | Published engineering test evidence | Independent assessment; no ISO 27001, SOC 2 or regulator approval claimed |

## GDPR assessment

Use the [official GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) and deployment-specific advice to establish controller/processor roles, purpose and lawful basis, retention, data-subject rights, security, processor agreements and international transfers. Screen for a DPIA where the actual processing warrants one. Local storage and encryption do not remove these duties. Avoid sensitive customer data in initial trials. A permission to share inside OMNI does not automatically constitute valid consent from every person mentioned in that material.

## Financial services procurement and DORA

The [CSSF DORA guidance](https://www.cssf.lu/en/ict-and-cyber-risk-for-dora-entities/) identifies ICT risk, resilience testing, incident handling and third-party oversight requirements for covered financial entities. The [ICT service arrangements guidance](https://www.cssf.lu/en/2025/04/definition-of-ict-services-under-dora-new-forms-for-ict-third-party-arrangements-ict-outsourcing-arrangements/) makes service classification and criticality relevant to the customer's process.

Prepare a service description, data locations, subcontractor inventory, incident cooperation process, access/audit provisions, continuity/recovery and exit terms. Determine which apply to the actual contract with qualified counsel and the customer. Do not advertise “DORA certified” or imply that installing OMNI discharges the institution's duties. No official critical-provider designation or financial-services licence is claimed for OMNI.

## AI Act and regulated activities

Review the [European Commission AI Act guidance](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) and the operative legislation for the proposed use and role. General workflow support must be distinguished from creditworthiness, employment, insurance or other consequential decision systems. The first pilot excludes these decision uses. Product configuration and intended purpose can change the analysis. Recheck the live implementation timetable before any 2027 deployment; do not rely on an old slide's date or a blanket compliance label.

Describe OMNI as software infrastructure. Do not infer an automatic exemption from financial-sector rules merely because the MVP does not process payments. Any later advice, payments, financial intermediation or account-data feature needs its own perimeter assessment before launch.

## IP and licensing

Repository metadata states AGPL-3.0-only and the [licence text](../../LICENSE) is present. Preserve notices and assess source-distribution/network-use obligations for the actual distribution model. Verify authorship and assignments from every contributor and contractor, relevant employment obligations, dependencies and trademarks. A dual-licensing plan requires the necessary rights; public authorship alone does not prove them. There is no verified patent, freedom-to-operate opinion or exclusive technology claim.

## Prioritised diligence actions

Before a paid non-sensitive pilot: name the operational contact, agree data/provider boundaries, document incident escalation, confirm licence obligations and sign the correct scope. Before broader real-data deployment: complete recovery, trusted release distribution and a scoped external security review, remediate material findings and agree appropriate privacy/procurement terms. Before managed enterprise promises: verify identity, policy distribution, work/personal separation and bypass prevention on supported configurations.

<!-- omni:footer -->
---

**Continue reading** · [The venture assessment](../assessment/README.md) · [The fintech venture review](../assessment/VENTURE_REVIEW.md) · [The action plan](../assessment/ACTION_PLAN.md)

[All documentation](../README.md) · [Delivery and verification](../DELIVERY.md)
<!-- /omni:footer -->
