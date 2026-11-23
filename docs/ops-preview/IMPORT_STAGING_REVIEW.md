# Legacy import staging — engineering review

This milestone adds a private holding area and an owner review screen. It does not promote captured records into operational tables.

## Workflow

Legacy history → Migration review uses the existing ERP Test sign-in and navigation. The owner selects a prepared export, verifies its target account and stores it in bounded, atomic chunks. Completed chunks live on the server and can be reviewed from another signed-in device. Browser memory holds only the currently selected file.

Review includes captured financial baselines, source table counts, original references, historical/test-like records, inventory deferrals, ownership exceptions and changed-source warnings. These are review classifications, not permissions to promote or clean up records. No promotion endpoint or button is included.

## Preservation and replay contract

- Preserve exact source JSON text, original primary keys, original ownership and SHA-256 checksums. Do not rewrite financial decimals through JavaScript before storage.
- Accept only the configured live source and isolated test target, with the signed-in initialized target owner.
- Allow only the explicit business-table list. Exclude Money, Auth and arbitrary schema/table names.
- Require consistent source ownership. Keep ownership exceptions outside the corresponding staging batch until reviewed.
- Check source primary keys against their original JSON and supported table key columns.
- Identify batches by exact manifest SHA-256. Repeated chunks and identical captures reuse existing source versions. Changed source rows retain earlier versions and require review.
- Keep staged records separate from canonical Finance, orders, production, inventory, public tracking and notifications.
- Treat captured baselines as owner-supplied export evidence, not an independently signed certification of a live database. Refresh source/target comparisons before later promotion.

The offline preparation script uses local files only. It has no database credentials, network operation or apply action. It refuses to overwrite source evidence, a target index or an earlier differing output. Confidential export data and private rehearsal findings are delivered separately; they are not Git fixtures or Site assets.

## Database change

Migration: `supabase/ops-preview/migrations/20261123180112_ops_test_import_staging.sql`.

The exact environment and private capture candidate are specified separately in the owner release review. General build authorization is not migration approval.

The migration adds the private `ops_migration` schema with `batches`, `records` and `batch_rows`. These hold immutable manifests, source versions and owner-consistent membership. Each table has owner-only SELECT RLS; direct client INSERT/UPDATE/DELETE are revoked.

`ops_preview_import_stage(text,jsonb)` is a narrow authenticated append command with explicit owner/workspace checks, configured source/target guards, allowlisted tables, empty search_path and fully qualified access. `ops_preview_import_list()` and `ops_preview_import_load(text)` are invoker-security owner-scoped reads. Review responses omit raw customer contacts, customer-access tokens and receipt URLs.

No existing canonical table, trigger, function, balance, order or invoice is replaced. No allocation, business mutation, payment, message or public-tracking command is invoked. No migration has been applied as part of preparing this code review.

## Validation

Automated checks cover real local SQL migration execution, checksum/owner/key rejection, immutable source versions, atomic failed chunks, repeat upload, source precision/Unicode, owner isolation, anonymous denial and unchanged canonical tables. jsdom exercises upload/retry/filter/server-persisted review logic. Transport and CLI file-preservation checks are included. Existing Finance, tax, settings and history regressions remain part of verification. Private rehearsal evidence and capture identifiers are retained outside this repository.

No visual browser/iPad verification is claimed. Desktop owner acceptance and the separate iPad spacing, navigation, touch and file-picker pass remain pending after approved publication.

## Release and recovery

Exact migration application, capture loading, merge and private publication require owner approval under AGENTS.md. Verify target identity, grants/RLS, function paths, canonical-table checksums and project sequence. Run a rollback-only permission/replay rehearsal before the reviewed staging load. Inspect post-application advisors.

Recovery restores the prior Site version and may revoke the staging append RPC. Preserve staging evidence and owner-scoped reads. Do not automatically drop tables, delete evidence or change the live ERP. Later operational import remains a separate reviewed milestone.

## Manual acceptance

1. Open Legacy history → Migration review and verify the return route to ERP.
2. Review a prepared batch, its ownership exceptions, captured baseline and table counts.
3. Filter review/inventory/historical rows and search original references.
4. Refresh or open another signed-in device; the saved batch remains available.
5. Repeat the same upload; no duplicate versions, business records, messages or stock movements occur.
6. Resolve conflicts separately before preparing any operational import. Preserve existing Finance Pro, archived documents and the deferred physical inventory reconciliation.
