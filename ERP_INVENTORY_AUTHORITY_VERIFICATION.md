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
