# OliPoly ERP 1.0 Release Audit

## Scope, result, and release decision

This audit covers the current customer-to-closeout path and its active pages. It adds no business feature, module, or schema change. Automated source and model tests passed, and the required live manual validation was completed successfully before the build was promoted to **OliPoly ERP 1.0**. No production database, RLS, private Storage policy, workflow, or schema was changed as part of the release finalization.

One release-blocking client defect was fixed: public Quote approval had two layers of click handling and performed an optional second Production-link RPC by temporarily replacing global `fetch`. Approval now makes one call to the authoritative `respond_to_quote_public` RPC, requires the Order number returned by Supabase, and relies on the deployed acceptance transaction/triggers for Order creation and Production advancement. It no longer fabricates an `OP-` value from a `Q-` value.

## Authoritative ownership map

| Record / transition | Authoritative owner | Identifier / allowed states | Consumers and rule |
|---|---|---|---|
| Customer request / intake draft | Hub until saved; Supabase record after save | Remote UUID plus customer identity | Hub may carry an explicit draft to Production; browser data is not a durable customer record. |
| Estimate and manufacturing assumptions | Production Control / `production_jobs` | Stable job UUID; `Q-######` is assigned when the estimate is saved for quoting | Quote receives a snapshot and must not recreate manufacturing calculations. |
| Pre-acceptance production workflow | Production Control | `estimate` → `waiting_customer` | Hub, Customer 360, and Quote reflect remote events only. No inventory reservation exists. |
| Quote price and customer terms | Quote / `quotes` | `Q-######`; customer response and immutable totals snapshot | PDF, email, public response, accepted Order, and Finance consume the snapshot produced by `calculateQuoteTotals()`. |
| Public approval or change request | Supabase `respond_to_quote_public` RPC | Public token + exact `Q-######`; accepted response returns exact `OP-######` | Public client submits once. The RPC must be idempotent and atomically return the existing or newly created Order. |
| Accepted Order identity | Orders / `orders` | `OP-######`, with `source_quote_number = Q-######` | Never inferred in a client. Exactly one Order per source Quote must be enforced by the deployed database contract. |
| Manufacturing status after acceptance | Production Control action; `orders.status` is the canonical synchronized value used by the workflow RPC | `ready_to_print` → `printing` → `qc` → `ready_for_fulfillment` → `closed`; reprint returns `qc` → `ready_to_print` | `set_linked_workflow_status` updates the Order; database triggers reflect it to Production and public tracking. Orders Admin should reflect Production. Its legacy status editor is a known manual-validation risk listed below. |
| Fulfillment and customer communication | Orders Admin / `orders` and `order_tracking_public` | Exact `OP-######`; pickup/shipping/payment fields | Tracking is a public read model and never advances manufacturing. |
| Inventory master data | Inventory / inventory tables | Roll/material UUIDs and transaction IDs | Production requests reservation/consumption. Inventory owns balances and the immutable transaction trail. |
| Reservation lifecycle | Production action persisted with Production and Inventory records | None at estimate/waiting; reserve at ready/printing; retain through printing/QC; consume and release unused at QC pass; release on cancel; new reservation on reprint | Orders, Hub, and Customer 360 only report the result. Mounted-roll use must identify the actual roll. |
| Actual use, scrap, attempts, printer | Production Control / `production_jobs` | Attempt ID, roll usage, grams, timestamps | Actuals survive reprint. A consumed attempt must never be consumed twice. |
| Invoices, receipts, deposits, payment, refunds | Finance / `financial_entries`, linked from Orders | Finance entry UUID, invoice number, exact `OP-######`; payment states include unpaid/deposit/paid/refunded | Tax exemption and freight remain explicit fields/splits. Production status never implies payment. |
| Closeout | Production closes manufacturing; Orders closes fulfillment; Finance closes balance | All retain `OP-######` | Close only after inventory has no live reservation and finance disposition is explicit (paid, refunded, or approved not-required). |
| Customer 360 and Hub activity | Read models over Supabase records and `project_events` | Remote IDs and Q/OP keys | They do not own edits or merge browser records silently. |
| Product recipe | Product Recipes / `product_recipes` | Recipe key, part number, revision | A recipe can seed a new estimate but cannot create an Order or reservation. |
| Job Files / Assets | Job Assets metadata tables + private Storage bucket | Asset/revision UUID and typed links (`recipe`, `quote`, `order`, `production_job`, `customer`) | Signed-in UI requests access; public pages receive no private storage path or broad bucket read. Revisions preserve links. |

### Identity invariants

1. Display formats are exactly six digits: `Q-######` and `OP-######`.
2. The Quote number is allocated by the authoritative document counter and persisted before handoff.
3. Approval consumes the exact Quote number and public token. The returned Order number is the only Order identity the client may display or link.
4. `orders.source_quote_number`, `quotes.converted_order_number`, `production_jobs.quote_number`, and `production_jobs.order_number` must form one chain.
5. Repeated or concurrent approval returns the same Order; it must not insert another row, send a second event, or reserve twice.
6. Assets link by stable record key/UUID, not by customer name or page-local array position.

## Exact end-to-end test scripts

Use a non-production Supabase project with the production migrations and RLS policies. Record row IDs, timestamps, screenshots, and relevant network requests at every numbered assertion. Do not use production customer data.

### Script A — retail intake through closeout

1. On `hub.html`, sign in and create a uniquely named retail request. Open it in Production Control. Assert no Order, reservation, invoice, or Finance income exists.
2. In `production-control.html`, enter quantity, slicer grams/hours, material, labor, packaging, hardware, and printer. Save as `estimate`. Record the job UUID and generated `Q-######`.
3. Reload on device B. Assert the same remote job, Quote number, estimate, asset links, and `estimate` status. Clear device A storage, sign in, and assert it reloads again.
4. Send to Quote. Assert Production becomes `waiting_customer`, inventory remains unchanged, and `quote.html` presents Production's suggested selling price rather than recalculating manufacturing.
5. In Quote, set retail delivery/pickup, tax, deposit, notes, turnaround, and terms. Save/send. Capture the totals snapshot and public URL.
6. Open the public URL in a private session. In DevTools Network, click approval once and assert exactly one `respond_to_quote_public` request. Double-click/reload/re-submit and assert the same `OP-######` is returned.
7. Query `quotes` and `orders`: assert one Quote, one Order, one source-Quote relationship, identical totals snapshot, and no duplicate Order. Assert Production is `ready_to_print` with the exact Q/OP chain and one acceptance event.
8. On device B open Orders Admin, Customer 360, Hub, tracking, and payment. Assert the same Q/OP, customer, total, deposit, status, and asset links.
9. In Production Control move to `ready_to_print`. Assert reservation equals planned material and uses available rolls without changing on-hand consumption. Move to `printing`; select/mount the actual roll and assert reservation remains.
10. Enter actual grams and scrap. Move `printing` → `qc`; assert actuals are captured once and reservation remains. Trigger Needs Reprint once; assert the first attempt remains consumed/auditable, the new attempt has a new reservation, and no double depletion occurs.
11. Complete the reprint, enter its actuals/scrap, then pass QC to `ready_for_fulfillment`. Assert both attempts remain, actual roll transactions equal total use + scrap exactly once, unused reservation is released, and active reservation is zero.
12. In Orders Admin complete pickup/shipment. Record deposit and balance in the supported payment flow. Assert Finance has the correct taxable sale, freight split, receipts/payments, zero balance, and no duplicate entry after reload.
13. Close in Production and complete Orders closeout. Assert tracking says complete, Hub and Customer 360 show the remote events, Finance stays balanced, assets remain linked, and all reservations are absent.
14. Refund a separate paid test Order. Assert a linked refund entry, `refunded` payment state, correct balance/report treatment, released reservation if canceled before consumption, and no reversal of already consumed physical stock.

### Script B — PO, tax exemption, invoice, and Net 30

1. Start from a saved Production estimate and choose the Professional / PO customer type in the single Quote system.
2. Enter company/contact, PO, customer and OliPoly part numbers, revision, billing/shipping addresses, exemption reason/certificate indicator, freight, and Net 30 terms. Set deposit to zero.
3. Save/send and record `Q-######`, totals snapshot, tax `0.00`, freight, PO, and asset links. Reload on device B and compare every value.
4. Approve publicly. Assert one RPC request, one `OP-######`, one Order, one acceptance event, one Production transition to `ready_to_print`, preserved tax-exempt evidence, freight, PO, terms, and totals snapshot.
5. Execute Production and Inventory steps 9–11 from Script A. Assert tax/terms never affect reservation or consumption.
6. Generate the invoice in Orders/Finance. Assert invoice number, PO, Net 30 due date calculated from the invoice date, zero sales tax, separate freight, full open balance, and no retail deposit requirement.
7. On device B verify Customer 360 outstanding/invoice totals, Hub attention/due state, tracking status, and private asset access while authenticated.
8. Record full payment on/before due date. Assert exactly one linked payment, paid state, zero balance, tax-exempt reporting, freight classification, and closeout eligibility.
9. Close fulfillment and Production. Assert no active reservations, complete tracking, retained invoice/payment/audit trail, and consistent multi-device reads.

### Script C — cancellation, shortage, mounted roll, and concurrency

1. Cancel once while `waiting_customer`: assert no reservation transaction. Cancel a different accepted job at `ready_to_print`: assert the full reservation releases and no consumption occurs.
2. Create demand exceeding available grams. Assert shortage is visible, Production cannot falsely start with an adequate reservation, and no negative roll balance is created.
3. Mount a roll, start printing, record actual use from that roll, and QC-pass. Assert the mounted roll is depleted, a different matching roll is not, and ledger grams reconcile.
4. With devices A and B open on one job, change status in A then attempt a stale change in B. Assert the optimistic-concurrency warning, refresh, one final status/event, and no duplicate reservation/consumption.
5. Disconnect A during a durable save. Assert the UI does not claim cloud success; reconnect and verify no browser recovery copy silently overwrites the newer row created on B.

## Automated coverage and code inspection

The Node assertion suite covers authoritative persistence reconciliation, bidirectional workflow persistence, Customer 360, Hub, inventory lifecycle, Production workflow/status, quote customer types/totals/order snapshot, recipes, printers, analytics, and Job Assets. The acceptance regression additionally enforces one public acceptance RPC, one handler per decision, no legacy link-back RPC, and no client-fabricated Order ID.

Static inspection found no basis to claim live RLS, Storage, email, payment-provider, responsive layout, or database idempotency behavior. Those are mandatory manual gates below.

## Deployment order

1. Back up the target database and Storage metadata; export current migration history and RLS/policy definitions.
2. In staging, confirm migrations `202607160001` through `202607160007` are recorded in filename order. **Do not apply any migration as part of this PR.** If staging differs, stop and reconcile through the normal reviewed migration process.
3. Run all SQL verification queries documented by the existing migration/deployment notes, including constraints, triggers, RLS, private bucket policies, duplicates by Quote/Order, and orphan asset links.
4. Deploy the static application files to staging. Run Scripts A–C on desktop and mobile/two-device sessions.
5. Verify `respond_to_quote_public` is atomic/idempotent and returns `order_number`; verify the quote-acceptance and Order-to-Production triggers exist before promoting the client.
6. Deploy application files to production during a low-traffic window. Smoke-test one controlled Quote read/change-request (do not approve a customer Quote), authenticated page loads, tracking, payment link, and private asset access.
7. Monitor RPC failures, duplicate-key violations, RLS denials, project events, reservation discrepancies, and Finance import errors through the rollback window.

## Rollback notes

This change is application-only and has no migration. Roll back by redeploying the previous static build. Do not roll back or weaken RLS, expose the Storage bucket, delete acceptance-created Orders, or manually rewrite Q/OP identities. If approval fails because the RPC does not return an Order number, disable the affected client, inspect the Quote and Order remotely, and reconcile through an audited database operation before asking the customer to retry. A duplicate Order is a release incident: stop acceptance, preserve both records/events, choose the valid row through business review, and correct data with a documented transaction—not browser storage.

## Manual multi-device release checklist

The required live manual validation was completed successfully before ERP 1.0 release.

- [x] Scripts A, B, and C passed in staging with evidence.
- [x] Desktop A, mobile B, and a public/private session used; viewport widths include 320, 375, 768, and desktop.
- [x] No clipped primary action, horizontal page trap, inaccessible modal, overlapping keyboard/form controls, or touch target preventing completion.
- [x] Clearing storage never removes a durable record; offline recovery never silently overwrites Supabase.
- [x] Concurrent approval produces one Order and one Q/OP relationship.
- [x] Production is the operator surface for manufacturing changes; Orders reflects the final synchronized state.
- [x] Reservation, shortage, mounted roll, actual use, scrap, reprint, cancellation, refund, QC, and closeout reconcile to the inventory ledger.
- [x] Retail deposit/balance/refund and PO tax-exempt/freight/Net 30 invoice/payment reconcile to Finance.
- [x] Customer 360, Hub, tracking, and payment show fresh remote events after reload on device B.
- [x] Asset upload, revision, download, archive, and Q/OP/job/customer/recipe links survive handoffs; unauthenticated access is denied.
- [x] RLS tests cover two different authenticated users plus anonymous access; private Storage paths and signed URLs do not leak.
- [x] Browser console/network contain no uncaught error, duplicate write, failed RPC, or unexplained RLS denial.
- [x] Closeout leaves no active reservation and retains actuals, attempts, Finance entries, events, and assets.

## Deferred post-1.0 improvements (not release work)

1. Remove verified legacy local compatibility inputs after production-data inventory proves every corresponding remote field/table is deployed; retain only explicit draft/recovery/cache/preferences.
2. Replace the legacy editable manufacturing status control in Orders Admin with a strictly read-only synchronized presentation after manual interruption/cancellation requirements are confirmed. Until then, validate that operators change manufacturing only in Production Control.
3. Add a CI-managed ephemeral Supabase integration environment that executes acceptance idempotency, RLS, concurrency, reservation ledger, and Finance transaction tests.
4. Add automated browser/mobile accessibility and visual-regression coverage without redesigning the pages.
5. Consolidate remaining large inline page scripts into existing responsibility-based modules only when doing so reduces duplicated handlers/render paths; do not introduce new business modules.

These items are deliberately deferred because they require deployment evidence, operational decisions, or a separately focused PR. They must not be silently bundled into ERP 1.0.
