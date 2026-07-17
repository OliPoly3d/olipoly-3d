# Milestone 4D — Final Persistence and Authority Cleanup

## Authority contract

Supabase is the only durable authority for orders, quotes, customers, Production jobs, inventory, product recipes, Finance records, and Job Files / Assets. Browser copies never make a save successful. Conflict resolution compares a stable ID and valid `updated_at` (including the legacy `updatedAt` spelling): the newer valid timestamp is selected for review, while Supabase wins equal, missing, or invalid timestamps. A newer local value is recovery data and is never uploaded automatically. Import is an explicit, reviewed, missing-record-only operation and de-duplicates stable IDs.

If an authoritative fetch fails, the page must show an unavailable state rather than silently rendering cached business rows. JSON files and local recovery copies are backup inputs, not a parallel database. Milestone 4C's private bucket, signed URL, immutable revision, and RLS behavior is unchanged.

## Repository-wide browser persistence inventory

The audit searched the active repository and the isolated `archive/` tree for `localStorage`, `sessionStorage`, IndexedDB, JSON state, durable in-memory collections, fallback/demo records, drafts, recovery records, and caches. There is no active `sessionStorage` or IndexedDB use.

| Browser value / location | Owner | Classification | Final disposition |
|---|---|---|---|
| `olipoly_quote_history_v3` in `quote.js` | Quote | **4. Permitted recovery copy** | Failed saves are labeled non-durable. Successful saves remove matching recovery. Local rows are excluded from Saved Quote Library and remote failures render no local authority. Recovery is loaded only through **Review recovery copies**, as an unsaved draft, followed by an explicit cloud save. |
| `olipoly_production_jobs_v3` and legacy job keys in Production, Orders, Inventory, Customer 360 | Production Control | **2. Permitted cache / 4. recovery copy** | Supabase loaders remain authoritative. Local rows support legacy recovery and cross-page drafts only; they must not replace equal/newer remote rows or upload automatically. Customer 360 uses remote tables and returns an unavailable/empty result on failure. |
| raw/finished/supply inventory, ledger and spool keys in `inventory-control.html` / `production-control.html` | Inventory | **2. Permitted cache / 4. recovery copy** | Authoritative tables remain `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, `inventory_spool_pool`, and `inventory_settings`. **Recover Local** now reviews/normalizes without automatic upload. Cloud import remains a separate explicit action. |
| `olipoly_product_recipes_v1` | Product Recipe Library | **4. Permitted recovery copy** | Supabase is rendered exclusively. Failed saves retain recovery; load failure renders no cached recipes. Review/import is explicit and missing-only through the recipe recovery interface. |
| `parts_catalog_*` in Orders | Orders / catalog | **2. Permitted cache / 4. recovery copy** | `parts_catalog` / `catalog_parts` are durable. In-memory `catalogPartsCache` is a session read model. Local catalog entries are recovery candidates, not a second authority; cloud refresh is required for durable display. |
| `olipoly_transfer`, production-to-quote, reorder quote, workflow and recipe-repeat preload keys | Quote / Production / Orders | **3. Permitted unsaved draft** | One-time, user-initiated navigation payloads. Consumers remove transfer payloads after use. They are clearly drafts and become durable only after explicit Supabase save. |
| quote field snapshot and `olipoly_erp_recovery_snapshot_v1` | Quote / reliability panel | **3. draft / 4. recovery copy** | Non-durable form recovery only. Recovery panel requires user action; exporting JSON is explicit backup. It never reports a database save. |
| Inventory JSON export/import | Inventory | **4. Permitted recovery copy** | User-triggered backup and reviewed import. Import normalizes and de-duplicates; cloud persistence requires a separate explicit action. It is not loaded during normal authoritative fetches. |
| `olipoly_order_closure_v1` | Orders | **5. UI preference** | Local closeout checklist state only; it cannot change durable order status, payment, production, or inventory state. |
| Finance settings | Finance | **5. UI preference** | Display/report filters and local operating preferences only. Financial entries remain in `financial_entries`. |
| `olipoly_hub_finance_summary_v1` | Hub / Finance | **2. Permitted cache** | Derived read-only dashboard summary; safe to delete and never written back to Finance records. |
| ERP event log, health, backup timestamps and dismissed recovery banner | ERP shell | **2. cache / 5. UI preference** | Diagnostics and presentation state only; safe to clear. |
| Knowledge favorites/recent | Knowledge Library | **5. UI preference** | Per-browser navigation preference, not business data. |
| Auth token/session/user keys (`sb_*`, `olipoly_auth_session_v1`) | Authentication | **2. Permitted cache** | Credentials cache only; Supabase Auth is authoritative. |
| Page-level arrays/maps (`orders`, `recipes`, `productionJobs`, catalog cache, Customer 360 bundle) | Respective page | **2. Permitted cache** | Ephemeral in-memory render models populated from Supabase. Reload/device changes re-fetch remote records. |
| Quote demo form and generated preview/email/PDF state | Quote | **3. Permitted unsaved draft** | Test/sample form content only; never appears in Saved Quotes until the user explicitly saves remotely. |
| Legacy active-key compatibility paths | Production / Inventory / Orders | **4. recovery / 6. deprecated** | Retained only where needed to expose old data for review. Automatic recovery upload has been removed. Remove keys after production owners complete the validation checklist and export any needed recovery. |
| `archive/**` local data tools | Archive | **6. Deprecated and remove from runtime** | Isolated, unlinked historical code. It is not an application authority and must not be restored or linked. |

## Shared behavior

`js/authoritative-persistence.js` owns timestamp parsing, stable identity, remote/local selection, recovery review reasons, and duplicate-safe missing-only imports. This prevents each page from inventing conflict rules. `js/supabase-record-store.js` performs explicit authenticated CRUD/import for modules that use the shared store.

## Deployment order

No Milestone 4D schema migration is introduced and no migration is applied automatically.

1. Confirm Milestone 4C migration `202607160007_job_asset_management.sql` is already manually deployed and validated.
2. Export browser recovery JSON from each known production device before cleanup.
3. Deploy the static application files and invalidate the CDN/browser cache.
4. Sign in and verify authoritative loads before reviewing any local recovery.
5. Review newer/missing local copies. Import only records approved by the business owner; never bulk overwrite existing IDs.
6. After multi-device validation, remove obsolete local keys through the existing recovery cleanup control.

## Rollback

Rollback is application-only: redeploy the previous static build. Do not roll back or weaken the 4C Storage bucket/RLS policies. No database rollback is needed because 4D adds no schema or data migration. Browser recovery exports should be retained until validation is signed off; do not automatically restore them into Supabase.

## Manual multi-device validation checklist

- [ ] In device A create/update one quote, Production job, inventory row, recipe, order, and Finance entry through their owning module; reload device B and confirm matching stable IDs, values, and `updated_at`.
- [ ] Modify a record on B, leave an older browser copy on A, reload A, and confirm Supabase is displayed.
- [ ] Create a newer local recovery copy on A, reconnect, and confirm it is reported for review but not uploaded.
- [ ] Test equal, missing, and invalid local timestamps; confirm Supabase remains displayed.
- [ ] Disconnect during a Quote save; confirm the UI says **not saved**, the copy is recovery-only, and Saved Quote Library remains empty/unavailable rather than showing it as durable.
- [ ] Use **Review recovery copies**, inspect a Quote, then explicitly save it. Reload B and confirm it appears once.
- [ ] Repeat the same recovery import twice and confirm stable-ID de-duplication prevents a second record.
- [ ] Use Inventory **Recover Local** and confirm it performs no network upload; use the separate reviewed import action only after comparing cloud rows.
- [ ] Clear browser storage on A, sign in again, and confirm all durable records reload from Supabase.
- [ ] Change Finance display settings, knowledge favorites, and closeout UI state; confirm those permitted preferences remain local and do not mutate remote business rows.
- [ ] Start a reorder/recipe/quote draft, cancel without saving, and confirm no durable row is created. Then explicitly save and confirm it appears on B.
- [ ] Export/import JSON and confirm it is presented as recovery, never loaded silently as the live database.
- [ ] Re-run the complete Milestone 4C private asset upload, duplicate detection, immutable revision link, signed download, archive/restore, and RLS validation separately.
