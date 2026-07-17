# Fundraiser Reporting Specification

## Reporting principles

Reports are owner-only read models over authoritative Orders, Production, Inventory, Finance, Recipes, Assets, and fundraiser extension rows. Every report shows fundraiser name/ID, timezone, “as of” instant, included/excluded rules, currency, and source freshness. Draft operational totals may change; posted settlement reports identify their immutable settlement version.

## Organizer dashboard

Purpose: give the owner a shareable organizer-facing summary without exposing internal manufacturing or unrelated customer data.

- Headline: ordering window/status, total orders/customers, units, standard/personalized split, gross sales, organizer proceeds, OliPoly payout, organizer-confirmed amount, outstanding to OliPoly.
- Order/payment reconciliation: Order number, customer display, selected method, gross, confirmation status/amount, exception.
- Fulfillment: pickup/delivery counts and customer disposition.
- Privacy: the interactive dashboard is owner-only; a generated organizer export contains only the explicitly selected fundraiser/customer fields.

## Production dashboard

- Filters: fundraiser, included disposition, recipe revision, item, design grouping key, milestone, fulfillment, search.
- Group modes: design, recipe, fundraiser item, customer.
- Measures: total/standard/personalized units, personalization list count, Programmed/Printed/Completed rollup, linked job/Order IDs, shortage/blocker, reprint count.
- Drill-down: escaped personalization text and production notes for authorized owner; links to Production Control, Recipe, Order, and private Assets.
- Integrity banner: orphan line, missing recipe revision, missing/duplicate job link, quantity mismatch, or unresolved canceled/refunded item.

## Finance dashboard

- Commercial totals: gross standard revenue, personalization revenue, discounts/tax/refunds/fees (once policy exists), organizer proceeds, OliPoly payout.
- Reconciliation: organizer-confirmed, Finance-posted/allocated, outstanding, disputed/waived, variance.
- Settlement: draft/approved/posted version, cutoff, Order count, Finance reference, approval/post actor and time.
- Drill-down by Order, payment method, confirmation state, and reconciliation state. Finance links open Finance Pro; Fundraiser Manager never edits ledger entries inline.

## Other required reports

- **Design totals:** design key/name, recipe/revision, item, total and personalized units, production milestones.
- **Personalization totals:** item/design, Order/customer, sequence, personalization text, milestone; owner-only.
- **Customer detail:** authoritative Order customer/contact snapshot, items, quantities, personalization, method, fulfillment/status, amount and reconciliation.
- **Settlement report:** immutable version totals and per-Order contributions, adjustments, evidence references, exclusions, signatures/audit metadata.

## Export formats

### Organizer CSV (`fundraiser-organizer-<slug>-<asof>.csv`)

UTF-8 with BOM if required by target spreadsheet, RFC 4180 quoting, CRLF, one header row. Columns: fundraiser ID/name; Order number; order date; customer name; optional organizer-approved contact; item code/name; standard quantity; personalized quantity; gross; payment method; organizer confirmation; fulfillment; customer status; exception. Personalization text is excluded by default and must require an explicit owner choice.

### Production CSV (`fundraiser-production-<slug>-<asof>.csv`)

One row per personalization/unit or consolidated standard line as documented. Columns: fundraiser/item/recipe/revision/design; Order; customer; unit sequence; quantity; personalized Y/N; personalization text; production note; Programmed/Printed/Completed Y/N; canonical job/status; exception.

### Finance CSV (`fundraiser-finance-<slug>-<asof>.csv`)

One row per Order/settlement contribution. Columns: settlement version/status; Order; gross standard; personalization revenue; gross sales; organizer proceeds; OliPoly payout; adjustments/refunds/fees; organizer confirmed; Finance posted; outstanding; payment method; Finance reference; exception.

### Settlement artifact

Owner-generated printable/PDF view plus CSV. It includes calculation definitions, totals, per-Order appendix, cutoff/as-of time, settlement version/status, exclusions, reconciliation variance, and Finance evidence reference. PDF generation must consume the frozen settlement snapshot, not recalculate.

## Calculation and reconciliation rules

Use line snapshots and the formulas in `FUNDRAISER_MANAGER_SPEC.md`. Aggregate integer quantities and fixed-point money. Round only at the defined line boundary, then sum stored line values; the exact policy remains an open decision. Production totals and financial totals must use the same included line population. Reports separately show canceled/refunded/adjusted records.

## Performance and freshness

Server-side filtering/pagination is required for customer detail. Index-backed queries scope by owner and fundraiser first. Dashboards show last successful load and never substitute stale local data after an error. CSV is generated from a consistent snapshot or cutoff to prevent page-by-page drift.
