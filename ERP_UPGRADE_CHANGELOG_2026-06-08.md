# OliPoly 3D ERP Upgrade Package — 2026-06-08

This package was applied to the actual uploaded repo zip: `olipoly-3d-main(18).zip`.

## Added shared files

- `assets/erp-upgrade.css`
  - shared ERP polish layer
  - mobile ERP dock
  - action queue cards
  - system health panel styles
  - inventory ledger / production closeout styles
  - mobile tap-target and overflow improvements

- `assets/erp-upgrade.js`
  - lazy-loads images across public/internal pages
  - adds canonical tags when missing
  - adds mobile ERP dock on internal tools
  - adds Hub ERP Action Queue
  - adds Hub System Health checks
  - adds Inventory Movement Ledger panel
  - adds Production Closeout Check panel
  - mirrors renamed invoice PDF fields in Quote
  - adds shared toast helper

## Changed all HTML pages

All root `.html` files now include:

```html
<link rel="stylesheet" href="assets/erp-upgrade.css">
<script src="assets/erp-upgrade.js" defer></script>
```

This was intentionally done as a safe overlay rather than rewriting every existing tool.

## Hub / ERP Console

Added:

- ERP Action Queue
- Production / Material / Orders / Quotes summary cards
- System Health panel
- Mobile dock shortcuts

The action queue reads browser/local cache when available and provides quick links to Production, Inventory, Orders, and Quote tools.

## Quote cleanup

Fixed the known duplicate-ID issue in `quote.html`.

Removed duplicate static compatibility fields:

- `invoiceNumber`
- `invoiceType`
- `invoiceNotes`

Renamed duplicate invoice-only PDF total IDs:

- `pdfInvoiceSubtotal`
- `pdfInvoiceTax`
- `pdfInvoiceTotal`
- `pdfInvoiceDeposit`
- `pdfInvoiceBalance`

The shared JS mirrors the quote totals into these invoice-only fields so current PDF behavior remains safe while eliminating invalid duplicate IDs.

## Inventory Control

Added a lightweight Inventory Movement Ledger panel:

- Add
- Reserve
- Consume
- Scrap
- Correction
- CSV export

This gives you an audit trail immediately without risking the existing inventory deduction logic.

## Production Control

Added a Job Closeout Check panel:

- actual grams
- scrap
- inventory deduction
- margin check

This is intentionally a workflow guardrail, not a destructive rewrite of your existing job engine.

## Validation performed

- Repo zip extracted successfully.
- All root HTML files updated.
- Duplicate ID audit passed across root HTML files: `0 duplicate ID groups`.
- Full repo package rebuilt as a downloadable zip.

## Recommended overwrite method

Safest approach:

1. Keep your current repo folder as a backup.
2. Extract this package to a new folder.
3. Copy everything from inside the extracted `olipoly-3d-main` folder.
4. Paste into your current repo root.
5. Choose replace/merge when Windows asks.
6. Test locally before pushing to GitHub.

