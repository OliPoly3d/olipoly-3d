# ERP Search v2 Notes

Safe search cleanup based on current repo ZIP.

Modified files:
- hub.html
- orders-admin.html
- inventory-control.html
- production-control.html
- finance-pro.html
- quote.html

What changed:
- Removed earlier generic cross-page search helper scripts that were overfilling unrelated fields.
- Hub now acts as a clean launcher/search router. It sends only `?search=<term>` to destination pages.
- Orders Admin search now searches across all orders when a search term is present, including closed/history records.
- Orders Admin gets a visible Search button and Enter-to-search behavior.
- Inventory duplicate Search buttons were removed.
- Inventory deep links now apply a clean query to the native raw/supply/finished search path without the generic helper.
- Production, Finance, and Quote get small page-specific deep-link support only.

No Supabase schema changes. No data migrations. No customer-facing pages touched.

Suggested tests:
- Hub search `PETG` → Inventory result opens `inventory-control.html?search=PETG` and raw materials filter to PETG.
- Inventory search `BLUE`, `PLA`, `PETG` → results update immediately and with Search/Enter.
- Hub search `OP-000184` → Orders Admin opens with search applied across all orders.
- Orders Admin manual search `OP-000184`, customer name, or email → results update.
- Production search from Hub opens Production Control with search term in the native search field.
- Finance search from Hub opens Finance Pro with search term in the native search field.
