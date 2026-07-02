# ERP 1.0 Workflow Regression Checklist

This is the short checklist to run after every backend release.

## A. Hub and search

- Hub loads.
- Hub search routes to modules with clean search terms.
- Search does not inject long descriptions into module filters.
- Backend pages show and clear filtered results correctly.

## B. Orders Admin

- Login/top actions work.
- Page keeps dark/private styling.
- Search works for customer and OP number.
- Order cards/tables do not leak print/PDF styling at page bottom.
- Existing orders still display.

## C. Production Control

- Active, closed, archived, and canceled states display correctly.
- Canceled jobs are not treated as active.
- Canceled jobs release inventory reservations.
- Search works for OP/customer/material.
- Cards are readable on desktop and mobile.

## D. Inventory Control

- Raw material search works for material, color, and brand.
- Clear search resets filters.
- Reorder policy behavior is correct:
  - Automatic = reorder prompt when low.
  - Specialty/watch/seasonal/discontinued = low visibility without constant nag.
- Cloud sync does not throw date/type constraint errors.
- Movement log is preserved locally if cloud transaction sync is disabled.

## E. Finance Pro

- Income entry requires destination county and tax rate unless exempt.
- Taxable sale amount is not backed out of gross cash amount.
- Ohio Sales Tax Filing summary groups by county.
- Schedule C category mapping sends Event Booth to Line 20b.
- Search works for customer/vendor/order terms.

## F. Quote Tool

- Quote page loads.
- Search/filter works.
- Quote workflow still has links to accepted/order path.
- Business/PO and retail terminology remains clear.

## G. Public safety

- Internal ERP pages have `noindex, nofollow`.
- Track page remains customer-safe.
- Public customer pages are not accidentally converted to private styling.
