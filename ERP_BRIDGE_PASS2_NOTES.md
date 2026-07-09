# OliPoly ERP Bridge Pass 2

Changed files:
- production-control.html
- quote.js
- orders-admin.html
- ERP_BRIDGE_PASS2_SUPABASE_MIGRATION.sql

What this pass tightens:

1. Quote numbering is now cloud-only.
   - Production Control no longer creates local/browser fallback Q numbers.
   - If Supabase cannot assign a Q number, save stops instead of risking duplicate numbering.
   - Preferred counter method is the new atomic `next_document_counter()` Supabase RPC.
   - If the RPC is not installed yet, it still falls back to the existing Supabase `document_counters` table, not local storage.

2. Added Supabase migration.
   - Creates atomic document counter function.
   - Adds optional bridge audit fields on `production_jobs`:
     - `quote_handoff_status`
     - `quote_handoff_at`
     - `quote_accepted_at`
   - Adds lookup indexes for quote/order bridges.

3. Quote acceptance is safer.
   - First tries full bridge patch into `production_jobs`.
   - If optional audit columns are missing, falls back to the minimum required fields:
     - `production_status`
     - `order_number`
     - `updated_at`

4. Orders Admin now recognizes all statuses Production Control may send.
   - Added labels/dropdowns/styles for:
     - `issue_review`
     - `on_hold`
     - `canceled`
   - These will no longer appear as raw unknown status values if Production Control syncs them downstream.

Before testing:
1. Run `ERP_BRIDGE_PASS2_SUPABASE_MIGRATION.sql` in Supabase SQL Editor.
2. Upload/overwrite the three changed files.
3. Hard refresh browser cache.

Critical test:
1. Log in.
2. Create a new Production Control estimate with blank Quote #.
3. Save.
4. Confirm Q-number auto-populates from Supabase.
5. Cancel another estimate and confirm next estimate uses the next number, not the canceled number.
6. Push to Quote, accept quote, confirm OP number matches Q number.
7. Move Production Control status to Printing / On Hold / Failed-Scrap and confirm Orders Admin shows clean labels.
