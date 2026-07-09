# ERP Bridge Pass 21 — Tax + Workflow Polish Prep

## Files included
- `quote.html`
- `quote.js`
- `js/quote.js`
- `orders-admin.html` (carried forward from Pass 19)
- `production-control.html` (carried forward from Pass 20)

## Main change
Quote Tool now uses a Tax County / Jurisdiction selector instead of relying on old hard-coded county presets.

The selector attempts to load county/rate options from Supabase `financial_entries` records created by Finance Pro:
- `destination_county`
- `sales_tax_rate`

If rates exist in Finance Pro entries, the Quote Tool dropdown lists counties only, then auto-fills the tax percentage when selected.

## Behavior
- County selected → sales tax rate auto-fills.
- Tax Exempt selected → rate becomes 0 and Tax Exempt becomes Yes.
- Out of State / No Tax → rate becomes 0.
- Custom / Manual Rate remains available as fallback.

## What this does NOT do yet
- Does not change Finance Pro tax reporting logic.
- Does not add a new tax settings table.
- Does not change customer-facing PDFs except that calculations use the selected rate.
- Does not loosen Supabase constraints.

## Test
1. Upload files.
2. Hard refresh `quote.html`.
3. Open Quote Tool.
4. Confirm Tax County / Jurisdiction dropdown loads county options from prior Finance Pro entries if available.
5. Select a county.
6. Confirm Sales Tax % auto-fills.
7. Generate/accept quote and confirm Orders Admin still creates without constraint errors.

## Note
If the dropdown only shows Custom / Out of State / Tax Exempt, Finance Pro likely has no income entries with both destination county and sales tax rate yet. Use Custom for now or add a dummy Finance Pro income entry with the desired county/rate.
