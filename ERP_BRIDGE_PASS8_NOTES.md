# ERP Bridge Pass 8 — Quote Tool Production Draft Identity Fix

## Fix
When opening Quote Tool from Production Control, the Production draft was sometimes ignored because the URL `production_job_id` was a string while the saved draft `production_job_id` could be numeric. That caused Quote Tool to fall back to its own standalone quote/invoice numbers.

This pass fixes that by:
- comparing production job IDs as strings
- forcing the Quote # from the Production Control draft
- deriving Invoice # from that same Quote #
  - Example: `Q-00001` → `INV-00001`
- re-applying those identity fields after legacy Quote Tool initializers finish

## Files
- quote.js

## SQL
No SQL migration required.

## Test
1. Production Control → Add Order / Estimate Mode
2. Confirm Quote # is assigned, e.g. `Q-00001`
3. Save estimate
4. Push/Create Quote
5. Quote Tool should show:
   - Quote #: `Q-00001`
   - Invoice #: `INV-00001`
6. Save quote
7. Accept/create order
8. Confirm OP uses same core number.
