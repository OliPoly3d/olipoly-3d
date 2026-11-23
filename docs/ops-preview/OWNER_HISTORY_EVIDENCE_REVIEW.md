# Owner-only history PDFs in ERP Test

The Legacy history screen shows document names alongside evidence notes. Select **Prepare PDF** to fetch an attachment using your test session, then **Open PDF** to open the browser preview. Each new search clears prior preview links. A missing or inaccessible file gets its own message without clearing the archive result.

## Hosted change for approval

Target **OliPoly ERP Test** (`llscjdyiiatmuqhilube`). [20261105185617_ops_test_owner_history_evidence.sql](../../supabase/ops-preview/migrations/20261105185617_ops_test_owner_history_evidence.sql) adds an empty private PDF bucket, owner-scoped metadata, and a read-only lookup. Storage grants authenticated access only to paths linked to an archive record for that owner. The original lookup remains available. No existing data is changed by the migration.

After approval, verify the private bucket and scoped grants. Upload [the fictional Q-900001 PDF](../../tests/fixtures/ops-preview/Q-900001.pdf) using an authorized Storage upload. Link only that file to the existing issued-quote fixture for the confirmed test owner. Add a second, clearly labeled missing-file fixture to the same quote for negative testing. Use Storage APIs for file bytes. Package only the updated preview scripts in the owner-private Site. The PDF stays in private Storage.

If rolling back, restore the prior preview and revoke the new lookup. Remove the explicitly identified fictional test object and metadata only with separate authorization. Keep operational and archive records available.

## Verification

- Run the preview test suite with `OPS_PGLITE_MODULE` set. The local test applies both reviewed history migrations with a mock Storage schema and verifies the owner and denial cases. The cloud test covers the authenticated download, missing file and invalid response.
- Hosted acceptance: search `Q-900001`, open the fictional PDF, and try the missing-file fixture. Verify anonymous access and a second owner's direct object request are denied. Confirm the record still has no linked order. Check Safari PDF opening on iPad.
- The dry-run importer and real source documents are separate work. `Q-000251` is the eventual real acceptance case.
