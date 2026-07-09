# ERP Bridge Pass 15 — Orders Admin Save Constraint Fix

## Why
Orders Admin was displaying friendly workflow statuses, but Save could still send a database-invalid status value to Supabase. Supabase rejected the PATCH with HTTP 400.

## Fix
- Orders Admin now normalizes status before saving.
- `awaiting_production`, `in_design`, `design_needed`, and `ready_to_print` save as `awaiting_approval`.
- `post_processing` saves as `in_production`.
- `qc_complete` and `production_closed` save as `production_complete`.
- payment aliases like `due_on_completion` save as `unpaid`.
- UI still displays the friendly label.

## Test
1. Open Orders Admin.
2. Select the new OP order.
3. Make a small edit.
4. Click Save.
5. Confirm no 400 error appears.
