# ERP Bridge Pass 17

Fixes the accepted-order reverse sync into Production Control.

## What changed

### Production Control
- Supabase top-level `production_status`, `quote_number`, and `order_number` now override stale `job_payload` values when loading jobs.
- Cards with an OP number now display as **Production mode**, even if they are still in the Pre-Production lane.
- Cards now show a clear Quote/Order ID ribbon so you can verify Q/OP linkage directly on the board.

### Orders Admin
- Clicking **Save** now also acts as a repair sync to Production Control, even when the order status did not change.
- This is intended to fix orders accepted before the bridge patch where Orders Admin had the OP, but Production Control still looked like quote/estimate mode.

## Test
1. Upload both files.
2. Hard refresh Orders Admin and Production Control.
3. Open the affected OP in Orders Admin.
4. Click Save.
5. Refresh Production Control.
6. The matching card should show the OP number and should no longer say Estimate / quote mode.

If Orders Admin is set to In Production, the Production Control card should move to WIP / Printing after Save + refresh.
