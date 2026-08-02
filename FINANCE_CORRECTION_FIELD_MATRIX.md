# Finance correction field matrix

Finance corrections always start from the current effective record. Audit IDs, owner IDs, command IDs, Order linkage, correction linkage, actor, and timestamps are never editable.

Validation is change-dependent. The browser tracks the fields the operator actually changes and sends that list with the complete proposed effective record. The RPC independently compares the proposal with the effective server record; it never trusts the browser list for accounting classification. Unchanged legacy values remain context and do not become required merely because another field is corrected. Override amount and explanation are omitted and ignored unless **Override calculated tax** is explicitly enabled.

| Field group | Income | Expense | Correction behavior | Validation / reporting |
|---|---:|---:|---|---|
| Date, category, tax category, title, notes | Yes | Yes | Metadata-only unless another financial field changes | Valid date; title/category required; latest metadata controls display/buckets |
| Vendor/customer description, payment method, receipt/document reference | Yes | Yes | Metadata-only | Length/type validated by the controlled RPC; latest metadata displayed/exported |
| Destination county | Yes | No | Metadata-only by itself | Controlled Ohio list; latest value drives county reporting |
| Exemption reason/certificate | Yes | No | Metadata-only if exemption status is unchanged | Reason required for an exempt entry |
| Entry type | Yes | Yes | Reversal/replacement | Only `income` or `expense`; contradictory fields rejected |
| Sale/expense amount and taxable subtotal | Yes | Yes | Reversal/replacement | Finite, nonnegative; explicit zero preserved |
| Shipping charged | Yes | No | Reversal/replacement | Finite/nonnegative; revenue remains separate from shipping cost |
| Tax rate, exemption status, tax collected | Yes | No | Reversal/replacement | Rate 0–20; canonical cent rounding; override requires flag and explanation |
| Shipping cost | Yes | Yes | Reversal/replacement | Finite/nonnegative; cost reporting |
| Material, packaging, labor/design, other direct cost | Yes | Income | Reversal/replacement | Finite/nonnegative; direct-cost/profit reporting |
| Business-use %, mileage amount/rate/route | No | Yes | Numeric drivers require reversal/replacement; route text is metadata | Percent 0–100 and nonnegative mileage values |
| Discount, gross total, amount paid, balance, quote/invoice reference | Snapshot/linkage only | Snapshot/linkage only | Not editable as nonexistent standalone ledger columns | Remain owned by accepted invoice/Order authority; Finance does not fabricate duplicate fields |
| Machine and post-processing cost | Snapshot/production only | Not standalone | Not editable as nonexistent standalone ledger columns | Production remains the manufacturing-cost authority; existing labor/other-direct ledger fields remain correctable |
| Original ID, Order number, command identity, correction group/linkage, actor/time | Read only | Read only | Never editable | Server-owned audit authority and CSV traceability |

## Effective-entry resolution

1. Start at the immutable original command-owned entry.
2. Use the newest correction receipt replacement, if one exists, as the financial effective row.
3. Apply the newest metadata-only `corrected_record` overlay targeting that effective row.
4. A financial correction reverses only the current effective financial row and creates one replacement atomically.
5. Reports retain original + reversal + replacement ledger effects and exclude zero-money metadata rows after applying their overlay exactly once.

## Manual acceptance

### County only

1. Open OP-000010 and choose **Create Correction**.
2. Change only destination county, enter a reason, and leave tax override disabled.
3. Submit and confirm the audit classification is metadata-only, no reversal/replacement exists, and county reporting uses the new county.

### Taxable-subtotal and rate split

1. Open the effective Finance entry and review the side-by-side customer total, taxable subtotal, rate, calculated/stored tax, shipping, exemption, and county context.
2. Correct taxable subtotal and/or rate, leave override disabled, and confirm tax is calculated with canonical cent rounding.
3. Submit and confirm exactly one correction command creates the established reversal/replacement, the ledger nets to the appropriate customer total, and reporting no longer treats tax as taxable sales.

## Live-schema mapping (2026-08-02 repair)

The correction boundary uses canonical ledger names. UI labels remain friendly, but the payload and effective snapshot do not invent ledger columns.

| Finance Pro input / payload key | Normalized server concept | `financial_entries` column | Classification | Validation | Reporting effect |
|---|---|---|---|---|---|
| Taxable / pre-tax amount → `amount` | Effective signed ledger amount | `amount` | Financial | Finite and nonnegative on a replacement | Income taxable/pre-tax sales; expense outlay |
| `original_amount` | Amount before expense business-use adjustment; same pre-tax basis for income | `original_amount` | Financial | Finite and nonnegative on a replacement | Preserves raw amount context |
| Destination county → `sales_county` | Ohio destination county | `sales_county` | Metadata-only by itself | Required and controlled only when county/tax inputs change | Main table, filing warnings, County Summary |
| `sales_tax_rate` | Percentage rate | `sales_tax_rate` | Financial | 0–20 | Tax calculation and filing rate |
| `sales_tax_collected` | Collected tax | `sales_tax_collected` | Financial | Server-calculated to cents unless override enabled | Tax liability; never added to taxable amount |
| `tax_exempt_sale` | Exemption state | `tax_exempt_sale` | Financial | Boolean; exemption reason required when true | Zero taxable tax calculation |
| `tax_category` | Reporting bucket override | `tax_category` | Metadata-only | Text; `auto` preserves category rules | Tax/category reports |
| `tax_included` | Amount tax-basis mode | `tax_included` | Financial if changed | Existing controlled text contract | Explains legacy inclusive amount treatment |
| `title`, `notes`, `category` | Descriptive metadata | Same-named columns | Metadata-only | Title/category required | Table and category reports |
| `payment_method` | Payment description | `payment_method` | Metadata-only | Text | Table/export only |
| `entry_date` | Ledger/report date | `entry_date` | Metadata-only | Valid date | Period assignment |
| `shipping_charged` | Customer shipping revenue | `shipping_charged` | Financial | Finite and nonnegative | Gross/customer total, not taxable subtotal |
| `shipping_cost` | Fulfillment expense | `shipping_cost` | Financial | Finite and nonnegative | Expense/profit reporting |
| `material_cost`, `packaging_cost`, `labor_cost`, `other_direct_cost` | Direct costs | Same-named columns | Financial | Finite and nonnegative | Profit reporting |
| `business_use_percent`, mileage fields | Expense allocation/drivers | Same-named columns | Financial for numeric values | Bounded percent/nonnegative numbers | Deductible expense reporting |
| Reason, correlation ID, expected effective timestamp, override flag/reason | Correction audit/command metadata | Receipt and correction audit fields | Audit-only | Always reason/identity/version; override reason only when enabled | Traceability/idempotency/concurrency |

`taxable_sales`, `taxable_amount`, and `destination_county` are not canonical `financial_entries` fields. The repair maps the taxable/pre-tax UI amount to `amount` and the destination UI control to `sales_county`; it does not add or emulate a `taxable_sales` column.

### Amount semantics

* **Income:** `amount` is the taxable/pre-tax sale basis when `tax_included = 'no'`; collected tax remains in `sales_tax_collected`, and customer total is amount + shipping charged + tax.
* **Expense:** `amount` is the ledger expense; `original_amount` retains its raw pre-business-use amount where allocation applies.
* **Reversal:** `amount` and `original_amount` negate the current effective row, with tax and other financial components negated separately.
* **Replacement:** `amount` is the validated corrected ledger amount and `original_amount` is the validated corrected raw amount.
* **Metadata-only correction:** the audit ledger row has zero monetary columns; the receipt's cumulative `effective_record` overlays canonical reporting metadata while retaining the prior effective amount and tax.
