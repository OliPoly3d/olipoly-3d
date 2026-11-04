# Exact test-database migration review

Prepared November 4, 2026. **Applied with explicit approval on November 4, 2026.** See [APPLIED.md](APPLIED.md) for hosted versions, verification and outstanding advisor findings. Target: **OliPoly ERP Test**, project ref **`llscjdyiiatmuqhilube`**, region `us-east-2`, in OliPoly3d's Org. This review does not authorize merge, deployment, changes to the live project, or copying customer data.

## Why the schema is needed

The new pages must exercise the actual acceptance → order → production → Inventory → payment → Finance → public tracking relationships across devices. The test project was created empty. Existing repository migrations are incremental, so they cannot alone rebuild a clean database. The baseline captures the current deployed business structure from read-only PostgreSQL metadata, without business records. A separate connected-workspace migration adapts the new per-item/per-run screen to the existing whole-order commands.

## Exact scripts, in order

| Script | Expected effect | SHA-256 |
| --- | --- | --- |
| [`20261104125424_ops_test_business_baseline.sql`](../../supabase/ops-preview/migrations/20261104125424_ops_test_business_baseline.sql) | Restore 38 business tables, 71 functions, five views, one sequence, constraints, indexes, 27 triggers, 105 RLS policies and recorded safe grants | `9f0d0078d4a4535b671654d795f9ca599345e96114c3848a0075e2422af43f74` |
| [`20261104130021_ops_test_connected_workspace.sql`](../../supabase/ops-preview/migrations/20261104130021_ops_test_connected_workspace.sql) | Add four owner-scoped staging tables, three public RPCs, three private helpers, quote counter fixture and tax-inclusive Finance validation | `410e63abd06d70664fc153e2485053b3f08c52ab8930b8ba341afb8cf7f51b8c` |

These live in `supabase/ops-preview/migrations`, deliberately outside the normal live `supabase/migrations` runner. Both use transactions. The baseline refuses any populated public schema. Verify the project ref immediately before execution; the baseline's empty-schema guard is an additional protection, not a substitute for checking the target.

## Affected tables and queries

The baseline creates the business tables listed below. They begin empty, except the connected migration initializes the document counter. It excludes all `money_*` tables, live financial/order/inventory rows, Auth users, Storage objects/buckets/policies, credentials, Edge Functions and personal Money data. It is a structural rehearsal, not a business-data backup or a full project clone.

`project_events`, `quote_accepted_commercial_snapshots`, `finance_correction_receipts`, `order_payment_command_receipts`, `campaigns`, `document_counters`, `campaign_products`, `production_linkage_audit`, `production_attempt_consumption_receipts`, `workflow_command_receipts`, `quotes`, `inventory_transactions`, `hub_reminders`, `hub_notes`, `order_tracking_public`, `production_material_reservations`, `campaign_submission_items`, `catalog_parts`, `parts_catalog`, `active_projects`, `orders`, `campaign_order_conversion_snapshots`, `campaign_submissions`, `order_pricing_revisions`, `production_job_roll_usage`, `production_jobs`, `finished_goods_inventory`, `reusable_spool_pool`, `printer_pm`, `raw_material_inventory`, `non_filament_materials`, `inventory_spool_pool`, `inventory_settings`, `product_recipes`, `financial_entries`, `asset_links`, `customers`, `asset_records`.

The connected migration adds:

| Table | Purpose |
| --- | --- |
| `ops_preview_workspaces` | Per-owner workspace revision and mixed-item/run presentation state |
| `ops_preview_links` | Workspace IDs linked to canonical Production, Quote and Order IDs; expected canonical timestamps |
| `ops_preview_rolls` | Fictional material/color buckets linked to canonical Inventory rows |
| `ops_preview_receipts` | Immutable command identity, request and resulting revision for safe retries |

Authenticated owners can SELECT their own staging records through RLS; direct writes are revoked. Mutations go through the authenticated RPCs. No anonymous workspace access is granted. The baseline restores explicit function/table/column grants, removes inherited PUBLIC function execution, limits legacy null-ACL functions to authenticated/service roles, omits TRUNCATE/TRIGGER/REFERENCES grants, and makes views security-invoker when no option was recorded.

The new pages query only `ops_preview_initialize`, `ops_preview_load`, `ops_preview_commit` and the existing public tracking lookup. They do not change any existing customer page's query or login configuration. The browser URL/key guard permits only this test project. Local demo mode remains an independent fictional fixture.

## Affected RPCs and workflow

- `ops_preview_initialize()` creates one fictional mixed-item draft and three fictional inventory buckets for the signed-in test user, once. It copies no live records.
- `ops_preview_load()` returns the owner's workspace, actual remaining stock/costs and canonical reservations.
- `ops_preview_commit(text,jsonb,jsonb,bigint,text)` validates action scope, owner, revision, canonical timestamps and command identity, then atomically orchestrates existing business commands. A replay returns current workspace state without repeating side effects.
- Private helpers calculate pending material quantities, reserve remaining stock and top up actual-run reservations when extra consumption is recorded. Consumption itself uses the existing Inventory receipt/ledger command.
- Existing `save_production_quote`, `respond_to_quote_public`, `reserve_production_material`, `release_production_material_reservation`, `production_workflow_command`, `consume_production_attempt`, `mark_order_paid`, `post_order_finance_income`, `create_manual_financial_entry`, `fulfillment_workflow_command`, `get_order_invoice_snapshot` and `public_order_tracking_lookup` are reused in the test baseline. Their definitions are not replaced by the connected migration.
- The connected migration replaces **one existing trigger function in the test project**, `apply_order_tax_metadata_to_finance_post()`: explicitly tax-inclusive snapshots validate backed-out aggregate tax; existing tax-exclusive snapshots retain their forward calculation. This is required for an eight-cent all-in sale with one cent included tax to reconcile. No live trigger is changed.

The first approved quote creates the canonical order and frozen invoice snapshot. Release reserves material. Each finished run captures accepted/rejected quantities and total actual consumption, including waste; consumption is deducted once. Unused reservations are released and outstanding quantities re-reserved. Sample inventory rows synchronize legacy `current_grams` with canonical `remaining_grams` after consumption. Complete pickup is recorded; the order closes after payment. A full combined payment posts net sales/tax plus a fee expense in one transaction.

## Evidence and remaining risks

**31 focused checks passed**, including the complete SQL restore/workflow rehearsal, existing pricing regressions, transport retries and access isolation. The local Postgres rehearsal uses Auth stubs and built-in UUID generation. It is not hosted Supabase verification. Browser checks covered the local async save path and staging sign-in screen; real cross-device REST and iPad Safari verification remain after migration application and test-account setup.

Material limitations before production use:

- This pilot supports fixed-price work, one complete pickup and one full payment. Partial payments, capped design charges, refunds/credits and partial fulfillment need later reviewed work.
- Labor/material/machine cost comparisons remain Production payload details. They are not yet posted as finalized costs to Finance. The inherited income command also records the payment-status label as its Finance method; the selected payment method/reference are preserved in the workspace payload, and the fee expense uses the correct method. Do not treat this pilot as completed Finance reconciliation.
- Tax county/rate/exemption entries are fictional fixtures. Current rates, sourcing, certificate evidence, filings and remittances are not automated.
- Public tracking inherits enumerable OP-number access. Only fictional data belongs in this project; real-data tracking needs a separate access review.
- No Storage/file copy is included. A future live migration needs a separate verified backup/export, restore rehearsal, identity/history/balance comparisons and explicit cutover plan.
- A pre-existing `invoice-authority-contract.test.js` label assertion fails against unchanged files before the new pricing path. It is reported, not suppressed.

## Application and recovery procedure

1. Obtain approval of these exact scripts for the target ref above.
2. Verify target identity/health, empty public schema and current migration history. If it is no longer empty, stop rather than reset it.
3. Apply the baseline, then the connected migration, using Supabase migration tooling. Each is its own transaction; if either fails, stop and report the actual state. A second-script failure leaves the first committed baseline in place.
4. Verify 42 public business/workspace tables, function grants, RLS ownership, anonymous restrictions and security/performance advisors. Review any warnings rather than weakening policies to make a test pass.
5. With a user-created test login, initialize fictional fixtures and verify hosted acceptance, stock/receipt counts, invoice totals, Finance net/tax/fee amounts, customer tracking and reload from another device. Do not bypass email confirmation or copy a production session.
6. If the applied pilot needs recovery, disable the optional test connection/stop using the preview and retain test records. Correct the issue with a separately reviewed migration. Do not automatically drop schema, delete records or reset the project. Before any destructive recovery, export test data and obtain the specific authorization.

No changes to the live project are needed for this test milestone. Deployment of the new source and later promotion of business data are separate actions.
