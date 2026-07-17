# Fundraiser Migration Plan (No SQL)

## Gate

This is a proposed deployment plan only. No migration is included and no schema is assumed applied. Before writing SQL, export/introspect the deployed staging schema and confirm Orders, customers, Production, Finance, Recipe revisions, events, Assets, grants, and RLS contracts.

## Required proposed tables

1. `fundraisers`
2. `fundraiser_items`
3. `fundraiser_order_links`
4. `fundraiser_order_lines`
5. `fundraiser_personalizations`
6. `fundraiser_payment_confirmations`
7. `fundraiser_settlements`
8. `fundraiser_settlement_lines`

Their fields, constraints, and relationships are defined in `FUNDRAISER_DATA_MODEL.md`. No customer, Order, production, inventory, recipe, Finance, or asset authority is duplicated.

## Relationships to validate

- `fundraiser_items.product_recipe_id → product_recipes.id` and an immutable revision contract.
- `fundraiser_order_links.order_id →` actual Orders PK, unique.
- Optional `fundraisers.organization_id →` verified existing organization/customer authority; omit rather than fabricate if none exists.
- Order↔Production uses the current stable Order link; no fundraiser-owned job status.
- Payment/settlement evidence uses concrete verified Finance FK(s), not free text.
- Fundraiser and item files use existing `asset_links` after extending/validating its record-type constraint.
- All child ownership must agree with the parent and referenced ERP record.

## Proposed indexes

| Table | Index / reason |
|---|---|
| fundraisers | unique normalized public slug; `(owner_id, status, ordering_ends_at)` management list |
| fundraiser_items | unique `(fundraiser_id, item_code)`; `(fundraiser_id, active, display_order)` catalog |
| fundraiser_order_links | unique `order_id`; unique `(fundraiser_id, submission_key_hash)` idempotency; `(owner_id, fundraiser_id, submitted_at)` reports |
| fundraiser_order_lines | unique business line key; `(owner_id, fundraiser_item_id, inclusion_status)` production aggregation |
| fundraiser_personalizations | unique `(order_line_id, sequence_number)`; parent lookup only—do not index text without demonstrated need |
| payment confirmations | `(owner_id, fundraiser_id, confirmation_status)` and Order history; enforce one current state by selected event/current-row design |
| settlements | unique `(fundraiser_id, version)` and conditional uniqueness for posted policy |
| settlement lines | unique `(settlement_id, order_id)` plus Order reconciliation lookup |

Avoid speculative indexes; validate query plans with representative simultaneous fundraiser volumes.

## RLS and API objects

1. Owner-only table policies and parent/reference ownership checks.
2. Sanitized public catalog read surface.
3. One idempotent public submission RPC that delegates Order identity creation to the approved authoritative contract.
4. Owner-only transition/confirmation/settlement commands where invariants exceed safe direct updates.
5. Owner-only reporting read models, with public roles explicitly denied.
6. Audit events through the existing event model if compatible; otherwise defer the precise audit mechanism for review.

## Deployment order

1. **Discovery:** schema/RPC/grant/RLS inventory, data classification, Finance and customer key decision, direct-sale Order architecture decision.
2. **Design approval:** approve calculations, tax/refund/rounding, retention, status commands, threat model, rollback plan.
3. **Staging foundation migration:** enum/check strategy, core fundraiser/catalog tables, constraints, indexes, owner RLS; no production application use.
4. **Staging transaction migration:** Order-link/line/personalization tables and idempotent submission contract; verify existing workflows unchanged.
5. **Staging operational integration:** Production read/link contract and Asset record type; no fundraiser-driven Inventory mutation.
6. **Staging Finance/settlement migration:** only after concrete Finance keys and posting behavior are approved.
7. **Read models/reporting:** views/RPCs with RLS and query-plan tests.
8. **Application implementation:** owner UI then public page behind a disabled feature flag.
9. **Staging acceptance/security/load:** full test plan, backup/restore drill, manual multi-device/browser checks.
10. **Production migration:** reviewed backup, migration application by operator, verification queries, feature still disabled.
11. **Canary:** one internal/test fundraiser, reconciliation, monitored enablement; Niles import only through a separately reviewed mapping/dry run.

## Existing tables/RPCs/queries affected

- Expected existing-table changes are limited to validated FKs/grants or Asset link record-type allowance. Altering Orders/Production/Inventory/Finance behavior is not approved by this plan.
- A new direct-sale Order RPC may be necessary. It must preserve existing OP allocation, event, Order, workflow, and totals rules; it is a separately reviewed integration, not a silent modification.
- Existing module queries need only optional fundraiser attribution/read links. Customer 360/Hub are later read-model enhancements, not migration prerequisites.

## Backfill and Niles onboarding

Do not automatically import legacy Niles data. First inventory identifiers, customers, order/payment evidence, product mapping, personalization, production flags, and totals. Produce a read-only dry-run mapping and exception list. Match existing authoritative Orders/Finance/jobs by stable IDs; never create replacements. Owner approves each unresolved duplicate and the opening settlement balance.

## Rollback

Feature flag off first. Preserve fundraiser records and authoritative Orders; never roll back by deleting Orders, Finance entries, inventory transactions, jobs, or files. Revoke new public RPC execute grants if unsafe. Database rollback must be additive/corrective and reviewed against backups because accepted submissions may already reference new tables.

## Stop conditions

Stop for unknown Orders/customer/Finance keys, conflicting RLS ownership, inability to make submission idempotent, totals mismatch, public PII exposure, unexplained duplicate, or any required change to stable ERP 1.0 behavior.
