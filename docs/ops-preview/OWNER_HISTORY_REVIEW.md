# Owner-only legacy history review

Open **Legacy history** from All work or Workspace after signing in to OliPoly ERP Test. Search a complete quote, order, invoice or PO reference. Case and outer whitespace are ignored. Prefixes, punctuation and leading zeros still matter. Results show the original status, source record, documented order link, evidence labels and open items. Multiple exact matches remain visible as separate candidates.

## Test database change for review

- Target for any later application is **OliPoly ERP Test** (`llscjdyiiatmuqhilube`). The migration is [20261105134128_ops_test_owner_history_lookup.sql](../../supabase/ops-preview/migrations/20261105134128_ops_test_owner_history_lookup.sql).
- Adds two empty, RLS-protected tables in the private `ops_history` schema and one read-only, invoker-security RPC. The lookup uses the signed-in identity and an exact owner/reference index. Anonymous callers have no schema or RPC access. Authenticated clients can read only their own archive rows and cannot write either table.
- No trigger, seed data, existing record update, payment, fulfillment or allocation action is part of the change. The app rejects a non-test Supabase host. Customer preview and public tracking have no archive link or lookup path.
- The page renders evidence labels and open issues. Actual document retrieval, the reviewable importer and source-data loading are separate. Until a reviewed import runs, an enabled archive is empty.
- If the private test publication is later approved, package `ops-history-preview.html` and `js/ops-preview/history.js` with the existing test pages and the updated cloud adapter. Validate the new route on the private Site. Apply the migration before expecting results.
- If the test rollout needs to be reversed, withdraw the new route and revoke the lookup RPC. If the archive remains empty, the new function and tables can then be removed in an approved rollback. If rows have been imported, preserve and reconcile the archive before considering removal.

## Verification

- Run `node --test tests/ops-preview*.test.*` with `OPS_PGLITE_MODULE` pointed to the local PGlite module. The lookup test exercises the actual migration with fictional references and owner identities.
- Manual browser acceptance after approval: sign out and check that the test sign-in prompt appears without a search; sign in and search an exact fictional reference, a similar reference that should miss, and a shared reference. Verify original status and unresolved items are visible on iPad and that a second owner cannot see the first owner's records. Verify that legacy records have no active order actions.
