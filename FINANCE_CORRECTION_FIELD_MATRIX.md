# Finance correction field matrix

Finance corrections always start from the current effective record. Audit IDs, owner IDs, command IDs, Order linkage, correction linkage, actor, and timestamps are never editable.

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
