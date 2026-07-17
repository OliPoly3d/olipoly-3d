# Fundraiser Manager Workflow

## 1. Setup

1. Owner chooses an existing organization/customer identity if available and records fundraiser-specific organizer contact details.
2. Owner enters event, timezone, order dates, collection model, fulfillment choices, notes, and a unique public slug.
3. System saves a remote `draft`; it creates no Order, production job, reservation, or Finance entry.
4. Owner resolves validation/open questions and schedules publication. At the start instant, an eligible `scheduled` fundraiser may be opened by an explicit server command/scheduled process.

## 2. Product assignment

1. Owner selects an active, verified Product Recipe revision.
2. Owner enters item code, public presentation, personalization rule, prices, payouts, and display order.
3. Preview shows calculated Niles-style terms but does not calculate manufacturing.
4. Before opening, validation requires at least one active item, valid terms, and stable recipe references.
5. After the first order, term changes affect future orders only; existing lines retain snapshots. Deactivation prevents new selection without altering history.

## 3. Public ordering

1. Anonymous visitor loads a sanitized published catalog by slug.
2. Client validates required contact/order fields for usability; the server independently validates fundraiser status/window, item activity, quantities, personalization, fulfillment, and money snapshots.
3. Visitor chooses cash/online-to-organizer and pickup/delivery. Payment choice is not payment confirmation.
4. One idempotent submission transaction creates/returns an authoritative ERP Order plus fundraiser attribution/lines. The Orders service allocates the exact Order identity.
5. Confirmation reveals only the minimum receipt/order reference. Retry with the same key returns the same Order; a concurrent retry cannot duplicate it.
6. Customer 360 and Orders Admin discover the real Order through existing read paths plus fundraiser attribution.

**Exception:** If ERP 1.0 lacks an approved direct-sale Orders creation contract, implementation stops until one is designed. The module must not create fake accepted Quotes or insert a shadow Order.

## 4. Production

1. After ordering closes (or a deliberate owner-approved batch cutoff), owner reviews included lines and validation exceptions.
2. Production summary groups by design/recipe revision/fundraiser item and exposes customer/personalization drill-down.
3. Owner requests Production jobs/batches through Production Control. Production owns job creation, estimates, assignment, attempts, notes, and transitions.
4. Fundraiser milestones project canonical evidence:
   - **Programmed = Yes:** linked Production work has recorded program/slicer readiness evidence defined by Production Control.
   - **Printed = Yes:** all included units/attempts have print-complete evidence; reprint need makes the projection incomplete.
   - **Completed = Yes:** all included work has passed QC/finishing and reached `ready_for_fulfillment` or later.
5. The system must never let three booleans advance canonical workflow. Partial quantities are shown numerically even when the legacy Y/N column is displayed.
6. Needs Reprint returns canonical work to Ready to Print and preserves actual usage; rollups update from Production evidence.

## 5. Inventory interaction

1. Catalog setup and Estimate reserve nothing.
2. Production Control creates/links jobs from recipe and actual fundraiser demand.
3. At Ready to Print, Production requests reservations from Inventory using the normal ledger contract.
4. Printing retains reservations. Print completion captures actual use and scrap.
5. QC pass consumes actual material and releases unused reservation. Cancellation releases reservation; reprint preserves actuals and follows the established lifecycle.
6. Fundraiser views may display shortage/readiness but never change inventory balances.

## 6. Finance and reconciliation

1. Commercial summary calculates obligation from immutable included line snapshots.
2. Owner records organizer confirmation separately from payment receipt.
3. Cash/online receipts or organizer remittance are posted/allocated in Finance Pro using its authoritative contract.
4. Finance dashboard compares gross customer sales, organizer proceeds, OliPoly payout, refunds/adjustments, posted receipts, and outstanding amount.
5. Any difference requires a categorized adjustment and audit note. Fundraiser Manager never manufactures a balancing Finance row.

## 7. Settlement

1. Ordering is closed and included/canceled/refunded lines are reviewed.
2. Owner generates a draft settlement with a cutoff and per-Order lines.
3. A second calculation from the same source snapshots must match; Order and Finance counts/totals are reconciled.
4. Owner approves the snapshot. Posting references the authoritative Finance transaction/allocation.
5. Posted settlement becomes immutable. Correction occurs through a void/adjustment policy, never editing history.
6. Organizer receives an owner-generated sanitized settlement report; there is no organizer portal in this phase.

## 8. Closeout

Close only when ordering is closed, all included Orders have an explicit disposition, production/QC is complete or exceptions documented, Inventory has no live reservations, fulfillment is complete or exceptions documented, settlement is posted, and outstanding balance is zero or formally approved. Closing makes the fundraiser read-only except audited reopening/notes. It does not close Orders, jobs, or Finance records by side effect.

## Exception paths

- **Canceled fundraiser:** stop new orders, release only through normal Production cancellation, preserve records, reconcile refunds.
- **Canceled/refunded line:** exclude only under explicit audited disposition; reconcile authoritative Order/Finance state.
- **Invalid personalization:** quarantine for owner review; do not silently truncate.
- **Recipe archived after ordering:** use captured revision; Production owner decides substitution with audit trail.
- **Offline/retry:** preserve unsent draft/key only; reload authoritative result before resubmission.
- **Conflicting device update:** reject stale update, reload, and show the current actor/time.
