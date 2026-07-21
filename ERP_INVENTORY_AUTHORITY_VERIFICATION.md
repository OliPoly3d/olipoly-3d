# Inventory Command Authority and Consumption Lifecycle Verification

Documentation-only milestone for ERP Blueprint v1.

## Scope

This milestone verifies repository evidence for Inventory command authority and consumption lifecycle boundaries. It does **not** implement fixes and does **not** change application code, migrations, schema, RLS, grants, data, tests, or UI.

Out of scope: workflow authority redesign, Quote acceptance, Finance redesign, fundraiser work, UI redesign, historical cleanup, migrations, and deployed data mutation.

## Classification key

Each reviewed contract is classified only as one of:

- Compliant
- Partially compliant
- Conflicting
- Missing
- Unable to verify from repository evidence

## Evidence separation

### Confirmed repository evidence

| Area | Evidence | Classification |
| --- | --- | --- |
| Domain map | Inventory Control is documented as Inventory authority for items/rolls, reservations, movements, and adjustments; Production consumes reservation/consume/release/scrap commands with job/attempt evidence. | Compliant |
| Lifecycle map | The lifecycle document states no reservation at Estimate/Waiting for Customer, reserve at Ready to Print, capture actuals/scrap at Print Complete/QC, consume/release at QC Pass, preserve actual consumption/scrap on Needs Reprint, release unused reservation on Cancel, and no unexplained live reservation at Closed. | Compliant |
| Reservation decision helper | `js/inventory-lifecycle.js` centralizes reservation states and transition actions, including `reserve`, `keep`, `capture_actuals_keep_reservation`, `consume_and_release`, `consume_and_reserve_reprint`, and `preserve_consumed_no_reserve`. | Partially compliant |
| Attempt idempotency helper | `attemptAlreadyConsumed(job)` checks the current attempt key against `production_attempts[*].consumed_at`. | Partially compliant |
| Production UI lifecycle use | Production status changes call `reservationAction`, then invoke `consumeCapturedAttempt` for QC Pass and Needs Reprint re-entry, rebuild/release reservations, and clear current-attempt fields when reprinting. | Partially compliant |
| Browser production direct writes | `cloudSaveJob()` strips workflow status and actual fields from ordinary Production upserts, but still writes `production_jobs` directly from the browser for non-workflow fields. | Partially compliant |
| Workflow RPC evidence | The workflow command migration defines `production_workflow_command`, validates Complete Print actuals, stores attempt payloads, uses correlation/event checks for idempotency, and updates orders/tracking projections. | Partially compliant |
| Needs Reprint RPC behavior | The workflow RPC resets top-level actual fields and roll usage on `needs_reprint` while storing new current-attempt payload metadata. | Conflicting |
| Inventory browser authority | Inventory Control reads/writes raw materials, non-filament supplies, finished goods, inventory settings, and spool pool rows directly through PostgREST using the logged-in browser token. | Partially compliant |
| Raw material inventory ownership | Inventory Control owns raw material forms, local keys, normalization, cloud load/save, manual adjustment, and delete/rebuild paths for `raw_material_inventory`. | Partially compliant |
| Non-filament materials | Inventory Control owns `non_filament_materials`; Production selects non-filament supplies for cost projection. Repository evidence does not confirm consumption commands for these materials. | Partially compliant |
| Finished goods | Inventory Control owns finished goods forms and direct PostgREST upsert into `finished_goods_inventory`; Production can add finished goods during consumption if lifecycle action is QC Pass. | Partially compliant |
| Spool pool | Inventory Control owns a local `olipoly_spool_pool_v1`, direct `inventory_spool_pool` sync, and `inventory_settings` fallback. | Partially compliant |
| Ledger / inventory transactions | Inventory Control has a local movement ledger, but cloud `inventory_transactions` writes are intentionally skipped because the deployed check constraint may not accept local ledger types. | Conflicting |
| Legacy/localStorage compatibility | Inventory Control carries multiple legacy raw/finished/local keys and Production/Inventory both retain browser localStorage fallbacks. | Partially compliant |
| Roll/lot traceability | Production stores `roll_usages` and actual filament structures; raw materials include roll labels, mounted/refill status, and spool metadata. No repository-enforced FK/constraint is visible. | Partially compliant |
| Finance cost projection boundary | Production calculates estimated material, supply, machine, design, post, revenue, and profit projections for its own dashboard. Finance Pro should be verified separately for cross-domain writes. | Partially compliant |
| Supabase inventory DDL | No checked-in migration in this repository creates or alters `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, `inventory_spool_pool`, or `inventory_settings`. | Missing |
| Inventory RLS/grants/policies | No checked-in migration in this repository defines inventory table policies/grants for those tables. | Missing |
| Inventory RPCs/triggers | No checked-in inventory reservation/consumption RPC or trigger was found. | Missing |

### Operator-supplied deployed evidence

No operator-supplied deployed query results are included in this repository milestone yet. The result-capture table below is reserved for the operator to paste read-only deployed-query outputs.

### Repository inference

| Inference | Basis | Classification |
| --- | --- | --- |
| Inventory is intended to be the business authority but currently browser-direct paths are a substantial part of the implementation. | Inventory Control directly writes raw, supply, finished, spool-pool, settings, and delete/rebuild rows with browser token. | Partially compliant |
| Production owns manufacturing attempt capture, while Inventory consumption appears to be invoked from Production UI rather than an Inventory RPC. | Production lifecycle code calls local consumption/reservation functions; repository has no inventory command RPC. | Conflicting |
| Consumption is intended to happen on QC Pass, not Complete Print. | Lifecycle helper maps Printing→QC to capture actuals/keep reservation and QC→Ready for Fulfillment to consume/release. | Compliant |
| Needs Reprint behavior is not fully aligned between repository documents and workflow RPC top-level fields. | Docs say preserve prior actual consumption/scrap; RPC clears top-level actual fields on `needs_reprint` while appending prior attempt evidence on Complete Print. | Partially compliant |
| Inventory transaction authority cannot be verified as durable because cloud ledger writes are disabled. | `cloudSaveLedger()` returns before writing. | Conflicting |
| Deployed schema may have drifted from repository migrations. | Inventory Control includes schema-cache/column fallback behavior for raw/supply saves and comments about deployed constraints. | Unable to verify from repository evidence |

### Requires deployed verification

- Actual deployed table schemas, constraints, generated columns, FK relationships, and indexes for inventory tables.
- RLS enabled status and policies for inventory tables.
- Effective privileges for `anon`, `authenticated`, and `service_role` on inventory tables and functions.
- Whether `inventory_transactions` exists, its allowed transaction types, and whether any deployed trigger/RPC populates it.
- Whether browser-authenticated users can directly mutate inventory quantities or only command endpoints.
- Whether production attempts can be consumed more than once in deployed data.
- Whether Needs Reprint rows preserve prior consumed attempts and reserve additional material only once.
- Whether raw roll/lot references in consumption rows point to real raw inventory rows.
- Whether Finance tables have direct writes to Inventory tables or Inventory-derived costs.
- Whether finished-goods inventory is authoritative in Inventory only or can also be changed by Production/Finance/Orders paths.

### Historical or abandoned behavior

- LocalStorage inventory keys `olipoly_raw_material_inventory_v1/v2/v3`, `olipoly_finished_goods_inventory_v1/v2/v3`, `finished_goods`, and `olipoly_spool_pool_v1` remain for compatibility and migration/recovery.
- `inventory_transactions` cloud writes are currently bypassed because deployed constraints reportedly reject local ledger categories.
- Inventory Control contains cloud rebuild/delete paths that delete all user cloud rows for several inventory tables; treat these as operational recovery paths requiring deployed grant verification.

## Contract review

| Contract | Classification | Repository finding |
| --- | --- | --- |
| Raw material inventory ownership | Partially compliant | Inventory Control owns raw material UI/local/cloud paths, but deployed DB authority and grants are not checked in. |
| Spool-pool ownership and lifecycle | Partially compliant | Inventory Control owns local pool and cloud primary/fallback sync; lifecycle rules are not enforced by checked-in DB objects. |
| Non-filament materials | Partially compliant | Inventory Control owns supply CRUD; Production projects supply costs; consumption/reservation lifecycle is not proven. |
| Inventory reservations | Partially compliant | Helper and Production UI implement reservations in job payloads/raw reserved grams; no inventory RPC/constraint proves authority. |
| Consumption timing | Compliant | Repository lifecycle maps consumption to QC Pass. |
| Production-attempt consumption | Partially compliant | Attempt helper and Production code indicate attempt-level consumption, but no deployed data enforcement is proven. |
| Needs Reprint behavior | Conflicting | Intended to preserve prior attempt evidence; RPC clears top-level actual fields on Needs Reprint and relies on payload history. |
| Scrap recording | Partially compliant | Complete Print captures scrap and attempt payload; durable inventory transaction authority is missing. |
| Roll/lot traceability | Partially compliant | Roll usage fields and roll labels exist; no checked-in FK/constraints prove traceability. |
| Inventory transaction authority | Conflicting | Local ledger exists but cloud ledger writes are disabled; no inventory command RPC is checked in. |
| Idempotency and retry behavior | Partially compliant | Workflow command RPC has correlation/event checks; inventory consumption idempotency is only visible in helper/app logic. |
| Reversal and correction behavior | Missing | No authoritative inventory reversal/correction RPC or ledger contract found. |
| Finished-goods inventory | Partially compliant | Inventory Control directly owns CRUD; Production may add finished goods during QC Pass consumption. |
| Production closeout interaction | Partially compliant | Production closeout messaging references inventory/history and lifecycle code consumes on QC Pass; no DB transaction boundary is proven. |
| Finance cost projection boundaries | Partially compliant | Production projects manufacturing costs; deployed Finance/Inventory cross-domain writes need verification. |
| Browser direct-write paths | Conflicting | Inventory Control uses browser token direct PostgREST mutations for Inventory authority tables. |
| Supabase tables/RPCs/functions/triggers/policies/grants | Unable to verify from repository evidence | Production workflow migrations are checked in; inventory authority DDL/RLS/grants are not. |
| Legacy/localStorage compatibility paths | Partially compliant | Compatibility exists, but it weakens command authority unless deployed cloud authority is proven. |


## Recommended consolidated deployed verification query

> Recommended operator check: run this single read-only SQL statement first in the deployed/staging Supabase SQL editor. It returns exactly one row with one JSONB column named `inventory_authority_verification`. The individual queries later in this document remain diagnostic follow-ups when a section needs deeper inspection or if the deployed schema differs from the expected inventory tables.
>
> This statement uses only `SELECT` CTEs and JSON aggregation. It does not create temporary tables, functions, migrations, DDL, DML, or data mutations. It intentionally returns metadata, counts, classifications, identifiers needed for diagnosis, and function/policy definitions; it does not return customer-sensitive row contents.
>
> PostgreSQL validates referenced relations before execution. This consolidated query handles optional columns through `to_jsonb(row)->>'column_name'`, but the core tables referenced by the existing verification checks must exist for the data-quality sections to run. If a deployed table is absent, capture the error below and use the metadata follow-up queries to confirm the actual schema.

```sql
with target_tables(table_name, authority_area) as (
  values
    ('raw_material_inventory', 'raw_material_authority'),
    ('finished_goods_inventory', 'finished_goods_authority'),
    ('non_filament_materials', 'non_filament_authority'),
    ('inventory_transactions', 'inventory_transaction_authority'),
    ('inventory_spool_pool', 'spool_pool_authority'),
    ('inventory_settings', 'inventory_settings_authority'),
    ('production_jobs', 'production_consumption_lifecycle'),
    ('orders', 'orders_boundary'),
    ('financial_entries', 'finance_boundary'),
    ('finance_entries', 'finance_boundary')
), relevant_relations as (
  select tt.table_name, tt.authority_area, c.oid, n.nspname as table_schema,
         c.relrowsecurity, c.relforcerowsecurity
  from target_tables tt
  left join pg_class c on c.relname = tt.table_name
  left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.oid is null or n.nspname = 'public'
), relevant_columns as (
  select table_name,
         jsonb_agg(jsonb_build_object(
           'column_name', column_name,
           'ordinal_position', ordinal_position,
           'data_type', data_type,
           'udt_name', udt_name,
           'is_nullable', is_nullable,
           'column_default', column_default,
           'is_generated', is_generated,
           'generation_expression', generation_expression
         ) order by ordinal_position) as columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
  group by table_name
), relevant_constraints as (
  select conrelid::regclass::text as table_name,
         jsonb_agg(jsonb_build_object(
           'constraint_name', conname,
           'constraint_type', contype,
           'definition', pg_get_constraintdef(oid)
         ) order by conname) as constraints
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and conrelid::regclass::text in (select table_name from target_tables)
  group by conrelid::regclass::text
), relevant_indexes as (
  select tablename as table_name,
         jsonb_agg(jsonb_build_object('index_name', indexname, 'definition', indexdef) order by indexname) as indexes
  from pg_indexes
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
  group by tablename
), relevant_policies as (
  select tablename as table_name,
         jsonb_agg(jsonb_build_object(
           'policy_name', policyname,
           'permissive', permissive,
           'roles', roles,
           'command', cmd,
           'qual', qual,
           'with_check', with_check
         ) order by policyname) as policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
  group by tablename
), table_privileges as (
  select t.table_name, r.role_name, p.privilege,
         case when to_regclass('public.' || t.table_name) is null then null
              else has_table_privilege(r.role_name, 'public.' || t.table_name, p.privilege)
         end as has_privilege
  from target_tables t
  cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
  cross join (values ('select'), ('insert'), ('update'), ('delete')) as p(privilege)
), table_privileges_json as (
  select table_name,
         jsonb_object_agg(role_name, role_privileges order by role_name) as effective_privileges
  from (
    select table_name, role_name,
           jsonb_object_agg(privilege, has_privilege order by privilege) as role_privileges
    from table_privileges
    group by table_name, role_name
  ) rp
  group by table_name
), schema_report as (
  select jsonb_agg(jsonb_build_object(
    'table_name', rr.table_name,
    'authority_area', rr.authority_area,
    'exists', rr.oid is not null,
    'rls_enabled', rr.relrowsecurity,
    'rls_forced', rr.relforcerowsecurity,
    'columns', coalesce(rc.columns, '[]'::jsonb),
    'constraints', coalesce(rcon.constraints, '[]'::jsonb),
    'indexes', coalesce(ri.indexes, '[]'::jsonb),
    'policies', coalesce(rp.policies, '[]'::jsonb),
    'effective_privileges', coalesce(tpj.effective_privileges, '{}'::jsonb)
  ) order by rr.table_name) as value
  from relevant_relations rr
  left join relevant_columns rc using (table_name)
  left join relevant_constraints rcon using (table_name)
  left join relevant_indexes ri using (table_name)
  left join relevant_policies rp using (table_name)
  left join table_privileges_json tpj using (table_name)
), relevant_functions as (
  select jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', p.proname,
    'signature', p.oid::regprocedure::text,
    'security_definer', p.prosecdef,
    'volatility', p.provolatile,
    'arguments', pg_get_function_arguments(p.oid),
    'return_type', pg_get_function_result(p.oid),
    'acl', p.proacl::text,
    'definition', pg_get_functiondef(p.oid)
  ) order by p.proname, p.oid::regprocedure::text) as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname ilike '%inventory%' or p.proname ilike '%material%' or p.proname ilike '%reserve%' or
      p.proname ilike '%consume%' or p.proname ilike '%production_workflow%' or p.proname ilike '%workflow_command%' or
      pg_get_functiondef(p.oid) ~* '(raw_material_inventory|finished_goods_inventory|non_filament_materials|inventory_transactions|inventory_spool_pool|financial_entries|finance_entries)'
    )
), relevant_triggers as (
  select jsonb_agg(jsonb_build_object(
    'event_table', event_object_table,
    'trigger_name', trigger_name,
    'action_timing', action_timing,
    'event_manipulation', event_manipulation,
    'action_statement', action_statement
  ) order by event_object_table, trigger_name, event_manipulation) as value
  from information_schema.triggers
  where event_object_schema = 'public'
    and (
      event_object_table in (select table_name from target_tables)
      or action_statement ~* '(raw_material_inventory|finished_goods_inventory|non_filament_materials|inventory_transactions|financial_entries|finance_entries)'
    )
), inventory_transactions_normalized as (
  select to_jsonb(t) as row_json,
         t.id::text as id,
         t.created_at,
         nullif(coalesce(to_jsonb(t)->>'user_id', ''), '') as user_id,
         nullif(coalesce(to_jsonb(t)->>'transaction_type', to_jsonb(t)->>'type', to_jsonb(t)->>'movement_type', ''), '') as txn_type,
         nullif(coalesce(to_jsonb(t)->>'production_job_id', to_jsonb(t)->>'job_id', to_jsonb(t)->>'order_number', to_jsonb(t)->>'reference_id', to_jsonb(t)->>'source_id', ''), '') as production_link,
         nullif(coalesce(to_jsonb(t)->>'attempt_id', to_jsonb(t)->>'production_attempt_id', to_jsonb(t)->>'correlation_id', to_jsonb(t)->>'command_id', t.id::text, ''), '') as attempt_or_command,
         nullif(coalesce(to_jsonb(t)->>'item_type', to_jsonb(t)->>'inventory_kind', ''), '') as item_kind,
         nullif(coalesce(to_jsonb(t)->>'raw_material_roll_id', to_jsonb(t)->>'roll_id', ''), '') as roll_id,
         nullif(coalesce(to_jsonb(t)->>'quantity_grams', to_jsonb(t)->>'amount_grams', to_jsonb(t)->>'grams', to_jsonb(t)->>'quantity', ''), '')::numeric as qty
  from public.inventory_transactions t
), consumption as (
  select *
  from inventory_transactions_normalized
  where lower(coalesce(txn_type, '')) similar to '%(consume|consumption|usage|raw_usage|production)%'
), production_attempts as (
  select pj.id::text as production_job_id,
         nullif(coalesce(to_jsonb(pj)->>'user_id', ''), '') as user_id,
         nullif(coalesce(to_jsonb(pj)->>'order_number', ''), '') as order_number,
         attempt.value->>'id' as attempt_id,
         attempt.value->>'captured_at' as captured_at,
         attempt.value->>'consumed_at' as payload_consumed_at,
         attempt.value as attempt_payload
  from public.production_jobs pj
  cross join lateral jsonb_array_elements(coalesce(to_jsonb(pj)->'job_payload'->'production_attempts','[]'::jsonb)) as attempt(value)
), duplicate_consumption as (
  select user_id, production_link, attempt_or_command, count(*) as duplicate_count, sum(coalesce(qty,0)) as total_quantity, min(created_at) as first_seen, max(created_at) as last_seen
  from consumption
  group by user_id, production_link, attempt_or_command
  having count(*) > 1
), attempts_without_consumption as (
  select a.production_job_id, a.user_id, a.order_number, a.attempt_id, a.captured_at, a.payload_consumed_at
  from production_attempts a
  left join consumption c on c.production_link in (a.production_job_id, a.order_number) and (c.attempt_or_command = a.attempt_id or c.attempt_or_command is null)
  where c.production_link is null and a.payload_consumed_at is null
), consumption_without_production_linkage as (
  select id, user_id, created_at, txn_type, attempt_or_command, qty
  from consumption
  where production_link is null
), needs_reprint_evidence as (
  select pj.id::text as production_job_id,
         nullif(coalesce(to_jsonb(pj)->>'user_id', ''), '') as user_id,
         nullif(coalesce(to_jsonb(pj)->>'order_number', ''), '') as order_number,
         nullif(coalesce(to_jsonb(pj)->>'production_status', ''), '') as production_status,
         to_jsonb(pj)->'job_payload'->>'needs_reprint_at' as needs_reprint_at,
         jsonb_array_length(coalesce(to_jsonb(pj)->'job_payload'->'production_attempts','[]'::jsonb)) as attempt_count,
         count(c.*) as consumption_rows
  from public.production_jobs pj
  left join consumption c on c.production_link in (pj.id::text, to_jsonb(pj)->>'order_number')
  where to_jsonb(pj)->'job_payload' ? 'needs_reprint_at'
     or (to_jsonb(pj)->>'production_status' = 'ready_to_print' and to_jsonb(pj)->'job_payload' ? 'production_attempts')
  group by pj.id, to_jsonb(pj)
), reservation_inconsistencies as (
  select pj.id::text as production_job_id,
         nullif(coalesce(to_jsonb(pj)->>'user_id', ''), '') as user_id,
         nullif(coalesce(to_jsonb(pj)->>'order_number', ''), '') as order_number,
         nullif(coalesce(to_jsonb(pj)->>'production_status', ''), '') as production_status,
         case
           when to_jsonb(pj)->>'production_status' in ('estimate','waiting_customer','ready_for_fulfillment','closed','canceled','void')
             and jsonb_array_length(coalesce(to_jsonb(pj)->'material_reservations','[]'::jsonb)) > 0 then 'reservation_in_non_reserving_status'
           when to_jsonb(pj)->>'production_status' in ('ready_to_print','printing','qc')
             and coalesce((to_jsonb(pj)->>'exclude_inventory_reduction')::boolean,false) = false
             and jsonb_array_length(coalesce(to_jsonb(pj)->'material_reservations','[]'::jsonb)) = 0
             and coalesce(nullif(to_jsonb(pj)->>'estimated_total_grams','')::numeric, nullif(to_jsonb(pj)->>'estimated_grams_each','')::numeric * nullif(to_jsonb(pj)->>'quantity','')::numeric, 0) > 0 then 'missing_reservation_for_printable_work'
         end as inconsistency_type
  from public.production_jobs pj
  where (
      to_jsonb(pj)->>'production_status' in ('estimate','waiting_customer','ready_for_fulfillment','closed','canceled','void')
      and jsonb_array_length(coalesce(to_jsonb(pj)->'material_reservations','[]'::jsonb)) > 0
    )
    or (
      to_jsonb(pj)->>'production_status' in ('ready_to_print','printing','qc')
      and coalesce((to_jsonb(pj)->>'exclude_inventory_reduction')::boolean,false) = false
      and jsonb_array_length(coalesce(to_jsonb(pj)->'material_reservations','[]'::jsonb)) = 0
      and coalesce(nullif(to_jsonb(pj)->>'estimated_total_grams','')::numeric, nullif(to_jsonb(pj)->>'estimated_grams_each','')::numeric * nullif(to_jsonb(pj)->>'quantity','')::numeric, 0) > 0
    )
), negative_impossible_balances as (
  select 'raw_material_inventory' as table_name, r.id::text as id, nullif(coalesce(to_jsonb(r)->>'user_id', ''), '') as user_id,
         nullif(to_jsonb(r)->>'remaining_grams','')::numeric as balance,
         nullif(to_jsonb(r)->>'starting_grams','')::numeric as max_expected,
         case when coalesce(nullif(to_jsonb(r)->>'remaining_grams','')::numeric,0) < 0 then 'negative_balance' else 'balance_above_starting_grams' end as issue
  from public.raw_material_inventory r
  where coalesce(nullif(to_jsonb(r)->>'remaining_grams','')::numeric,0) < 0
     or (to_jsonb(r) ? 'starting_grams' and nullif(to_jsonb(r)->>'remaining_grams','')::numeric > nullif(to_jsonb(r)->>'starting_grams','')::numeric and coalesce(to_jsonb(r)->>'roll_status','') <> 'refilled')
  union all
  select 'non_filament_materials', n.id::text, nullif(coalesce(to_jsonb(n)->>'user_id', ''), ''), nullif(to_jsonb(n)->>'quantity_on_hand','')::numeric, null::numeric, 'negative_balance'
  from public.non_filament_materials n
  where coalesce(nullif(to_jsonb(n)->>'quantity_on_hand','')::numeric,0) < 0
  union all
  select 'finished_goods_inventory', f.id::text, nullif(coalesce(to_jsonb(f)->>'user_id', ''), ''), nullif(to_jsonb(f)->>'quantity_on_hand','')::numeric, null::numeric, 'negative_balance'
  from public.finished_goods_inventory f
  where coalesce(nullif(to_jsonb(f)->>'quantity_on_hand','')::numeric,0) < 0
), roll_usage as (
  select pj.id::text as production_job_id,
         nullif(coalesce(to_jsonb(pj)->>'user_id', ''), '') as user_id,
         nullif(coalesce(to_jsonb(pj)->>'order_number', ''), '') as order_number,
         coalesce(ru.value->>'raw_material_roll_id', ru.value->>'roll_id') as roll_id,
         ru.value->>'roll_label' as roll_label
  from public.production_jobs pj
  cross join lateral jsonb_array_elements(coalesce(to_jsonb(pj)->'roll_usages', to_jsonb(pj)->'job_payload'->'roll_usages', '[]'::jsonb)) ru(value)
), roll_lot_linkage_gaps as (
  select ru.production_job_id, ru.user_id, ru.order_number, ru.roll_id, ru.roll_label
  from roll_usage ru
  left join public.raw_material_inventory r on nullif(coalesce(to_jsonb(r)->>'user_id', ''), '') = ru.user_id and r.id::text = ru.roll_id
  where coalesce(ru.roll_id, '') <> '' and r.id is null
), transaction_type_distributions as (
  select txn_type, item_kind, count(*) as row_count, min(created_at) as first_seen, max(created_at) as last_seen
  from inventory_transactions_normalized
  group by txn_type, item_kind
), authority_counts as (
  select jsonb_build_object(
    'inventory_transactions', (select count(*) from public.inventory_transactions),
    'production_jobs', (select count(*) from public.production_jobs),
    'raw_material_inventory', (select count(*) from public.raw_material_inventory),
    'non_filament_materials', (select count(*) from public.non_filament_materials),
    'finished_goods_inventory', (select count(*) from public.finished_goods_inventory),
    'inventory_spool_pool', (select count(*) from public.inventory_spool_pool),
    'inventory_settings', (select count(*) from public.inventory_settings),
    'duplicate_production_attempt_consumption', (select count(*) from duplicate_consumption),
    'production_attempts_without_consumption', (select count(*) from attempts_without_consumption),
    'consumption_without_production_linkage', (select count(*) from consumption_without_production_linkage),
    'needs_reprint_or_repeated_consumption_rows', (select count(*) from needs_reprint_evidence),
    'reservation_inconsistencies', (select count(*) from reservation_inconsistencies),
    'negative_or_impossible_balances', (select count(*) from negative_impossible_balances),
    'roll_lot_linkage_gaps', (select count(*) from roll_lot_linkage_gaps)
  ) as value
), direct_browser_mutation_authority as (
  select jsonb_agg(jsonb_build_object(
    'table_name', table_name,
    'anon_insert', effective_privileges->'anon'->'insert',
    'anon_update', effective_privileges->'anon'->'update',
    'anon_delete', effective_privileges->'anon'->'delete',
    'authenticated_insert', effective_privileges->'authenticated'->'insert',
    'authenticated_update', effective_privileges->'authenticated'->'update',
    'authenticated_delete', effective_privileges->'authenticated'->'delete',
    'browser_accessible_direct_mutation', coalesce((effective_privileges->'anon'->>'insert')::boolean,false)
      or coalesce((effective_privileges->'anon'->>'update')::boolean,false)
      or coalesce((effective_privileges->'anon'->>'delete')::boolean,false)
      or coalesce((effective_privileges->'authenticated'->>'insert')::boolean,false)
      or coalesce((effective_privileges->'authenticated'->>'update')::boolean,false)
      or coalesce((effective_privileges->'authenticated'->>'delete')::boolean,false)
  ) order by table_name) as value
  from table_privileges_json
  where table_name in ('raw_material_inventory','finished_goods_inventory','non_filament_materials','inventory_transactions','inventory_spool_pool','inventory_settings')
), finance_inventory_cross_domain_write_evidence as (
  select jsonb_build_object(
    'functions_or_rpcs', coalesce((select value from relevant_functions), '[]'::jsonb),
    'triggers', coalesce((select value from relevant_triggers), '[]'::jsonb)
  ) as value
), detail_samples as (
  select jsonb_build_object(
    'transaction_type_distributions', coalesce((select jsonb_agg(to_jsonb(d) order by row_count desc nulls last, txn_type, item_kind) from transaction_type_distributions d), '[]'::jsonb),
    'duplicate_production_attempt_consumption', coalesce((select jsonb_agg(to_jsonb(d) order by duplicate_count desc, last_seen desc nulls last) from duplicate_consumption d), '[]'::jsonb),
    'production_attempts_without_consumption', coalesce((select jsonb_agg(to_jsonb(a) order by captured_at desc nulls last) from attempts_without_consumption a), '[]'::jsonb),
    'consumption_without_production_linkage', coalesce((select jsonb_agg(to_jsonb(c) order by created_at desc nulls last) from (select * from consumption_without_production_linkage order by created_at desc nulls last limit 200) c), '[]'::jsonb),
    'needs_reprint_and_repeated_consumption_evidence', coalesce((select jsonb_agg(to_jsonb(n) order by needs_reprint_at desc nulls last) from needs_reprint_evidence n), '[]'::jsonb),
    'reservation_inconsistencies', coalesce((select jsonb_agg(to_jsonb(r) order by production_job_id) from reservation_inconsistencies r), '[]'::jsonb),
    'negative_or_impossible_balances', coalesce((select jsonb_agg(to_jsonb(n) order by table_name, id) from negative_impossible_balances n), '[]'::jsonb),
    'roll_lot_linkage_gaps', coalesce((select jsonb_agg(to_jsonb(r) order by production_job_id) from roll_lot_linkage_gaps r), '[]'::jsonb)
  ) as value
)
select jsonb_build_object(
  'generated_at', now(),
  'scope', 'ERP Inventory authority deployed read-only verification',
  'read_only_statement', true,
  'relevant_tables_columns_constraints_rls_policies_privileges', coalesce((select value from schema_report), '[]'::jsonb),
  'inventory_related_functions_rpcs_triggers_and_definitions', jsonb_build_object(
    'functions_and_rpcs', coalesce((select value from relevant_functions), '[]'::jsonb),
    'triggers', coalesce((select value from relevant_triggers), '[]'::jsonb)
  ),
  'browser_accessible_direct_mutation_authority', coalesce((select value from direct_browser_mutation_authority), '[]'::jsonb),
  'raw_material_spool_pool_non_filament_finished_goods_authority', jsonb_build_object(
    'raw_material_inventory', (select jsonb_build_object('row_count', count(*)) from public.raw_material_inventory),
    'inventory_spool_pool', (select jsonb_build_object('row_count', count(*)) from public.inventory_spool_pool),
    'non_filament_materials', (select jsonb_build_object('row_count', count(*)) from public.non_filament_materials),
    'finished_goods_inventory', (select jsonb_build_object('row_count', count(*)) from public.finished_goods_inventory)
  ),
  'finance_inventory_cross_domain_write_evidence', (select value from finance_inventory_cross_domain_write_evidence),
  'counts_of_unresolved_or_suspicious_records', (select value from authority_counts),
  'deployed_verification_checks', (select value from detail_samples)
) as inventory_authority_verification;
```

## Consolidated query result capture

| Date run | Environment | Runner | Single JSONB result location or summary | Follow-up individual query needed | Contract classification after result |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Read-only Supabase verification queries

> Run these in the deployed/staging Supabase SQL editor as read-only checks. Replace no data, create nothing, and do not execute mutations.

### 1. Relevant table schemas and constraints

```sql
select table_schema, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings',
    'production_jobs','orders','financial_entries','finance_entries'
  )
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings',
    'production_jobs','orders','financial_entries','finance_entries'
  )
order by table_name::text, conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings',
    'production_jobs','orders','financial_entries','finance_entries'
  )
order by tablename, indexname;
```

### 2. RLS and policies

```sql
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings',
    'production_jobs','orders','financial_entries','finance_entries'
  )
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings',
    'production_jobs','orders','financial_entries','finance_entries'
  )
order by tablename, policyname;
```

### 3. Effective anon/authenticated/service-role grants

```sql
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role','PUBLIC','public')
  and table_name in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings',
    'production_jobs','orders','financial_entries','finance_entries'
  )
order by table_name, grantee, privilege_type;

select role_name, object_name, privilege, has_privilege
from (
  values ('anon'), ('authenticated'), ('service_role')
) as r(role_name)
cross join (
  values
    ('public.raw_material_inventory'),('public.finished_goods_inventory'),('public.non_filament_materials'),
    ('public.inventory_transactions'),('public.inventory_spool_pool'),('public.inventory_settings'),
    ('public.production_jobs'),('public.orders')
) as o(object_name)
cross join (values ('select'),('insert'),('update'),('delete')) as p(privilege)
cross join lateral (
  select has_table_privilege(r.role_name, o.object_name, p.privilege) as has_privilege
) hp
order by object_name, role_name, privilege;
```

### 4. Functions, RPCs, triggers, and definitions

```sql
select n.nspname, p.proname, p.oid::regprocedure as signature, p.prosecdef, p.provolatile,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as return_type,
       p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%inventory%' or p.proname ilike '%material%' or p.proname ilike '%reserve%' or
    p.proname ilike '%consume%' or p.proname ilike '%production_workflow%' or p.proname ilike '%workflow_command%'
  )
order by p.proname, signature::text;

select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_spool_pool','inventory_settings','production_jobs','orders'
  )
order by event_object_table, trigger_name, event_manipulation;
```

### 5. Inventory transaction type distributions

```sql
select transaction_type, type, movement_type, count(*) as row_count,
       min(created_at) as first_seen, max(created_at) as last_seen
from public.inventory_transactions
group by transaction_type, type, movement_type
order by row_count desc nulls last, transaction_type, type, movement_type;
```

### 6. Duplicate consumption detection

```sql
with consumption as (
  select id, user_id, created_at,
         coalesce(production_job_id::text, job_id::text, order_number, reference_id, source_id) as production_link,
         coalesce(attempt_id::text, production_attempt_id::text, correlation_id, command_id, id::text) as attempt_or_command,
         coalesce(transaction_type, type, movement_type) as txn_type,
         coalesce(grams, quantity_grams, amount_grams, quantity) as qty
  from public.inventory_transactions
  where lower(coalesce(transaction_type, type, movement_type, '')) similar to '%(consume|consumption|usage|raw_usage|production)%'
)
select user_id, production_link, attempt_or_command, count(*) as duplicate_count, sum(coalesce(qty,0)) as total_quantity, min(created_at), max(created_at)
from consumption
group by user_id, production_link, attempt_or_command
having count(*) > 1
order by duplicate_count desc, max desc nulls last;
```

### 7. Production attempts without consumption

```sql
with attempts as (
  select pj.id as production_job_id, pj.user_id, pj.order_number,
         attempt.value->>'id' as attempt_id,
         attempt.value->>'captured_at' as captured_at,
         attempt.value->>'consumed_at' as payload_consumed_at
  from public.production_jobs pj
  cross join lateral jsonb_array_elements(coalesce(pj.job_payload->'production_attempts','[]'::jsonb)) as attempt(value)
), consumption as (
  select distinct coalesce(production_job_id::text, job_id::text, order_number, reference_id, source_id) as production_link,
                  coalesce(attempt_id::text, production_attempt_id::text, correlation_id, command_id) as attempt_id
  from public.inventory_transactions
  where lower(coalesce(transaction_type, type, movement_type, '')) similar to '%(consume|consumption|usage|raw_usage|production)%'
)
select a.*
from attempts a
left join consumption c on c.production_link in (a.production_job_id::text, a.order_number) and (c.attempt_id = a.attempt_id or c.attempt_id is null)
where c.production_link is null and a.payload_consumed_at is null
order by a.captured_at desc nulls last;
```

### 8. Consumption without Production linkage

```sql
select *
from public.inventory_transactions
where lower(coalesce(transaction_type, type, movement_type, '')) similar to '%(consume|consumption|usage|raw_usage|production)%'
  and coalesce(production_job_id::text, job_id::text, order_number, reference_id, source_id, '') = ''
order by created_at desc
limit 200;
```

### 9. Needs Reprint attempts and repeated consumption

```sql
with reprints as (
  select id, user_id, order_number, production_status, updated_at,
         job_payload->>'needs_reprint_at' as needs_reprint_at,
         coalesce(job_payload->'production_attempts','[]'::jsonb) as attempts
  from public.production_jobs
  where job_payload ? 'needs_reprint_at'
     or production_status = 'ready_to_print' and job_payload ? 'production_attempts'
)
select r.id, r.user_id, r.order_number, r.production_status, r.needs_reprint_at,
       jsonb_array_length(r.attempts) as attempt_count,
       count(t.*) filter (where lower(coalesce(t.transaction_type,t.type,t.movement_type,'')) similar to '%(consume|consumption|usage|raw_usage|production)%') as consumption_rows
from reprints r
left join public.inventory_transactions t
  on coalesce(t.production_job_id::text, t.job_id::text, t.order_number, t.reference_id, t.source_id) in (r.id::text, r.order_number)
group by r.id, r.user_id, r.order_number, r.production_status, r.needs_reprint_at, r.attempts
order by r.needs_reprint_at desc nulls last;
```

### 10. Reservation inconsistencies

```sql
select id, user_id, order_number, production_status, material_reservations,
       jsonb_array_length(coalesce(material_reservations,'[]'::jsonb)) as reservation_count
from public.production_jobs
where (
    production_status in ('estimate','waiting_customer','ready_for_fulfillment','closed','canceled','void')
    and jsonb_array_length(coalesce(material_reservations,'[]'::jsonb)) > 0
  )
  or (
    production_status in ('ready_to_print','printing','qc')
    and coalesce(exclude_inventory_reduction,false) = false
    and jsonb_array_length(coalesce(material_reservations,'[]'::jsonb)) = 0
    and coalesce(estimated_total_grams, estimated_grams_each * quantity, 0) > 0
  )
order by updated_at desc nulls last;
```

### 11. Negative or impossible balances

```sql
select 'raw_material_inventory' as table_name, id::text, user_id, remaining_grams as balance, starting_grams as max_expected
from public.raw_material_inventory
where coalesce(remaining_grams,0) < 0
   or (starting_grams is not null and remaining_grams > starting_grams and coalesce(roll_status,'') <> 'refilled')
union all
select 'non_filament_materials', id::text, user_id, quantity_on_hand, null::numeric
from public.non_filament_materials
where coalesce(quantity_on_hand,0) < 0
union all
select 'finished_goods_inventory', id::text, user_id, quantity_on_hand, null::numeric
from public.finished_goods_inventory
where coalesce(quantity_on_hand,0) < 0
order by table_name, id;
```

### 12. Roll/lot linkage gaps

```sql
with roll_usage as (
  select pj.id as production_job_id, pj.user_id, pj.order_number,
         ru.value->>'raw_material_roll_id' as raw_material_roll_id,
         ru.value->>'roll_id' as roll_id,
         ru.value->>'roll_label' as roll_label,
         ru.value as roll_usage_payload
  from public.production_jobs pj
  cross join lateral jsonb_array_elements(coalesce(pj.roll_usages, pj.job_payload->'roll_usages', '[]'::jsonb)) ru(value)
)
select ru.*
from roll_usage ru
left join public.raw_material_inventory r
  on r.user_id = ru.user_id
 and r.id::text in (ru.raw_material_roll_id, ru.roll_id)
where coalesce(ru.raw_material_roll_id, ru.roll_id, '') <> ''
  and r.id is null
order by ru.production_job_id;
```

### 13. Direct browser mutation authority

```sql
select table_name,
       has_table_privilege('anon', 'public.' || table_name, 'insert') as anon_insert,
       has_table_privilege('anon', 'public.' || table_name, 'update') as anon_update,
       has_table_privilege('anon', 'public.' || table_name, 'delete') as anon_delete,
       has_table_privilege('authenticated', 'public.' || table_name, 'insert') as authenticated_insert,
       has_table_privilege('authenticated', 'public.' || table_name, 'update') as authenticated_update,
       has_table_privilege('authenticated', 'public.' || table_name, 'delete') as authenticated_delete
from (values
  ('raw_material_inventory'),('finished_goods_inventory'),('non_filament_materials'),
  ('inventory_transactions'),('inventory_spool_pool'),('inventory_settings')
) as t(table_name)
order by table_name;
```

### 14. Finished-goods authority

```sql
select 'finished_goods_inventory grants' as check_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='finished_goods_inventory'
order by grantee, privilege_type;

select coalesce(transaction_type, type, movement_type) as txn_type, count(*)
from public.inventory_transactions
where lower(coalesce(transaction_type, type, movement_type, '')) like '%finished%'
   or lower(coalesce(item_type, inventory_kind, '')) like '%finished%'
group by txn_type
order by count desc;
```

### 15. Finance/Inventory cross-domain writes

```sql
select n.nspname, p.proname, p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ~* '(raw_material_inventory|finished_goods_inventory|non_filament_materials|inventory_transactions|inventory_spool_pool|financial_entries|finance_entries)'
order by p.proname, signature::text;

select event_object_table, trigger_name, action_statement
from information_schema.triggers
where event_object_schema='public'
  and action_statement ~* '(raw_material_inventory|finished_goods_inventory|non_filament_materials|inventory_transactions|financial_entries|finance_entries)'
order by event_object_table, trigger_name;
```

## Operator deployed-query result capture

| Query group | Date run | Environment | Runner | Result summary | Contract classification after result | Follow-up needed |
| --- | --- | --- | --- | --- | --- | --- |
| Table schemas and constraints |  |  |  |  |  |  |
| RLS and policies |  |  |  |  |  |  |
| Effective grants |  |  |  |  |  |  |
| Functions/RPCs/triggers |  |  |  |  |  |  |
| Transaction type distributions |  |  |  |  |  |  |
| Duplicate consumption detection |  |  |  |  |  |  |
| Attempts without consumption |  |  |  |  |  |  |
| Consumption without Production linkage |  |  |  |  |  |  |
| Needs Reprint repeated consumption |  |  |  |  |  |  |
| Reservation inconsistencies |  |  |  |  |  |  |
| Negative/impossible balances |  |  |  |  |  |  |
| Roll/lot linkage gaps |  |  |  |  |  |  |
| Direct browser mutation authority |  |  |  |  |  |  |
| Finished-goods authority |  |  |  |  |  |  |
| Finance/Inventory cross-domain writes |  |  |  |  |  |  |

## Decision gate

Do **not** implement Inventory command fixes until deployed verification proves:

1. Actual inventory schemas, constraints, RLS, grants, policies, triggers, and functions are known.
2. The current deployed transaction type contract is known.
3. Duplicate consumption, missing consumption, reservation inconsistency, negative balance, and roll/lot gap checks have been run and captured.
4. Browser direct-write privileges are explicitly accepted or a future command-authority milestone is approved.

If any deployed query fails because a referenced column/table differs, capture the error in the result table and classify the related contract as **Unable to verify from repository evidence** until the actual deployed schema is supplied.

## Recommended next corrective milestone

Exactly one small future corrective milestone is recommended based on repository evidence:

**Create an Inventory deployed-schema authority report from read-only Supabase outputs.**

Deliverable: paste the operator-run query results into this document or a follow-up `ERP_INVENTORY_DEPLOYED_SCHEMA_AUTHORITY_REPORT.md`, then classify only the Inventory table/RLS/grant/function/transaction contracts. Do not change code or schema in that milestone.


## Corrective milestone — 2026-07-21 Retire legacy `complete_production_job` RPC overloads

This focused milestone records operator-supplied deployed evidence and the planned forward-only correction in `supabase/migrations/202607210001_retire_complete_production_job_overloads.sql`. This repository environment did not connect to deployed Supabase, execute SQL, deploy, merge, or modify historical data.

### Operator-supplied deployed findings

- Five overloads of `public.complete_production_job` coexist.
- All overloads grant `EXECUTE` to `PUBLIC`, `anon`, `authenticated`, and `service_role`.
- Multiple overloads are `SECURITY DEFINER`.
- The overload bodies directly update `production_jobs` workflow status and actuals.
- The overload bodies directly reduce `raw_material_inventory`, add `finished_goods_inventory`, and insert `inventory_transactions`.
- The overloads use conflicting legacy quantity columns, including `current_grams` and `remaining_grams`.
- The deployed `inventory_transactions` ledger contains 384 `raw_usage` rows with no Production, attempt, command, or reference linkage.
- Migration `202607200008_workflow_command_authority_parameter_default_compatibility.sql` is deployed successfully and is the active workflow command authority.

### Planned correction

- Preserve every deployed `complete_production_job` overload identity by reading parameter names, defaults, identity arguments, and return types from `pg_proc`.
- Do not drop the functions, preserving PostgREST compatibility and avoiding dependency churn.
- Replace each body with an explicit retired-function exception using `SECURITY DEFINER` and fixed `search_path = public, pg_temp`.
- Revoke `EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and `service_role`; no reviewed recovery path requires retaining service-role execution for this obsolete bypass.
- Include read-only preflight and post-deployment verification queries.
- Do not create a new Inventory command, alter migration 008, redesign schema/UI/Finance/Quote/workflow authority, or clean historical transaction data.

### Active-client inspection

Repository inspection found no active client call to `complete_production_job`. The focused test scans Production Control, Orders Admin, Inventory Control, Finance Pro, Quote, and public tracking entry points to keep the retired RPC out of active browser paths.

## Corrective milestone — authoritative Production-attempt material consumption (2026-07-21)

Migration `supabase/migrations/202607210002_consume_production_attempt_inventory.sql` adds the reviewed Inventory command `public.consume_production_attempt(...)` as the only linked Production-attempt material consumption path introduced by this milestone. The command is designed for the QC Pass and Needs Reprint orchestration boundaries only; it does not mutate Production status, Orders, tracking, Finance, finished goods, Quote acceptance, reservations outside the raw-material rows it consumes from, or historical data.

The migration uses the deployed raw quantity authority selected from repository/deployed-contract evidence: `raw_material_inventory.remaining_grams`. It intentionally does not update `current_grams` as a competing raw quantity authority. Historical unlinked `inventory_transactions` rows remain untouched.

### Operator verification to run after deploying the migration

Use the read-only preflight and post-deployment JSONB verification queries embedded in `202607210002_consume_production_attempt_inventory.sql`. Confirm that:

- `consume_production_attempt` exists as `SECURITY DEFINER` with `search_path=public, pg_temp`.
- `PUBLIC` and `anon` cannot execute it.
- `authenticated` and `service_role` can execute it.
- The function body references `remaining_grams` and does not update `current_grams`.
- The uniqueness indexes for `(user_id, production_job_id, raw_material_id, attempt_id)` and `(user_id, correlation_id)` are present.

Manual browser testing is still required after deployment because this repository environment does not have deployed Supabase credentials and did not run live SQL.

## Deployment reconciliation — 2026-07-21 authoritative Inventory consumption repair

This repository reconciliation records operator-supplied deployed evidence for the authoritative Inventory consumption deployment. The operator already applied the equivalent repair manually in Supabase; this repository migration must not be manually rerun solely for deployment.

### Operator-supplied deployed evidence

- The original authoritative consumption migration failed and rolled back because `inventory_transactions.attempt_id` did not exist.
- The operator manually and successfully added `inventory_transactions.occurred_at timestamptz`, `attempt_id text`, `correlation_id text`, `quantity_grams numeric`, `order_number text`, and `quote_number text`.
- Existing ledger rows received `occurred_at = created_at` only where `occurred_at` was `NULL`; `occurred_at` now defaults to `now()`.
- The operator created `inventory_transactions_production_attempt_roll_once`, unique on `user_id`, `production_job_id`, `raw_material_id`, and `attempt_id` for authoritative `production_attempt_consumption` rows.
- The operator created `inventory_transactions_production_command_roll_once`, unique on `user_id`, `correlation_id`, and `raw_material_id` for authoritative `production_attempt_consumption` rows.
- The originally proposed correlation-only unique index was rejected because one command may consume multiple rolls.
- `public.consume_production_attempt` was successfully deployed as `SECURITY DEFINER` with `search_path = public, pg_temp`.
- Execute privileges are: `PUBLIC` false, `anon` false, `authenticated` true, and `service_role` true.
- `remaining_grams` is the sole raw quantity authority; the function does not update `current_grams`.
- Completed retry recognition happens before optimistic-concurrency rejection.
- There are currently zero authoritative `production_attempt_consumption` ledger rows.

### Verification status

| Verification area | Status | Notes |
| --- | --- | --- |
| Database structure | Passed | Operator supplied deployed evidence for required columns, backfill/default behavior, verified partial unique indexes, RPC security posture, fixed search path, grants, and raw quantity authority. |
| Live consumption | Pending | Runtime workflow testing remains pending and was not claimed passed. |
| Retry behavior | Pending | Contract is deployed, but live retry workflow testing remains pending. |
| Insufficient-material rejection | Pending | Runtime negative-path testing remains pending. |
| Cross-owner rejection | Pending | Runtime negative-path testing remains pending. |
| Needs Reprint consumption path | Pending | Runtime Needs Reprint workflow testing remains pending. |
| Workflow recovery after Inventory success | Pending | Runtime workflow-recovery testing remains pending. |

### Repository reconciliation artifact

- Forward-only migration `supabase/migrations/202607210003_reconcile_authoritative_inventory_consumption_repair.sql` reconciles the repository with the manually repaired deployed contract.
- The reconciliation adds missing ledger columns idempotently, backfills only missing `occurred_at` values from `created_at`, preserves historical rows otherwise, creates the two verified partial unique indexes, does not create the rejected correlation-only unique index, replaces `consume_production_attempt` with the corrected implementation, preserves retry-before-concurrency behavior, preserves grants/search path, and includes one consolidated read-only JSONB verification query using ACL inspection without `has_function_privilege('PUBLIC', ...)`.

## 2026-07-21 corrective milestone: durable linked Production raw-material reservations

Migration `supabase/migrations/202607210004_authoritative_production_material_reservations.sql` introduces `public.production_material_reservations` as technical Inventory state for linked Production reservations. The table is owner-scoped, records the Production job UUID, accepted Order number, raw-material roll UUID, reserved grams, active/released/consumed status, command identities, and created/updated/consumed/released timestamps. It is not a Blueprint business-event stream and does not reinterpret historical unlinked inventory transactions.

The migration adds Inventory command RPCs `reserve_production_material(...)` and `release_production_material_reservation(...)`, and replaces `consume_production_attempt(...)` so consumption validates active reservation lines, decrements `remaining_grams`, releases reserved grams, marks reservation rows consumed, and inserts immutable attempt-linked `inventory_transactions` rows atomically and retry-safely. All three RPCs are `SECURITY DEFINER` with `search_path = public, pg_temp`, require authenticated owner context, command identity, and optimistic concurrency, and lock the Production, accepted Order, reservation, and raw-material rows they affect.

`remaining_grams` remains the deployed on-hand quantity authority. Available grams are enforced as `remaining_grams - reserved_grams` at reservation time. The RPC contract rejects missing or cross-owner rolls, duplicate roll lines, non-finite or nonpositive quantities, insufficient availability, stale Production rows, missing accepted Order linkage, command identity collisions, and invalid lifecycle commands. Needs Reprint consumption preserves prior attempt ledger evidence and allows the next Ready to Print reservation to receive a distinct reservation identity.

The Production client now routes linked reservation/release behavior through Inventory RPC requests generated by `js/workflow-status.js` and invoked from `production-control.html`. Linked workflow state is still updated only after authoritative workflow responses, and pending recovery information remains durable if a cross-domain step fails. Ordinary Inventory Control CRUD and historical unlinked transactions are unchanged.

Operators should use the consolidated read-only JSONB verification query embedded in migration `202607210004_authoritative_production_material_reservations.sql` after applying it in a controlled deployment window. Manual browser tests are still required for Ready to Print reservation, Start Print retention, QC Pass consumption/release, Needs Reprint distinct reservation, stale retry handling, and recovery after intentionally interrupted workflow RPC completion.

## Deployment closeout — authoritative Inventory reservation, release, and Production-attempt consumption (2026-07-21)

This documentation-only closeout records operator-supplied deployment evidence for the focused Inventory authority milestone merged before this closeout. No code, migrations, schema, RLS, grants, tests, data, UI, historical rows, or deployed Supabase state were changed by this documentation update.

### Operator-reported deployed migration

- Exact merged migration recorded as deployed: `supabase/migrations/202607210004_authoritative_production_material_reservations.sql`.
- Operator-reported database deployment result: the forward-only migration executed successfully in Supabase with `Success. No rows returned.`
- Deployment status: **database deployment successful, operator-reported**.
- Runtime status: **manual/browser/runtime workflow verification pending**.

Successful SQL execution means the database accepted and applied the migration statement set as reported by the operator. It does **not** prove that live browser workflows, retry paths, insufficient-material failures, cross-owner failures, Needs Reprint behavior, or workflow recovery behave correctly under deployed credentials.

### Deployed authority contract recorded

The deployed contract for linked Production material movement is:

1. **Reservation authority:** linked Ready to Print material reservation is requested through `public.reserve_production_material(...)`; browser-direct linked reservation writes are not the authority.
2. **Release authority:** linked reservation release is requested through `public.release_production_material_reservation(...)`; release is a workflow command, not ordinary browser table mutation.
3. **Consumption authority:** linked Production-attempt material consumption is requested through `public.consume_production_attempt(...)`; consumption validates active reservation state, decrements `raw_material_inventory.remaining_grams`, releases the applicable reserved grams, marks reservation rows consumed, and inserts immutable attempt-linked `inventory_transactions` evidence.
4. **Raw quantity authority:** `raw_material_inventory.remaining_grams` remains the deployed raw on-hand authority. Available linked material is the on-hand authority minus active reserved grams.
5. **Owner and command authority:** the command RPCs are owner-scoped, authenticated command paths. They are distinct from ordinary Inventory CRUD and from retired legacy Production completion overloads.

### Ordinary Inventory CRUD vs linked workflow command authority

Ordinary browser-direct Inventory Control CRUD remains a separate, still-existing operational surface for ordinary Inventory maintenance. This closeout does not mark ordinary Inventory CRUD as eliminated or fully Blueprint-reviewed.

Linked Production workflow material reservation, release, and attempt consumption are now recorded as command-authority responsibilities of Inventory RPCs. This distinction is important: ordinary CRUD may still maintain inventory records, while linked Production lifecycle movements must use the authoritative command paths above.

### Historical evidence preservation

Historical unlinked `inventory_transactions` rows remain historical evidence. This milestone did not clean, delete, backfill beyond previously recorded structural reconciliation, relabel, reinterpret, or convert historical unlinked transactions into authoritative Production-attempt evidence. No historical cleanup or reinterpretation occurred in this closeout.

### Verification status after deployment

| Area | Status | Notes |
| --- | --- | --- |
| Migration SQL execution | Successful | Operator reports Supabase returned `Success. No rows returned.` |
| Prior `consume_production_attempt` structure and security verification | Passed | Operator reports the prior structure/security verification passed before this closeout. |
| Live Production workflow | Pending | No live workflow test was performed. |
| Reservation retry | Pending | No reservation retry test was performed. |
| Consumption retry | Pending | No consumption retry test was performed. |
| Needs Reprint | Pending | No Needs Reprint test was performed. |
| Insufficient material | Pending | No insufficient-material test was performed. |
| Cross-owner rejection | Pending | No cross-owner test was performed. |
| Recovery after partial workflow failure | Pending | No recovery test was performed. |

### Remaining risk

- A deployed browser workflow may still fail because SQL execution does not verify UI orchestration, PostgREST request shape, authenticated session behavior, RLS interactions, or optimistic-concurrency timing.
- Retry, Needs Reprint, insufficient-material, cross-owner, and recovery paths remain unproven at runtime.
- Ordinary Inventory CRUD remains separate from linked workflow command authority and still needs future direct-write ownership review.
- Full ERP Blueprint compliance is **not** claimed.

### Exactly one recommended next milestone

**Finance ownership and cross-domain write verification.**

Verify that Finance-owned records, Inventory-owned records, and linked Production workflow records are mutated only by their authoritative owners and reviewed command boundaries. Do not combine that milestone with historical cleanup, UI redesign, or additional Inventory runtime testing.
