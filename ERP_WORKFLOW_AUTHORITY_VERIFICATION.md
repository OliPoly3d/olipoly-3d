# ERP Workflow Authority Verification

> **Milestone:** Production vs. Orders Workflow Authority Verification  
> **Scope:** Documentation-only corrective preparation  
> **Blueprint:** ERP Blueprint v1 / repository authority documents  
> **Production safety:** Do not run mutation tests in production. All deployed verification below is read-only metadata or SELECT analysis.

## 1. Evidence boundaries

### Confirmed repository evidence

- `ENGINEERING_ARCHITECTURE.md` says Orders & Fulfillment owns accepted-work coordination and excludes print actuals, while Production owns manufacturing estimates, production planning, and production work.
- `DOMAIN_CONTRACTS.md` says Production owns manufacturing commands, actual usage, scrap, and production actions; Orders & Fulfillment owns Order identity, canonical post-acceptance status, Production linkage, fulfillment, and closure.
- `BUSINESS_EVENT_CONTRACT.md` defines status-producing workflow events: Production produces `printing`, `qc`, `ready_for_fulfillment`, and reprint-return events, while Orders/Fulfillment produces `closed`.
- `LIFECYCLES.md` defines the accepted lifecycle: `ready_to_print` → `printing` → `qc` → `ready_for_fulfillment` → `closed`, with `needs_reprint` returning from `qc` to `ready_to_print`.
- `SHARED_SERVICES.md` classifies Hub, Customer 360, global search, public tracking, and analytics as projections, not business authorities.
- `ERP_DEPLOYED_CONTRACT_INVENTORY.md` and `ERP_QUOTE_ACCEPTANCE_TRANSACTION_VERIFICATION.md` contain prior deployed observations and corrective milestones. Those observations are useful history but must be re-verified before treating current production behavior as fact.
- Checked-in migrations define multiple synchronization mechanisms that can write status fields: `normalize_accepted_order_status`, `sync_order_workflow_to_production`, `set_linked_workflow_status`, quote-acceptance Production handoff, tracking projection writes, and event inserts.
- `production-control.html`, `orders-admin.html`, and `js/workflow-status.js` expose browser paths that read and write workflow state through Supabase REST/RPC calls.
- Tests assert portions of the intended contract, including legal status vocabulary, no browser acceptance side-effect writes, acceptance handoff behavior, workflow button availability, inventory reservation meanings, and RPC grant expectations.

### Operator-supplied deployed evidence

Initial sections preserve the pre-closeout verification plan. Section 9 records the fresh operator-supplied deployed Supabase evidence for this documentation-only closeout and supersedes the pending placeholders where it provides confirmed deployed facts.

### Repository inference

- Because repository migrations can be applied, superseded, skipped, or edited outside git, checked-in SQL is not proof of deployed function or trigger definitions.
- Because browser code can call RPCs or table endpoints directly, repository evidence can identify possible write paths but cannot prove deployed RLS, grants, or policies currently allow or block each path.
- The repository architecture contains a tension: `DOMAIN_CONTRACTS.md` assigns canonical post-acceptance status to Orders, while Blueprint/module guidance and event ownership assign manufacturing commands and actuals to Production. The safest interpretation is that Orders holds the coordinated accepted-work status record, but only Production commands should advance manufacturing states through QC, and Orders/Fulfillment should close only after fulfillment handoff.

### Unresolved deployed behavior

- Current deployed definitions, `SECURITY DEFINER`/`SECURITY INVOKER` modes, `search_path` settings, grants, triggers, and RLS policies for workflow functions and tables are unresolved until section 4 queries are run.
- Current status distributions, linked-row mismatches, orphan records, legacy values, duplicate events, missing events, and likely last writers are unresolved.
- Whether deployed browser credentials can directly update `orders.status`, `production_jobs.production_status`, or `order_tracking_public.status` outside approved commands is unresolved.

### Historical test/abandoned records

Historical test records, abandoned Orders, failed acceptance attempts, and rows created before corrective migrations may be valid audit history. Do not mutate or “clean up” them during this verification. Classify them separately when reviewing query results, especially if their timestamps predate the accepted lifecycle migrations.

## 2. Blueprint ownership baseline

This baseline does not invent a new model; it reconciles the repository authority documents and calls out ambiguity.

| Workflow item | Blueprint owner | Evidence-derived boundary | Ambiguity |
|---|---|---|---|
| `ready_to_print` initial acceptance handoff | Quote acceptance / Orders service with Production linkage | Quote acceptance creates the Order at `ready_to_print` and may advance linked waiting Production work to `ready_to_print`. | `BUSINESS_EVENT_CONTRACT.md` names `order.ready_to_print` producer as Orders workflow, while Production owns manufacturing readiness and reservations. |
| `ready_to_print` after reprint | Production | `order.needs_reprint` is produced by Production and returns work to `ready_to_print` while preserving actuals. | Stored current status may still live on Orders per lifecycle contract. |
| `printing` | Production | Start Print is a Production command and produces `order.printing_started`. | Synchronization may copy the state into Orders/tracking, but it should not become an independent Orders command. |
| `qc` | Production | Complete Print captures actuals/scrap and moves to QC; it must not close the Order. | None material. |
| `needs_reprint` behavior | Production | Reprint is not a durable canonical status in the constrained post-acceptance vocabulary; it is an action/event that returns status to `ready_to_print` and preserves attempt history. | Some repository tests/read models mention `needs_reprint` as a production status, so deployed legacy values must be checked. |
| `ready_for_fulfillment` | Production handoff to Orders/Fulfillment | Pass QC is a Production command; after it, pickup/shipment may occur. | This is the key handoff boundary: Production appears authoritative to and including QC pass, while Orders/Fulfillment acts after handoff. |
| `closed` | Orders/Fulfillment | Fulfillment and operational closeout, not print completion or payment alone. | Some Production UI labels include “Fulfilled / Close,” so verify whether Production Control can close directly. |
| Manufacturing actuals | Production | Actual usage, scrap, printer/attempt evidence, and production actions belong to Production. | Inventory owns stock mutation after Production requests movement. |
| Fulfillment confirmation | Orders/Fulfillment | Pickup/shipping completion and closure belong to Orders/Fulfillment. | If Production Control has close UI, it may be conflicting unless treated as a fulfillment command with proper domain authority. |
| Public status projection | Shared Services / Orders projection | Public tracking presents allowlisted status and next-step text; it is a projection over authoritative records/events. | Direct table updates can become conflicting if not limited to projection synchronization. |

Expected decision boundary for deployed verification: **Production authoritative through QC, explicit handoff at `ready_for_fulfillment`, Orders/Fulfillment authoritative after handoff**. This is derived from Production command/event ownership and Orders/Fulfillment closure ownership, while recognizing that repository contracts also describe Orders as the canonical post-acceptance status holder.

## 3. Repository execution-path trace

### Authority and contract documents

| Artifact | Reads | Writes | Command or projection | Overwrite risk | Classification |
|---|---|---|---|---|---|
| `ENGINEERING_ARCHITECTURE.md` | Domain responsibilities | None | Contract | None | Authoritative documentation |
| `DOMAIN_CONTRACTS.md` | Domain responsibilities | None | Contract | None | Authoritative documentation with noted ambiguity: Orders owns canonical status, Production owns manufacturing commands |
| `BUSINESS_EVENT_CONTRACT.md` | Event vocabulary | None | Contract | None | Authoritative event documentation |
| `DATA_OWNERSHIP_MATRIX.md` | Ownership matrix | None | Contract | None | Authoritative documentation; says owner record wins over cache timestamp |
| `SHARED_SERVICES.md` | Shared-service scope | None | Contract | None | Projection boundary documentation |
| `LIFECYCLES.md` | Lifecycle states/transitions | None | Contract | None | Authoritative lifecycle documentation |
| `ERP_MODULE_MAP.md` | Module map | None | Contract | None | Projection and module-boundary documentation |
| `ERP_DEPLOYED_CONTRACT_INVENTORY.md` | Prior deployed inventory/contract evidence | None | Historical evidence | None | Useful prior verification, not current deployed proof |
| `ERP_QUOTE_ACCEPTANCE_TRANSACTION_VERIFICATION.md` | Prior acceptance verification | None | Historical evidence | None | Useful prior verification, not current deployed proof |

### Browser and JavaScript paths

| Page/function | Reads | Writes | Command or projection | Can overwrite another domain's state? | Classification |
|---|---|---|---|---|---|
| `production-control.html` workflow actions | Production job records, linked order numbers/status timestamps, shared workflow helpers | Calls workflow status persistence for `production_jobs.production_status` and/or linked workflow RPC depending on helper path | Intended Production commands for `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, and possibly close/reprint UI actions | Yes, if it writes `orders.status`/tracking as part of manufacturing command or can close after fulfillment boundary | Partially compliant pending deployed/RLS verification; likely authoritative for manufacturing, potentially conflicting for `closed` |
| `orders-admin.html` workflow actions | Orders, tracking, linked production records, status helpers | Calls linked workflow status persistence and may update order/tracking status | Orders coordination/fulfillment command or status synchronization | Yes, if it advances manufacturing states (`printing`, `qc`, `ready_for_fulfillment`) instead of only coordinating/closing after handoff | Partially compliant/conflicting depending deployed UI permissions and intended action set |
| `js/workflow-status.js` | Current status values and timestamps | Normalizes status, maps UI labels, builds/dispatches Supabase status writes/RPC calls | Shared workflow client helper | Yes, because a shared helper can flatten Production and Orders boundaries if all pages can call all statuses | Compatibility/shared plumbing; must not be treated as domain authority |
| Browser follow-up writes after Quote acceptance | Accepted Quote response | Current tests expect no browser writes to `orders`, `production_jobs`, `order_tracking_public`, or `project_events` during acceptance | Should be absent; acceptance should be one RPC command | Historical versions had conflict risk; current repository tests assert removal | Verify deployed bundle and network behavior; repository intent is compliant |

### Database functions, triggers, and migrations

| Function/trigger | Reads | Writes | Command or projection | Can overwrite another domain's state? | Classification |
|---|---|---|---|---|---|
| `respond_to_quote_public` | Quote by public token/quote number, existing Order/snapshot/tracking/event rows, linked Production rows | Quote response/status, accepted snapshot, `orders`, acceptance-time `production_jobs.production_status='ready_to_print'`, `order_tracking_public`, `project_events` | Quote acceptance command with initial Order/Production handoff and public projection | Yes, if retried or applied to advanced Production rows; later migration guards waiting-like statuses only | Authoritative for initial acceptance handoff if deployed as corrected |
| `normalize_accepted_order_status` | Input status | None | Compatibility normalization | No direct overwrite; consumers/triggers using it can rewrite legacy values | Compatibility-only |
| `enforce_accepted_order_status` triggers | New `orders.status` or tracking status | Normalized `orders.status` / `order_tracking_public.status` | Compatibility validation/normalization | Yes, maps legacy values such as `completed`, `canceled`, and `production_closed` to `closed` | Compatibility-only with historical mutation impact |
| `sync_order_workflow_to_production` / `orders_sync_workflow_to_production` | `orders` row after insert/update | `production_jobs.production_status`, linkage columns, payload | Synchronization from Orders to Production | Yes; if active for all status updates it can make Orders a competing manufacturing authority and overwrite advanced Production state | Conflicting unless constrained to non-manufacturing handoff/projection use |
| `set_linked_workflow_status` | `orders` by order number, expected timestamp | `orders.status`, `order_tracking_public.status`, public text/next step; trigger may also update Production | Workflow command facade | Yes; available to both Production and Orders UIs, so domain authorization must be status-specific | Potential command gateway; partially compliant only if authorization and state transition checks enforce owner boundaries |
| Quote acceptance `advance_linked_production_on_quote_acceptance` trigger | `quotes.customer_response` changes | Waiting Production rows to `ready_to_print`, quote acceptance linkage | Legacy acceptance handoff trigger | Yes, duplicates `respond_to_quote_public` handoff if both active | Conflicting if active alongside corrected RPC handoff |
| `order_tracking_public` writes | Orders/tracking rows | Tracking status/text | Public projection | Yes, if directly writable by browser/users as source status | Projection-only if RLS/grants restrict direct mutation |
| `project_events` inserts | Source command context | Append-only events | Audit/event evidence | No status overwrite; event duplication can mislead read models | Authoritative evidence only if emitted once per command and never used as current status source |

### Tests and migrations inspected

Relevant tests include `tests/production-workflow.test.js`, `tests/bidirectional-workflow-persistence.test.js`, `tests/production-status-persistence.test.js`, `tests/quote-acceptance-authority.test.js`, `tests/quote-acceptance-runtime-correctness.test.js`, `tests/inventory-lifecycle.test.js`, `tests/public-access-security-hardening.test.js`, and acceptance/persistence tests. Relevant migrations include `202607160001_milestone_2a_order_workflow.sql`, `202607160002_repair_milestone_2a_order_status.sql`, `202607160003_persist_production_quote_status.sql`, `202607160004_authoritative_bidirectional_workflow.sql`, `202607200001_public_access_ownership_security_hardening.sql`, `202607200002_quote_acceptance_authority.sql`, `202607200004_quote_acceptance_runtime_correctness.sql`, and `202607200005_quote_acceptance_runtime_safety.sql`.

## 4. Deployed verification queries

**Production prohibition:** Run only read-only `select`/metadata queries in production. Do not insert/update/delete rows, call status-changing RPCs, disable triggers, bypass RLS, or simulate browser mutations against production data.

### 4.1 Function definitions, security modes, and search paths

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_config,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'set_linked_workflow_status',
    'sync_order_workflow_to_production',
    'normalize_accepted_order_status',
    'respond_to_quote_public'
  )
order by p.proname, arguments;
```

### 4.2 Function grants

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  r.rolname as role_name,
  has_function_privilege(r.oid, p.oid, 'execute') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname in (
    'set_linked_workflow_status',
    'sync_order_workflow_to_production',
    'normalize_accepted_order_status',
    'respond_to_quote_public'
  )
  and r.rolname in ('public', 'anon', 'authenticated', 'service_role', 'postgres')
order by p.proname, arguments, r.rolname;
```

### 4.3 Deployed trigger definitions

```sql
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_orientation,
  action_condition,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('orders', 'production_jobs', 'order_tracking_public', 'quotes', 'project_events')
order by event_object_table, trigger_name, event_manipulation;
```

### 4.4 RLS and policies

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('orders', 'production_jobs', 'order_tracking_public')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'production_jobs', 'order_tracking_public')
order by tablename, policyname;
```

### 4.5 Status distributions across Orders, Production, and tracking

```sql
select 'orders' as source_table, status, count(*) as row_count
from public.orders
group by status
union all
select 'production_jobs', production_status, count(*)
from public.production_jobs
group by production_status
union all
select 'order_tracking_public', status, count(*)
from public.order_tracking_public
group by status
order by source_table, status;
```

### 4.6 Linked Order/Production/tracking status mismatches

```sql
select
  coalesce(o.order_number, p.order_number, t.order_number) as order_number,
  o.status as order_status,
  p.production_status,
  t.status as tracking_status,
  o.source_quote_number,
  p.quote_number as production_quote_number,
  o.updated_at as order_updated_at,
  p.updated_at as production_updated_at,
  t.updated_at as tracking_updated_at
from public.orders o
full join public.production_jobs p
  on p.order_number = o.order_number
  or (o.source_quote_number is not null and p.quote_number = o.source_quote_number)
full join public.order_tracking_public t
  on t.order_number = coalesce(o.order_number, p.order_number)
where o.status is distinct from p.production_status
   or o.status is distinct from t.status
   or p.production_status is distinct from t.status
order by greatest(
  coalesce(o.updated_at, '-infinity'::timestamptz),
  coalesce(p.updated_at, '-infinity'::timestamptz),
  coalesce(t.updated_at, '-infinity'::timestamptz)
) desc nulls last;
```

### 4.7 Orders without Production rows

```sql
select
  o.id,
  o.order_number,
  o.source_quote_number,
  o.status,
  o.created_at,
  o.updated_at
from public.orders o
where not exists (
  select 1
  from public.production_jobs p
  where p.order_number = o.order_number
     or (o.source_quote_number is not null and p.quote_number = o.source_quote_number)
)
order by o.updated_at desc nulls last;
```

### 4.8 Production rows without Orders

```sql
select
  p.id,
  p.order_number,
  p.quote_number,
  p.production_status,
  p.created_at,
  p.updated_at
from public.production_jobs p
where coalesce(p.order_number, '') <> ''
  and not exists (
    select 1
    from public.orders o
    where o.order_number = p.order_number
       or (o.source_quote_number is not null and o.source_quote_number = p.quote_number)
  )
order by p.updated_at desc nulls last;
```

### 4.9 Linked rows with missing quote/order/source quote numbers

```sql
select
  o.id as order_id,
  o.order_number,
  o.source_quote_number,
  o.status as order_status,
  p.id as production_job_id,
  p.order_number as production_order_number,
  p.quote_number as production_quote_number,
  p.production_status,
  t.order_number as tracking_order_number,
  t.status as tracking_status
from public.orders o
full join public.production_jobs p
  on p.order_number = o.order_number
  or (o.source_quote_number is not null and p.quote_number = o.source_quote_number)
full join public.order_tracking_public t
  on t.order_number = coalesce(o.order_number, p.order_number)
where nullif(coalesce(o.order_number, p.order_number, t.order_number), '') is null
   or (o.id is not null and nullif(o.source_quote_number, '') is null)
   or (p.id is not null and nullif(p.quote_number, '') is null and nullif(p.order_number, '') is null)
   or (t.order_number is null and o.order_number is not null)
order by coalesce(o.order_number, p.order_number, t.order_number) nulls first;
```

### 4.10 Timestamps showing likely last writer

```sql
select
  coalesce(o.order_number, p.order_number, t.order_number) as order_number,
  o.status as order_status,
  p.production_status,
  t.status as tracking_status,
  o.updated_at as order_updated_at,
  p.updated_at as production_updated_at,
  t.updated_at as tracking_updated_at,
  case greatest(
    coalesce(o.updated_at, '-infinity'::timestamptz),
    coalesce(p.updated_at, '-infinity'::timestamptz),
    coalesce(t.updated_at, '-infinity'::timestamptz)
  )
    when o.updated_at then 'orders'
    when p.updated_at then 'production_jobs'
    when t.updated_at then 'order_tracking_public'
    else 'unknown'
  end as likely_last_writer_table
from public.orders o
full join public.production_jobs p
  on p.order_number = o.order_number
  or (o.source_quote_number is not null and p.quote_number = o.source_quote_number)
full join public.order_tracking_public t
  on t.order_number = coalesce(o.order_number, p.order_number)
order by greatest(
  coalesce(o.updated_at, '-infinity'::timestamptz),
  coalesce(p.updated_at, '-infinity'::timestamptz),
  coalesce(t.updated_at, '-infinity'::timestamptz)
) desc nulls last;
```

### 4.11 Advanced/closed Production rows that differ from Orders

```sql
select
  p.id as production_job_id,
  p.order_number,
  p.quote_number,
  p.production_status,
  o.status as order_status,
  p.updated_at as production_updated_at,
  o.updated_at as order_updated_at
from public.production_jobs p
join public.orders o
  on o.order_number = p.order_number
  or (o.source_quote_number is not null and o.source_quote_number = p.quote_number)
where p.production_status in ('printing', 'qc', 'ready_for_fulfillment', 'closed')
  and p.production_status is distinct from o.status
order by p.updated_at desc nulls last;
```

### 4.12 Production actuals on rows moved backward

```sql
select
  p.id,
  p.order_number,
  p.quote_number,
  p.production_status,
  p.actual_grams_used,
  p.actual_print_hours,
  p.actual_labor_minutes,
  p.scrap_grams,
  p.print_started_at,
  p.print_completed_at,
  p.updated_at
from public.production_jobs p
where p.production_status in ('ready_to_print', 'waiting_customer', 'estimate')
  and (
    coalesce(p.actual_grams_used, 0) <> 0
    or coalesce(p.actual_print_hours, 0) <> 0
    or coalesce(p.actual_labor_minutes, 0) <> 0
    or coalesce(p.scrap_grams, 0) <> 0
    or p.print_started_at is not null
    or p.print_completed_at is not null
  )
order by p.updated_at desc nulls last;
```

### 4.13 Duplicate status-change events

```sql
select
  quote_number,
  order_number,
  event_type,
  date_trunc('second', coalesce(occurred_at, created_at)) as event_second,
  count(*) as duplicate_count,
  min(created_at) as first_created_at,
  max(created_at) as last_created_at
from public.project_events
where event_type in (
  'order.created',
  'order.ready_to_print',
  'order.printing_started',
  'order.print_completed',
  'order.qc_passed',
  'order.needs_reprint',
  'order.closed'
)
group by quote_number, order_number, event_type, date_trunc('second', coalesce(occurred_at, created_at))
having count(*) > 1
order by last_created_at desc nulls last;
```

### 4.14 Missing required workflow events

```sql
with linked as (
  select
    o.order_number,
    o.source_quote_number,
    o.status as order_status,
    p.production_status
  from public.orders o
  left join public.production_jobs p
    on p.order_number = o.order_number
    or (o.source_quote_number is not null and p.quote_number = o.source_quote_number)
), expected as (
  select order_number, source_quote_number, 'order.created' as expected_event from linked
  union all select order_number, source_quote_number, 'order.ready_to_print' from linked where order_status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed') or production_status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed')
  union all select order_number, source_quote_number, 'order.printing_started' from linked where order_status in ('printing','qc','ready_for_fulfillment','closed') or production_status in ('printing','qc','ready_for_fulfillment','closed')
  union all select order_number, source_quote_number, 'order.print_completed' from linked where order_status in ('qc','ready_for_fulfillment','closed') or production_status in ('qc','ready_for_fulfillment','closed')
  union all select order_number, source_quote_number, 'order.qc_passed' from linked where order_status in ('ready_for_fulfillment','closed') or production_status in ('ready_for_fulfillment','closed')
  union all select order_number, source_quote_number, 'order.closed' from linked where order_status = 'closed' or production_status = 'closed'
)
select e.*
from expected e
where not exists (
  select 1
  from public.project_events pe
  where pe.event_type = e.expected_event
    and (pe.order_number = e.order_number or pe.quote_number = e.source_quote_number)
)
order by e.order_number, e.expected_event;
```

### 4.15 Legacy status values

```sql
select 'orders' as source_table, status as legacy_status, count(*) as row_count
from public.orders
where status is null
   or status not in ('ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed')
group by status
union all
select 'production_jobs', production_status, count(*)
from public.production_jobs
where production_status is null
   or production_status not in ('estimate', 'waiting_customer', 'ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed')
group by production_status
union all
select 'order_tracking_public', status, count(*)
from public.order_tracking_public
where status is null
   or status not in ('ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed')
group by status
order by source_table, legacy_status;
```

### 4.16 Browser-accessible direct write authority

Run as metadata first, then review the application network panel in a non-production/staging environment only. Do not perform mutation probes in production.

```sql
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('orders', 'production_jobs', 'order_tracking_public')
  and grantee in ('anon', 'authenticated', 'public')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by table_name, grantee, privilege_type;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'production_jobs', 'order_tracking_public')
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
order by tablename, policyname;
```

## 5. Result-capture table

Only these result values are allowed: **Compliant**, **Partially compliant**, **Conflicting**, **Missing**, **Unable to verify from repository evidence**.

| Area | Repository result | Deployed result | Evidence to paste after operator review | Notes |
|---|---|---|---|---|
| Initial acceptance handoff | Partially compliant | Unable to verify from repository evidence | Pending section 4.1-4.4, 4.6, 4.14 | Corrected migrations make RPC the intended authority, but deployed definition must be confirmed. |
| Manufacturing-state ownership | Partially compliant | Unable to verify from repository evidence | Pending section 4.1, 4.3, 4.6, 4.11 | Production owns commands, while Orders is documented as canonical status holder. |
| Post-acceptance Order coordination | Partially compliant | Unable to verify from repository evidence | Pending section 4.6, 4.10 | Orders may coordinate, but should not independently manufacture. |
| Production Control commands | Partially compliant | Unable to verify from repository evidence | Pending browser/RLS/function review | Manufacturing buttons are expected; close/reprint boundary needs verification. |
| Orders Admin commands | Partially compliant | Unable to verify from repository evidence | Pending browser/RLS/function review | Should own fulfillment/closure after handoff, not printing/QC commands. |
| Fulfillment transition | Partially compliant | Unable to verify from repository evidence | Pending section 4.6, 4.11, browser review | `ready_for_fulfillment` is Production QC pass handoff. |
| Closed-state authority | Partially compliant | Unable to verify from repository evidence | Pending section 4.10-4.11, browser review | Orders/Fulfillment should close; Production close UI may conflict. |
| `needs_reprint` behavior | Partially compliant | Unable to verify from repository evidence | Pending section 4.12, 4.14-4.15 | Contract treats it as event/action returning to `ready_to_print`; tests mention legacy status. |
| Tracking projection | Partially compliant | Unable to verify from repository evidence | Pending section 4.2, 4.4, 4.6, 4.16 | Must remain projection, not authority. |
| Event evidence | Partially compliant | Unable to verify from repository evidence | Pending section 4.13-4.14 | Contract requires one logical event per command. |
| Optimistic concurrency | Partially compliant | Unable to verify from repository evidence | Pending section 4.1 and browser helper review | `set_linked_workflow_status` includes expected timestamp in repository migration. |
| RLS/owner isolation | Unable to verify from repository evidence | Unable to verify from repository evidence | Pending section 4.2, 4.4, 4.16 | Deployed policies/grants are required evidence. |
| Browser side effects | Partially compliant | Unable to verify from repository evidence | Pending staging network review | Current tests assert no acceptance browser side-effect writes. |
| Trigger synchronization | Conflicting | Unable to verify from repository evidence | Pending section 4.3 and 4.11 | Orders-to-Production synchronization can overwrite Production if broadly active. |

## 6. Decision gate

Do not implement this conclusion during this milestone. Use it only as a review gate after deployed query results are supplied.

From the Blueprint repository documents, the expected boundary is:

1. **Production authoritative through QC** for manufacturing commands: Start Print, Complete Print with actuals/scrap, Pass QC, and Needs Reprint.
2. **Explicit handoff at `ready_for_fulfillment`** after Production passes QC/finishing.
3. **Orders/Fulfillment authoritative after handoff** for pickup/shipping fulfillment and operational closeout to `closed`.
4. **Orders stores/coordinates the accepted-work lifecycle**, but that storage must not allow Orders UI, shared helpers, triggers, or projections to become an independent manufacturing authority.
5. **Read models and synchronization mechanisms are not authorities**. `order_tracking_public`, Hub/Customer 360 projections, trigger-maintained copies, and browser caches must follow source-domain commands and events.

If deployed evidence shows that `orders.status` is the only mutable current status and Production commands exclusively use `set_linked_workflow_status`, then the gateway must enforce Production-only rights for manufacturing transitions and Orders/Fulfillment-only rights for closure. If deployed evidence shows broad Orders-to-Production trigger synchronization, treat it as a candidate conflict until proven constrained by state, actor, and command context.

## 7. Future corrective milestone

After operator-supplied deployed query results are reviewed, recommend exactly one small implementation milestone:

> **Constrain the workflow status command boundary so Production-only commands advance manufacturing states through `ready_for_fulfillment`, and Orders/Fulfillment-only commands close after fulfillment handoff, while tracking remains projection-only.**

This future milestone must not include Finance, Inventory consumption, UI redesign, fundraiser work, historical cleanup, or acceptance RPC redesign.

## 8. Testing and delivery

Documentation checks for this milestone should include:

- Markdown/file existence check for `ERP_WORKFLOW_AUTHORITY_VERIFICATION.md`.
- Search check that the document contains the required status vocabulary, function names, and result-capture values.
- `git diff --check`.

Manual browser testing is not required for this documentation-only milestone and must not be claimed. Future implementation work should include staging browser verification of Production Control, Orders Admin, and public tracking network writes.

## 9. Documentation-only closeout: Production vs. Orders Workflow Authority Verification

> **Closeout date:** 2026-07-20
> **Evidence source:** operator-supplied deployed Supabase verification.
> **Change boundary:** documentation only. This closeout did not implement functionality, create migrations, modify application/UI code, change tests, alter deployed Supabase objects, or clean historical data.

### 9.1 Evidence classification

#### Confirmed deployed evidence

The operator supplied the following deployed Supabase findings for the current Production vs. Orders workflow authority contract:

- `public.normalize_accepted_order_status(text)` is `SECURITY INVOKER` and `IMMUTABLE`; maps manufacturing and legacy aliases into accepted Order statuses; defaults unknown values to `ready_to_print`; and has `EXECUTE` granted to `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`.
- `public.set_linked_workflow_status(text, text, timestamptz)` is `SECURITY INVOKER` with `search_path=public`; is executable by `authenticated`, `postgres`, and `service_role`; accepts `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, and `closed`; locks and updates `orders`, then directly updates `order_tracking_public`; bypasses optional optimistic concurrency when the expected timestamp is null; and does not enforce domain-specific transition ownership or legal transition edges.
- `public.sync_order_workflow_to_production()` is `SECURITY DEFINER` with `search_path=public`; has `EXECUTE` granted to `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`; blindly copies changed `orders.status` into linked `production_jobs.production_status`; and can overwrite Production state, including backward movement or closure, without a Production-owned command.
- The deployed Orders trigger is:

```sql
CREATE TRIGGER orders_sync_workflow_to_production
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN ((old.status IS DISTINCT FROM new.status))
EXECUTE FUNCTION sync_order_workflow_to_production()
```

- Orders and `order_tracking_public` normalize status on `INSERT` and `UPDATE`.
- Orders invokes `sync_order_workflow_to_production` only after a changed status.
- Orders, tracking, and Production have `updated_at` triggers.
- The retired Quote acceptance trigger is absent.
- RLS is enabled on `orders`, `production_jobs`, and `order_tracking_public`.
- Owner isolation is present.
- Authenticated owners retain direct CRUD capability on all three workflow tables.
- Orders and Production have broad browser table grants.
- Production has duplicate owner CRUD policy sets.
- Anonymous table grants exist on Orders and Production, although deployed RLS owner checks prevent ordinary anonymous row access.
- Direct authenticated table writes can bypass the intended workflow command boundary.
- Public tracking is not technically enforced as projection-only because authenticated owners can write it directly.

#### Confirmed deployed data evidence

- `order_tracking_public` status distribution: `closed=3`, `ready_to_print=1`.
- `orders` status distribution: `closed=3`.
- `production_jobs` status distribution: `closed=23`, `estimate=2`, `ready_to_print=3`.
- No current `printing`, `qc`, or `ready_for_fulfillment` records exist.
- The focused linked-record mismatch query returned no rows.
- Current linked records are consistent, but live workflow handoff behavior cannot be verified from current data.
- Confirmed real Orders:
  - `OP-000178`, Rocky-PHM, direct/manual Order, `closed`, with matching tracking and no Production job.
  - `OP-000184`, PETG Pocket Door Spacer Clip, source Quote `Q-000184`, `created_from_quote=true`, `closed`, with matching tracking and no Production job.

#### Historical/test/abandoned evidence

The operator confirmed that these Production rows reference absent Orders and should be classified as historical/test/abandoned evidence, not current authority defects to repair in this milestone:

- `OP-000006` / `Q-000006`
- `OP-000002` / `Q-000002`
- `OP-805877` / `Q-805877`
- `OP-000005` / `Q-000005`

No deletion, repair, backfill, or cleanup is proposed for these records in this milestone.

#### Repository evidence

Repository evidence continues to show intended domain boundaries, browser write paths, migrations, tests, and architecture documents. It is useful for interpreting the contract, but it is not treated as proof of deployed Supabase behavior unless matched by operator-supplied deployed evidence.

#### Inference

The primary inference from the confirmed deployed evidence is that current linked rows can be internally consistent while the command authority boundary remains non-compliant. Consistency exists because active linked records currently match, not because deployed grants, policies, triggers, and functions technically prevent unauthorized cross-domain workflow mutation.

#### Unable to verify

- Current runtime workflow event-envelope emission is unable to verify because no new workflow transition has been performed since the contract was introduced.
- Live Production-to-Fulfillment handoff behavior is unable to verify because no active real linked workflow exists in `printing`, `qc`, or `ready_for_fulfillment`.
- Browser behavior was not manually verified during this documentation-only closeout.

### 9.2 Manufacturing-actuals verification

The operator supplied a corrected deployed data-integrity check for early-state Production jobs:

- The first query produced five early-state rows only because `actual_filaments` and `actual_filament_usage` contain empty JSON arrays rather than empty JSON objects.
- The corrected query treated both empty arrays and empty objects as empty.
- The corrected query returned no rows.
- Therefore, no current `estimate`, `waiting_customer`, or `ready_to_print` Production job retains nonempty manufacturing actuals, start timestamps, or completion timestamps.

Classification: **Compliant**.

### 9.3 Event evidence

- `project_events` contains the full Blueprint envelope columns: `event_id`, `occurred_at`, `aggregate_type`, `aggregate_id`, `actor_type`, `actor_id`, `correlation_id`, `causation_id`, `schema_version`, and `payload`.
- All 16 existing events are legacy pre-envelope records:
  - `production_closed`: 1
  - `production_job_canceled`: 8
  - `production_status_changed`: 3
  - `quote_voided`: 4
- All 16 existing events have null envelope fields.
- The non-null `event_id` duplicate query returned no rows.
- Null legacy event IDs are historical missing envelope values, not duplicate IDs.
- No envelope-format events currently exist.
- Historical event evidence is **Partially compliant**.
- Existing envelope completeness is **Missing**.
- Duplicate assigned event identities are **Compliant** because none were found.
- Current runtime event-envelope emission is **Unable to verify** because no new workflow transition has been performed since the contract was introduced.

### 9.4 Required classifications

| Verification area | Closeout classification | Basis |
|---|---|---|
| Owner isolation | Compliant | RLS is enabled and owner isolation is present on the workflow tables. |
| Current linked-record status consistency | Compliant | Focused linked-record mismatch query returned no rows. |
| Early-state Production jobs retaining manufacturing actuals | Compliant | Corrected deployed query found none. |
| Least-privilege table/function grants | Partially compliant | Anonymous access is constrained by RLS for ordinary row access, but broad grants remain on workflow functions/tables. |
| Production policy duplication | Partially compliant | Duplicate owner CRUD policy sets exist on Production. |
| Workflow command boundary | Conflicting | Authenticated browser clients can directly mutate workflow tables, and Orders status changes trigger direct Production overwrites. |
| Production ownership of printing, qc, reprint, and manufacturing actuals | Conflicting | Orders-trigger synchronization and shared write paths can overwrite Production workflow state without Production-owned commands. |
| Orders/Fulfillment ownership of ready_for_fulfillment and closed | Conflicting or not technically enforced | `set_linked_workflow_status` accepts workflow states without domain-specific transition ownership checks. |
| Public tracking as projection-only | Conflicting | Authenticated owners can write `order_tracking_public` directly. |
| Optional optimistic concurrency enforcement | Partially compliant | RPC supports an expected timestamp but bypasses the check when the expected timestamp is null. |
| Historical event evidence | Partially compliant | Legacy workflow/audit events exist, but they predate the envelope. |
| Blueprint event-envelope completeness for existing records | Missing | All 16 existing events have null envelope fields. |
| Duplicate non-null event IDs | Compliant | Non-null duplicate query returned no rows. |
| Current runtime workflow event emission | Unable to verify | No new workflow transition has been performed since the contract was introduced. |
| Live Production-to-Fulfillment handoff behavior | Unable to verify | No active real linked workflow exists in `printing`, `qc`, or `ready_for_fulfillment`. |

### 9.5 Decision gate

The deployed workflow authority is **not Blueprint-compliant**, even though current linked rows are consistent. The primary conflict is that authenticated browser clients can directly mutate workflow tables and the Orders trigger blindly writes changed Order status into Production.

### 9.6 Exactly one recommended next corrective milestone

Recommend exactly one future corrective milestone:

> **Enforce Production and Fulfillment Workflow Command Authority.**

That future milestone should be narrowly limited to:

- Production-owned commands for `printing`, `qc`, `needs_reprint`, and manufacturing actuals.
- Orders/Fulfillment-owned commands for `ready_for_fulfillment` and `closed`.
- Explicit legal transition validation.
- Mandatory optimistic concurrency for workflow changes.
- Projection-only updates to public tracking.
- Removal of blind Orders-to-Production status overwrites.
- Removal of unnecessary function/table grants and duplicate Production policies.
- Blueprint-envelope event emission for new transitions.
- Preservation of existing historical records without cleanup or backfill unless separately approved.
- Focused contract tests and read-only deployment verification.

Explicitly excluded from that future milestone: Finance, Inventory consumption, Quote acceptance redesign, UI redesign, Fundraiser work, and historical data cleanup.

No corrective migration is created in this milestone.

## Repository-planned corrective contract — workflow command authority (2026-07-20)

Migration `supabase/migrations/202607200006_workflow_command_authority.sql` is the focused repository artifact for enforcing the Blueprint workflow command boundary. It is **not deployed**. Codex did not apply the migration, run SQL against Supabase, mutate historical/test data, or backfill legacy events.

The planned contract retires blind Orders-to-Production status copying, replaces browser-writable workflow mutation with authenticated command RPCs, requires non-null optimistic concurrency for every workflow mutation, locks authoritative rows before validation, and projects customer-safe tracking only inside approved server-side commands. Production commands own manufacturing transitions and actual recording (`start_print`, `complete_print`, `needs_reprint`). Fulfillment commands own the customer-ready handoff and closeout (`ready_for_fulfillment`, `close_order`). `needs_reprint` remains internal Production evidence and projects publicly as `ready_to_print`.

The planned migration also revokes authenticated direct INSERT/UPDATE/DELETE authority on `orders`, `production_jobs`, and `order_tracking_public` where those grants bypass command authority, preserves owner-scoped SELECT access and service-role recovery access, removes duplicate Production owner CRUD policies, and revokes unnecessary execution grants from retired workflow helper functions. Every successful workflow command appends one Blueprint-envelope `project_events` row with database uniqueness on `(correlation_id, event_type)` for retry-safe event emission. Existing legacy events remain untouched.

Deployment proof remains pending operator-supplied Supabase verification using the migration's preflight and post-deployment queries. Until that evidence is supplied, this is repository-planned corrective evidence only, not a deployed-state claim.
