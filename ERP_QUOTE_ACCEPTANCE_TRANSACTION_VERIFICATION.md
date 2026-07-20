# Public Quote Acceptance Transaction Verification

> **Milestone type:** documentation-only corrective preparation  
> **Blueprint:** ERP Blueprint v1  
> **Mutation policy:** read-only verification only. Do not implement fixes, modify application/UI code, create migrations, change schemas, alter RLS/grants, or mutate deployed data as part of this milestone.

## Purpose

This document prepares the next deployed verification pass for public Quote acceptance. It does **not** decide or implement a fix. Its job is to separate what the repository proves from what only the deployed Supabase database can prove, then provide read-only SQL that an operator can run against production metadata and existing records.

The verification scope is limited to:

- `public.respond_to_quote_public`;
- public Quote acceptance and decline/change-request submission;
- `quotes.customer_response` and accepted Quote state;
- creation of exactly one permanent `orders` row;
- `orders.source_quote_number` and `converted_order_number` lineage;
- accepted commercial snapshots;
- `production_jobs` linkage and status handoff;
- `order_tracking_public` customer-safe projection;
- `project_events` required audit evidence;
- document identity allocation;
- idempotency, duplicate acceptance, transaction boundaries, and failure behavior.

## Evidence classification rules

| Classification | Meaning |
|---|---|
| Confirmed repository evidence | Directly visible in checked-in documentation, application code, tests, or migrations. |
| Operator-supplied deployed evidence | Results copied from read-only production metadata or existing production rows. Empty until an operator supplies results. |
| Repository inference | A likely behavior inferred from application calls or migrations, but not proven by a checked-in authoritative DDL/RPC definition. |
| Unresolved deployed behavior | Behavior that cannot be proven from this repository and must be verified against the deployed Supabase instance. |

## Authoritative Blueprint v1 comparison baseline

### Business-event contract

`BUSINESS_EVENT_CONTRACT.md` requires `quote.accepted` to mean the exact offered snapshot was accepted and exactly one Order was created in the same operation. `quote.change_requested` creates no Order. Required events commit atomically with their business change, use stable lowercase dot-separated names, include durable IDs and correlation/causation context, and are append-only.

### Domain contracts

`DOMAIN_CONTRACTS.md` assigns final customer-facing commercial offer/response and immutable totals snapshot to Quote, while Orders owns Order identity, accepted snapshot reference, Production linkage, fulfillment coordination, tracking projection, and post-acceptance customer communication. Quote acceptance must be idempotent and create exactly one Order; change request and cancellation must create no Order.

### Data ownership matrix

`DATA_OWNERSHIP_MATRIX.md` requires:

- `Q-######` identity owned by Quote/ID service;
- customer totals snapshot owned by Quote and immutable on acceptance;
- Quote response/status owned by Quote and public response RPC;
- `OP-######` identity owned by Orders/ID service;
- accepted Quote and resulting Order to retain the same six-digit suffix;
- exactly one Order per accepted Quote;
- consumers to use the accepted snapshot rather than recalculate customer-facing totals.

### Lifecycles

`LIFECYCLES.md` makes Quote acceptance terminal for the accepted customer decision, and makes the accepted Order begin at `ready_to_print`. `order.print_completed` never closes the Order; `needs_reprint` returns to `ready_to_print` while preserving prior actuals.

### Shared services

`SHARED_SERVICES.md` requires server-side ID allocation, transactionally paired allocation and creation, idempotent retry returning the existing identity, least-privilege public response shapes, critical multi-record operations through reviewed RPCs/transactions, and events committed with required business changes.

### Engineering architecture

`ENGINEERING_ARCHITECTURE.md` requires public acceptance to atomically record the response, allocate/validate `OP-######`, create the Order, preserve the accepted snapshot, emit required events, and do all of that or none of it. It also requires public endpoints to be least privilege and idempotent.

## Currently visible execution paths

### Path A: anonymous public `quote-response.html`

**Confirmed repository evidence**

1. The page requires `q` and `token` URL parameters, then calls `get_quote_public` to load an allowlisted Quote projection.
2. On Approve or Request Changes, it calls exactly one `respond_to_quote_public` RPC with `p_quote_number`, `p_public_token`, `p_response`, and `p_message`.
3. For `accepted`, the page refuses to show success unless the RPC returns `order_number`.
4. After the RPC returns, it sends a non-authoritative Formspree notification. This is outside Supabase and is not evidence of transaction success.
5. The page does not directly insert `orders`, patch `quotes`, patch `production_jobs`, patch `order_tracking_public`, or allocate an `OP-` number.
6. The regression test asserts exactly one public acceptance RPC call, no client-side `OP-` fabrication from `Q-`, no linked-production RPC, and exactly one click handler for each response button.

**Repository inference**

- The deployed `respond_to_quote_public` RPC is expected to own Quote response, Order creation, Production handoff/triggers, accepted snapshot persistence, idempotency, and customer-safe tracking projection, because the public page has no fallback write path.

**Unresolved deployed behavior**

- Whether `respond_to_quote_public` is `SECURITY DEFINER`, owner-safe, anonymous-callable, token-validating, transactionally atomic, idempotent, and able to return/reuse the authoritative `order_number` cannot be proven from checked-in migrations because no migration defines it.

### Path B: authenticated internal `quote.js` acceptance

**Confirmed repository evidence**

1. The current root `quote.js` still derives an `OP-` display helper from `Q-` by replacing the prefix, but its internal acceptance function calls `respond_to_quote_public` and expects the server response.
2. The internal acceptance flow ensures/saves the Quote, obtains or creates a public token by reading/patching `quotes.public_token`, then calls `/rest/v1/rpc/respond_to_quote_public` with `p_response: "accepted"`.
3. After the RPC returns, the internal flow still performs browser follow-up writes:
   - patches linked `production_jobs` to `ready_to_print` with `order_number`, `quote_accepted_at`, and `quote_handoff_status` when matching by `productionJobId` or `quote_number`;
   - patches `order_tracking_public` for status/public messaging.
4. Tests assert the main saved-Quote acceptance flow uses `acceptQuoteThroughServer`, does not build Order totals locally, and that saved Quote totals snapshot fields are present in `quote.js`.

**Repository inference**

- Internal authenticated acceptance has at least two possible authorities for side effects: the RPC and browser follow-up writes. If the deployed RPC/triggers already patch `production_jobs` and tracking, the follow-up writes may duplicate or overwrite side effects. If the RPC does not do those writes, then acceptance is not fully atomic from the browser path because post-RPC patches can fail independently.

**Unresolved deployed behavior**

- Whether browser follow-up writes are harmless projections, required compatibility repairs, or conflicting second authorities depends on deployed RPC/trigger definitions and deployed table constraints.

### Path C: older/archived `js/quote.js` acceptance bridge

**Confirmed repository evidence**

- `js/quote.js` contains an older `acceptAndCreateOrder` implementation that builds an Order payload in the browser, derives `order_number` from the Quote number, upserts `orders`, patches `quotes`, and patches linked `production_jobs`.

**Repository inference**

- This file appears to be historical or non-current relative to the root `quote.js` tested by the current suite, but it remains checked in and may still be served if referenced by a page or deployment manifest outside this repository view.

**Unresolved deployed behavior**

- Whether production serves root `quote.js` only, `js/quote.js`, or both must be verified from deployed static hosting configuration. If `js/quote.js` is live, it is a visible non-atomic browser acceptance path and conflicts with Blueprint v1.

### Path D: database triggers and linked workflow RPCs

**Confirmed repository evidence**

- Migration `202607160003_persist_production_quote_status.sql` defines `advance_linked_production_on_quote_acceptance()`, a trigger on `quotes.customer_response` that advances linked `production_jobs` from `waiting_customer` to `ready_to_print` when a Quote becomes accepted.
- Migration `202607160004_authoritative_bidirectional_workflow.sql` defines `sync_order_workflow_to_production()`, a trigger on `orders` insert/update that copies Order status/order/quote linkage into linked `production_jobs`.
- The same migration defines `set_linked_workflow_status()`, which updates `orders.status` and `order_tracking_public` in one function after acceptance.
- Migration `202607200001_public_access_ownership_security_hardening.sql` defines `public_order_tracking_lookup(text)` as a customer-safe public tracking projection RPC and removes direct anonymous access to `order_tracking_public`.

**Repository inference**

- The repository contains at least two Production handoff mechanisms: Quote-response trigger and Order-workflow trigger. If both are deployed, accepting a Quote and creating an Order may update the same `production_jobs` row through multiple database paths, plus current authenticated browser follow-up patches.

**Unresolved deployed behavior**

- Trigger deployment state, trigger firing order, trigger security mode, old trigger remnants, and interactions with `respond_to_quote_public` are unknown until production metadata is inspected.

## Required atomic acceptance contract

The future implementation contract, after deployed evidence is reviewed and a corrective milestone is approved, must satisfy all of the following. This section is intentionally prescriptive about outcomes, not schema design.

1. **One Quote acceptance**: a valid public token and exact `Q-######` identify one acceptably current Quote. Acceptance updates the Quote response exactly once to the accepted state and stores response message/time/actor evidence.
2. **Exactly one permanent Order**: acceptance creates one durable `orders` row, or returns the already-created row on retry. There must never be zero Orders for an accepted Quote or multiple Orders for one accepted Quote.
3. **Permanent source linkage**: the Order permanently records `source_quote_number = Q-######`. The accepted Quote records the returned `converted_order_number` or equivalent explicit Order linkage. Neither side relies on numeric inference alone.
4. **Immutable accepted commercial snapshot**: the accepted customer totals/terms are preserved in a durable snapshot at acceptance. Order, Finance import, public Quote, PDF/email, and tracking consume the snapshot instead of recalculating totals.
5. **Required business events**: `quote.accepted` and `order.created` commit with the acceptance transaction. A change request commits `quote.change_requested` and no Order. Events include server time, aggregate IDs, human references, correlation/causation context, actor, payload version, and append-only evidence.
6. **Correct Production handoff**: the linked Production job is advanced/linked exactly as the approved domain contract requires for accepted work, without creating a competing manufacturing authority or overwriting Production actuals.
7. **Customer-safe tracking projection**: public tracking exposes only allowlisted Order/payment/fulfillment status through the approved public lookup RPC/projection and never exposes private costs, notes, customer PII beyond approved fields, assets, or accounting internals.
8. **Idempotent repeated submission**: double-click, browser retry, network timeout retry, and repeated accept after success return the same `OP-######` and do not duplicate Orders, events, tracking rows, or Production handoffs.
9. **No partial state on failure**: if any required step fails, the transaction rolls back Quote response, Order creation, snapshot persistence, events, Production handoff, and tracking projection. A client timeout is treated as unknown outcome and resolved by lookup/retry, not a fresh operation.

## Read-only Supabase verification queries

> **Production mutation tests are explicitly prohibited.** Do not insert test Quotes, invoke acceptance on live Quotes, alter functions, alter grants, disable triggers, edit RLS, or repair rows during verification. Use metadata and existing deployed records only. Run queries in a read-only SQL session where possible.

### 1. Deployed `respond_to_quote_public` definition and security mode

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  l.lanname as language,
  case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  p.provolatile as volatility,
  p.proconfig as function_settings,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname = 'respond_to_quote_public';
```

### 2. Function grants

```sql
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'respond_to_quote_public',
    'get_quote_public',
    'next_document_counter',
    'set_linked_workflow_status',
    'public_order_tracking_lookup'
  )
order by routine_name, grantee, privilege_type;
```

### 3. Quote/order linkage for accepted Quotes

```sql
select
  q.id as quote_id,
  q.quote_number,
  q.customer_response,
  q.quote_status,
  q.converted_order_number,
  q.customer_responded_at,
  q.accepted_date,
  o.id as order_id,
  o.order_number,
  o.source_quote_number,
  o.status as order_status,
  o.created_at as order_created_at
from public.quotes q
left join public.orders o
  on o.source_quote_number = q.quote_number
  or o.order_number = q.converted_order_number
where q.customer_response = 'accepted'
   or q.quote_status in ('accepted', 'converted_to_order')
order by coalesce(q.customer_responded_at, q.updated_at, q.created_at) desc nulls last;
```

### 4. Duplicate or missing derived Orders per accepted Quote

```sql
with accepted_quotes as (
  select id, quote_number, converted_order_number
  from public.quotes
  where customer_response = 'accepted'
     or quote_status in ('accepted', 'converted_to_order')
), linked_orders as (
  select
    q.id as quote_id,
    q.quote_number,
    count(distinct o.id) as order_count,
    array_agg(distinct o.order_number order by o.order_number) filter (where o.id is not null) as order_numbers
  from accepted_quotes q
  left join public.orders o
    on o.source_quote_number = q.quote_number
    or o.order_number = q.converted_order_number
  group by q.id, q.quote_number
)
select *
from linked_orders
where order_count <> 1
order by quote_number;
```

### 5. Accepted Quotes without explicit source linkage

```sql
select
  q.id,
  q.quote_number,
  q.customer_response,
  q.quote_status,
  q.converted_order_number,
  q.customer_responded_at,
  q.accepted_date
from public.quotes q
where (q.customer_response = 'accepted' or q.quote_status in ('accepted', 'converted_to_order'))
  and not exists (
    select 1
    from public.orders o
    where o.source_quote_number = q.quote_number
      and (q.converted_order_number is null or o.order_number = q.converted_order_number)
  )
order by coalesce(q.customer_responded_at, q.updated_at, q.created_at) desc nulls last;
```

### 6. Orders marked created from Quote but missing `source_quote_number`

```sql
select
  id,
  order_number,
  source_quote_number,
  created_from_quote,
  converted_from_quote,
  quote_number,
  status,
  created_at,
  updated_at
from public.orders
where coalesce(created_from_quote, false) = true
   or coalesce(converted_from_quote, false) = true
   or quote_number is not null
order by created_at desc nulls last;
```

Review rows where `source_quote_number is null` or where a legacy `quote_number` exists without permanent `source_quote_number`.

### 7. Production rows missing Quote or Order linkage

```sql
select
  p.id as production_job_id,
  p.user_id,
  p.quote_number,
  p.order_number,
  p.production_status,
  p.quote_handoff_status,
  p.quote_accepted_at,
  q.id as quote_id,
  q.customer_response,
  o.id as order_id,
  o.source_quote_number,
  o.status as order_status
from public.production_jobs p
left join public.quotes q on q.quote_number = p.quote_number
left join public.orders o
  on o.order_number = p.order_number
  or (p.quote_number is not null and o.source_quote_number = p.quote_number)
where p.production_status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed')
  and (q.id is null or o.id is null or p.order_number is null or p.quote_number is null)
order by p.updated_at desc nulls last;
```

### 8. Tracking rows missing matching Orders

```sql
select
  t.order_number,
  t.order_title,
  t.status,
  t.updated_at,
  o.id as order_id,
  o.source_quote_number,
  o.status as order_status
from public.order_tracking_public t
left join public.orders o on o.order_number = t.order_number
where o.id is null
   or t.status is distinct from o.status
order by t.updated_at desc nulls last;
```

### 9. Acceptance-related `project_events`

```sql
select
  event_id,
  event_type,
  occurred_at,
  actor_type,
  actor_id,
  aggregate_type,
  aggregate_id,
  quote_number,
  order_number,
  correlation_id,
  causation_id,
  schema_version,
  payload
from public.project_events
where event_type in ('quote.accepted','quote.change_requested','order.created','order.ready_to_print')
   or event_type ilike '%accept%'
   or event_type ilike '%quote%'
   or event_type ilike '%order%created%'
order by occurred_at desc nulls last, created_at desc nulls last
limit 200;
```

### 10. Evidence of accepted commercial snapshots

```sql
select
  q.id,
  q.quote_number,
  q.customer_response,
  q.quote_status,
  q.customer_totals,
  q.quote_data -> 'customer_totals' as quote_data_customer_totals,
  q.accepted_snapshot,
  q.accepted_quote_snapshot,
  q.accepted_commercial_snapshot,
  o.id as order_id,
  o.order_number,
  o.source_quote_number,
  o.accepted_snapshot,
  o.accepted_quote_snapshot,
  o.customer_totals,
  o.order_total,
  o.deposit_amount,
  o.balance_amount
from public.quotes q
left join public.orders o on o.source_quote_number = q.quote_number
where q.customer_response = 'accepted'
   or q.quote_status in ('accepted', 'converted_to_order')
order by coalesce(q.customer_responded_at, q.updated_at, q.created_at) desc nulls last
limit 200;
```

If a referenced column does not exist in the deployed schema, capture the error and rerun a column inventory instead of changing schema:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('quotes','orders')
  and (
    column_name ilike '%snapshot%'
    or column_name ilike '%total%'
    or column_name ilike '%deposit%'
    or column_name ilike '%balance%'
    or column_name in ('quote_data','customer_totals','source_quote_number','converted_order_number')
  )
order by table_name, ordinal_position;
```

### 11. Trigger/function interactions that may duplicate side effects

```sql
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_orientation,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('quotes','orders','production_jobs','order_tracking_public','project_events')
order by event_object_table, trigger_name, event_manipulation;
```

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%quote%'
    or p.proname ilike '%order%'
    or p.proname ilike '%production%'
    or p.proname ilike '%tracking%'
    or p.proname ilike '%event%'
    or p.proname ilike '%document%'
    or p.proname ilike '%counter%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);
```

### 12. Document identity allocation and suffix parity

```sql
select
  q.quote_number,
  o.order_number,
  o.source_quote_number,
  regexp_replace(q.quote_number, '^Q-', '') as quote_suffix,
  regexp_replace(o.order_number, '^OP-', '') as order_suffix,
  case
    when regexp_replace(q.quote_number, '^Q-', '') = regexp_replace(o.order_number, '^OP-', '') then 'suffix_matches'
    else 'suffix_conflict'
  end as suffix_result
from public.quotes q
join public.orders o on o.source_quote_number = q.quote_number
where q.customer_response = 'accepted'
   or q.quote_status in ('accepted', 'converted_to_order')
order by q.quote_number;
```

```sql
select key, value, updated_at
from public.document_counters
where key in ('quote','order','invoice')
order by key;
```

## Deployed verification closeout — 2026-07-20

This closeout records operator-supplied deployed Supabase evidence only. This repository environment did not connect to Supabase, mutate deployed state, run acceptance on live data, alter grants/RLS/schema, or repair rows.

### Confirmed repository evidence

- `quote-response.html` delegates public acceptance/change submission to one `respond_to_quote_public` RPC and does not directly write `orders`, `production_jobs`, `order_tracking_public`, or `project_events`.
- Root `quote.js` calls `respond_to_quote_public` for internal acceptance, then still performs browser follow-up Production and tracking writes. That remains a conflicting second authority now that deployed evidence confirms the RPC and triggers also write acceptance-related state.
- Repository migrations define multiple possible handoff mechanisms: `advance_linked_production_on_quote_acceptance`, `sync_order_workflow_to_production`, and `set_linked_workflow_status`.
- No checked-in migration defines `respond_to_quote_public`, the deployed core `quotes`/`orders` table definitions, immutable accepted snapshot columns, or Blueprint-compliant event envelope columns.

### Operator-supplied deployed evidence

#### `respond_to_quote_public`

- Signature: `respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text)`.
- Return type: `jsonb`.
- Function properties: PL/pgSQL, volatile, `SECURITY DEFINER`, fixed `search_path=public`.
- Validates the supplied `quote_number` and `public_token`.
- Accepts only `accepted` or `declined`.
- Derives the `OP-######` identity by replacing the `Q-` prefix with `OP-`.
- Updates Quote response/status and `converted_order_number`.
- Inserts an `orders` row with `ON CONFLICT (order_number) DO NOTHING`.
- Does not populate `orders.source_quote_number`.
- Does not populate `created_from_quote` or `accepted_date`.
- Does not preserve an explicit immutable accepted commercial snapshot.
- Does not emit `quote.accepted` or `order.created` events.
- Upserts `order_tracking_public` and may reset an existing projection on repeated acceptance.
- Returns the derived order number without proving that a conflicting existing Order belongs to the Quote.
- All function and trigger writes participate in the PostgreSQL function transaction, but the transaction omits required Blueprint state.

#### Grants and RLS interaction

- `get_quote_public` and `respond_to_quote_public` are executable by `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`.
- `set_linked_workflow_status` is executable by `PUBLIC` and `anon` as well as authenticated roles.
- `set_linked_workflow_status` is `SECURITY INVOKER`, so deployed RLS currently prevents anonymous mutation.
- `orders` and `order_tracking_public` policies are authenticated-only and owner-scoped.
- The workflow RPC grants are unnecessarily broad, but the evidence does **not** confirm an anonymous-write bypass.

#### Deployed accepted/test records

- `Q-000006` is accepted/converted and references `OP-000006`, but no `orders` row exists.
- Its Production job references `Q-000006`/`OP-000006` and is marked `accepted_created_order` despite the missing Order.
- `Q-000008` has one correctly linked test Order.
- The operator confirmed `Q-000006`, `Q-000008`, and most other early rows are historical test/abandoned data.
- These rows are not classified as current customer workflow failures. They are test residue demonstrating that the historical path allowed partial/inconsistent state.

#### Operator-confirmed real records

- `OP-000178` / Rocky-PHM is a direct/manual Order, not Quote-created.
- `OP-000184` / PETG Pocket Door Spacer Clip is marked `created_from_quote` and references `Q-000184`, but the source Quote row no longer exists.
- Both records have synchronized closed public tracking rows.
- Neither record has a linked Production row.
- Existing real records therefore cannot prove a complete current end-to-end Quote acceptance transaction.

#### Tracking evidence

- Public lookup for `OP-000184` succeeded through `public_order_tracking_lookup(text)`.
- A blank-order-number tracking row titled `500 Toys` exists and is operator-confirmed test/abandoned residue.
- Valid public tracking security was already verified in the prior milestone.

#### Event evidence

- Deployed `project_events` columns are: `id`, `user_id`, `project_id`, `quote_number`, `order_number`, `event_type`, `details`, `created_at`.
- The table lacks the Blueprint event envelope fields: `event_id`, `occurred_at`, `actor_type`, `actor_id`, `aggregate_type`, `aggregate_id`, `correlation_id`, `causation_id`, `schema_version`, and canonical payload.
- No `quote.accepted` or `order.created` events were found.
- Existing matching events were Production lifecycle and `quote_voided` evidence only.
- Blueprint-compliant acceptance events are classified as Missing/Conflicting.

#### Commercial snapshot evidence

- `quotes` contains `quote_total` and `quote_data`.
- `orders` contains `order_total`, `deposit_amount`, `balance_amount`, and `invoice_terms`.
- No accepted snapshot columns exist.
- `respond_to_quote_public` copies selected mutable values but does not preserve the exact accepted offer.
- The immutable accepted commercial snapshot is Missing.

#### Constraints and idempotency

- `orders.order_number` is globally unique.
- `orders.source_quote_number` is not unique and has no foreign key.
- No constraint enforces exactly one Order per accepted Quote.
- `ON CONFLICT (order_number) DO NOTHING` prevents one narrow duplicate case but does not validate ownership/linkage.
- A pre-existing Order-number collision could cause the RPC to mark the Quote accepted, return the conflicting number, and overwrite its tracking projection.
- Idempotency is Partially compliant/Conflicting.

#### Trigger interactions

- `advance_linked_production_on_quote_acceptance` is `SECURITY DEFINER` and advances `waiting_customer` Production rows to `ready_to_print`.
- `enforce_accepted_order_status` normalizes legacy statuses.
- `sync_order_workflow_to_production` is `SECURITY DEFINER` and links/synchronizes Production using `order_number` or `source_quote_number`.
- Because the acceptance RPC does not populate `source_quote_number`, Order-trigger linkage is incomplete unless Production already has the derived order number.
- Root `quote.js` browser follow-up Production/tracking writes remain a conflicting second authority.

### Unresolved behavior

- Static hosting was not verified, so whether archived `js/quote.js` is live remains unresolved.
- Existing real records do not prove a complete current Quote acceptance transaction because the real records are manual/direct, lack the source Quote row, or lack linked Production.
- No live acceptance mutation was performed, so runtime behavior under a fresh real acceptance, retry, timeout, or collision remains inferred from deployed definitions and existing rows rather than newly exercised.

## Result-capture table

| Area | Query/result reference | Classification | Repository evidence summary | Operator-supplied deployed evidence | Follow-up needed |
|---|---|---|---|---|---|
| `respond_to_quote_public` exists and is correct security mode | Query 1 | Partially compliant | RPC is called by clients; no checked-in definition found. | Deployed as PL/pgSQL, volatile, `SECURITY DEFINER`, fixed `search_path=public`, returns `jsonb`, validates Quote number/token, accepts only `accepted` or `declined`. | Keep RPC as the candidate authority, but correct omitted Blueprint state. |
| `respond_to_quote_public` grants allow intended public access only | Query 2 | Partially compliant | Public page calls RPC anonymously with token. | Executable by `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`. Public execution is needed for token response, but grants are broader than least privilege. | Tighten to least-privilege grants without breaking public token flow. |
| Workflow RPC grants | Query 2 | Partially compliant | `set_linked_workflow_status` exists in repository migration. | Executable by `PUBLIC`/`anon`, but `SECURITY INVOKER` plus deployed owner-scoped RLS prevents confirmed anonymous mutation. | Revoke unnecessarily broad workflow RPC grants. |
| Accepted Quote creates exactly one Order | Queries 3-4 | Conflicting | Blueprint requires one Order; repository has no deployed constraint proof. | `Q-000006` test residue is accepted/converted but has no Order; `Q-000008` test residue has one linked Order; no real record proves full end-to-end acceptance. | Enforce exactly one Order per accepted Quote in the future RPC/constraints. |
| Permanent `orders.source_quote_number` linkage | Queries 3, 5-6 | Missing | Current code and inventory reference `source_quote_number`; deployed constraints unknown. | Deployed RPC does not populate `orders.source_quote_number`; column is not unique and has no FK. `OP-000184` references missing `Q-000184`. | Add validated permanent Quote→Order linkage. |
| Accepted commercial snapshot exists and is immutable | Query 10 | Missing | Root `quote.js` stores mutable totals-shaped data; no schema immutability evidence. | `quotes.quote_total`/`quote_data` and `orders.order_total`/deposit/balance/terms exist, but no accepted snapshot columns exist and RPC copies selected mutable values. | Persist immutable accepted commercial snapshot. |
| Required `project_events` | Query 9 | Missing | Event contract requires `quote.accepted` and `order.created`; table hardening migration only scopes access. | Deployed table lacks Blueprint event envelope fields and no `quote.accepted` or `order.created` events were found. | Emit append-only Blueprint-compliant acceptance events atomically. |
| Production handoff/linkage | Queries 7 and 11 | Conflicting | Migrations define Quote and Order triggers; root `quote.js` also patches Production after RPC. | Quote trigger advances waiting-customer jobs; Order trigger links/syncs using order number/source quote; RPC omits `source_quote_number`, making linkage incomplete unless the derived order number is already present. | Choose one approved Production handoff path. |
| Customer-safe tracking projection | Queries 2, 8, 11 | Partially compliant | Security hardening migration creates public lookup RPC and removes direct anon table access. | `public_order_tracking_lookup(text)` succeeded for `OP-000184`; policies are authenticated-only/owner-scoped; RPC may reset existing tracking projection on repeated acceptance. | Preserve customer-safe projection while making acceptance collision/retry-safe. |
| Idempotent repeated submission | Queries 1, 3-4, 9, 11 | Partially compliant | Tests assert single client call; server behavior not defined in repo. | `ON CONFLICT (order_number) DO NOTHING` handles one duplicate order-number case, but does not validate ownership or prevent tracking overwrite/collision ambiguity. | Make idempotency collision-safe and retry-safe. |
| No partial state on failure | Query 1 plus trigger inventory | Conflicting | Blueprint requires one transaction; RPC definition absent from repository. | Function/trigger writes are transactional, but the transaction omits required Order linkage, snapshot, events, and complete validated handoff state. Historical test residue demonstrates partial/inconsistent state was possible. | Make all required acceptance state atomic in one authority. |
| Browser follow-up writes after RPC | Code review plus Queries 7-8/11 | Conflicting | Root `quote.js` patches Production/tracking after RPC; public page does not. | Deployed RPC/triggers already write acceptance-related state; browser follow-up writes are a second authority. | Remove browser acceptance side effects. |
| Legacy `js/quote.js` path | Static hosting review | Unable to verify from repository evidence | Old file creates/patches Order client-side. | Static hosting was not verified by the operator evidence provided for this closeout. | Confirm deployment references before implementation cleanup. |

Use only these classifications when filling results: **Compliant**, **Partially compliant**, **Conflicting**, **Missing**, **Unable to verify from repository evidence**.

## Future corrective requirement

The evidence supports one focused future implementation milestone:

> **Make `respond_to_quote_public` the sole atomic Quote acceptance authority.**

That future milestone must address only the confirmed acceptance transaction gaps:

- validated permanent Quote→Order linkage;
- collision-safe and retry-safe idempotency;
- exactly one Order per accepted Quote;
- immutable accepted commercial snapshot;
- required append-only acceptance events;
- one approved Production handoff path;
- customer-safe tracking projection;
- removal of browser acceptance side effects;
- least-privilege RPC grants.

Do not design speculative unrelated schema, Finance, Inventory, UI, or cleanup work in this closeout.

## Manual browser tests required later, not now

No browser mutation test is allowed for this documentation-only milestone. After a future corrective implementation is built in a safe test environment, manual tests should verify double-click/retry behavior, returned `OP-######`, tracking lookup, Quote/Order/Admin reload consistency, Production linkage, and event audit evidence. Those tests must not be claimed for production unless actually performed in an approved non-destructive or test environment.

## Reviewed corrective contract — repository evidence, not deployed proof (2026-07-20)

Migration `supabase/migrations/202607200002_quote_acceptance_authority.sql` is the focused repository artifact for making `respond_to_quote_public` the sole atomic Quote acceptance authority. Codex did **not** apply this migration to Supabase and did not mutate production data.

The reviewed contract now requires the RPC to lock the matching Quote row by exact `quote_number` and `public_token`, normalize only the supported acceptance vocabulary, create or reuse exactly one Order with permanent `orders.source_quote_number`, reject OP-number collisions that do not belong to the same Quote owner, preserve Q/OP suffix parity, create an immutable accepted commercial snapshot, emit exactly-once `quote.accepted` and `order.created` events, perform the valid waiting-state Production handoff, and initialize the public tracking projection without resetting advanced tracking rows on retry.

The root `quote.js` and referenced legacy `js/quote.js` acceptance paths now delegate acceptance state to `respond_to_quote_public`; browser code no longer creates Orders, patches accepted Quote state, patches acceptance-time Production handoff state, writes project events, or patches tracking after the RPC. UI refresh/display behavior remains browser-owned.

This is repository evidence of the intended corrective contract only. Deployment proof still requires running the migration preflight queries, applying the migration through the reviewed Supabase process, and then running the included post-deployment verification and manual browser checklist.

## Deployed snapshot security repair closeout — operator evidence (2026-07-20)

Operator-supplied deployed evidence records that `quote_accepted_commercial_snapshots` was initially deployed with RLS disabled after the acceptance-authority migration, and that `anon` and `authenticated` inherited broad table privileges. The operator immediately applied and verified the focused security repair outside Codex.

The deployed contract is now that RLS is enabled for `quote_accepted_commercial_snapshots`, and `PUBLIC`, `anon`, and `authenticated` have no direct table privileges. The accepted commercial snapshot remains an internal artifact created through `respond_to_quote_public`; no browser table policies are required or expected.

The operator-supplied verification also records that the duplicate source-Quote check and the duplicate acceptance-event check returned no rows. Repository migration `supabase/migrations/202607200003_quote_accepted_snapshot_security.sql` only synchronizes source control with this already-applied deployed state. Codex did not deploy or reapply the migration.

## 202607200004 forward-only runtime correctness evidence

Migration `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql` is the next focused corrective repository artifact for the deployed Quote acceptance authority. Codex did **not** apply this migration, did not deploy it, and did not mutate production or historical data.

The migration replaces `public.respond_to_quote_public` as a `SECURITY DEFINER` RPC with `search_path = public, pg_temp`, preserves locked Quote/token validation, rejects post-acceptance attempts to decline or request changes, returns an accepted retry before any writes when the Order, immutable snapshot, and required events already exist, and keeps the first accepted commercial snapshot authoritative.

On first acceptance, the RPC explicitly projects the locked accepted Quote values into `orders`: quantity from `quote_data.fields.qty` with default `1`, `order_total` from `quote_total`, deposit from `quote_data.fields.depositAmount`, balance as `greatest(order_total - deposit, 0)`, payment status, fulfillment, customer fields, `order_title`, `source_quote_number`, `created_from_quote`, and `accepted_date`. It initializes `order_tracking_public` with customer-safe approved projection fields, including title, total, payment status, `ready_to_print` status, public status text, and next-step text, without resetting existing advanced tracking rows on retry.

The migration retires the overlapping `quotes_advance_linked_production` trigger and removes its unused trigger function after repository-reference inspection. It preserves `orders_sync_workflow_to_production` for normal post-acceptance workflow synchronization. Acceptance-time Production handoff remains inside the RPC and only updates the linked owner/Quote row in approved pre-acceptance states while avoiding closed or actual-work rows.

The migration includes read-only preflight queries, post-deployment verification queries, and forward-recovery guidance. It preserves the least-privilege grants from the acceptance authority and snapshot security migrations and does not broaden direct access to `quote_accepted_commercial_snapshots`.

## Forward correction — 202607200005 Quote Acceptance Runtime Safety

Migration `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql` was merged as repository evidence, but the operator reports it was **not deployed** and must not be deployed as written. A follow-up review found defects in transaction safety, payment ownership, deployed response vocabulary compatibility, fulfillment normalization, event causation, and tracking idempotency.

Migration `supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql` supersedes `202607200004` for deployment. It is a forward-only correction that leaves migrations `202607200002`, `202607200003`, and `202607200004` unedited. It wraps RPC replacement, Order workflow trigger replacement, Quote trigger retirement, and grant enforcement in one explicit transaction so a statement failure preserves the previously deployed RPC and trigger state. The corrected trigger contract recreates `orders_sync_workflow_to_production` as `AFTER UPDATE OF status` only, with an `old.status is distinct from new.status` condition, so Order insert no longer acts as a second acceptance-time Production authority.

Neither Codex nor this milestone deployed SQL, applied migrations, modified deployed data, or performed historical repairs. Operators must run the included read-only preflight checks before deployment and the included post-deployment verification checks after deployment, including `pg_get_triggerdef` verification that the Order workflow trigger is UPDATE-only and has no INSERT event.

## Deployment sequencing correction — 202607200004 neutralized before deployment

Migration `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql` was merged as repository evidence but was never deployed. Before any normal migration runner executed it, review found it unsafe, so this PR replaces its executable contents with a transaction-safe no-op supersession marker.

`supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql` supersedes `202607200004` and is the sole runtime deployment artifact for this correction. Existing deployed databases where an operator manually applied `202607200002` and `202607200003` should apply only `202607200005`. Fresh or sequential environments may safely run the no-op `202607200004` marker followed by `202607200005`.

Neither Codex nor this milestone deployed SQL, applied migrations, modified deployed data, or performed historical repairs.
