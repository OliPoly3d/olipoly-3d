# OliPoly ERP 1.0 Deployment Guide

[Handbook](ERP_1_0_HANDBOOK.md) · [Backup/recovery](ERP_1_0_BACKUP_RECOVERY.md) · [Testing playbook](ERP_1_0_TESTING_PLAYBOOK.md) · [Release audit](ERP_1_0_RELEASE_CANDIDATE_AUDIT.md)

## Deployment invariants

Deploy reviewed static application files only after the target Supabase contract is verified. Application code never applies schema automatically. Stop on any unexplained migration, constraint, trigger, RPC, RLS, private bucket, duplicate Q/OP, or orphan Asset difference.

## Required migration order

Apply/reconcile only through the reviewed Supabase migration process, in exact filename order:

1. `202607160001_milestone_2a_order_workflow.sql` — canonical accepted-Order/tracking states, normalization, defaults, constraints, triggers.
2. `202607160002_repair_milestone_2a_order_status.sql` — idempotent repair for a partial 001 application; drops old checks safely, normalizes rows, recreates checks/triggers, includes verification.
3. `202607160003_persist_production_quote_status.sql` — durable Quote-acceptance → linked Production advancement trigger.
4. `202607160004_authoritative_bidirectional_workflow.sql` — makes `orders.status` canonical post-acceptance, synchronizes Production, and supplies `set_linked_workflow_status`.
5. `202607160005_product_recipe_library.sql` — owner-scoped `product_recipes` and RLS.
6. `202607160006_product_recipe_revision_history.sql` — immutable prior recipe-revision history support; requires 005.
7. `202607160007_job_asset_management.sql` — private `job-assets` bucket, Asset records/links, constraints, RLS, and owner-folder Storage policies.

Do not skip 002 because 001 appears successful; reviewed history includes both. Do not apply 004 before 001–003, 006 before 005, or Asset UI before 007/policy verification.

## Private Storage and RLS contract

- Bucket `job-assets` must have `public = false`; never use a public URL or broad read policy.
- Asset rows are owner-scoped; authenticated access is constrained by `owner_id = auth.uid()`.
- Object paths begin with the authenticated owner's UUID; Storage select/insert/delete policies enforce the owner folder.
- `asset_links` must reference an Asset revision owned by the same user.
- The client requests short-lived signed URLs (currently 300 seconds) only after authorized metadata access. Public Quote/tracking pages receive no Storage path or signed URL.
- Test owner, a different authenticated user, and anonymous access. A failed legitimate request is not fixed by weakening policy.

## Staging deployment

1. Create and verify database/Storage/policy backups per [backup guide](ERP_1_0_BACKUP_RECOVERY.md).
2. Export target migration history plus schema, functions, triggers, RPCs, constraints, RLS, bucket/policy definitions.
3. Compare migrations 001–007 byte/review intent and recorded filename order. Stop on drift.
4. Run SQL verification included in migrations/deployment notes: canonical statuses, duplicate source Quotes/Orders, Q/OP formats/links, trigger/RPC presence, orphan Asset links, bucket privacy, and policies.
5. Deploy static files to staging with the correct Supabase configuration. Do not put service-role credentials in client files.
6. Run JavaScript syntax, all Node tests, documentation links, migration static checks, and `git diff --check`.
7. Run Scripts A–C and all security/Asset/multi-device/mobile checks in the [testing playbook](ERP_1_0_TESTING_PLAYBOOK.md). Use synthetic data only.
8. Record approval, build commit, migration state, evidence, known deferrals, rollback owner, and monitoring window.

## Production promotion and smoke test

Deploy static files in a low-traffic window. Smoke-test authenticated Hub/Production/Orders/Inventory/Finance/Recipes pages, controlled Quote read/change request (do not approve a live customer Quote), public tracking/payment read, and authorized private Asset download. Confirm anonymous Asset denial. Monitor RPC failures, duplicate-key violations, RLS denials, acceptance/events, reservation discrepancies, and Finance import errors.

## Rollback

For an application-only defect, redeploy the previous known-good static build and retain database evidence. Do not reverse reviewed migrations, weaken RLS, expose Storage, delete acceptance Orders, or rewrite Q/OP identities. If data was written, use module-specific incident reconciliation before reopening workflows. Any schema rollback requires a separately reviewed forward recovery/migration plan and verified backup restore—not an improvised destructive SQL action.

## Required deployment record

Record: environment; commit/build; operator/reviewer; UTC start/end; database and Storage backup IDs; migration-history output; policy/RPC verification; automated commands/results; manual devices/viewports/users; synthetic Q/OP IDs; smoke evidence; defects; rollback decision; and post-deploy monitoring result.

