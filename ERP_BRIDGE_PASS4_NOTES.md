# ERP Bridge Pass 4 Notes

## What this pass changes

Pass 4 focuses on interruption handling and rollback protection so the new ERP bridge does not leave Production Control and Inventory Control stuck when a customer/business order is canceled or put on hold from Orders Admin.

## Orders Admin interruption sync

Orders Admin now has a narrow back-sync helper for statuses that are legitimately business/customer-level interruptions:

- `canceled` → Production Control `canceled`
- `on_hold` → Production Control `on_hold`
- `issue_review` → Production Control `failed_scrap`

Orders Admin still does **not** become the manufacturing status driver. It should not push normal production progress like printing/QC forward. That remains owned by Production Control.

## Cancellation rollback behavior

When an order is marked `canceled` in Orders Admin:

1. Orders Admin saves the order and public tracker like normal.
2. It looks for the matching Production Control job by `order_number`.
3. If the production job has reserved material and inventory has **not** already been deducted, it releases those reserved grams from `raw_material_inventory.reserved_grams`.
4. It clears `material_reservations` in the production job payload.
5. It marks the production job `canceled` and keeps the record for audit history.

This protects against the exact failure mode we discussed:

> Customer/order canceled after production planning, but reserved filament stays stuck forever.

## Hold / issue review behavior

- `on_hold` keeps reservations in place because the order may resume.
- `issue_review` flags the production job for review but does not automatically release or deduct inventory.

## What this pass intentionally does NOT do

- It does not connect Finance Pro to inventory purchases.
- It does not reuse canceled quote/order numbers.
- It does not delete production jobs when orders are canceled.
- It does not let Orders Admin drive normal manufacturing statuses.

## Test path

1. Create estimate in Production Control and push/accept into Orders Admin.
2. Confirm production job has an `OP-######` order number.
3. Enter grams and confirm/reserve production plan.
4. Confirm Inventory Control shows reserved grams.
5. Open Orders Admin and mark the order `Canceled`.
6. Save.
7. Confirm public tracker shows canceled.
8. Return to Production Control and confirm the job is canceled.
9. Confirm Inventory Control reserved grams were released.

## Files changed

- `orders-admin.html`

`production-control.html` and `quote.js` are included unchanged from Pass 3 for convenience.
