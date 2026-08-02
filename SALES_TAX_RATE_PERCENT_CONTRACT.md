# Sales-Tax Rate Percentage-Point Contract

The ERP canonical representation is **percentage points**: `7` means 7%, `6.5`
means 6.5%, and explicit `0` means 0%. Storage and transport retain that number;
tax is rounded to cents from `taxable subtotal × rate / 100`.

## Contract audit

| Location | Input | Stored/transported | Calculation | Display | Canonical status |
| --- | --- | --- | --- | --- | --- |
| Quote county/custom rate (`quote.html`, `js/quote.js`) | Percentage points | Accepted Quote totals `tax_rate` | Shared `calculateSalesTax` | Numeric value plus `%` label | Canonical |
| Quote pricing authority (`js/quote-pricing.js`) | Percentage points | Totals snapshot retains rate | Shared `calculateSalesTax` | Snapshot consumers display percent | Canonical |
| Quote → Order (`capture_accepted_order_tax_metadata`) | Accepted snapshot percentage points | `orders.sales_tax_rate` unchanged | Server reconciliation uses `/ 100` | Orders field shows stored value | Canonical |
| Orders Admin (`orders-admin.html`) | Percentage points | PATCH retains number unchanged | **Previously decimal multiplication; repaired to shared `calculateSalesTax`** | `7` under percentage label | Repaired |
| Invoice snapshot (`get_order_invoice_snapshot`) | Order/accepted snapshot percentage points | `tax_metadata.sales_tax_rate` unchanged | Does not recalculate totals | Consumers add `%` | Canonical |
| Order → Finance (`apply_order_tax_metadata_to_finance_post`) | Server-owned percentage points | `financial_entries.sales_tax_rate` unchanged | Reconciles `amount × rate / 100` | Finance adds `%` | Canonical |
| Finance entry/correction (`finance-pro.js`, correction RPC) | Percentage points | Entry/effective replacement retains number | Shared browser helper and server `/ 100` | `formatRate` adds `%` | Canonical |
| Finance effective projection, County Summary, filing report | Effective entry percentage points | No conversion | Reporting consumes stored tax and audits percent rate | Adds `%` | Canonical |
| Finance CSV/tax export | Effective entry percentage points | Rate column is percentage value | No conversion | Export appends `%` where labeled | Canonical |
| Legacy candidates (`sales_tax_rate_contract_candidates`) | Stored historical value | Read-only | Compares percent and decimal interpretations | Explicit classification | Controlled legacy-only comparison |

The only decimal-fraction interpretation remaining is isolated in the read-only
candidate report and guarded Orders repair procedure. A sub-1 value is never
converted merely because it is sub-1; accepted snapshot rate and collected-tax
evidence must both prove the legacy meaning. Finance originals are never updated.

## Migration deployment

Apply `202608020008_canonical_sales_tax_rate_percent_contract.sql` through the
normal Supabase migration process. It adds validation functions/triggers, a
security-invoker candidate view, an RLS-enabled repair audit table, and a
service-role-only guarded Orders repair procedure. The migration does **not** run
the repair procedure and does not assume that any candidate is legacy data.

## Manual browser acceptance required

1. Open the Portage Order and enter `7`; confirm `$40.00` previews `$2.80`.
2. Save and reload; confirm the field remains `7` and tax remains `$2.80`.
3. Post the Order to Finance; confirm Portage, `7%`, `$40.00`, and `$2.80`.
4. Confirm County Summary and both tax/CSV exports show `7%`, never `0.07%`.
5. Check OP-000010: `$20.50` at `6.5%` must remain `$1.33`.
6. Create a Finance rate correction using `7`; confirm the preview and replacement
   use `$2.80`, while a county-only correction preserves the existing rate/tax.
7. Query `sales_tax_rate_contract_candidates`; review ambiguous rows without
   changing them. Run the service-role repair only after retaining the candidate
   output and independently confirming its accepted snapshot evidence.
