# OliPoly mobile operations pilot

Three unique pages exercise one mixed-item, fixed-price pickup order:

- `ops-preview.html` — Today, shared work and available material.
- `ops-order-preview.html` — draft, approval, production runs, pickup, payment and receipt.
- `ops-track-preview.html` — overall customer milestones.

Without a query parameter the sample uses fictional browser-local records under `olipoly.ops.preview.v1`. Choose **Use test database**, or open `ops-preview.html?database=test`, for the prepared separate-project connection. The migrations in [MIGRATION_REVIEW.md](MIGRATION_REVIEW.md) were approved and applied to **OliPoly ERP Test** on November 4, 2026; see [APPLIED.md](APPLIED.md) for hosted verification and advisor findings. A separate user-created test account is still required. The source is in a draft PR, not deployed to the customer website.

## Connected boundary

The configured project is `llscjdyiiatmuqhilube` in `us-east-2`. The adapter refuses a different project/host or a secret key. Its public publishable key is browser configuration, not an administrative credential. Test Auth sessions use project-specific session storage and never import the production login. Use the same test account on each device. A confirmation email may be required. A signup confirmation link does not silently create an authenticated workspace session.

The test database owns persistence. The workspace RPC reuses the existing Quote acceptance, immutable commercial snapshot, order number, material reservation/consumption, production, fulfillment, invoice, payment and Finance commands. New orders exist only after quote acceptance. Runs retain item identities, quantities, both body and support materials, accepted/rejected counts and actual usage. An actual-use total includes scrap/purge; rejected counts do not deduct filament a second time.

Each save has a stable receipt and expected workspace revision. An interrupted save stays pending until retried. Another device's changes require reload; changes made through legacy pages require reconciliation. Avoid editing the same sample through legacy admin pages. The server rejects unrelated edits hidden in a production/payment command. Actual stock costs and reservations come back from Inventory. Sample buckets keep `current_grams` and `remaining_grams` aligned.

A connected payment is **one full combined payment**, with method, fee and reference retained in the workspace payload. It posts net sales and collected tax through the existing immutable Finance command, plus a separate fee expense when applicable. This pilot does not create separate financial sales per item. Partial payments remain a local model experiment, not part of the connected server contract.

**Finance limitation:** job labor, material and machine cost comparisons are saved as Production details. They do not yet reconcile direct-cost fields on a posted Finance income entry. The inherited Finance command records its legacy payment-status label in its `payment_method` field; the actual method/reference remain in the workspace payment payload. The fee entry records the selected method. These must be resolved with an append-only cost/payment reconciliation design before production adoption. The pilot must not be treated as a complete Finance profitability report.

Public tracking calls `public_order_tracking_lookup` against the test project using the accepted OP number. It needs no internal login and the screen renders only milestone, next step, pickup note and balance. The existing lookup uses enumerable order numbers; use fictional data only. Production tracking access control is a separate review before copying any real customer records.

## Review scenario

1. Create/sign in to the separate test account after migrations are approved and applied.
2. Open the sample: two support blocks, three nameplates and a separate $20 design charge. The $110 all-in total uses a fictional 7% Portage fixture. It is not a verified current county rate.
3. Save any edits, record approval, then release the order to reserve stock.
4. Print two blocks on P1S; inspect one accepted and one rejected. Record 160 g PETG Black and 20 g PLA White for the entire attempt.
5. Reprint one block; accept it with 80 g PETG Black and 10 g PLA White.
6. Print/accept three nameplates using 45 g PLA Black.
7. Review the prepared customer message; record pickup and one $110 cash payment.
8. Enter 0.5 total actual labor hours and review the receipt and customer link.
9. Sign into the same test account on another device; confirm the same order, balances, runs and available stock.

Expected stock: PETG Black 1,760 g, PLA White 970 g, PLA Black 1,455 g; balance $0. At fixture costs, estimated cost $23.09, recorded cost $26.22 and Production cost-comparison profit $76.58. A fee reduces that result by its amount. These are test fixtures, not business forecasts.

## Deliberately staged requirements

Verified tax sourcing, county/rate lookup, certificates, tax filing/remittance, business POs, billing/shipping, capped design additions with prior approval, files/photos, partial fulfillment, show sales, fundraiser collection/settlement and non-filament purchasing remain later milestones. Presets remain editable and do not restrict the underlying eventual capabilities. Actual physical inventory reconciliation is deferred by Rob. No real inventory, Money records, financial entries, customer files or Auth users are copied here.

Tax-inclusive prices opt into the existing canonical `calculateQuoteTotals`. Gross entered lines are retained for display; net lines allocate whole cents so invoice components reconcile to aggregate backed-out tax. Existing callers keep tax-exclusive behavior by default. No second quote pricing engine is introduced.

## Checks

```sh
node --check js/ops-preview/model.js
node --check js/ops-preview/cloud.js
node --check js/ops-preview/workspace.js
node --check js/quote-pricing.js
node --test tests/ops-preview.test.js tests/ops-preview-cloud.test.js tests/order-line-items-pricing.test.js tests/quote-totals-unification.test.js
```

The SQL rehearsal uses a local Postgres engine and never connects to Supabase:

```sh
mkdir -p /tmp/olipoly-db-rehearsal
npm install --prefix /tmp/olipoly-db-rehearsal @electric-sql/pglite@0.5.15
OPS_PGLITE_MODULE=/tmp/olipoly-db-rehearsal/node_modules/@electric-sql/pglite/dist/index.js node --test tests/ops-preview-db.test.mjs
```

It restores all business DDL and runs acceptance, stale/tampered write rejection, a zero-use failure, parallel printers, failed-part/reprint/overage consumption, command replay, pickup, Finance, tax cent boundaries, second-owner RLS and anonymous tracking. PGlite uses local Auth stubs and substitutes its built-in UUID generator for Supabase's installed UUID extensions. It cannot prove hosted Auth, PostgREST, email confirmation, extension installation or actual iPad Safari behavior.

Browser verification on this branch covered local async save and the separate-project sign-in screen. The earlier local workflow walkthrough covered the full sample and 820/390px responsive layouts. After application, verify hosted login, REST RPC parameter binding, real cross-device concurrency, pending-save recovery, the complete connected browser journey, and iPad Safari print/share before any live use.

Existing `invoice-authority-contract.test.js` fails at its unchanged expected labels (`Deposit / prior payment`, `Current amount due` versus current `Total due`), before the new pricing code executes. This pre-existing failure is not suppressed.
