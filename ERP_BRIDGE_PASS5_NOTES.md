# OliPoly ERP Bridge Pass 5

## What this pass adds

- Solves the denied/voided quote loop.
- Keeps Production Control estimates in pre-production statuses until accepted.
- Adds manual `quote_declined` and `void` handling.
- Preserves burned Q numbers instead of deleting/reusing them.
- Adds lightweight `project_events` logging groundwork for Hub / Customer 360 / Business Pulse later.
- Adds a frozen production closeout snapshot so completed order profitability does not shift later if material prices/rates change.

## Files included

- `production-control.html`
- `orders-admin.html`
- `quote.js`
- `ERP_BRIDGE_PASS5_SUPABASE_MIGRATION.sql`
- `ERP_BRIDGE_PASS5_NOTES.md`

## Supabase step

Run `ERP_BRIDGE_PASS5_SUPABASE_MIGRATION.sql` in Supabase SQL Editor before testing.

## Lifecycle behavior

### Estimate / Quote Sent

- Q number is assigned by Production Control.
- Inventory is not reserved.
- No OP is created until acceptance.
- `Push to Quote` moves the job to `quote_sent`.

### Declined / Voided

- `Mark Declined` moves the job to `quote_declined`.
- `Cancel` from an estimate/quote that has no OP moves it to `void`.
- Q number remains burned and is not reused.
- Inventory is untouched.

### Accepted / Production

- Quote acceptance should move Production into `awaiting_design` and create the matching OP.
- Production Control owns printing/QC status.
- Orders Admin mirrors production status for tracker/customer visibility.

### Closeout

- QC Complete / Close now saves a `production_closeout_snapshot`.
- Inventory is still protected from double-deduction.
- Orders Admin takes over fulfillment, payment, invoices, labels, and Finance Pro push after production close.

## Testing

1. Create new estimate and confirm Q auto-populates.
2. Push quote and confirm Production card becomes `quote_sent`.
3. Mark quote declined; confirm no OP and no inventory movement.
4. Create another estimate, push quote, accept quote, and confirm OP matches Q number.
5. Enter actuals, confirm plan/reserve, start print, then QC closeout.
6. Confirm Orders Admin/tracker mirrors production status.
7. Push to Finance from Orders Admin as before.
