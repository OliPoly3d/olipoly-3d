# Annual expense and tax-preparation reports

Prepared 2026-11-23. Target: private OliPoly ERP Test only. No migration, data updates, public website changes or Finance Pro retirement.

## Owner workflow

Finance → Reports → choose report year → Annual expenses & tax preparation.

This section always covers January–December of the chosen year, including when the monthly/county period is H1 or H2. Transaction search filters do not restrict it. Annual summary, expense-detail and mileage-log CSVs use the same effective records as the screen.

## Coverage and accounting authority

| Finance Pro capability | Integrated ERP treatment |
| --- | --- |
| Yearly sales, shipping income, expenses and result | Posted business portions, separate sales-tax memo and reconciled annual category totals |
| Expense/tax buckets | Known visible categories retain legacy precedence over stale tax_category; custom groups preserved and flagged for review |
| Schedule C references and CSV | Category-level preparation references and exports; equipment/repairs separated, current other-expense reference corrected |
| Mileage | Saved date, total business miles, rate, purpose, origin, destination, amount and round-trip flag in CSV; no historical repricing |
| Home-office helper | Shared current floor areas and area ratio; labeled current reference, not a historical area snapshot or calculated deduction |
| Receipt/document links | HTTPS links in expense details and exports; original/effective IDs preserve correction traceability |
| Corrections | Existing owner-scoped effective ledger remains authoritative; technical reversal/replacement rows excluded |
| County/monthly reports | Existing period filters, totals and exports preserved |

Expense totals use amount + shipping_cost, matching Finance Pro. amount is already the business portion: business_use_percent is not reapplied. Purchased filament and per-job cost allocations are not deducted twice. Equipment purchases remain in recorded expenses, with tax treatment distinguished from bookkeeping totals. Negative posted expenses remain visible as refunds/credits. No record is silently reclassified or rewritten.

Annual detail CSV amount is the total posted expense including any separate shipping_cost. The latter is included as a component reference, not an additional amount to add to the exported total. CSV text is formula-escaped by the existing Finance exporter. Missing/unusual categories and incomplete/inconsistent mileage are surfaced while posted values are retained.

## Tax-reference review

Verified 2026-11-23 against primary IRS sources:

- 2026 Schedule C: https://www.irs.gov/pub/irs-pdf/f1040sc.pdf
- 2025 Schedule C instructions: https://www.irs.gov/instructions/i1040sc

The references are for 2025/2026 only. Other years explicitly require their tax-year form review. Legacy Finance Pro labels all equipment/maintenance line 13 and other expenses line 27a. The new helper separates repairs (line 21) from equipment treatment review and uses Part V / line 27b for other expenses on the verified forms. No claim is made that all equipment purchases are immediately deductible. Inventory/COGS, home-office eligibility/allocation, research treatment and mixed-use costs still require applicable method/eligibility review. Saved mileage amounts are used rather than recalculated using current defaults.

The annual result is revenue less recorded expenses, not an automatically prepared taxable profit. Review the existing list of approved orders without a posted sale (including payments/deposits) before filing; this milestone does not change revenue-recognition timing.

## Verification

- New assertion suite executes actual Finance Pro pure reporting functions and compares the same effective sample ledger to the replacement by expense group, revenue and sales tax.
- Covers business-use portions, separate postage, equipment refunds, custom and missing categories, corrected-entry exclusion, historic-year references and mileage discrepancies.
- jsdom executes the real Finance screen and download controls; checks full-year exports under H1, safe evidence links, escaped descriptions, audit IDs, shared home-office reference and preservation of an unsaved expense form.
- Existing Finance, corrections, defaults, reports and shared settings regression suites run with jsdom enabled.
- Syntax checks and git diff --check required before PR creation.

No visual browser/iPad testing is claimed. No hosted data was changed by these tests.

## Manual browser tests after approved private publication

1. Open Finance → Reports, choose a year with expenses and expand Annual expenses & tax preparation.
2. Check category totals against annual recorded expenses; open evidence links on authorized sample entries.
3. Change monthly/county period to H1/H2. Annual section must remain the full year and stay open.
4. Export all three annual CSVs. Verify amounts, date range, saved mileage rate, trip details, receipt links and original/effective IDs.
5. Compare current Settings home-office areas with the reference; verify no extra deduction is added.
6. Confirm an unsaved expense entry survives report-filter changes. Check table scrolling/readability on iPad.

## Release boundary and recovery

Merge target is the existing private ERP integration branch agent/owner-history-evidence, not public main. Merge and private publication require approval under AGENTS.md. Recovery is a source/site-version rollback; no database rollback is necessary. Finance Pro and its historical data remain available. Sales-tax filed-return history, remittance tracking and remaining legacy migration acceptance are later milestones; this change does not mark them complete.
