# Multiple items and final order pricing

This change supports a mixed-item estimate through Quote, acceptance, order revision,
invoice, public tracking, and Finance. It has **not been deployed**. The SQL below is
a proposed migration; no live schema, business records, payments, or counters were changed.

## Operator workflow

1. In Production Control, enable **Multiple items**. Enter each description, quantity,
   unit selling price, print hours per item, and filament/grams per item. A single
   production job retains these item recipes and combines their material requirements.
2. Advance the estimate to Quote. The item prices and quantities carry across; Quote
   still owns discounts, tax, exemption, deposits, and customer terms. A standalone
   Quote can also use **Use itemized pricing**.
3. Choose a known customer shipping charge or **Add at final invoice**. Deferred
   shipping appears in the quote PDF, email, public review, and subsequent invoice.
4. Accept through the customer link or the existing internal acceptance action.
5. In Orders Admin, choose **Edit Items / Final Shipping**. Remove a canceled item,
   change quantity/price, set final customer shipping, and enter a customer-facing
   reason. Save Revised Pricing updates the order and public projection atomically.
6. Regenerate the invoice or email. It uses the current saved revision, lists shipping
   separately, and shows recorded payments, balance, and any customer credit.
7. After finalizing shipping and recording the payment state, use the existing
   Finance posting action. Product revenue, shipping revenue, and collected tax are
   stored separately and reconcile to the final invoiced amount.

Example at a saved 7% rate: five dragons at $3 plus one puppy at $2 = $17 before tax.
Canceling the puppy and adding $6 shipping produces $15 products + $6 shipping +
$1.47 tax = **$22.47**. No payment record is required to revise that order. A requested
deposit is not treated as received money. Previously recorded receipts survive a
revision; a reduction below receipts produces a credit, not an automatic refund.

Customer shipping is separate from the business's carrier expense. New pricing
snapshots include charged shipping in the saved tax base; an exempt order uses zero
tax. This follows the application's Ohio taxable-goods workflow and saved rate, not
a new destination tax engine. Ohio delivery-charge reference:
https://codes.ohio.gov/ohio-administrative-code/rule-5703-9-52

The original accepted quote remains immutable. Closed, refunded, and Finance-posted
orders cannot use this revision action; posted records use the existing append-only
Finance correction workflow. A sales revision does not erase consumed filament or
change manufacturing actuals. Adjust remaining production work in Production Control.

## Database change

Migration: `supabase/migrations/20260928150008_order_line_items_and_pricing_revisions.sql`.
The new revision record is needed because ordinary order metadata saves deliberately
cannot rewrite accepted financial authority.

| Table | Effect |
| --- | --- |
| `order_pricing_revisions` | New immutable, owner-readable revision history with item/totals JSON, reason, command identity, and received amount. Direct client writes are denied. |
| `orders` | The revision RPC updates current quantity, total, tax, balance, payment status, and version. No historical backfill. |
| `order_tracking_public` | The same transaction updates total and payment state; missing projection rolls the revision back. |
| `quote_accepted_commercial_snapshots` | Remains immutable; new quote snapshots carry item and shipping fields using the existing acceptance trigger. |
| `financial_entries` | Posting triggers consume the current commercial snapshot and split product/shipping/tax. Existing rows are unchanged. |
| `production_jobs` | No schema change. Per-item recipes live in existing `job_payload.line_items`; combined recipes use the existing reservation contract. |

New RPC: `revise_order_pricing(uuid,timestamptz,text,text,jsonb)` locks the owner-scoped
order, validates the snapshot and saved tax rate, rejects stale versions, and makes
identical retries idempotent. `current_order_commercial_totals` and
`current_order_amount_received` are private helpers with no client execute grant.

Updated functions: `get_order_invoice_snapshot_base` (the existing wrapper remains),
`apply_invoice_authority_to_finance_post`, `apply_order_tax_metadata_to_finance_post`,
`public_order_tracking_lookup`, and `correct_financial_entry`. The last change keeps
shipping-only corrections taxable for the new snapshots without reinterpreting old
postings. Shipping-pending invoices remain viewable, but Finance posting waits for a
final shipping decision.

Queries now select the latest owner/order revision first, then the immutable accepted
snapshot. The public lookup returns only customer-safe fields and adds
`shipping_charged`, `shipping_deferred`, and `credit_amount`. A Q-number resolves via
`orders.source_quote_number`; it no longer invents an OP-number from matching digits.

The read-only numbering audit found no duplicate quote/order identifiers and an order
sequence aligned with the maximum order suffix. Existing numbering allocators remain
unchanged. Q and OP suffixes are not guaranteed equal; existing records are not renumbered.

## Deployment and verification

Per `AGENTS.md`, stop at the migration and review PR. Do not apply the SQL automatically.
First review and test the migration in a staging database with the existing live
prerequisites, then apply it through the approved migration process before deploying
the frontend. Check the current function definitions against the branch if production
has changed since the read-only inspection. A failed migration rolls back as one
transaction; preserve revision history and use a forward migration after deployment.

Required existing functions/tables include the accepted-snapshot immutability trigger,
invoice snapshot wrapper, Finance correction receipts/helper, Ohio county validator,
and current order/payment/tracker columns. Read-only checks:

```sql
select to_regprocedure('public.get_order_invoice_snapshot(uuid)'),
       to_regprocedure('public.get_order_invoice_snapshot_base(uuid)'),
       to_regprocedure('public.finance_adjustment_value(jsonb,text)'),
       to_regclass('public.finance_correction_receipts');
select order_number, count(*) from public.orders group by order_number having count(*) > 1;
select quote_number, count(*) from public.quotes group by quote_number having count(*) > 1;
```

Automated validation includes the real migration executed in isolated PGlite PostgreSQL
against synthetic rows, active PDF/email renderers, the item editor in a jsdom copy of
the quote page, totals/material aggregation, authorization, stale/idempotent commands,
unpaid and partially paid revisions, credits, shipping tax, Finance corrections, and
transaction rollback. Reproduce the additional dependency-backed tests with:

```sh
test_deps=$(mktemp -d)
npm install --prefix "$test_deps" --no-save @electric-sql/pglite@0.3.14 jsdom@26.1.0
PGLITE_MODULE="$test_deps/node_modules/@electric-sql/pglite" \
JSDOM_MODULE="$test_deps/node_modules/jsdom" node --test tests/*.test.js
```

The full suite returned 182 passes and six failures also reproduced on unchanged
main: `engine-rc2-1-authority-investigation`, `engine-rc2-2-deployed-storage-verification`,
`engine-rc2-6-niles-exclusion-decision`, `invoice-authority-contract`,
`orders-admin-action-regression`, and `workflow-command-authority`. Syntax checks and
`git diff --check` passed. Live authenticated browser flows and visual PDF layout have
not been verified; jsdom is a DOM test, not a browser rendering check.

Manual staging checks before release:

- Create/reload a two-item Production estimate with different filament recipes; verify
  both materials and total print hours, then send it to Quote and reload that quote.
- Test customer-link and internal acceptance, repeat acceptance, and confirm one real
  OP link without duplicate numbers. Test Q lookup when Q and OP suffixes differ.
- On an unpaid order, cancel one item and add shipping. Compare Orders, invoice PDF,
  invoice email, public tracker, and Finance product/shipping/tax components.
- Repeat with a recorded deposit, a paid order, an exempt order, zero-price items,
  discounts, a customer credit, and a legacy one-item accepted quote.
- Open the same order in two tabs; a stale save must fail without losing either revision.
  Confirm cancellation/close and already-posted orders cannot bypass their existing gates.
- Verify deferred shipping is disclosed before finalization and blocks Finance posting.
  Mark payment received through the existing command; post once and retry without duplication.
- Check desktop/mobile item editing, reset/load behavior, and printed PDF pagination.
