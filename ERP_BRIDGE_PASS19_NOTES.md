# ERP Bridge Pass 19

Focused repair after testing showed:
- Orders Admin status changes appeared to save but reverted on reload.
- Production Control could show Q/OP badges but still say order not accepted / remain in the wrong lane.

## Changes

### orders-admin.html
- Adds explicit Supabase-safe status/payment normalizers that were referenced but not defined in the active file.
- Keeps friendly UI labels separate from database values.
- Improves Orders Admin -> Production Control repair sync by matching production jobs using:
  - exact OP number
  - OP number with 5-digit and 6-digit padding variants
  - source quote number
  - Q number with 5-digit and 6-digit padding variants
- Writes `quote_number` back to the production job top-level fields during repair.

### production-control.html
- Improves Production Control lane authority loading by finding linked orders from either:
  - `order_number`
  - `source_quote_number`
  - Q/OP number variants using 5-digit or 6-digit padding
- This specifically handles older test records such as `Q-00001` vs newer `Q-000001` formatting.

## Test
1. Upload both files.
2. Hard refresh Orders Admin and Production Control.
3. Open the test order in Orders Admin.
4. Set status to In Production.
5. Click Save and confirm it remains In Production after refresh.
6. Refresh Production Control.
7. The linked card should show Q and OP badges and move to WIP / Printing.

No SQL migration required.
