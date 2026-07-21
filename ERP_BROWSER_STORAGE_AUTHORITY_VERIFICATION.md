# Browser Storage and Cloud Authority Verification Milestone

Date: 2026-07-21  
Scope: documentation-only repository verification under ERP Blueprint v1. No application code, tests, schema, migrations, RLS, grants, UI, data, or browser/cloud state was changed.

## Decision gate

**Gate result: Partially compliant.** The repository has clear Supabase authority for many ERP records, but active pages still keep several localStorage datasets that can act as fallback, recovery, or migration sources. The most important conflict is Inventory reset/rebuild code that deletes cloud inventory tables from a browser action; this needs a later corrective milestone, but no fix is included here.

Do **not** treat this document as proof that deployed browsers contain no legacy data. Runtime/browser verification is still required before deleting keys or changing migration behavior.

## Evidence categories

### Confirmed repository evidence

- Active repository search found `localStorage` use and no active `sessionStorage`, IndexedDB, CacheStorage, or `caches.*` API use outside documentation references.
- Authentication tokens are stored in `sb_token`, `sb_refresh_token`, `sb_user`, and `olipoly_auth_session_v1`.
- Quotes use `olipoly_quote_history_v3` as a non-durable browser recovery copy when cloud save/load is unavailable.
- Production Control uses `olipoly_production_jobs_v3` plus legacy production job keys for local migration/fallback and cloud mirroring.
- Inventory uses local material, finished-good, ledger, spool-pool, and supply keys alongside Supabase tables.
- Orders Admin has a browser closure override key, catalog key, reorder quote draft key, and reads the production jobs cache.
- Finance stores settings and a Hub dashboard summary in localStorage, but financial entries use Supabase.
- Workflow command retry identities are localStorage keys with the dynamic prefix `olipoly_workflow_command:`.
- Generic reliability snapshots use dynamic keys `olipoly_recovery_<page>_snapshot_v1` and `olipoly_recovery_<page>_dismissed_snapshot_v1`.

### Operator-supplied deployed evidence

No deployed browser storage contents, Supabase query results, or operator screenshots were supplied for this milestone. Treat all deployed-state claims as **Missing** until a human verifies them in an actual browser and Supabase project.

### Repository inference

- Cloud rows usually load before local rows where both are available, then local entries are shown as browser/recovery copies.
- Browser copies may be stale across devices because localStorage is device-local.
- Browser-generated IDs and timestamps exist for fallback records, local inventory ledger entries, catalog parts, drafts, PM logs, and command idempotency keys.
- Some local-to-cloud migration paths intentionally seed cloud from local rows when cloud is empty or when explicit import/rebuild actions run.

### Requires browser/runtime verification

- Which keys exist in live users' browsers.
- Whether old browsers still run older scripts that treat local data as authoritative.
- Whether deployed Supabase has all tables/RPCs referenced by the current repository.
- Whether offline/error paths preserve or discard pending user intent in live usage.
- Whether local recovery snapshots contain business records that must be exported before cleanup.

### Historical or abandoned behavior

Archived files were not treated as active runtime authority. `archive/` contains older browser-storage behavior and must not be restored as production behavior without a separate review.

## Active API surface inventory

- **localStorage:** Active use confirmed.
- **sessionStorage:** No active repository use confirmed.
- **IndexedDB:** No active repository use confirmed.
- **CacheStorage / browser caches as ERP data:** No active repository use confirmed.
- **Browser-generated identifiers:** Confirmed for fallback/local rows and retry identity keys.
- **Browser-generated timestamps:** Confirmed for saved snapshots, local updates, command retries, and some cloud payloads.

## Complete storage-key inventory table

| Exact key/path | Owning module/page | Stored data type | Contract classification | Authority role | Supabase authority when present | Read precedence | Write direction | Merge behavior | Failure behavior | Cross-device behavior | Stale-data risk | Can overwrite newer cloud? | Can bypass command authority? | Can deletion/rebuild erase cloud rows? | Recommended disposition | Evidence bucket |
|---|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `sb_token` | Shared auth, Quote, Orders, Production, Inventory, Finance, Customer 360 | string JWT | Partially compliant | auth-only | Supabase Auth | Browser token before/inside saved session | Supabase Auth -> browser | N/A | Missing/expired token disables cloud calls or triggers refresh | Device-local login | Medium | No ERP rows directly | No, but enables direct REST/RPC calls allowed by RLS | No | May remain as auth-only; never business authority | Confirmed repository evidence |
| `sb_refresh_token` | Shared auth | string JWT | Partially compliant | auth-only | Supabase Auth | Browser refresh token, then saved session | Supabase Auth -> browser | N/A | Refresh failure leaves existing session or signed-out state | Device-local login | Medium | No ERP rows directly | No, but refreshes access to REST/RPC | No | May remain as auth-only | Confirmed repository evidence |
| `sb_user` | Shared auth | user JSON | Compliant | cached profile | Supabase Auth user endpoint | Browser cache, refreshed from `/auth/v1/user` | Cloud -> browser | Replace | Failed fetch keeps cached user | Device-local | Low | No | No | No | May remain as cache | Confirmed repository evidence |
| `olipoly_auth_session_v1` | Shared auth | session JSON | Partially compliant | auth-only/cache | Supabase Auth | Token keys override saved session fields | Supabase Auth -> browser | Replace | Stale session can be read if token exists | Device-local | Medium | No ERP rows directly | No, but enables authorized calls | No | May remain as auth-only | Confirmed repository evidence |
| `olipoly_quote_history_v3` | Quote | array of quote recovery rows | Partially compliant | recovery-only, not durable | `quotes`; public response RPC `respond_to_quote_public` | Cloud quote list first; local rows only explicit recovery/review or remote failure | Cloud save first; fallback writes local | Upsert by `quoteNumber`; cloud/local displayed separately | Remote save failure writes `durable:false` local recovery | Not cross-device | High | Repository intends no, but manual loading stale local copy can re-save | Possibly if re-saving bypasses RPC paths | Quote delete targets cloud for cloud selection; local delete only local | Keep recovery-only with banner and explicit restore; later add expiry/export | Confirmed repository evidence |
| `olipoly_production_to_quote_draft_v1` | Production Control -> Quote handoff | object draft | Partially compliant | migration/handoff-only | `quotes`, `production_jobs` | Quote reads draft only when handoff/reorder path is used | Production writes browser draft; Quote may save cloud quote | Replace single draft | Cloud status failure can leave draft local only | Not cross-device | High | Yes if stale draft is saved as new cloud quote | Could bypass Production as estimate source if misused | No | Keep as short-lived handoff; clear after confirmed quote save | Confirmed repository evidence |
| `olipoly_reorder_quote_draft_v1` | Customer 360 / Orders Admin -> Quote | object reorder draft | Partially compliant | migration/handoff-only | `quotes`, `orders` | Quote reads when reorder path is used | Browser page writes draft, Quote may create cloud quote | Replace single draft | Local draft survives if navigation/save fails | Not cross-device | Medium | Can create a quote from stale completed order data | No direct command bypass | No | Keep short-lived handoff only; clear after load/save | Confirmed repository evidence |
| `olipoly_transfer` | Orders Admin legacy intake transfer | object transfer | Unable to verify from repository evidence | migration-only/legacy | `orders` | Browser transfer read on page load | Unknown legacy writer; active reader removes after load | None; single-use | Bad JSON ignored; removed after active load path | Not cross-device | High | Could populate stale order fields before save | Could bypass quote acceptance if used to make order manually | No | Remove after verifying no deployed writer remains | Repository inference |
| `olipoly_order_closure_overrides_v1` | Orders Admin | object keyed by order | Conflicting | browser-stored workflow state | `orders`; fulfillment workflow RPC | Browser override augments displayed closure/status facts | Browser only | Shallow merge by key with local `updated_at` | Survives cloud failure and can mask true cloud status | Not cross-device | High | Can visually supersede newer cloud facts | Yes, display state can bypass fulfillment command authority | No | Migrate/remove; closure state should come from `orders`/RPC snapshots | Confirmed repository evidence |
| `olipoly_catalog_parts_v1` | Orders Admin catalog/reorder | array of catalog parts | Partially compliant | cache/fallback | `catalog_parts` and `parts_catalog` references | Cloud catalog first, then local browser entries deduped | Save attempts cloud then always local | Dedupe by part numbers/revision/source order/key | Missing table/cloud error saves browser catalog only | Not cross-device | High | Potentially when stale local part is saved later | No workflow RPC bypass, but can bypass catalog cloud authority | No | Keep as recovery until cloud catalog is verified; then migrate/remove stale local entries | Confirmed repository evidence |
| `olipoly_production_jobs_v3` | Production Control; read by Inventory and Orders Admin | array of production jobs | Conflicting | fallback/cache/migration, sometimes mirror | `production_jobs`; workflow RPCs | Production cloud rows load when signed in, then local legacy rows may seed/mirror; Orders Admin reads cache for production status | Cloud <-> browser mirror; local writes after many actions | Merge unique jobs; local legacy migration; cloud save per job | Cloud load/save failure leaves local job state | Not reliably cross-device | Critical | Yes, local job cloud-save/import paths can update rows | Yes if status/local actions avoid command RPCs | Production deletion deletes cloud job by id | Remove as authority; keep export-only recovery after cloud verification | Confirmed repository evidence |
| `olipoly_production_jobs_v2` | Production Control legacy migration | array | Conflicting | migration-only legacy | `production_jobs` | Read during migration | Browser legacy -> current key/cloud possible | Merged with other job arrays | Bad/stale legacy rows can reappear | Not cross-device | Critical | Yes via migration/import | Yes | No direct delete path for legacy key | Remove after one-time export/migration review | Confirmed repository evidence |
| `olipoly_production_jobs_v1` | Production Control legacy migration | array | Conflicting | migration-only legacy | `production_jobs` | Read during migration | Browser legacy -> current key/cloud possible | Merged | Same as above | Not cross-device | Critical | Yes | Yes | No direct delete path | Remove after migration review | Confirmed repository evidence |
| `olipoly_production_jobs_local_v1` | Production Control legacy migration | array | Conflicting | migration-only legacy | `production_jobs` | Read during migration | Browser legacy -> current key/cloud possible | Merged | Same as above | Not cross-device | Critical | Yes | Yes | No direct delete path | Remove after migration review | Confirmed repository evidence |
| `olipoly_active_projects_local_v1` | Production Control legacy migration | array | Conflicting | migration-only legacy | `production_jobs` | Read during migration | Browser legacy -> current key/cloud possible | Merged | Same as above | Not cross-device | Critical | Yes | Yes | No direct delete path | Remove after migration review | Confirmed repository evidence |
| `olipoly_active_projects_v1` | Production Control legacy migration | array | Conflicting | migration-only legacy | `production_jobs` | Read during migration | Browser legacy -> current key/cloud possible | Merged | Same as above | Not cross-device | Critical | Yes | Yes | No direct delete path | Remove after migration review | Confirmed repository evidence |
| `active_projects` | Production Control legacy migration | array | Conflicting | migration-only legacy | `production_jobs` | Read during migration | Browser legacy -> current key/cloud possible | Merged | Same as above | Not cross-device | Critical | Yes | Yes | No direct delete path | Remove after migration review | Confirmed repository evidence |
| `olipoly_printer_pm_v3` | Production Control printer PM | array PM rows | Partially compliant | cache/fallback | `printer_pm` | Cloud PM loaded when available; local default/fallback otherwise | Browser local and cloud upsert | Upsert by machine/cloud row | Cloud failure keeps browser PM | Not cross-device | Medium | Yes when local PM later cloud-saved | No ERP workflow command bypass | No | Keep cache only until PM cloud authority verified | Confirmed repository evidence |
| `olipoly_printer_pm_log_v1` | Production Control printer PM | array PM log rows | Conflicting | local-only history | No active table found | Browser only | Browser only | Append/prepend local | Local loss loses PM log | Not cross-device | High | N/A | No | No | Add cloud authority in a future PM milestone or declare obsolete | Confirmed repository evidence |
| `olipoly_raw_material_inventory_v3` | Inventory, Production Control | array raw material rows | Conflicting | cache/fallback/migration | `raw_material_inventory`; inventory RPCs | Inventory cloud load when signed in; local fallback/migration when unavailable/empty | Cloud <-> browser; import/rebuild can write cloud | Merge/upsert by ids and material fields | Cloud failure keeps local quantities | Not cross-device | Critical | Yes through local save/import/rebuild paths | Yes if local quantity edits bypass reservation/consumption RPCs | Yes: Inventory reset deletes cloud raw rows | Remove as authority; keep export-only recovery after read-only verification | Confirmed repository evidence |
| `olipoly_finished_goods_inventory_v3` | Inventory, Production Control | array finished goods | Conflicting | cache/fallback/migration | `finished_goods_inventory` | Cloud first when available; local fallback | Cloud <-> browser | Merge/upsert | Cloud failure keeps local | Not cross-device | High | Yes | Potential inventory command bypass | Yes: Inventory reset deletes cloud finished rows | Remove as authority; keep recovery only | Confirmed repository evidence |
| `olipoly_non_filament_supplies_v1` | Inventory, Production Control | array supply rows | Conflicting | cache/fallback | `non_filament_materials` | Cloud first when available; local fallback | Cloud <-> browser | Upsert/local replace | Cloud failure keeps local | Not cross-device | High | Yes | Can bypass inventory authority for supplies | Yes: Inventory reset deletes cloud supply rows | Remove as authority; keep recovery only | Confirmed repository evidence |
| `olipoly_inventory_ledger_v2` | Inventory, Production Control | array transaction/ledger rows | Conflicting | local ledger/cache | `inventory_transactions`; inventory RPC events | Cloud transactions loaded by Inventory; Production also appends local ledger | Browser local and cloud transaction tables both exist | Local prepend capped at 5000; cloud fetched separately | Cloud failure leaves local ledger | Not cross-device | High | Possible duplicate/stale movement evidence | Yes if treated as consumption/reservation evidence | Yes: Inventory reset deletes cloud transactions | Stop writing authoritative ledger locally; export-only recovery | Confirmed repository evidence |
| `olipoly_inventory_ledger_v1` | Inventory legacy migration | array ledger rows | Conflicting | migration-only legacy | `inventory_transactions` | Legacy read during migration | Browser legacy -> current/cloud possible | Merged | Stale ledger can reappear | Not cross-device | High | Possible | Yes if imported as transactions | No direct legacy delete | Remove after migration review | Confirmed repository evidence |
| `olipoly_spool_pool_v1` | Inventory, Production Control | object spool pool/settings | Partially compliant | cache/fallback/settings | `inventory_spool_pool` | Cloud spool pool when available; local fallback | Cloud <-> browser | Replace one user setting row | Cloud failure keeps local spool pool | Not cross-device | Medium | Yes when local saved later | Could influence inventory allocations | Yes: Inventory reset deletes cloud spool pool | Keep only if explicitly non-authoritative settings cache | Confirmed repository evidence |
| `olipoly_finished_goods_inventory_v3` | Inventory reset/rebuild | array | Conflicting | inventory data | `finished_goods_inventory` | Same as above | Same as above | Same as above | Same as above | Same as above | High | Yes | Yes | Yes | Same as above | Confirmed repository evidence |
| `olipoly_hub_workflow_v3` | Production backup set / historical Hub workflow | unknown JSON | Unable to verify from repository evidence | backup/migration-only | No active authoritative table identified | Included in backup key list | Unknown | Unknown | Unknown | Not cross-device | Unknown | Unable to verify | Unable to verify | No active delete found | Requires runtime verification; do not restore as authority | Repository inference |
| `olipoly_linked_workflow_recovery_v1` | Production linked workflow recovery | JSON recovery rows | Partially compliant | recovery-only | `production_jobs`, `orders`, project events, workflow RPCs | Read during linked workflow recovery paths | Browser recovery | Append/replace inferred | Used when linked workflow operations fail | Not cross-device | High | Possible if replayed after cloud changes | Possible if recovery replay avoids expected-updated-at | No | Keep only as explicit recovery queue with stale checks | Confirmed repository evidence |
| `olipoly_workflow_draft_v1` | Hub -> Production Control | object workflow draft | Partially compliant | handoff-only | `production_jobs` / workflow commands | Production reads draft banner | Hub writes, Production can dismiss | Replace/dismiss flag | Cloud not involved until user acts | Not cross-device | Medium | Can seed stale production work | Could bypass command authority if converted directly | No | Keep short-lived; clear/dismiss after use | Confirmed repository evidence |
| `olipoly_workflow_command:<scope>:<orderNumber>:<command>:<expectedUpdatedAt>` | Shared workflow status | string UUID/idempotency key | Compliant | retry identity only | Workflow RPCs: `reserve_production_material`, `release_production_material_reservation`, `consume_production_attempt`, `post_order_finance_income`, `append_finance_correction`, `production_workflow_command`, `fulfillment_workflow_command`, `preacceptance_production_command` | Reuses existing retry key for same scope/order/command/expected timestamp | Browser-generated -> RPC request body/header | Removed on success | Preserves identity across browser retry; stale if expected timestamp stale | Device-local | Low/Medium | No by itself; RPC should enforce expected timestamp | No if RPC command authority holds | No | May remain; add TTL cleanup later | Confirmed repository evidence |
| `olipoly_finance_settings_v1` | Finance Pro | object settings | Compliant | user preference/settings | No ERP financial-entry table; could map to user settings later | Browser only | Browser only | Replace | Save failure affects defaults only | Not cross-device | Low | No | No | No | May remain as local preference | Confirmed repository evidence |
| `olipoly_finance_dashboard_summary_v1` | Finance Pro -> Hub | object dashboard summary | Partially compliant | cache/read model | `financial_entries` | Hub can read local summary; Finance computes from current entries | Cloud entries -> browser summary | Replace | Hub may show stale summary if Finance not opened/synced | Not cross-device | Medium | No writes to cloud | No | No | Keep cache only with visible stale timestamp | Confirmed repository evidence |
| `olipoly_recovery_<page>_snapshot_v1` | ERP Reliability | page form snapshot | Partially compliant | recovery-only | Page-specific tables | Browser snapshot appears when meaningful and not dismissed | Browser only | Replace by page snapshot | Captures unsaved local changes before unload/cloud failure | Not cross-device | High | Yes if restored and re-saved over cloud | Potentially, depending page save path | No | May remain recovery-only; restore must require review | Confirmed repository evidence |
| `olipoly_recovery_<page>_dismissed_snapshot_v1` | ERP Reliability | string timestamp | Compliant | UI preference/recovery marker | N/A | Browser only | Browser only | Replace | Bad value only affects banner visibility | Not cross-device | Low | No | No | No | May remain | Confirmed repository evidence |
| `olipoly_erp_health_v1` | ERP Reliability | object health/status | Compliant | diagnostic cache | N/A | Browser only | Browser only | Merge by page | Stale diagnostics possible | Not cross-device | Low | No | No | No | May remain diagnostic-only | Confirmed repository evidence |
| `olipoly_last_recovery_export_at` | ERP Reliability | ISO timestamp string | Compliant | diagnostic marker | N/A | Browser only | Browser only | Replace | Stale date only affects status panel | Not cross-device | Low | No | No | No | May remain | Confirmed repository evidence |
| `olipoly_erp_event_log_v1` | Hub / ERP core events | array events | Partially compliant | local activity log/read model | `project_events` exists for durable business events | Browser activity read/clear | Browser only unless event bridge also posts elsewhere | Append/cap via ERP core | Clear loses local activity only | Not cross-device | Medium | No cloud overwrite | No, unless treated as business event authority | No | Keep local UX log only; durable events must use `project_events` | Confirmed repository evidence |
| `olipoly_knowledge_favorites_v1` | ERP Knowledge Library | array favorites | Compliant | UI preference | N/A | Browser only | Browser only | Replace | Local preference loss only | Not cross-device | Low | No | No | No | May remain | Confirmed repository evidence |
| `olipoly_knowledge_recent_v1` | ERP Knowledge Library | array recent articles | Compliant | UI preference | N/A | Browser only | Browser only | Replace | Local preference loss only | Not cross-device | Low | No | No | No | May remain | Confirmed repository evidence |

## Cloud-authority precedence matrix

| Domain | Authoritative cloud object/RPC | Browser source allowed? | Current repository precedence | Contract classification | Required manual verification |
|---|---|---|---|---|---|
| Customer intake and Quotes | `quotes`; `respond_to_quote_public`; accepted snapshot/quote acceptance RPCs from migrations | Recovery drafts only | Cloud quote rows load first; `olipoly_quote_history_v3` is labeled non-durable recovery | Partially compliant | Verify saved quote load never defaults to local when cloud rows exist; verify local recovery restore requires explicit choice |
| Retail vs Business quote behavior | One Quote page with customer type fields | UI preference/draft only | Single quote implementation uses customer type fields and shared totals snapshot; local quote history can include either type | Partially compliant | Verify retail/business browser drafts do not fork pricing or save two quote engines |
| Orders and public tracking | `orders`, `order_tracking_public`, workflow RPCs, `project_events` | No authoritative browser order status | Orders Admin uses cloud orders but also closure override and production job local cache | Partially compliant | Verify `olipoly_order_closure_overrides_v1` cannot mark a cloud-stale order complete in UI/workflow |
| Production workflow and actuals | `production_jobs`; workflow RPCs including production/fulfillment/preacceptance commands | Export/recovery only | Production writes local `olipoly_production_jobs_v3` frequently and saves to cloud when possible | Conflicting | Verify offline status changes cannot later overwrite newer cloud workflow state |
| Inventory reservations, attempts, consumption | `raw_material_inventory`, `inventory_transactions`, inventory settings/spool tables; RPCs for reserve/release/consume | Recovery/export only | Inventory and Production keep local inventory arrays and ledger; reset deletes cloud inventory rows | Conflicting | Verify reset/rebuild UI cannot erase production inventory rows without operator-approved command authority |
| Finance entries and posting identities | `financial_entries`; `post_order_finance_income`; `append_finance_correction` | Preferences/dashboard cache only | Finance entries use Supabase; retry identities use workflow command keys; settings/dashboard local | Partially compliant | Verify finance posting cannot be duplicated by stale retry key or direct local dashboard state |
| Assets and job files | Job asset tables/storage from asset milestone/migrations; browser file inputs | Temporary form state only | No active localStorage key found for asset blobs/files; no IndexedDB/cache use found | Unable to verify from repository evidence | Verify actual browser upload page does not retain assets in localStorage/cache as ERP data |
| Parts/catalog | `catalog_parts`; `parts_catalog` | Recovery cache only until table verified | Orders Admin saves to cloud if possible but always writes local `olipoly_catalog_parts_v1` | Partially compliant | Verify cloud catalog table existence and resolve dual table naming (`catalog_parts` vs `parts_catalog`) |
| Printer PM | `printer_pm`; missing PM log table | Cache only | PM rows sync to cloud/local; PM log is local-only | Partially compliant | Verify PM log is not business-authoritative or add cloud table in future PM milestone |
| Settings and counters | `next_document_counter`; `inventory_settings`; `inventory_spool_pool`; local user settings | Settings cache allowed; counters must be cloud | Quote/order counters use browser fallbacks in some paths; inventory settings/spool can save cloud/local | Partially compliant | Verify document number browser fallbacks cannot create duplicate cloud quote/order identifiers |
| Fundraiser | Deferred extension gate only | None | Fundraiser docs exist, but no implementation/storage authority should be added in this milestone | Missing | Treat any fundraiser storage as out of scope until explicit extension gate opens |

## Browser-write risk matrix

| Risk | Affected keys/paths | Impact | Evidence classification | Mitigation recommendation |
|---|---|---|---|---|
| Browser copy overwrites newer cloud record | `olipoly_production_jobs_v3`, legacy job keys, inventory keys, catalog key, quote history after restore | Stale device can update cloud with old workflow/inventory/catalog/quote data | Repository inference | Require expected `updated_at` on all cloud writes and block local replay unless explicitly reviewed |
| Browser bypasses command authority | Production job local actions; inventory local arrays/ledger; order closure overrides | Status, reservation, consumption, fulfillment, or posting state may be represented without RPC command | Confirmed repository evidence | Route every authoritative status/inventory/finance mutation through command RPCs only |
| Browser deletion/rebuild erases cloud rows | Inventory reset/rebuild paths deleting `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, `inventory_spool_pool` | Cloud inventory loss from browser UI action | Confirmed repository evidence | Future milestone should disable cloud delete/rebuild from local browser state |
| Duplicate identifiers from browser fallback | Quote/order/part/job IDs using `Date.now`, `Math.random`, `crypto.randomUUID` | Duplicate or non-sequential business IDs, hard reconciliation | Confirmed repository evidence | Counters from cloud RPC only for business document numbers; browser UUIDs only transient/recovery |
| Local-only financial/dashboard facts | `olipoly_finance_dashboard_summary_v1`, Finance settings | Stale Hub metrics; preferences not cross-device | Confirmed repository evidence | Display `savedAt`; never post finance entries from dashboard summary |
| Local assets cached unintentionally | Browser file inputs, recovery snapshots | Sensitive job files or thumbnails retained locally | Requires browser/runtime verification | Verify DevTools Application/Storage after uploads; do not store blobs in localStorage |

## Keys that must never be treated as authoritative

- `olipoly_quote_history_v3`
- `olipoly_production_to_quote_draft_v1`
- `olipoly_reorder_quote_draft_v1`
- `olipoly_transfer`
- `olipoly_order_closure_overrides_v1`
- `olipoly_catalog_parts_v1`
- `olipoly_production_jobs_v3`
- `olipoly_production_jobs_v2`
- `olipoly_production_jobs_v1`
- `olipoly_production_jobs_local_v1`
- `olipoly_active_projects_local_v1`
- `olipoly_active_projects_v1`
- `active_projects`
- `olipoly_raw_material_inventory_v3`
- `olipoly_finished_goods_inventory_v3`
- `olipoly_non_filament_supplies_v1`
- `olipoly_inventory_ledger_v2`
- `olipoly_inventory_ledger_v1`
- `olipoly_spool_pool_v1`
- `olipoly_hub_workflow_v3`
- `olipoly_linked_workflow_recovery_v1`
- `olipoly_workflow_draft_v1`
- `olipoly_finance_dashboard_summary_v1`
- `olipoly_erp_event_log_v1`
- `olipoly_recovery_<page>_snapshot_v1`

## Recovery-only keys that may remain

- `olipoly_quote_history_v3`, if the UI continues to label it non-durable and requires explicit recovery review.
- `olipoly_production_to_quote_draft_v1`, only as a short-lived Production-to-Quote handoff.
- `olipoly_reorder_quote_draft_v1`, only as a short-lived reorder handoff.
- `olipoly_linked_workflow_recovery_v1`, only if replay requires cloud freshness checks.
- `olipoly_recovery_<page>_snapshot_v1`, only for user-reviewed unsaved form recovery.
- `olipoly_recovery_<page>_dismissed_snapshot_v1`, `olipoly_erp_health_v1`, and `olipoly_last_recovery_export_at` as diagnostic/recovery metadata.
- `olipoly_workflow_command:<scope>:<orderNumber>:<command>:<expectedUpdatedAt>`, as retry identity only.

## Keys requiring migration/removal

- Legacy production job keys: `olipoly_production_jobs_v2`, `olipoly_production_jobs_v1`, `olipoly_production_jobs_local_v1`, `olipoly_active_projects_local_v1`, `olipoly_active_projects_v1`, `active_projects`.
- Inventory authority keys: `olipoly_raw_material_inventory_v3`, `olipoly_finished_goods_inventory_v3`, `olipoly_non_filament_supplies_v1`, `olipoly_inventory_ledger_v2`, `olipoly_inventory_ledger_v1`, `olipoly_spool_pool_v1`.
- Workflow/display authority keys: `olipoly_order_closure_overrides_v1`, `olipoly_hub_workflow_v3`.
- Catalog fallback key `olipoly_catalog_parts_v1`, after cloud catalog authority and table naming are verified.
- PM log key `olipoly_printer_pm_log_v1`, unless it is explicitly downgraded to local-only notes.
- Legacy intake key `olipoly_transfer`, after confirming no deployed writer remains.

## Consolidated read-only Supabase JSONB verification query

This query is optional and read-only. It is useful when repository inspection is not enough to confirm deployed table/RPC availability, table row counts, and whether storage buckets exist. Do not execute it from this milestone unless an operator explicitly approves a Supabase verification session.

```sql
select jsonb_build_object(
  'checked_at', now(),
  'tables', (
    select jsonb_object_agg(t, to_regclass('public.' || t)::text)
    from unnest(array[
      'quotes','orders','production_jobs','raw_material_inventory','finished_goods_inventory',
      'non_filament_materials','inventory_transactions','inventory_settings','inventory_spool_pool',
      'financial_entries','catalog_parts','parts_catalog','printer_pm','project_events',
      'order_tracking_public','product_recipes'
    ]) as t
  ),
  'rpcs', (
    select jsonb_object_agg(r, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r))
    from unnest(array[
      'next_document_counter','respond_to_quote_public','reserve_production_material',
      'release_production_material_reservation','consume_production_attempt',
      'post_order_finance_income','append_finance_correction','production_workflow_command',
      'fulfillment_workflow_command','preacceptance_production_command'
    ]) as r
  ),
  'storage_buckets', (
    select coalesce(jsonb_agg(name order by name), '[]'::jsonb)
    from storage.buckets
    where name ilike '%asset%' or name ilike '%job%' or name ilike '%quote%'
  )
) as browser_storage_authority_verification;
```

## Manual browser verification checklist

1. Open DevTools -> Application -> Local Storage on each active ERP page: Quote, Orders Admin, Production Control, Inventory Control, Finance Pro, Customer 360, Product Recipes, Hub, public tracking, and asset upload surfaces.
2. Export current localStorage before changing anything.
3. Confirm `sessionStorage`, IndexedDB, CacheStorage, and Service Worker caches do not contain ERP business records.
4. Sign in on a clean browser profile and verify cloud-first loads for Quotes, Orders, Production, Inventory, Finance, Catalog, PM, and Settings.
5. Simulate network failure, save a Quote, and verify any `olipoly_quote_history_v3` record is labeled non-durable recovery only.
6. Seed a stale `olipoly_production_jobs_v3` row, then load Production Control while cloud has a newer row; verify the stale local row cannot overwrite cloud workflow state.
7. Seed stale inventory keys, then load Inventory Control; verify local quantities cannot overwrite cloud quantities or reservations.
8. Verify Inventory reset/rebuild actions do not run in production until a corrective PR removes cloud deletion from browser reset paths.
9. Verify Orders Admin closure override cannot visually complete or close an order contrary to cloud `orders` state.
10. Verify public tracking reads cloud/public tables only and no local tracking state is required.
11. Verify job asset upload/download does not persist blobs, previews, signed URLs, or file metadata in localStorage, IndexedDB, CacheStorage, or browser caches as ERP authority.
12. Verify Finance posting retries use command/RPC idempotency and that `olipoly_finance_dashboard_summary_v1` cannot create or update `financial_entries`.
13. Verify retail and business Quote flows use the same saved quote/totals pathway and that customer type only changes displayed fields.
14. Verify fundraiser pages/features do not create browser storage keys until a separate extension gate is approved.

## Exactly one small future corrective milestone

**Milestone: Inventory browser reset cloud-delete guard.** Documentation evidence shows Inventory reset/rebuild paths can delete cloud rows from `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, and `inventory_spool_pool` from a browser action. The smallest corrective milestone is to remove or hard-disable browser-initiated cloud deletes/rebuilds from local inventory state, leaving only export/recovery of local inventory keys and authoritative inventory mutations through reviewed Supabase RPC/table paths. No schema redesign, Inventory redesign, UI redesign, or historical cleanup should be included.

## Out-of-scope confirmations

- No UI redesign.
- No schema redesign.
- No Finance redesign.
- No Inventory redesign.
- No workflow redesign.
- No fundraiser implementation.
- No historical cleanup.
- No SQL execution.
- No browser/cloud data modification.
