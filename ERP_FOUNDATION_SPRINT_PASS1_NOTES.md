# ERP Foundation Sprint — Pass 1

Date: 2026-07-08

## Scope
This pass improves ERP structure and inventory scalability without redesigning the UI.

## Changed

### Shared ERP foundation helpers
Updated `js/erp-core.js` with shared helpers for:
- Canonical production/order/payment status labels
- Closed production status list
- Inventory-reserving production status list
- Safe number/string normalization helpers
- Material key and inventory-pick parsing
- Shared material matching logic
- Shared production-job and raw-inventory localStorage reads
- Lightweight local ERP event log at `olipoly_erp_event_log_v1`

### Production Control reservation path
Updated `production-control.html` so:
- Reservation logic uses the shared material-matching helper when available
- Material reservation prefers mounted/open rolls first, then active/low/sealed, then spool/refill/sample, then smallest remaining amount
- Jobs marked `exclude_inventory_reduction` do not reserve material
- Status changes and job saves write simple local ERP events

### Inventory Control reserved inventory visibility
Updated `inventory-control.html` so:
- Reserved inventory is based first on explicit `material_reservations` written by Production Control
- Awaiting Approval / early-stage production jobs can now show as reserved inventory instead of waiting for queued/printing status
- Older jobs without explicit reservations still use a fallback recipe-based demand calculation
- Shared material matching is used when available

### Cache refresh
Updated ERP core script query strings in:
- `production-control.html`
- `inventory-control.html`
- `orders-admin.html`
- `quote.html`

## Not changed
- No redesign
- No customer-facing page edits
- No Niles fundraiser edits
- No Supabase schema changes required
- No internal navigation changes

## Recommended manual test
1. Open Inventory Control and confirm current raw material totals still load.
2. Open Production Control.
3. Create or edit a job with material recipe, status `Awaiting Approval`, and inventory included.
4. Save the job.
5. Return to Inventory Control and confirm the matching roll/group now shows reserved grams.
6. Toggle the job to `Exclude Inventory` and confirm the reservation releases.
7. Cancel or close the job and confirm reserved grams release.
