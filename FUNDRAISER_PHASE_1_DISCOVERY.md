# Fundraiser Manager Phase 1 — Deployed-Contract Discovery

## Scope decision

`IMPLEMENTATION_PHASES.md` is the approved delivery contract. Its Phase 1 is discovery and decisions, and explicitly precedes migration SQL and production UI. This milestone therefore does **not** add tables, policies, UI, public writes, exports, or settlement logic. Doing so would cross the approved stop gate while authoritative contracts remain unresolved.

## Repository evidence reviewed

| Authority | Repository contract found | Finding / gap |
|---|---|---|
| Orders Admin | `orders` is read and written through PostgREST; records have a UUID-like `id`, owner field `user_id`, human `order_number`, `source_quote_number`, customer snapshots, totals, and canonical status. | No checked-in base `orders` DDL, multi-line contract, direct-sale RPC, or atomic OP-number allocator was found. Browser-side quote acceptance currently checks/inserts an Order and is not an approved fundraiser submission contract. |
| Production Control | `production_jobs` is owner-filtered by `user_id`; Order linkage is currently by `order_number`. The workflow migration synchronizes the five canonical accepted-order states. | No stable FK from a production job to `orders.id`, programming evidence, print-attempt/unit evidence, or canonical milestone event contract was found. Programmed/Printed cannot yet be derived safely. |
| Inventory Control | Production remains responsible for requesting normal inventory reservation/consumption. | No fundraiser-specific mutation is needed or approved. Deployed reservation RPCs and ledgers still require staging inventory. |
| Product Recipe Library | `product_recipes.id` is UUID, owned by `user_id`; `(user_id, recipe_key, revision_number)` is unique and `supersedes_recipe_id` links revisions. | `id` can identify the selected immutable row, but deployed immutability of revision rows and cross-owner FK checks must be verified. |
| Finance Pro | `financial_entries` is read/written by `user_id`; Orders creates revenue/tax/shipping entries by browser requests and searches free-text references. | Checked-in authoritative DDL, allocation FK/RPC, posting semantics, refund policy, and transaction boundary are absent. Free-text matching is not sufficient for settlement. |
| Customer 360 | Customer 360 derives identity/activity from Orders, Quotes, Production, and project events. | No deployed customer/organization master key is evidenced. Phase 1 must use the Order customer snapshot rather than invent a customer table. |
| Job Files / Assets | Private `asset_records` and `asset_links` are owner scoped; allowed link types currently exclude fundraiser records. | Adding fundraiser link types requires a later reviewed constraint migration. Storage must remain private. |
| Persistence | `js/authoritative-persistence.js` distinguishes `remote` from `local-recovery` and exposes explicit recovery review/import filtering. | A future manager may reuse the recovery-review semantics, but must never merge recovery rows into authoritative lists or auto-upload them. |

## Decisions supported by repository evidence

1. **Owner identity:** use `auth.uid()` with an `owner_id` on fundraiser extension tables. Adapter/query code must explicitly map existing authorities that use `user_id`.
2. **Recipe identity:** catalog rows should reference `product_recipes.id` and snapshot `recipe_key`, `revision_number`, and commercial/display terms. No recipe authority is duplicated.
3. **Customer identity:** until a deployed organization master is confirmed, keep a fundraiser-specific organizer contact and read buyers from authoritative Order snapshots. Do not add `fundraiser_customers`.
4. **Production milestones:** `Completed` may project from canonical `ready_for_fulfillment` or `closed`, including a reprint regression. `Programmed` and `Printed` remain unavailable until evidence contracts exist; they must not become freely editable fundraiser booleans.
5. **Assets:** retain private Storage and owner-only signed access. A future schema migration may extend `asset_links.record_type`; there is no public image contract in Phase 1.
6. **Browser recovery:** Supabase results remain authoritative. Recovery is separately labeled, manually reviewed, duplicate checked, and never automatically imported.

## Blocking decisions and owners

| Decision required before Phase 2 | Required evidence / decision owner | Stop condition |
|---|---|---|
| Actual deployed DDL, constraints, grants, policies, triggers, and functions | Supabase owner exports sanitized `pg_catalog`, `information_schema`, and `pg_policies` results from staging | Stop if stable Order/owner keys differ or cannot be enforced by FK. |
| Direct fundraiser-sale Order creation | Orders owner approves one transactional, idempotent server contract that allocates Order number and creates canonical Order | Stop if only browser multi-request insertion is available. |
| Order line compatibility | Orders owner decides whether canonical Orders gain/use line items and how fundraiser snapshot total reconciles | Stop if fundraiser lines cannot reconcile exactly without shadowing Orders. |
| Production evidence | Production owner identifies programming artifact/event, print attempts and required-unit completion | Stop rather than create mutable duplicate status. |
| Finance allocation | Finance owner identifies concrete entry/allocation IDs, posted state, and posting RPC | Stop rather than settle against text search. |
| Accounting rules | Business owner approves tax, discounts, refunds, cancellations, fees, rounding, overpayments, adjustments and write-offs | Stop settlement implementation until all are deterministic. |
| Retention/public receipt | Business/security owner approves PII/personalization retention, public receipt token, abuse controls and export consent | Stop public submission/read until threat controls are approved. |
| Fulfillment | Orders owner approves allowed methods and whether a submission can split recipients/methods | Stop public form contract until decided. |

## Staging discovery queries

Run read-only in staging and attach redacted output to the Phase 2 review. These do not mutate schema.

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders','production_jobs','product_recipes','asset_records','asset_links','financial_entries')
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in ('orders','production_jobs','product_recipes','asset_records','asset_links','financial_entries')
order by 1, 2;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

select routine_schema, routine_name, routine_type, data_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage')
order by table_schema, table_name, grantee, privilege_type;
```

## Phase 1 exit assessment

The approved exit gate is **not met** from repository evidence alone. In particular, no approved stable idempotent Orders creation path, production evidence contract, or Finance allocation contract exists in this checkout. Phase 2 migration SQL and all UI/public/finance implementation must remain blocked pending the decisions above.
