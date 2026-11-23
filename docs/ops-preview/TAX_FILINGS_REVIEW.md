# Sales-tax filing and remittance history

Prepared November 23, 2026. Status: implementation and local verification complete; migration application, merge and private publication await approval.

## Owner workflow

Finance → Sales-tax filing & payments. The initial period is the most recently closed semiannual period. Select another half-year/month or enter exact dates within one calendar year, including partial periods for rate changes. The selected period is independent of transaction search and annual-report controls.

1. Review the current county/rate worksheet against the external filing portal and any unposted orders in Finance reports.
2. File outside this app. Record the original return, filing date, actual due date, full reported tax, actual discounts/charges/credits, confirmation, explanation and optional HTTPS document link. Explicit confirmation of external filing is required.
3. Record actual payments separately, including partial remittances, payment date, confirmation and evidence. Refunds are separate positive-amount records that reduce net remittances.
4. Review outstanding amounts, overpayments, recorded due dates and source-change alerts. Recorded periods remain available below the form with their statuses/balances. These are in-app reminders, not scheduled email notifications.
5. If needed, append a complete filed amendment or correct an ERP record with a reason. Prior versions remain. Amendments replace total liability rather than adding the same liability again; prior payments stay allocated to the period.
6. Void an incorrect payment/refund record and enter the corrected record. This preserves the original, does not reverse a bank transaction, and rejects removal of a payment if dependent refunds would make net payments negative. An incorrect return record may be voided only with zero net payments; it does not cancel an external return.

Exports: selected period event history and each return's saved source worksheet. CSV text uses the existing formula-escaping exporter. Source exports retain recorded fields plus amounts derived by the same Finance report reducer, including snapshot fallbacks.

## Coverage against legacy

| Capability | Existing Finance Pro / approved design | This milestone |
| --- | --- | --- |
| Semiannual worksheet, county/rate rows, CSV | Existing legacy worksheet and current replacement reports | Retained; exact date ranges use the same authoritative report calculation |
| Actual filing status/date/reference | No saved filing-history implementation found in source or test schema | New append-only owner-scoped events |
| Tax collected versus reported | Saved ledger amounts already authoritative | Separate frozen source worksheet, reported amount and reconciliation explanation |
| Discount, additional charges, credits | No persisted return record | Actual portal amounts entered separately; no automatic eligibility assumption |
| Remittances, partial payments, refunds, balances | Not represented as a filing/remittance subledger | Separate events, confirmed dates/references, balance and overpayment display |
| Amendments and county corrections after filing | Finance corrections already preserve source entries | Filing snapshot remains frozen; source changes prompt review; complete amendments/corrections preserve history |
| Cross-device persistence | Shared Supabase test architecture | Server storage and concurrency control; browser session storage holds only interrupted-command identity |
| Filing or bank submission | External Ohio portal | External; no automatic filing, payment, email or bank action |

Recorded remittances do not become business expenses, artificial sales, or revenue reductions. Discounts, credits and added charges are retained for reconciliation, but their income/expense treatment is not automatically posted to the general ledger. Review these in year-end bookkeeping. This remains a filing/remittance record rather than an automatic tax-return or bank-reconciliation engine.

## Date and tax rules

Sources checked November 23, 2026:

- Ohio administrative rule 5703-9-13: https://codes.ohio.gov/ohio-administrative-code/rule-5703-9-13
- Ohio sales/use tax filing guidance: https://tax.ohio.gov/business/sales-and-use-tax/sales-and-use-tax
- Ohio due-date reference: https://tax.ohio.gov/help-center/resources/duedates

Semiannual suggestions match Rob's existing filing frequency, not a new election of filing frequency. Ohio assigns the schedule. Suggestions start with the 23rd of the month after period end and move weekends to Monday. Holidays/extensions require portal verification; the actual due date is editable. For example, the suggested July–December 2026 due date is Monday January 25, 2027 because January 23 is Saturday. No timely-filing discount is automatically claimed; the owner enters the amount actually on the external return.

The source worksheet includes current effective posted income, not unpaid/unposted orders. Existing Finance unposted-order review remains relevant before filing. Recording an older return captures today's available effective records as evidence at capture time, not a claim to reconstruct the exact books as of its historical filing date. External return documents retain the evidence of what was actually filed.

## Exact migration awaiting approval

- File: `supabase/ops-preview/migrations/20261123171845_ops_test_tax_filings.sql`.
- Target: **OliPoly ERP Test — llscjdyiiatmuqhilube only**.
- Adds `public.ops_preview_tax_events`, its identity sequence, owner/period index and owner SELECT RLS policy.
- Adds `ops_preview_tax_source(date,date)` and `ops_preview_tax_load()` as SECURITY INVOKER functions.
- Adds `ops_preview_tax_commit(date,date,text,jsonb,uuid,jsonb,text)` as a narrow SECURITY DEFINER append command with an explicit authenticated owner predicate, empty search_path, fully qualified object access and authenticated-only EXECUTE.
- Revokes direct INSERT/UPDATE/DELETE and sequence access from public/anon/authenticated. Owners can SELECT only their own rows. No public tracker/payment capability is added.
- Uses existing `get_effective_financial_entries()` without modifying it. No existing table, workspace state, order, invoice, inventory or financial entry is rewritten. No old return is inferred or marked filed.
- Command retries require the same owner/request/identity and return the existing event. New commands use an expected last-event ID; stale history and stale Finance source are rejected. Repeated active payment/refund date/reference/amount combinations and overlapping filed periods are rejected.

Risks: a new private data store requires correct grants/RLS and preservation during future migration; manual external amounts can differ from source data and must have explanations. Source snapshots are intentionally immutable point-in-time evidence. Application failures leave the table/events intact.

Recovery: roll back the Site/source version and revoke authenticated EXECUTE on the new commit RPC if needed; retain the new history table and its owner-scoped read access. Do not delete history to roll back UI behavior. The SQL file is transactional, so an application error rolls back its schema changes as one unit.

After exact approval: verify the target project identity, capture counts/digests of existing workspace/order/Finance records, apply this file only, verify catalog grants/RLS/function paths, run a rollback-only owner command rehearsal with frozen source/retry and permission checks, confirm no existing-record changes, and rerun security advisors. No permanent sample events should remain.

## Verification completed

66 automated checks passed, zero skipped, with jsdom and PGlite enabled. Tests include real migration execution against the local PostgreSQL-compatible database, server-owned snapshots, stale-source/history rejection, exact retry idempotence, duplicate/overlap prevention, partial payments, refunds, void dependencies, zero-sales returns, record amendments, owner isolation, anonymous denial and no direct updates/deletes. Integrated UI tests exercise real form controls, downloads, interrupted-command recovery, county drift and unsaved expense preservation. Annual reports, expense entry, financial corrections, rate defaults and shared settings regressions pass. Syntax and git diff checks pass.

Hosted schema was inspected read-only before authoring. A baseline security advisor response was captured before application. Existing legacy warnings are not changed by this migration; post-application review must check for newly introduced findings. All hosted writes remain pending approval.

No visual browser/iPad verification is claimed. Desktop owner acceptance and iPad spacing/touch/PDF checks remain after approved publication. The public website, live ERP and Finance Pro stay intact.

## Manual acceptance after publication

1. Refresh Finance. Expand Sales-tax filing & payments and select a closed fictional period.
2. Compare its county worksheet with Reports. Enter actual-style fictional return details, confirm external filing and save.
3. Record a partial payment, then the remainder; verify the amount outstanding reaches zero. Test a refund/void using fictional records only.
4. Make a reasoned Finance county correction in that period. Refresh and verify the saved return remains unchanged while the review alert appears.
5. Export history and original source; verify confirmation/document links, amounts and source county. Record a correction/amendment only as appropriate.
6. Confirm desktop layout first. Add this screen to the later iPad acceptance pass; current approvals are desktop-only.
