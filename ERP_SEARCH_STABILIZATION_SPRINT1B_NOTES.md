# ERP Search Stabilization Sprint 1B

Safe fix for Hub and backend search/deep-link behavior.

## Changed
- Hub search now always shows cross-module fallback links for the typed query.
- Hub inventory result links pass the clean typed search term, not the long display title.
- Inventory search now matches combined material/color/brand/supplier/notes text and tokenized queries.
- Inventory Search buttons added for Raw, Supplies, and Finished Goods.
- `?search=PETG`, `?search=BLUE`, `?search=PLA`, `?search=OP-000184` are applied consistently by a safe helper.

## No changes
- No Supabase schema changes.
- No customer-facing pages changed.
- No data deletion or migration.

## Test cases
1. Hub search `PETG` -> click inventory result -> Inventory shows PETG results.
2. In Inventory, clear search -> type `BLUE` -> results update.
3. In Inventory, type `PLA` -> results update.
4. Hub search `OP-000184` -> opens module search links even when no local index exists.
