# Finance effective reporting verification

## Resolution contract

Finance reporting reads `get_effective_financial_entries()`, not raw correction ledger rows. The projection returns exactly one transaction per immutable original. It selects the latest non-voided cumulative correction receipt, which already represents the current replacement plus all metadata overlays, and falls back to the original when no correction exists. The projection is `security invoker`, requires `auth.uid()`, and scopes both originals and receipts to that owner.

Metadata correction rows, reversals, and replacements remain in `financial_entries` for audit/accounting history. They are excluded as reporting roots. The projected row retains original, effective, metadata, reversal, replacement, correction-group, reason, and changed-field identifiers.

## Deployment

1. Apply `supabase/migrations/202608020001_effective_financial_entries_projection.sql` after the existing Finance correction migrations.
2. Deploy `finance-pro.js` with the same release.
3. Run `supabase/verification/finance_effective_entry_trace.sql` as the owning authenticated operator.

## OP-000010 manual acceptance

1. Confirm the diagnostic output still shows `original_county` and `original_rate` as null.
2. Confirm its linked metadata receipt shows `metadata_only`, Portage, 6.5, a correction-group ID, and a metadata-entry ID.
3. Confirm effective values show Portage, 6.5, taxable sales 20.50, and tax collected 1.33.
4. Confirm `effective_transaction_count` is 1.
5. Open Finance Pro or select **Refresh Data**.
6. Confirm the main table shows Portage, 6.5%, revenue 20.50, tax 1.33, shipping 0.00, and **Corrected**.
7. Confirm the missing-county and missing-rate filing warnings are absent.
8. Confirm County Summary shows Portage, one sale, taxable sales 20.50, rate 6.5%, and tax 1.33.
9. Confirm Monthly Breakdown still contains one transaction and customer total 21.83 without adding tax to taxable sales.
10. Export the Finance CSV and filing CSV; confirm effective county/rate and the original/effective/correction audit identifiers.
11. Re-query the original `financial_entries` row and confirm it remains unchanged.

Successful correction storage in the live project must be established from the diagnostic query. Repository code alone cannot prove the contents of the deployed database.
