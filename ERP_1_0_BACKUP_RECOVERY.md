# OliPoly ERP 1.0 Backup and Recovery

[Handbook](ERP_1_0_HANDBOOK.md) · [Troubleshooting](ERP_1_0_TROUBLESHOOTING.md) · [Deployment](ERP_1_0_DEPLOYMENT_GUIDE.md) · [Testing](ERP_1_0_TESTING_PLAYBOOK.md)

## Recovery principles

Supabase is authoritative for durable business rows, identity/counters, acceptance, workflow, inventory transactions, Finance entries, events, Asset metadata, and private Storage. A browser is not a replica. Recovery must preserve audit trails and never silently replace newer remote data.

## Browser data and JSON

| Data | Examples | Durable? | Backup/recovery rule |
|---|---|---:|---|
| Draft | intake, reorder Quote, recipe repeat preload, unfinished form | No | Save deliberately; copy critical text before clearing a browser. |
| Recovery copy | failed Quote/recipe/record save | No | Review side-by-side and explicitly import only missing data. **It never uploads automatically.** |
| UI preference/cache | theme, filter, favorite, dismissed UI, cached read | No | Safe to reset; cannot override authority. |
| Auth session | browser token/session | No business durability | Sign out on shared devices; never export/share as backup. |
| JSON export | point-in-time portable copy from a supported page | Only as a file | Store securely, label environment/time, validate before import. It is not continuous backup. |

### JSON export and import runbook

1. Sign in to the correct environment and allow remote loading to complete.
2. Use the page's supported export action; name the file with environment and UTC timestamp. Do not include session tokens/signed URLs.
3. Preserve an immutable original in encrypted, access-controlled storage; record operator, scope, counts, and checksum where available.
4. Test that JSON parses and contains expected version/type/counts. Never edit the only copy.
5. Before import, take a fresh export and database backup, preview/dry-run if supported, compare stable IDs, and decide create/skip/conflict policy.
6. Import only through the supported explicit control. An import does not justify weakening RLS or inventing identities.
7. Reload from Supabase; reconcile counts, Q/OP chains, totals, statuses, ledger entries, and errors. Retain both exports and an import log.

If a page offers no explicit importer, the JSON file is evidence/recovery material—not permission to paste data into localStorage or the database.

## Scheduled backup checklist

- Back up the Supabase database using the project's supported backup/export process and verify restore documentation/access.
- Export migration history, schema/constraints, functions/triggers/RPC definitions, RLS policies, and Storage bucket/policy metadata.
- Back up private `job-assets` objects and object metadata with access controls at least as strict as production.
- Run supported application JSON exports for applicable modules (especially Finance) as a supplemental operator-readable copy.
- Store off-project, encrypted, least-privilege copies; document retention, owner, UTC timestamp, environment, and checksum.
- Test recovery in an isolated non-production project. A backup is not verified until restore and representative reads/downloads pass.

## Browser failed-save recovery

1. Stop editing and preserve the local recovery record.
2. Reconnect and query/reload Supabase by stable identity.
3. If remote exists and is newer, keep remote; manually compare useful fields and re-enter only an intentional change.
4. If remote is absent, use the explicit recovery review/import interface where provided.
5. Reload on a second device and confirm one record/event. Then retain or clear the local recovery according to the UI.

Never assume reconnection syncs the copy. Never use local timestamps alone to decide authority.

## Database/Storage disaster recovery

1. Declare incident; stop writes/public acceptance and preserve logs/evidence.
2. Select the last verified compatible database, Storage, policies, and migration-history backup.
3. Restore to an isolated Supabase project first; do not overwrite production as the first test.
4. Verify migrations `202607160001`–`202607160007` in order, functions/triggers/RPCs, RLS, private bucket/policies, counters, Q/OP uniqueness, orphan Asset links, and inventory/Finance reconciliation.
5. Run the full [testing playbook](ERP_1_0_TESTING_PLAYBOOK.md), including two users + anonymous, signed downloads, acceptance idempotency, and multi-device checks.
6. Approve cutover, preserve the damaged environment read-only when possible, document recovery point/data-loss window, and monitor.

Do not restore only Asset metadata without matching private objects (or vice versa). Do not reverse migrations casually, make Storage public, delete duplicates without review, or let browser recovery overwrite the restored authority.

## Recovery verification

- Authenticated owner reads durable records; unauthorized access remains denied.
- Q/OP identity chain, counters, one-Order-per-Quote contract, and snapshots are intact.
- Workflow status/events agree; reservations/transactions reconcile; no negative balances.
- Finance invoices/receipts/payments/refunds balance.
- Asset bytes, hashes/size, metadata, links, revisions, archive state, and fresh signed download work.
- Hub/Customer 360/public tracking are read-only and consistent after reload.

