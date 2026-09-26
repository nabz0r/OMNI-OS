<!-- omni:header -->
[OMNI](../../README.md) / [Field guide](../README.md) / Evaluation & funding

> **Planning · 24 Sep 2026** · Scenario inputs and runway limits, separated from actual cash or sales records.
<!-- /omni:header -->

# Financial planning assumptions

The workbook models January 2027 through June 2028 in EUR. It is an operating cash-planning exercise, not actual accounts, a valuation or a grant claim. No authenticated opening cash, liabilities or sales records were supplied.

## Common planning inputs

| Driver | Assumption | Basis |
| --- | ---: | --- |
| Proposed financing in month 1 | EUR 350,000 | Planning envelope, uncommitted; editable down to zero |
| Opening cash | EUR 0 | Illustrative modelling starting point, not reported actual cash |
| Grant receipts | EUR 0 | No award assumed |
| Founder fully loaded monthly cash cost | EUR 4,000 | Planning allowance, not a salary quote |
| Engineer monthly cash cost from month 4 | EUR 6,500 | Planning allowance including employer/contract cost; no existing hire |
| Cloud and tools per month | EUR 1,000 | Estimate, excluding customer-paid model inference |
| Legal and accounting per month | EUR 1,500 | Estimate; includes incorporation/IP advice allowance |
| Discovery and sales per month | EUR 800 | Estimate, including ordinary travel |
| Release operations per month | EUR 500 | Signing, devices and distribution allowance |
| Administration per month | EUR 800 | Estimate; office arrangements unquoted |
| Security review in month 3 | EUR 20,000 | Estimate requiring scope and supplier quote |
| Cost reserve | 10% of fixed operating expenses | Conservative cash allowance, treated as spent in model |
| Pilot price / direct delivery cost | EUR 2,000 / EUR 500 | Proposed one-month pilot, not contracted |
| Direct support / hosting per recurring organisation | EUR 100 / EUR 20 monthly | Planning variable costs |
| Payment cost | 2% of revenue | Estimate applied to pilots and subscriptions |
| Collection lag | One month | All earned revenue collected next month; no annual prepayment assumed |

Fixed operating expenses total **EUR 272,300** over 18 months. The 10% allowance adds **EUR 27,230**, producing **EUR 299,530** before variable delivery costs and revenue. The remaining financing capacity is EUR 50,470 before those variable costs, inflows and any costs omitted below. The spreadsheet calculates these values from inputs.

## Scenario controls

| Driver | Downside | Base | Upside |
| --- | ---: | ---: | ---: |
| Monthly recurring price per organisation | EUR 350 | EUR 500 | EUR 650 |
| First subscription month | Month 10 | Month 7 | Month 7 |
| New recurring organisations each month after launch | 0.5 expected | 1 expected | 2 expected |
| Monthly organisation churn | 3% | 1.5% | 1% |
| New paid pilots in each of months 4-6 | 0 | 1 | 2 |

The case selector changes active assumptions feeding one forecast. Fractional organisations are expected cohort values, not literal invoices or claimed customers. Revenue assumes additions start service at the beginning of the month and churn applies to the prior closing cohort. Pilot revenue is non-recurring and excluded from MRR and ARR. New subscriptions are a total new-sales assumption that can include converted pilots; the model does not add pilot conversions again.

Closing organisations = opening organisations × (1 − churn) + additions. MRR = closing organisations × monthly recurring price. ARR = final-month MRR × 12, not total historical sales. Subscription contribution deducts support, hosting and payment costs, while founder and engineering time remain in operating expenses. Never present this partial margin as fully allocated company profitability.

Collections lag recognised revenue by one month. Costs are paid in the month incurred. Financing and grants are cash inflows separate from revenue. The workbook shows closing cash, uncollected revenue and the first month of negative cash. Negative cash denotes an unfunded requirement, not a permitted overdraft. “No shortfall in horizon” is limited to the modelled 18 months and its selected financing assumption.

## Limits to resolve before relying on runway

Replace assumed opening cash with the actual balance and incorporate existing liabilities, tax, VAT timing, debt repayments, capex and any security-review scope change. VAT is excluded from prices and cash flows. Corporate tax and depreciation are not modelled. Compensation assumptions are not net take-home pay. No inflation, foreign-exchange conversion, programme travel to San Francisco, relocation, or corporate flip is included. If YC becomes the chosen route, build a separate USD-to-EUR cash and restructuring plan using then-current actual terms.

For the unfunded case, set proposed financing to zero. The operating plan then requires funding immediately under the assumed zero opening cash. The fallback is a separately approved founder-funded discovery budget, no new hire, and synthetic evaluations only until cash is secured. Programme acceptance must never be used as proof that money has arrived.

## Grant budget discipline

Use this operating model to explain the venture, then map actual work packages into the specific call's eligible cost rules. Do not submit the entire cost reserve as automatically eligible expenditure. Keep invoices, timesheets, payment proof, cost category, funding source and reporting period in a private aid ledger. Check aid cumulation and avoid financing the same cost twice. Published Fit 4 Start instalments depend on conditions and reports; the default grant assumption remains zero. See [programme screening](PROGRAMMES.md).

<!-- omni:footer -->
---

**Continue reading** · [The venture assessment](../assessment/README.md) · [The fintech venture review](../assessment/VENTURE_REVIEW.md) · [The 26-action plan](../assessment/ACTION_PLAN.md)

[All documentation](../README.md) · [Delivery and verification](../DELIVERY.md)
<!-- /omni:footer -->
