# ERP Bridge Pass 10 — Status + Payment Cleanup

## Purpose
This pass corrects the status/payment behavior exposed during end-to-end testing.

## Fixes

### 1. Production Control swim lanes simplified
Production Control now uses broad manufacturing lanes:
- Pre-Production
- WIP / Printing
- Complete / Handoff

Detailed statuses still appear on the cards, but the board is no longer trying to mirror every Orders Admin/customer status.

### 2. Accepted quote lands in the right Production Control state
Accepted quotes should land in:
- `awaiting_design`

They should NOT jump straight to:
- `ready_to_print`

That prevents skipping actual design/slicer/material confirmation.

### 3. Production status syncing simplified
Production Control still drives manufacturing status, but Orders Admin receives customer/order-level equivalents:
- `awaiting_design` -> `awaiting_production`
- `ready_to_print` -> `awaiting_production`
- `printing` -> `in_production`
- `post_processing` -> `in_production`
- `qc_complete` / `production_closed` -> `production_complete`

### 4. Orders Admin statuses simplified
Orders Admin no longer needs to expose internal manufacturing micro-statuses such as `In Design` and `Post-Processing` in the dropdowns.

### 5. Deposit/payment logic corrected
If accepted quote deposit is $0, the order now uses:
- `due_on_completion`

Instead of incorrectly defaulting to:
- `deposit_due`

## No SQL migration required
This pass uses existing text status/payment fields.

## Restart testing from
1. New Production Estimate
2. Push Quote
3. Accept Quote
4. Verify Orders Admin payment is Due on Completion when deposit is $0
5. Verify Production Control status is Awaiting Design / Actuals
6. Confirm Plan / Reserve
7. Start Print from Production Control
8. Verify Orders Admin/tracker shows In Production
