# Fundraiser Query Plan and Migration Review Draft — Phase 1

## Query plan

Every owner query begins with `owner_id = auth.uid()` and normally `fundraiser_id`; anonymous queries go only through an allowlisted RPC/view.

| View/use case | Filter/group plan | Candidate index (review after `EXPLAIN`) |
|---|---|---|
| Owner list | owner, archive state, updated descending | `(owner_id, archived_at, updated_at desc)` |
| Catalog | owner/fundraiser, active, display order | `(owner_id, fundraiser_id, active, display_order)` |
| Idempotent submission | fundraiser + key hash | unique `(fundraiser_id, submission_key_hash)` |
| Linked order detail | exact Order and fundraiser | unique `order_id`; `(owner_id, fundraiser_id, submitted_at)` |
| Quantity/design/recipe rollups | fundraiser, inclusion status, item/design/recipe snapshots | fundraiser-first line index; validate aggregation plans with pilot volume |
| Personalization production | line plus stable sequence | unique `(order_line_id, sequence_number)` |
| Confirmation review | fundraiser/Order, latest event | `(owner_id, fundraiser_id, order_id, created_at desc)` |
| Settlement | fundraiser/version and included Order | unique `(fundraiser_id, version)` and `(settlement_id, order_id)` |

Avoid indexing sensitive text. Exports fetch an explicit column allowlist and paginate using stable IDs; no `select *` or public materialized customer list.

## Proposed migration decomposition (Phase 2+, not SQL in this milestone)

1. **Catalog foundation:** fundraiser and item tables, fixed-point constraints, owner checks, timestamps/archive behavior, owner-only RLS and grants.
2. **Order integration:** only after the approved direct-sale Orders transaction and actual PK are known; add links, immutable line snapshots, personalizations, idempotency and cross-owner guards.
3. **Production read projection:** only after canonical programming/print evidence is identified; no fundraiser mutation of Production.
4. **Finance/settlement:** confirmations first; settlement objects only after concrete Finance allocation and accounting rules are approved. Add finalization immutability triggers/commands.
5. **Asset link constraint:** separately extend allowed record types after confirming stable fundraiser/item record keys; do not alter Storage policies.
6. **Public surface:** sanitized catalog read and narrow submission RPC only after threat-model gates, input limits and receipt policy are approved.

Each step is an idempotent, separately reviewable migration with `begin/commit`, `create ... if not exists` where semantically safe, named constraints/policies, explicit grants/revokes, comments, verification SQL and a tested rollback. `create or replace` must not silently broaden an existing signature or privilege.

## Static review checklist for Phase 2

- No fundraiser customer, Order, production, inventory, recipe, finance ledger, or asset-byte authority.
- All durable records have UUID, owner, audit timestamps and appropriate archive/history semantics.
- Money is fixed point; quantity/personalization and date bounds are constrained.
- Existing-order and submission uniqueness prevent duplicates under concurrency.
- Commercial snapshots become immutable after line acceptance.
- Finalized settlement header/lines reject direct update/delete; voiding is an audited command if approved.
- RLS is enabled and forced where appropriate; Owner A cannot reference Owner B parents.
- `anon` has no direct private-table privileges; public functions expose allowlisted results only.
- Security-definer functions have fixed search path, fully qualified names and explicit privilege review.
- Existing Orders, Production, Inventory, Recipe, Finance and Storage policies are not weakened.
- Rollback refuses destructive removal when fundraiser Orders/settlements exist unless an explicit preservation/export procedure is followed.

## Deployment verification draft

After each future staging migration: inspect columns/constraints/indexes/policies/grants/function owner and configuration; run anonymous, Owner A and Owner B denial tests; execute duplicate/concurrency tests; reconcile line sums to Orders and Finance; run existing ERP regression suite; capture `EXPLAIN (ANALYZE, BUFFERS)` for owner list, catalog, rollups and exports. Production deployment remains a manual, separately approved action.

## Rollback principle

Before public/order integration, disable the feature flag and remove public execute grants first. Preserve linked extension/audit/settlement data. Never delete canonical Orders, Production, Inventory, Recipe, Finance or Storage records. Schema rollback SQL cannot be finalized until actual dependencies and retention policy are approved.
