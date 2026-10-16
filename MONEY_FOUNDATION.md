# Money: first milestone

Target: `/money.html` on the existing domain. This is an initial transaction and scheduled-cash-flow foundation, not the finished financial management system.

## Included

- Existing OliPoly sign-in, with separate database authorization for one designated owner.
- Separate household, business and custodial accounts. Positive cash and negative card liabilities, stored as integer cents.
- Purchases, receipts, paired transfers/card payments, explained balance adjustments and pending/cleared/reconciled states.
- Spending grouped by category and expense owner. Personally funded business purchases default to owner contributions. Opening card balances do not become spending.
- Monthly and biweekly schedules, first-paycheck-of-month stipend, effective-dated amount changes in the data model, optional end dates and pause/resume.
- One engine for daily and monthly projections up to 36 months. Same-day lows assume withdrawals before deposits. Recording a scheduled event replaces it using a stable occurrence key, even if the actual date/amount differs.
- Export and empty-plan-only JSON import. Optimistic concurrency prevents stale-tab overwrite. Database revisions retain old states.

## Data and access design

This milestone stores a versioned plan document with separate account, transaction and schedule collections. It is deliberately a single atomic save boundary for transfers and schedule matching. Later migration to normalized transaction tables is expected before high-volume imports or ERP synchronization. The SQL migration adds only `money_access`, `money_plans`, `money_history`, and a private history trigger; it changes no ERP tables, RPCs or queries. The application uses SELECT and revision-conditional PATCH on these new tables, not ERP finance endpoints.

`money_access` permits exactly one row. Provisioning is an administrator operation; users cannot add themselves or claim the first plan. All new public tables have RLS. Unauthenticated access is revoked. Authenticated users can read/update only the designated owner's plan when their verified user ID matches. Clients cannot insert/delete plans, reassign ownership, edit the access list or mutate history. The private security-definer trigger can only archive the prior row during a valid owner update. It is not exposed as an RPC.

No financial values, personal seed files, owner email or real owner UUID should be committed. The page is a public shell; the data is protected in the database. There is no offline financial-data cache. Explicit exports contain private records and belong outside the public repository. The shared auth bridge still stores login tokens according to the existing site's design; this milestone does not redesign site-wide authentication.

## Required manual database setup — NOT applied by this change

1. Review `supabase/migrations/20261016183209_money_foundation.sql` and run the isolated database tests.
2. Apply that additive migration to the intended Supabase project using the administrator's normal review process. Confirm the project matches the existing auth bridge.
3. Find Rob's existing user ID in Supabase Auth, verifying the account with him. Never guess it from a name or automatically select the first user.
4. In an administrator transaction, insert that UUID into `money_access`, then provision `money_plans` with a version 1 empty document and the agreed start date. The migration ends with example statements; replace placeholders privately. No financial data is embedded in the SQL.
5. Verify the owner can load the empty plan, a second signed-in user cannot access it, and signed-out REST requests cannot read it. Test both read and write denial. Apply only after the security checks pass in staging.
6. Sign in and import the private opening-plan JSON. The import intentionally refuses to overwrite nonempty data. Merge the reviewed page/code only when setup and browser checks are complete.

## Model

`version`, `start`, `accounts`, `transactions`, `schedules` are required. Account `opening` is the posted balance immediately before `start`; `reserve` is integer cents. Credit-card debt is negative. Transactions are dated signed account postings; a transfer has two equal/opposite entries. `scheduleKey` identifies the replaced occurrence. Transaction categories record spending at purchase, while transfers/payment entries never re-record spending. `expenseEntity` and `funding` identify personally paid business costs; they are an initial classification, not a full double-entry accounting ledger.

Monthly schedules use `day` and clamp to shorter month end. Biweekly schedules retain their anchor. `firstPayBonus` applies only when the previous scheduled payday is in the preceding month. `changes: [{date,amount}]` overrides the base amount from an effective date. Holiday overrides are recorded as actual matched events; a separate forecast-only exception editor remains to be implemented.

## Explicit limits before relying on projections

- No remaining-budget reservations, reallocation or rollover engine yet. Category actuals are present, not budget completeness.
- No automatic future payoff for new card purchases, statement-cycle model, interest calculation, or debt optimizer. Scheduled fixed card payments work. Do not interpret projected cash as safe to spend.
- No automatic sales-tax reserve, processor clearing ledgers, or ERP synchronization. Business tax liability remains unknown until supplied.
- No bank imports, full Excel import/export, weekly view, charting or multi-user sharing yet. JSON export is available for the foundation.
- Recurring entries can be paused and replaced; a full schedule/account editor, transaction reversals and revision restore UI are later milestones.
- Current posted balances use transactions dated through today in America/New_York. Dates represent planned/actual posting dates; month views can include partial months.
- The confirmed end of a payroll loan deduction must be preserved, but exact effective payday/amount must be reconciled from source before that event is treated as exact. Do not silently interpret annual draft raises or changing allocation amounts as loan relief.

## Verification

Run `node --check js/money-app.mjs`, `node --test tests/money-engine.test.mjs`, and `git diff --check`.

For isolated real PostgreSQL behavior, install `@electric-sql/pglite@0.5.10` in a temporary directory outside the repo, then set `MONEY_PGLITE_MODULE` to its absolute `dist/index.js` and run `node --test tests/money-access.test.mjs`. This creates an in-memory PostgreSQL database and stub Supabase roles/auth.uid; it never connects to production. It checks owner/non-owner/public access, immutable ownership/history, revision sequencing and stale updates. It does not certify the deployed Supabase configuration.

Manual browser checks required before activation: sign-in/out and second-user denial; narrow mobile layout; create a purchase on each account type; pay a card without duplicate category spending; record a schedule at a changed date/amount; reconcile and adjust a balance; import only into an empty plan; export; conflict between two tabs; expired session during save; sign-out while requests are in flight; keyboard entry and screen-reader labels. No browser verification is claimed in this milestone.

## Next milestone

Build adaptive budget reservations and card payment scheduling into the same engine, using the workbook's month-specific category targets, October proration and reset-by-default rules. Add weekly views and debt/promo visibility after validating their effect on daily cash. Keep the private verified configuration separate from public source throughout.
