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

## Result-capture table

| Area | Query/result reference | Classification | Repository evidence summary | Operator-supplied deployed evidence | Follow-up needed |
|---|---|---|---|---|---|
| `respond_to_quote_public` exists and is correct security mode | Query 1 | Unable to verify from repository evidence | RPC is called by clients; no checked-in definition found. | _Pending_ | Capture function definition and security mode. |
| `respond_to_quote_public` grants allow intended public access only | Query 2 | Unable to verify from repository evidence | Public page calls RPC anonymously with token. | _Pending_ | Capture grants for `anon`, `authenticated`, `service_role`, `public`. |
| Accepted Quote creates exactly one Order | Queries 3-4 | Unable to verify from repository evidence | Blueprint requires one Order; no deployed rows inspected. | _Pending_ | Count missing/duplicate linked Orders. |
| Permanent `orders.source_quote_number` linkage | Queries 3, 5-6 | Unable to verify from repository evidence | Current code and inventory reference `source_quote_number`; deployed constraints unknown. | _Pending_ | Verify every accepted Quote has explicit source linkage. |
| Accepted commercial snapshot exists and is immutable | Query 10 | Unable to verify from repository evidence | Root `quote.js` stores `customer_totals`; no schema immutability evidence. | _Pending_ | Identify deployed snapshot columns and acceptance-time values. |
| Required `project_events` | Query 9 | Unable to verify from repository evidence | Event contract requires `quote.accepted` and `order.created`; table hardening migration only scopes access. | _Pending_ | Verify event vocabulary, fields, and one logical event per acceptance. |
| Production handoff/linkage | Queries 7 and 11 | Partially compliant | Migrations define Quote and Order triggers; multiple paths may overlap. | _Pending_ | Determine deployed trigger set and duplicate side effects. |
| Customer-safe tracking projection | Queries 2, 8, 11 | Partially compliant | Security hardening migration creates public lookup RPC and removes direct anon table access. | _Pending_ | Verify deployment and matching tracking rows. |
| Idempotent repeated submission | Queries 1, 3-4, 9, 11 | Unable to verify from repository evidence | Tests assert single client call; server behavior unknown. | _Pending_ | Inspect RPC locking/upsert/unique constraints/events. |
| No partial state on failure | Query 1 plus trigger inventory | Unable to verify from repository evidence | Blueprint requires one transaction; RPC definition absent. | _Pending_ | Inspect whether RPC wraps all required writes and raises on required failures. |
| Browser follow-up writes after RPC | Code review plus Queries 7-8/11 | Conflicting until deployed role is known | Root `quote.js` patches Production/tracking after RPC; public page does not. | _Pending_ | Decide whether to remove, keep, or convert after evidence review. |
| Legacy `js/quote.js` path | Static hosting review | Conflicting if deployed | Old file creates/patches Order client-side. | _Pending_ | Confirm whether deployed pages can load it. |

Use only these classifications when filling results: **Compliant**, **Partially compliant**, **Conflicting**, **Missing**, **Unable to verify from repository evidence**.

## Blocking architecture decisions

These must be decided only after deployed results are supplied and reviewed:

1. **Single acceptance authority:** Should `respond_to_quote_public` be the only state-changing authority for public and internal Quote acceptance, with browser follow-up writes removed or restricted to non-authoritative UI refresh?
2. **Production handoff owner:** Which single deployed mechanism should perform accepted Quote → Production linkage/status handoff without duplicating the Quote trigger, Order trigger, and browser patch paths?
3. **Accepted snapshot location/name:** Which existing deployed column(s), if any, are the authoritative immutable accepted commercial snapshot? If none exists, a future schema milestone may be required, but this document does not choose it.
4. **Event service shape:** Does deployed `project_events` already support the Blueprint v1 required event fields, or is it a compatibility table requiring a future migration?
5. **Document identity source:** Does deployed acceptance allocate `OP-######` by server counter/transaction, or does it infer from `Q-######`? Blueprint v1 requires server-side transactional identity and suffix parity, but the implementation choice must be based on deployed evidence.
6. **Idempotency key/constraint:** Is idempotency currently enforced by Quote row lock, unique `orders.source_quote_number`, unique `orders.order_number`, explicit idempotency key, or not at all?
7. **Public response vocabulary:** The public page sends `declined` for the non-accept button while Blueprint v1 names `quote.change_requested`. Decide whether deployed RPC normalizes `declined` to `change_requested`, rejects it, or stores a conflicting value.

## Recommended next implementation milestone after deployed results

Do not implement any corrective code until the result-capture table is filled with operator-supplied deployed evidence and reviewed.

If the deployed evidence confirms the current risk pattern, the next single small corrective implementation milestone should be:

> **Milestone: Make `respond_to_quote_public` the sole atomic acceptance transaction and remove non-authoritative acceptance side effects from browser clients.**

That milestone should remain focused on one business problem: public/internal acceptance must call one authoritative RPC that atomically records Quote response, creates/reuses exactly one Order with permanent source linkage, persists the accepted snapshot, emits required events, performs the approved Production/tracking handoff, and returns the authoritative Order. It should not include unrelated UI redesign, Finance, Inventory, schema cleanup, or historical documentation cleanup.

## Manual browser tests required later, not now

No browser mutation test is allowed for this documentation-only milestone. After a future corrective implementation is built in a safe test environment, manual tests should verify double-click/retry behavior, returned `OP-######`, tracking lookup, Quote/Order/Admin reload consistency, Production linkage, and event audit evidence. Those tests must not be claimed for production unless actually performed in an approved non-destructive or test environment.
