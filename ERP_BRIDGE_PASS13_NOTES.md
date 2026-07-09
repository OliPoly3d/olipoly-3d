# ERP Bridge Pass 13 — Saved Quote Library Hydration Fix

## Purpose
Fixes saved quote loading when a quote originated from Production Control and was saved before all fields were being restored correctly.

## Fixes
- Saved Quote Library now restores top-level cloud quote fields into the form, not only `quote_data.fields`.
- Restores/preserves:
  - Quote number
  - Invoice number
  - Customer name/email
  - Quote/project title
  - PO/tax-exempt fields
  - shipping/billing fields when available
  - production-origin project/customer/quantity/notes fallback fields
- Loading an existing saved quote does **not** regenerate Q/INV numbers.
- URL auto-load uses the same hydration logic.

## Files
- quote.js
- js/quote.js
- quote.html cache-bust update

## SQL
No SQL migration required.

## Test
1. Open quote.html and hard refresh.
2. Select the Production-origin saved quote from Saved Quote Library.
3. Click Load Quote.
4. Confirm Q-number, INV-number, customer name, customer email, project/quote title, and dollar values all populate.
5. Save again if needed to persist the now-complete fields.
