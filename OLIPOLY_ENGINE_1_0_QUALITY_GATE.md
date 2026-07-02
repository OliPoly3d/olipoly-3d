# OliPoly Engine v1.0 Quality Gate

Use this checklist before calling a repo commit stable.

## 1. Pages load cleanly

Open each page and confirm there are no red console errors:

- `hub.html`
- `orders-admin.html`
- `production-control.html`
- `inventory-control.html`
- `finance-pro.html`
- `quote.html`
- `customer-360.html`
- `track.html`
- `pay.html`

## 2. Search v2 regression

Search these terms from Hub and confirm the destination page opens filtered:

- `PETG`
- `Blue`
- `PLA`
- a known customer name
- a known `OP-#####`
- a known quote/customer term

Then on each destination page:

- edit the search term manually
- press Enter
- click Search if present
- click Clear Search
- confirm results reset

## 3. Workflow smoke tests

### Quote to order

- Create or identify a test quote.
- Confirm accepted quote path still creates/finds an order correctly.
- Confirm OP/order reference is searchable.

### Order to production

- From Orders Admin, confirm the order can be pushed or referenced by Production Control.
- Search the OP number in Production Control.

### Production closeout to inventory

- Close or simulate a safe test job.
- Confirm material deduction is visible in Inventory Control.
- Confirm canceled jobs do not remain active and reserved inventory is released.

### Finance

- Confirm a known sale appears in Finance Pro.
- Confirm county and tax rate display correctly.
- Confirm Ohio Sales Tax Filing summary still loads.
- Confirm Schedule C mapping check still loads.

## 4. Inventory safety

- Sync button does not loop.
- Specialty/watch/discontinued materials do not nag as reorder-needed.
- Movement log remains readable.
- Recovery/backup tools remain collapsed unless opened.

## 5. Mobile spot check

On phone-sized viewport:

- Hub nav is usable.
- Orders Admin controls are reachable.
- Inventory search/quick actions are usable.
- Finance Pro tables do not prevent basic entry/search.
- Production cards are readable.

## Release rule

If any item fails, do not start a new feature sprint. Fix the failing item first, then commit a new stable checkpoint.
