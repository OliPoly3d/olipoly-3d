# OliPoly ERP 1.0 Troubleshooting

[Handbook](ERP_1_0_HANDBOOK.md) · [Workflow map](ERP_1_0_WORKFLOW_MAP.md) · [Backup/recovery](ERP_1_0_BACKUP_RECOVERY.md) · [Deployment](ERP_1_0_DEPLOYMENT_GUIDE.md)

## First response: preserve, identify, compare

1. Stop the repeated action; do not double-click, refresh-submit, or create a replacement row.
2. Record environment, user, time, URL, stable UUID, exact Q/OP, visible message, and intended action.
3. Capture console and Network request/response without publishing tokens or signed URLs.
4. Inspect the authoritative Supabase record/ledger and owner page after reload.
5. Distinguish durable remote data from draft, recovery, preference, or cache.
6. Correct only through the owning module/audited database process. Never weaken RLS, expose Storage, invent IDs, or delete incident evidence.

## Authentication or RLS denial

**Symptoms:** sign-in loops, empty remote lists, `401/403`, private download denied. **Check:** correct environment, session/account, network, system time, request user, deployed RLS policies, and whether another user/anonymous access is correctly denied. **Recover:** preserve local draft, sign out/in, reload, then retry once. Escalate persistent policy denial with request details. **Do not:** copy a service key to the browser, disable RLS, make a bucket public, or reuse another operator's signed URL. **Verify:** owner succeeds; different authenticated user and anonymous session fail where required.

## Durable save failed or is uncertain

**Symptoms:** offline/RLS/network error, recovery banner, no cloud-success message. **Check:** remote row by UUID/Q/OP before retry; compare `updated_at` and device B. **Recover:** reconnect, reload authority, explicitly import a reviewed recovery record only if the row is absent. If remote is newer, preserve recovery for comparison and do not overwrite. **Remember:** local recovery records never upload automatically. **Verify:** remote reload and second device match; only one row/event exists.

## Public acceptance failed or duplicated

**Missing OP:** disable/refrain from further acceptance, inspect Quote response, Orders by `source_quote_number`, Production link, and acceptance event. Reconcile through an audited database operation before asking the customer to retry. The client must not fabricate OP.

**Duplicate Order:** treat as a release incident. Stop public acceptance, preserve both rows/events/network evidence, determine the valid row through business review, and correct with a documented transaction. Do not delete from browser UI or rewrite identifiers.

**Verify after resolution:** repeat/concurrent request returns the same exact OP; one Order, one event, one Q/OP chain, one reservation maximum.

## Hub or Customer 360 is stale

Reload the owner page first, then the read model. Confirm exact ID and environment, remote save, timestamps, and `project_events`. A same-name customer is not proof of identity. Never recreate business records to refresh a read model. Verify on a second device.

## Quote/PDF/email/public totals disagree

Stop sending/acceptance. Compare the saved totals snapshot and inputs from `calculateQuoteTotals()`. Confirm the consumer reads the snapshot and that a browser draft did not overlay it. Correct/save once in Quote and regenerate consumers; never hand-edit an accepted Order/Finance total. Verify every customer-facing surface matches cent-for-cent.

## Inventory reservation or consumption discrepancy

Record job, attempt, reservation and transaction IDs; mounted roll; planned/actual/scrap grams; and status. Check for one reservation at ready, retention through QC, one consumption per attempt, and unused release. On stale concurrency, reload current state. Do not enter a balancing adjustment until physical count and immutable ledger are reviewed; never consume twice or create negative stock. If cancellation occurred after physical use, retain consumption and release only the live remainder.

## Recipe is missing, duplicated, or wrong revision

Confirm signed-in owner, remote recipe key, active filter, revision, and whether only a local preload/recovery exists. Explicitly import missing recovery only after comparison. Create a new revision rather than rewriting history; activate the approved revision and deactivate obsolete versions deliberately. Starting Repeat Job is a local handoff until destination save.

## Asset upload, link, or signed download failure

- **Upload:** inspect private object path, `asset_records`, and `asset_links`; a failure can occur between layers. Do not blindly re-upload or use upsert.
- **Link:** use stable record UUID/key and exact revision; never customer name or list position.
- **Download:** request a fresh authenticated signed URL (currently short-lived); do not turn it into a permanent/public link.
- **Revision:** New Revision must preserve prior metadata/object and links; archive is not deletion.
- **Security incident:** if anonymous/another owner can read, stop Asset use and deployment, preserve evidence, review RLS/Storage policies, and rotate exposed access as appropriate. Never weaken policy to restore convenience.

## JSON import created concern

Pause imports. Preserve the original export unchanged, hash/date it, identify data type and environment, and compare stable IDs against Supabase. Import is not automatic merge or rollback. Prefer dry-run/preview where provided; import only missing/approved data; verify counts/totals and retain an audit note. See [backup and recovery](ERP_1_0_BACKUP_RECOVERY.md#json-export-and-import-runbook).

## Escalation packet

Include: severity/business effect; operator/environment/browser/device; UTC/local time; Q/OP/UUID/attempt/transaction IDs; exact steps; expected versus actual; screenshots; sanitized console/network response; remote row/event/ledger observations; whether another device reproduces; and actions deliberately not taken. For acceptance, inventory, Finance, migration, RLS, or private Storage incidents, stop the affected workflow until reconciled.

