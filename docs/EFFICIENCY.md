<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Trust & evidence

> **Measurement plan · 26 Sep 2026** · A protocol for testing token, cost, energy and carbon effects without assuming savings.
<!-- /omni:header -->

# Useful context, measured resource use

**Measurement plan · 26 September 2026. No net token, energy or carbon reduction has yet been established for OMNI.** This plan makes efficiency visible in the product direction while preserving the distinction between an optimisation hypothesis and an observed result.

## The hypothesis

Selecting relevant, authorised context may avoid resending unnecessary conversation history, reduce repeated explanation and prevent some avoidable model calls. This could reduce inference cost and energy for a completed task. It may also add extraction, selection, local compute, output tokens or retries. A persistent vault by itself does not save tokens: context sent again is still processed according to the provider's own caching and billing rules.

OMNI's present bounded continuity is a safety and retention mechanism, not a proven optimal selector. In some tasks it can increase the prompt compared with a short manual brief. Token savings, price savings and lower data-centre electricity are separate claims.

## Existing measurement boundary

The [operations interface](ADMINISTRATION.md) exposes local request records, available provider token counters, missing-observation counts and manually configured cost estimates. Its representation benchmark compares local context forms; byte-based token estimates are not billing measurements or observed network savings. No calibrated energy meter or carbon estimator is delivered. See the [interface implementation](../apps/desktop/src/Operations.tsx).

The next implementation should preserve provider-reported usage, tokenizer estimates and byte heuristics as separate sources. Record model/version, provider, cached/uncached input, cache writes where available, output, reasoning where reported, retries, denied requests and missing fields. Provider categories may overlap: normalise documented semantics before summing, and never count a subset twice. Unknown is not zero.

## Compare completed work

Use the same approved tasks, model/version, task budget and quality rubric in three arms:

| Arm | Purpose |
| --- | --- |
| Existing workflow | Real customer behaviour, with their existing tools and caching settings |
| Maintained manual context brief | A strong, low-cost alternative; avoid a deliberately wasteful baseline |
| OMNI with scoped context | Same task and permitted information, including the work needed to prepare and maintain OMNI memory |

Alternate task order and repeat stochastic runs. Freeze the corpus and evaluation rubric before collection; separate tuning tasks from held-out tasks. Use synthetic/public or explicitly approved material. Never store real chats centrally just to build a benchmark.

For an initial pilot, use at least 30 paired tasks per organisation. For broader claims, retain the roadmap's separate study target of 30 recruited participants, 20 completing four weeks and at least 200 paired tasks. Publish counts, distributions, uncertainty, task exclusions and failures. Cluster uncertainty by participant/task where repeated observations are correlated; many requests from one person are not independent customers.

## Metrics and proposed acceptance

| Dimension | Record | Decision rule |
| --- | --- | --- |
| Utility | Completion rate, rubric score, human preparation/correction time | No task-success loss greater than five percentage points against the manual brief; disclose uncertainty and quality failures |
| Security | Unauthorised disclosure, stale/wrong memory, false policy blocks | No unauthorised disclosure in the defined suite or observed pilot; serious failures block expansion |
| Tokens | Full task input/output and available cache/reasoning breakdown, including extra calls | A proposed target is at least 20% lower aggregate input tokens on the held-out corpus; report output and total changes too |
| Cost | Actual usage categories and dated applicable prices; local/service/support costs separately | Positive net customer value; token reduction alone cannot establish lower invoices or positive business margin |
| Latency | End-to-end task time and policy/selection/provider times separately | Publish median and p95 for the named load; no SLA inferred from a debug microbenchmark |
| Energy | Device overhead plus attributable provider, network and supporting service energy | Publish a net reduction only for a comparable, adequately measured system boundary |
| Carbon | Operational emissions, and embodied emissions if a lifecycle claim is made | Publish a bounded estimate or measurement with provenance, assumptions and uncertainty; otherwise report unavailable |

The 20% token target is an internal experiment threshold, not a forecast, customer promise or prerequisite for selling a product whose independently demonstrated value is security/productivity. An efficiency claim requires its own evidence. A five-point quality tolerance does not permit safety failures, and a small pilot alone cannot establish statistical non-inferiority.

Calculate aggregate input reduction as `1 - sum(OMNI task input) / sum(baseline task input)` for a matched corpus with a positive denominator. Report the paired distribution alongside it. Sum the full attempts needed to complete each task, including failed attempts, preparation/extraction and retries, not just the final successful request. Show failures for both arms and resource use per attempted task as well as per successful task. Negative reductions are valid results; never clamp them away.

For an amortised memory-preparation cost, state the observed reuse count and also show first-use cost. Separate cold-cache and warm-cache comparisons. A cheaper cached prompt can cost less without the same proportional energy change. A blocked request is a counted prevention event, not automatically an observed amount of avoided energy: its counterfactual requires an explicit model.

## Energy and carbon accounting

Use a functional unit such as **one successfully completed documentation task at the agreed quality level**, with the success rate reported separately. The Software Carbon Intensity methodology distinguishes energy, location-specific electricity carbon intensity and allocated embodied hardware emissions. It gives a useful accounting structure, not an automatic certification of OMNI. [SCI specification](https://sci.greensoftware.foundation/) · [Green Software Foundation standard overview](https://greensoftware.foundation/standards/sci/).

For each arm, define `C_task = sum(E_component × I_component) + M_allocated`, expressed per functional unit. Energy is in kWh, intensity in gCO2e/kWh and allocated embodied emissions in gCO2e. If hardware emissions cannot be estimated, label the result operational-only; do not present it as a full lifecycle footprint. Document boundary, allocation, region/time and exclusions for both arms. Report the difference and sensitivity range, including a possible increase.

Include OMNI's idle allocation, extraction/selection, storage, network and any additional service in the comparison. Include provider host/accelerator allocation and data-centre overhead where available, without counting overhead twice when supplied data already includes it. Google's production inference study shows why host energy, idle capacity and facility overhead matter alongside accelerator work. Its Gemini results are specific to that serving system; they are not a universal conversion factor for OMNI tokens. [Google's measurement study](https://arxiv.org/abs/2508.15734).

Fewer tokens may reduce work in a given configuration, but energy also depends on model, input/output mix, batching, cache behaviour, hardware utilisation and serving infrastructure. A per-task improvement does not prove that a provider reduced total data-centre consumption or capacity. Report absolute workload totals alongside intensity so increased use does not hide a rebound effect.

When a cloud API supplies no usable energy or regional data, keep provider energy/carbon **unavailable**. An optional scenario may use a disclosed, dated, configuration-specific factor with a range, visibly labelled **estimated**. Never turn a fixed grams-per-token factor into a live “CO2 saved” counter. Customer content and private usage metadata remain local unless separately authorised for a defined study.

## Product and sales presentation

| Evidence level | Permitted wording | Avoid |
| --- | --- | --- |
| Present hypothesis | “Designed to reduce unnecessary context; token and environmental benefits are being evaluated.” | “OMNI already reduces your carbon footprint.” |
| Matched token results | “In this named corpus and configuration, input tokens changed by X%, with these quality and output results.” | Applying X% to all models, bills or emissions |
| Energy study | “Measured system energy per completed task changed by Y% within this boundary.” | Claiming lower provider fleet electricity or hardware demand |
| Carbon study | “Estimated/measured gCO2e per task, using these factors and this uncertainty range.” | Carbon neutrality, offsets or certification inferred from token counts |

The planned reporting surface has three separate views: **usage observed**, **cost calculated** and **environmental impact estimated/measured**. Show source, coverage, baseline, date and uncertainty. An unavailable environmental result stays unavailable. Continue to lead with control and utility; expose efficiency as evidence accumulates.

## Implementation sequence

1. **Instrument:** make usage provenance and missing categories exportable without prompt text; audit existing counters before extending them.
2. **Benchmark:** execute paired tasks, include preparation and retries, and publish quality and negative results.
3. **Optimise:** evaluate deterministic scoped selection and deduplication first. Introduce summarisation, semantic retrieval, caching or model routing only with separate security, authority and quality tests.
4. **Measure energy:** validate two reference configurations and local idle/active overhead. Add provider measurements when the boundary is observable.
5. **Publish claims:** review wording against the evidence level and update the report when model, hardware or adapter versions change.

This work is part of [roadmap G1–G4](../ROADMAP.md#commercial-and-ecosystem-gates--26-september-2026). It does not change current runtime behaviour or declare an environmental reduction. Sources were reviewed on 26 September 2026.

<!-- omni:footer -->
---

**Continue reading** · [Know the security boundary](SECURITY.md) · [Follow the data](PRIVACY.md) · [Evidence, by release](VALIDATION.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
