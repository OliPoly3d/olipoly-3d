# Fundraiser Manager Specification

## Purpose and boundaries

Fundraiser Manager coordinates a time-bounded catalog, organizer-collected sales, production grouping, and final settlement. It is an orchestration module: Supabase stores durable fundraiser records, while existing ERP modules retain authority for customers, accepted Orders, manufacturing, inventory, Finance, recipes, and files.

This specification does **not** authorize a UI, migration, SQL, public write policy, or change to ERP 1.0. All proposed database names are contracts to validate against a staging schema before implementation.

## Business goals

- Reuse one model for schools, nonprofits, community groups, and other organizations.
- Reproduce Niles Primary HSA terms through data: standard price `$10.00`, personalized price `$15.00` (`$5.00` surcharge), standard OliPoly payout `$6.00`, personalized payout `$8.50`, organizer collection, and cash/online reconciliation.
- Give the owner production-ready design and personalization totals without re-entering sales.
- Settle each fundraiser from an auditable snapshot without creating shadow Orders or Finance ledgers.
- Isolate simultaneous fundraisers by stable UUID and public slug.

## Responsibility map

| Concern | Authority | Fundraiser Manager role |
|---|---|---|
| Organization/contact | Existing customer/organization identity where available | References stable customer/organization ID; stores only fundraiser-specific contact role and immutable order contact snapshot where required |
| Sale and fulfillment | Orders Admin / `orders` | Adds fundraiser attribution and line detail to a real Order |
| Manufacturing | Production Control / `production_jobs` | Requests/links jobs and reads canonical workflow state |
| Material | Inventory Control | Reads availability; Production requests reservation/consumption through existing lifecycle |
| Product definition | Product Recipe Library / `product_recipes` | Catalog item references a recipe and snapshots commercial terms |
| Revenue/payment | Finance Pro | References authoritative entries/payments; derives reports from linked records |
| Files | Job Files / Assets | Uses `asset_links`; no public storage paths |
| Customer history | Customer 360 | Reads linked Order activity; Fundraiser Manager does not create a customer silo |

## Functional scope

### Fundraiser setup

Owner creates a fundraiser UUID, organization reference/display snapshot, event/contact details, public slug, ordering window, configured timezone, status, collection model, fulfillment choices, and internal notes. Dates are stored as timezone-aware instants; the fundraiser timezone controls public display and ordering boundary decisions.

### Catalog

Each fundraiser item has its own UUID and human-facing item code, references exactly one active Product Recipe revision, and records display name/order, active flag, personalization rules, standard unit price, personalization surcharge, and standard/personalized OliPoly payout per unit. Prices are fixed-point currency, never floating point. Editing catalog terms never changes already-created order-line snapshots.

### Public ordering

The public page exposes only published fundraiser/catalog data and submits through one narrow, idempotent server-side transaction. A successful submission creates or returns one authoritative Order and its fundraiser line rows, using a client-generated idempotency key. It must never let an anonymous client insert directly into `orders`, select private records, allocate `OP-` numbers, or infer an Order from another identifier.

Organizer-collected payment is a collection model, not proof of payment to OliPoly. The line/order records capture the selected method; confirmation and Finance reconciliation remain distinct owner actions.

### Order detail

One Order may contain one or more fundraiser lines, but all fundraiser lines on that Order belong to one fundraiser. Each line stores standard quantity, personalized units as child personalization rows (one text value per unit), production notes, price/payout snapshots, and fulfillment selection. Quantities and snapshots are the reporting source; the Order remains fulfillment authority.

Customer status is presented as a fundraiser-facing projection of canonical Order status, payment disposition, and fulfillment state. It is not another mutable status column.

### Production and finance

Programmed, Printed, and Completed are milestone projections over linked Production records/events, not replacements for canonical ERP statuses. Production rolls up by design/recipe/item/customer and carries personalization text only to authorized production views.

Gross sales, personalization revenue, organizer proceeds, and OliPoly payout are deterministic sums of order-line snapshots. Actual receipts, payments, invoices, expenses, and outstanding balance come from linked Finance records. A settlement record freezes approved totals and references Finance evidence; it is not a general ledger.

## Business calculations

For included, non-canceled lines:

- `standard_quantity = total_quantity - personalized_quantity`
- `gross_sales = standard_quantity * standard_unit_price_snapshot + personalized_quantity * (standard_unit_price_snapshot + personalization_surcharge_snapshot)`
- `personalization_revenue = personalized_quantity * personalization_surcharge_snapshot`
- `olipoly_payout = standard_quantity * standard_payout_snapshot + personalized_quantity * personalized_payout_snapshot`
- `organizer_proceeds = gross_sales - olipoly_payout`
- `reconciled_to_olipoly = sum(linked, posted Finance receipts allocated to the fundraiser)`
- `outstanding_to_olipoly = settlement_olipoly_payout - reconciled_to_olipoly`, bounded only for display, not silently written off

Discounts, tax, refunds, fees, and canceled lines require an explicit policy before implementation. Reports must show them separately and must reconcile to the Order totals snapshot and Finance rather than hiding a difference in organizer proceeds.

### Niles example

For 8 standard and 2 personalized units: gross sales are `$110.00`; personalization revenue is `$10.00`; OliPoly payout is `$65.00` (`8 × $6.00 + 2 × $8.50`); organizer proceeds are `$45.00`. These values arise from item terms, not organization-specific code.

## Non-functional requirements

- Owner-only management and least-privilege public reads/submission.
- Idempotent public submission, payment confirmation, production linking, and settlement finalization.
- Currency code on fundraiser and immutable minor-unit/decimal snapshots.
- Audit actor/time for term changes, confirmations, exclusions, and settlement.
- Accessible, responsive future UI that follows existing ERP styles.
- Multi-device reads always reload Supabase; local storage may hold only an explicit unsent draft/idempotency key.
- No private contact, personalization, notes, financial records, or asset paths in public projections.

## Out of scope

- Organizer login/portal, organizer RLS, payment processor integration, tax advice, general donation management, product/recipe editing, printer scheduling, inventory mutation, accounting ledger replacement, and automatic migration.

## Acceptance criteria for a later implementation

1. A fundraiser can be configured without Niles-specific code.
2. Every submitted sale resolves to exactly one authoritative Order.
3. Every sale line retains commercial snapshots and a recipe revision reference.
4. Production rollups reconcile exactly to included Order lines.
5. Production and Inventory transitions use existing ERP contracts.
6. Finance summary reconciles computed obligations to authoritative Finance entries.
7. Settlement freezes a reproducible snapshot and cannot be silently recomputed.
8. Anonymous access cannot enumerate orders or private fields.
9. Two fundraisers with the same recipe never mix in reports or production batches.

## Open decisions

- Confirm the deployed stable customer/organization key and whether Orders currently support multiple line items.
- Decide whether fundraiser sales bypass Quote through a new owner-approved/direct-sale Order creation contract; do not force them through fake Quotes.
- Define tax, discounts, refunds, card fees, partial cancellations, and rounding policy.
- Decide whether one customer submission may select multiple pickup recipients/fulfillment methods.
- Define the exact Finance allocation entity/RPC after auditing the deployed Finance schema.
- Determine whether recipe revisions are immutable IDs or require an additional recipe revision key.
