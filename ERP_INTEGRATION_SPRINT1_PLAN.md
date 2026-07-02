# ERP Integration Sprint 1 — Safe Plan

## Goal
Make the ERP feel connected without touching Supabase schema or rewriting module business logic.

## Planned files to modify
1. `hub.html`
2. `orders-admin.html`
3. `production-control.html`
4. `inventory-control.html`
5. `finance-pro.html`
6. `finance-pro.js` only if Finance Pro needs query-param filter support that is not in the HTML file
7. `quote.html` / `quote.js` only if quote search/deep-link handling is needed

## Deliverables
- Cleaner Hub attention wording for Inventory v2 policies.
- Hub search supports direct tool and material-oriented searches.
- Orders Admin accepts safe URL filters: `order`, `customer`, `q`.
- Production Control accepts safe URL filters: `order`, `customer`, `material`, `q`.
- Inventory Control accepts safe URL filters: `material`, `supplier`, `q`.
- Finance Pro accepts safe URL filters: `customer`, `order`, `category`, `q`.
- No auto-saving, no data mutation from links.

## Do not change in Sprint 1
- Supabase tables
- Auth model
- Inventory deductions
- Finance tax formulas
- Production closeout logic
- Quote acceptance behavior

## Test checklist
### Hub
- Search still works.
- Core links still open.
- Inventory attention uses clear action/headsup wording.

### Orders Admin
- Normal page load works.
- `orders-admin.html?q=test` does not break the page.
- If a search field exists, it is prefilled or a visible hint appears.

### Production Control
- Normal page load works.
- `production-control.html?material=PETG%20Black` does not break the page.

### Inventory Control
- Normal page load works.
- `inventory-control.html?material=PETG%20Black` prefilters/searches if possible.
- Sync fixes remain intact.

### Finance Pro
- Normal page load works.
- Login still works.
- `finance-pro.html?category=Event%20Booth` does not break the page.
