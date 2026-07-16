# Milestone 4B — Persistent Data and Multi-Device Audit

## Authority and precedence contract

Supabase is authoritative for signed-in ERP users. Reconciliation uses a stable `id` first (then a documented business key for legacy rows), compares `updated_at`, selects the newer record, and selects Supabase when timestamps are equal, invalid, or absent. A newer browser copy is **recovery data**, never an automatic write. It may be uploaded only through an explicit, reviewed recovery import; an existing remote ID is never inserted by that path. Removing browser storage never deletes a durable row.

## Supabase inventory

The application reads/writes these authoritative tables: `quotes` (saved quotes, totals snapshots, quote status and customer fields), `orders` (accepted orders, fulfillment/payment linkage), `production_jobs` (estimates, estimate snapshots, workflow, attempts, actual usage, scrap, printer assignment), `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, `inventory_spool_pool`, `inventory_settings`, `parts_catalog`, `catalog_parts`, `printer_pm`, `financial_entries` (payments, invoices, expenses and finance reporting), `project_events`, `document_counters`, `order_tracking_public`, and `product_recipes`. Customer 360, Hub Business Pulse, Printer Dashboard, and Estimate vs. Actual are read models derived from those remote records; they are not separate authorities.

Authoritative workflow RPCs/triggers are `normalize_accepted_order_status`, `enforce_accepted_order_status`, `advance_linked_production_on_quote_acceptance`, `sync_order_workflow_to_production`, and `set_linked_workflow_status`. REST RPC calls used by the application are under `/rest/v1/rpc/*`.

## Browser storage classification

| Values | Classification | Rule |
|---|---|---|
| `olipoly_quote_history_v3`, production/inventory keys (`olipoly_production_jobs_v3`, raw/finished/supply/ledger/spool keys), recipe key | recovery/read-only cache of remote records | Never authoritative and never allowed to overwrite a newer/equal remote row. Recipe writes no longer update this key; failed writes retain recovery only. |
| production-to-quote, reorder, workflow, recipe-repeat, form snapshots | unsaved draft/recovery fallback | Explicit user action creates the durable record. |
| auth session/token/user keys | authentication cache | Supabase Auth remains authoritative. |
| finance settings, knowledge favorites/recent, closeout UI state, recovery timestamps | UI preference/local operational state | Must not be used as the durable business record. |
| Hub finance summary and ERP activity log | read-only derived cache/diagnostics | Safe to clear; dashboards reload authoritative inputs. |

No `sessionStorage` or IndexedDB usage exists in the active application. Archived tools contain legacy browser storage but are not linked runtime modules and must not be restored to production.

## Browser-only business records found and disposition

The Product / Recipe page was the confirmed active browser-only authority: create, revise, activate, and list all used `olipoly_product_recipes_v1`, despite the existing `product_recipes` migration. It now loads Production jobs and recipes from Supabase, performs recipe mutations remotely, starts with an empty view when remote loading fails (rather than presenting cache as truth), and retains a browser copy only after a failed save. Existing local recipes are detected as recovery but are not silently uploaded.

Legacy production, quote, inventory, order-closeout, and printer-maintenance local keys remain in older page code as compatibility/recovery inputs. Their primary loaders and mutations already target the tables above, but a production-data verification is required before deleting those compatibility paths. The local order closure override and printer PM log representations are the highest deferred risks: verify their corresponding remote columns/rows in the deployed project before removal. No schema was guessed for them in this milestone.

## Migration and deployment

A migration is required if `product_recipes` is not already present. Do **not** apply it automatically.

1. Apply existing workflow migrations `202607160001` through `202607160004` in filename order if not already recorded.
2. Apply `supabase/migrations/202607160005_product_recipe_library.sql`.
3. Apply `supabase/migrations/202607160006_product_recipe_revision_history.sql` to add the recipe model’s immutable `revision_history` snapshots.
4. Deploy the application files.

Verification queries:

```sql
select to_regclass('public.product_recipes') as product_recipes;
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='product_recipes'
order by ordinal_position;
select relrowsecurity from pg_class where oid='public.product_recipes'::regclass;
select policyname, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename='product_recipes';
select user_id, recipe_key, revision_number, count(*)
from public.product_recipes group by 1,2,3 having count(*) > 1;
```

## Required manual multi-device tests

1. Sign in as the same user in desktop browser A and mobile/tablet browser B.
2. Create a recipe from a completed Production job in A; reload B and confirm the same revision, snapshot, price, and status.
3. Revise and deactivate in B; reload A and confirm both revisions and the remote active state.
4. Clear all site storage in A, sign in again, and confirm recipes and completed Production jobs reload.
5. Disconnect A, attempt a recipe save, and confirm the warning says a recovery copy was retained and no success is claimed.
6. Reconnect and verify the recovery copy is not silently uploaded. In DevTools run `OliPolyRecipeRecovery.review()`; after reviewing the returned rows, run `await OliPolyRecipeRecovery.importMissing()`. Only stable IDs absent from Supabase are inserted; existing remote IDs are never patched by recovery import.
7. Create a newer remote change from B, then retain an older local recovery copy in A; confirm A displays the remote row and does not issue a write.
8. Exercise Quote acceptance through Production, Orders, Inventory reservation/consumption, Finance payment, Customer 360, Hub, Printer Dashboard, and Estimate vs. Actual on A; reload each view on B and compare IDs, timestamps, workflow status, totals snapshots, reservations, actuals, and payment values.
