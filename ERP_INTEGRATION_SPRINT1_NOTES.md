# ERP Integration Sprint 1 Notes

Safe integration pass. No Supabase schema changes, no customer-facing pages, and no business logic rewrites.

## Files changed
- hub.html
- orders-admin.html
- production-control.html
- inventory-control.html
- finance-pro.html
- quote.html

## What changed
- Hub attention wording is calmer and separates action-required inventory from specialty/watch/snoozed low-stock notices.
- Hub inventory attention links now deep-link to Inventory Control with low-stock context.
- Added a small safe URL filter helper to backend modules.
- Pages can now accept query parameters such as `?search=PETG`, `?customer=Niles`, `?order=OP-1001`, `?material=PETG`, `?status=low`, or `?type=income` and apply them to existing filter/search inputs when present.

## Safety notes
- The helper only fills existing inputs/selects and dispatches normal input/change events.
- It does not write to Supabase.
- It does not change existing save/update/delete logic.
- If a page does not have a matching input/select, the helper does nothing.

## Quick verification
1. Open `hub.html`. Confirm the inventory heads-up says “Specialty inventory” / “No reorder action required” instead of the old implementation wording.
2. Search for a material on Hub and open an Inventory result. Confirm Inventory opens with the search box populated.
3. Try `orders-admin.html?search=OP` and confirm Orders Admin search is populated.
4. Try `production-control.html?search=Niles` and confirm Production search is populated.
5. Try `finance-pro.html?type=income` and confirm Finance filter is applied.
