# OliPoly Tax Exempt + PO Workflow V1

## Install order

1. Run `sql/tax_exempt_po_workflow_v1.sql` in Supabase SQL Editor.
2. Upload/overwrite these repo files:
   - `orders-admin.html`
   - `quote.html`
   - `quote.js`
   - `finance-pro.html`
   - `finance-pro.js`
3. Hard refresh the browser after GitHub Pages deploys.

## What this adds

- PO number remains stored in quotes/orders.
- Tax Exempt workflow fields:
  - Tax Exempt?
  - Exemption Reason / Notes
  - Exemption Certificate On File?
  - PO File Stored?
- Quote calculation forces tax to $0 when tax exempt.
- Quote/order payloads save tax exempt fields.
- Quote → Order creation carries PO + tax exempt flags into Orders Admin.
- Orders Admin → Finance Pro push marks tax exempt sales with $0 sales tax.
- Finance Pro income entry supports Tax Exempt Sale.

## File storage recommendation

Store the customer-provided PO PDF and tax exemption certificate externally for now:

OliPoly Business Customers/
  Customer Name/
    PO-####.pdf
    Tax Exempt Certificate.pdf
    Q-######.pdf
    INV-######.pdf

The OliPoly system tracks whether those files are on file, but does not upload/store them yet.
