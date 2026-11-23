# Finance corrections and remaining accounting coverage

Prepared November 23, 2026. Review package only. This milestone does not apply a database migration, merge, publish, send communications or change customer orders.

## Scope and behavior

The existing Finance screen gains a correction form and correction history for each effective transaction. Owners can correct posted income, manual expenses and mileage using the existing append-only correction RPC. The form previews changed values and requires a reason. Income fields include tax reporting county, rate, exemption details and an explicitly explained actual-tax override. Expenses retain full purchase cost and business-use share; mileage retains total miles and four decimal rate precision.

County-only changes preserve the posted tax and reallocate the effective sale to its corrected county in reports. Rate or taxable-amount changes use the existing canonical tax calculator; the server independently calculates tax. The corrected financial record does not rewrite accepted customer quotes, invoices, orders or payments. Those require their own commercial adjustment and any actual refund/additional payment must be recorded through the appropriate workflow.

An interrupted correction retries the exact saved command identity. Another edit cannot overwrite a changed effective version. Original entries and technical audit/reversal/replacement rows remain visible through history; reports consume the existing server-effective projection once per transaction. History includes timestamp, reason, previous/new values and ledger/command references.

## Exact migration and approval boundary

- File: `supabase/ops-preview/migrations/20261123135110_ops_test_finance_corrections.sql` (created using Supabase CLI).
- Target: **OliPoly ERP Test, llscjdyiiatmuqhilube only**.
- Replaces two existing functions: `public.correct_financial_entry(...)` and `public.guard_command_owned_financial_entry_mutation()`.
- Allows an owner's original manual financial entries to use audited corrections. Technical correction/reversal/replacement rows remain invalid correction roots.
- Once a manual original has correction history, the existing mutation trigger blocks direct update/delete through legacy paths too.
- Preserves four decimal mileage rates in financial replacements. Metadata-only edits of legacy exempt records do not require unrelated exemption repairs.
- Existing `financial_entries` and `finance_correction_receipts` are used; no new tables, columns, roles, policies or grants. No rows are updated, deleted or renumbered by the migration.
- Existing effective-ledger query, Finance reports and owner RLS remain authoritative. The public website and production database are unaffected.

Risks: correcting an entry will make its manual original immutable to old direct-edit/delete controls. Financial corrections intentionally change effective historical reports for their entry dates. Filed-return snapshots/locks are not implemented in this milestone. A Finance-only tax correction does not collect/refund money or amend a submitted tax return.

Recovery: do not delete correction history to undo a financial result. Apply another audited correction. If UI trouble arises, republish the previous private Site version while retaining the protective functions and audit data. Before any corrections exist, previous function definitions are available in the baseline migration; after corrections exist, prefer a forward fix preserving immutability. Apply the migration transactionally only after explicit approval of this file and target.

## Remaining accounting scenarios and go-live gates

This is a coverage register, not authorization to implement the following features or change accounting policy.

| Scenario | Evidence and remaining work | Acceptance requirement |
|---|---|---|
| County / rate reallocation | Covered by this proposed milestone; not deployed yet. Delivery address and tax jurisdiction are distinct. | Change county only without changing tax; change rate with explicit tax preview; retain prior values and reason; effective county totals reconcile. |
| Ohio sourcing and historical rates | Legacy page labels destination county; new screen permits explicit tax reporting county. Automatic order-received location capture and rule selection are not verified. | Preserve order-received location and delivery/pickup location separately; document applicable sourcing basis and sale-date rate. Review exceptional sourcing before automated selection. |
| Filed returns and later corrections | Effective history exists; frozen filing snapshots, period locks and amendment/remittance reconciliation are not in the current Finance preview. | Retain what was actually filed; correction shows old/new county/tax and affected period; deliberate amendment or current-period handling; record filing/payment reference. Never silently replace a filed return. |
| Tax owed versus collected | Reports summarize recorded tax. Undercollection/overcollection settlement is not a complete verified workflow. | Distinguish calculated liability, collected tax, customer refund/additional collection and remitted tax; explain differences. Tax collected must not become sales revenue. |
| Refunds, partial returns, credit notes, chargebacks | Legal terms mention remedies, but end-to-end accounting controls are not verified. Current correction form accepts nonnegative effective entries. | Link refund/credit to original sale/payment, reverse appropriate sales/tax amounts, retain fees and order history, avoid using an expense as an undocumented substitute. |
| Deposits, partial payments, overpayments and tips | Split payments/deposits have DB regression coverage. Current preview posts order income on final payment. Overpayment/tip/refund completion not verified. | Reconcile actual receipts and remaining balance; explicitly confirm accounting timing; separate voluntary tip, accidental overpayment and customer credit; do not treat all excess as tip. |
| Processor fees, payouts and duplicate expenses | Posted expense/business-share reports exist; bank/processor payout matching is not verified. | Match gross receipts less fees/refunds to net deposits. Avoid recording both payout and gross sale as revenue or the same postage twice. |
| Owner/personal funds | Business-use percentages and personal payment method exist. Equity contributions, draws and reimbursements lack a verified dedicated flow. | Retain receipt/full amount/business share and funding source; distinguish expense from owner transfer and reimbursement. |
| Internal/personal/complimentary production | Inventory-only use is an established requirement; full financial classification is not verified here. | Consume appropriate inventory and machine resources with zero artificial revenue; distinguish personal withdrawal, goodwill, advertising and scrap. |
| Inventory, equipment and year-end treatment | Cash expense report and production cost allocations are separate. Legacy Schedule C helpers exist, but exact tax-category mappings need annual review. | No duplicate deduction for purchased filament and its per-job usage. Preserve opening stock/adjustments/closing stock and equipment register; verify tax treatment rather than copying old form-line labels blindly. |
| Unpaid B2B invoices, bad debts, year-end cutoffs | Invoices/terms and deposits exist; posted-sale timing follows final payment in current test workflow. | Verify chosen accounting basis, invoice/receipt dates, open receivables and reporting-period boundary cases with the business's tax preparer. |
| Finance Pro parity | Legacy settings, home-office helper, Schedule C line/bucket reports and exports remain in `finance-pro.html` / `finance-pro.js`. They have not all been recreated in the private Finance screen. | Complete feature-by-feature parity and financial-total migration reconciliation before retiring anything. Preserve document links, original IDs, historical corrections and exports. |

Ohio primary sources reviewed November 23, 2026:
- https://tax.ohio.gov/business/ohio-business-taxes/sales-and-use/information-releases/st-2009-03-sourcing — Ohio vendor origin-sourcing rules and exceptions.
- https://codes.ohio.gov/ohio-revised-code/section-5739.033 — statutory sourcing hierarchy.
- https://tax.ohio.gov/business/resources/self-help-library/file-original-and-amended-returns — amended-return process.

## Validation and owner review

Automated checks include pure correction validation, normal submit controls in jsdom, escaped audit content, report refresh, exact-identity retry, full PostgreSQL migration rehearsal, owner isolation, stale version rejection, manual-root update/delete protection, chained corrections, tax allocation, rate recalculation, explicit override and mileage precision. Existing inventory/order/payment regression tests run with the new migration included.

jsdom is not a visual browser review. After approved migration and private publication, on iPad:
1. Open Finance, expand an expense and select Correct entry. Change a receipt note, supply a reason, save and inspect history.
2. Change the full expense amount/business share; verify the preview, corrected amount and report once.
3. On a fictional posted sale, change only tax reporting county; verify unchanged recorded tax and new county allocation.
4. Change rate, verify calculated tax; separately test an explained actual-tax override. Customer order/invoice/payment remains managed in its own workflow.
5. Open the same entry on a second device, correct it, then attempt the stale first-device save. Refresh before proceeding.
6. Review trip fields and four decimal mileage rates; reload on another device and verify persistence.
