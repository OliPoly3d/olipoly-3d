# Money monthly dashboard

`/money.html` is a private monthly household/business planner. It reuses OliPoly sign-in and the existing owner-only plan tables. No ERP endpoints, schema, policies or grants change in this milestone.

## Workflow

Choose a month and owner. One page shows:

1. Account summary with projected opening, current recorded balance including pending, and projected month-end.
2. Account balance graph and category Expected/Actual bars.
3. Income with editable expected dates, accounts and exact amounts.
4. Recurring bills/payments with the same editing workflow.
5. Other transactions and editable Child, Pet, Gas, Grocery, Dining and Misc targets.
6. Known monthly extras (YOY) with item amounts, selected-year and future-year totals.

Changing an expected amount, date, budget or seasonal item previews the effect immediately after the field changes. `Save changes` saves the plan without creating transactions. `Reset preview` restores the saved plan. `Record` opens the ordinary transaction form, where date, description, category, account, amount, destination, status and funding details can be adjusted before recording. Recording also saves pending plan edits atomically. Recorded rows have `Edit actual`, which updates the same transaction ID instead of inserting another entry.

Each monthly category target and funding-account edit affects that month. Seasonal-item edits default to that year/month. `Repeat these amounts in future years` creates an effective-year rule for the same calendar month and leaves earlier years intact. All changes retain the plan's revision/conflict/history protection. Forms are inert while a save is in progress, without excluding their fields from submission. Logout and auth changes clear draft data and rendered private views.

## Projection model

`money-planning.mjs` uses the existing posting engine rather than maintaining a second balance calculator:

- Start with recorded transactions and unmatched income/bill occurrences.
- For every category/month, reserve only `max(target - recorded purchases - matching scheduled purchases, 0)` against the selected cash account.
- Opening-month targets prorate inclusively. Monthly overrides are effective allowances and never prorate twice.
- Pending purchases consume targets. All recorded/committed postings in the forecast month participate in projection, while the displayed Actual category totals run only through today.
- Credit-card purchases consume their expense category once. Card payments are transfers. Configured everyday cards are projected to be paid in full by month end; an existing recorded/scheduled payment reduces the remaining payoff requirement. Other cards retain their scheduled payment plans.
- Monthly planned budget/payoff events occur at month end. They are ephemeral, never stored as actual transactions. Their results carry into the next month's opening through the same engine.
- Seasonal-item totals feed the single seasonal category target; they are not added as another expense layer. Actuals use the seasonal/YOY category to consume that allowance.
- Missing category targets or funding accounts are disclosed. Protected accounts are not pooled into an available-cash total.

Month-end event timing is a planning convention, not a prediction of daily variable-spending dates or a guarantee against overdrafts. The advanced cash-flow table retains the recorded/scheduled view. It is explicitly labeled as excluding remaining variable spending. Unknown obligations and post-promotion interest are not yet calculated; the dashboard does not claim a complete safe-to-spend figure.

Expected rows retain stable keys such as `schedule-id:original-date`. A per-occurrence override can change its amount, actual expected posting date and source/destination account without changing that key. Matching an actual suppresses the forecast once, including moves across month boundaries. First-pay-of-month stipend logic still uses the original 14-day schedule. A zero expected amount can skip that occurrence; actual income/expense entries still require a nonzero valid amount.

## Plan fields

Required foundation fields remain `version`, `start`, `accounts`, `transactions`, `schedules`. Amounts are signed integer cents; card liabilities are negative.

- `schedules[].overrides[original-date]`: signed `amount`, expected `date`, optional `account` and `to`. `changes` continues to provide effective-dated baseline amounts.
- `budgets[]`: `id`, `name`, `entity`, `aliases`, `monthly` full-month targets, optional `overrides` effective monthly targets, `account` default funding, and `funding[YYYY-MM]` month-specific funding. Optional `shortName` is presentation only.
- `budgets[].seasonal`: derives this category's full-month target from the seasonal items for that calendar month. It replaces the old monthly seasonal source total, rather than adding another target.
- `seasonalItems[]`: `id`, `name`, `entity`, calendar `month`, signed expense `amount` (a negative value is a credit), year/month `overrides`, and optional effective-year `changes: [{year, amount}]`. Private source-cell references/notes and review flags are preserved.
- `planning.cardPayoffs[]`: `card`, funding cash account `from`, optional `enabled`. These are explicit monthly projection assumptions, not bank autopay instructions.
- `unscheduledBills[]`: names and reasons for missing details; excluded from quantified projections until supplied.

The source workbook contains a positive value in an expense row. Its original sign is preserved as a credit with a visible review note. It is not silently corrected or represented as confirmed.

## Data and access

Only the allowlisted owner's verified user ID can read/update the plan. Clients cannot add themselves, insert/delete plans, transfer ownership or mutate history. The private trigger validates owner/revision and archives the prior document. This milestone needs no database migration. Private configuration changes use a revision guard and preserve existing accounts, actual transactions, schedules and target overrides.

Financial figures, owner identity and workbook/private imports must remain outside the public Git repository. No offline financial-data cache is added. Explicit JSON backups contain private records. The existing site's shared auth bridge still owns session persistence; no service-role key is exposed.

The single versioned plan document remains an atomic save boundary. Normalize before high-volume imports or ERP synchronization.

## Verification

- `node --check` each changed `.mjs` module.
- `node --test tests/money-engine.test.mjs tests/money-budget.test.mjs tests/money-planning.test.mjs`.
- Install `jsdom@26.1.0` outside the repository, set `MONEY_JSDOM_MODULE` to its absolute `lib/api.js`, then run `node --test tests/money-dashboard.test.mjs`.
- `git diff --check`.

Projection assertions cover target sensitivity, forward carry, cash/card purchase replacement, transfer exclusion, expected category commitments, overspending, exact cents, cross-month matching, seasonal year rules, source immutability and invalid inputs. Synthetic DOM checks cover previews without writes, seasonal repetition, save/reset behavior, recording and correcting actuals once, full-page loading and sign-out clearing.

The original `tests/money-access.test.mjs` remains available for isolated PostgreSQL checks with `@electric-sql/pglite@0.5.10`; no access-control changes occur here. Browser download failed in this environment during the preceding milestone. DOM checks are not visual or real-browser verification.

Manual checks required: desktop and narrow mobile layout; section links and keyboard labels; change each expected income/bill amount by a cent before recording; move a date across a month; change budget and funding for one month; compare that month's end and next month's opening; repeat only the selected calendar month's YOY amounts; record card purchases/payments; edit actuals; expired sessions and stale-tab saves. Full browser behavior is not claimed verified.


## Cancel and removal controls

The transaction editor has a labeled Cancel action and Escape shortcut. Both close/reset the editor without a save and preserve the separate plan preview.

Each actual has a removal dialog:

- Put back in budget removes the actual posting(s) and returns that exact amount/date/account to an editable expectation. Ordinary transactions become one-off expectations. An inactive recurring source stays inactive; returning one actual creates a separate one-off instead of resuming the entire series.
- Delete transaction removes the actual posting(s) and skips its matched occurrence. Other recurring dates remain unchanged. Category target amounts remain unchanged; their actual/remaining totals recalculate.
- Balance adjustments can be deleted but cannot become expected budget items.

Expected entries offer Skip this time or Stop recurring item. Skips are stored as original occurrence dates in `schedules[].skipped`, remain visibly restorable, and are excluded from forecasts. `schedules[].stoppedFrom` suppresses that and subsequent unrecorded occurrences; settings can resume the source. Existing actual history stays visible even when its source stops or no longer exists. Canceling the removal dialog changes nothing. All saved changes use the existing optimistic revision/archive flow; no records in immutable plan history are deleted.

`money-actions.mjs` owns these pure transitions. Tests cover matched and one-off returns, exact cents/dates, skip/restore, stop with retained history, paired transfer removal and invalid adjustment plans, plus editor/dialog cancellation without writes. These are source changes only; no production transactions are removed during implementation.

## Credit planning, annual summaries and opening snapshots

`money-credit.mjs` validates optional account credit terms and owns immutable payment-plan, scenario and hypothetical balance-transfer transitions. Account type `loan` is supported. A loan with `balanceUnknown: true` has no quantified principal; `credit.payoffQuote` is shown as a separate reference, never counted as zero known debt or silently substituted as principal. Existing loan bills remain cash expenses until a known principal and an explicitly applied loan payment plan link them as transfers.

Optional `accounts[].credit` fields include purchase/regular APR, promotional APR and last eligible date, promotional portion of opening debt, post-promotion APR, latest statement minimum/as-of date, due day, warning window, purchase grace-period confirmation, mode and linked payment schedule. Blank APRs remain unknown. A confirmed purchase grace period suppresses purchase interest estimates while preserving promotional-balance interest. Promotions with deferred interest and cash advances are outside this model.

The shared planning engine adds daily APR/365 interest estimates, posted at calendar month-end. Rates change the day after the entered final promotional day. Estimates allocate credits toward higher-rate buckets first; issuer minimum-payment allocation, statement periods, grace conditions, compounding, fees and rounding can differ. An actual expense categorized Interest replaces that account's estimate for its calendar month. Missing APRs retain explicit incomplete-interest warnings and prevent complete debt/interest summaries. They are never represented as confirmed zero-percent rates.

Managed payment occurrences use their existing matching keys, suppress the original engine's duplicate occurrence, and cap payments at projected debt. Unmatched actual payments already made in that month reduce remaining fixed monthly intent. Full-balance mode uses projected debt; a month-specific amount takes precedence. Pauses/skips and actual matches remain authoritative. Payment-plan application keeps real openings and transactions unchanged and disables the old full-card-payoff assumption for that account. Cross-owner payments retain an owner-contribution classification. It never changes bank autopay.

The sandbox retains multiple account scenarios with a common start/end horizon. It rebases comparisons on actual account balances and actual remaining category allowances, rather than prorating targets a second time. Hypothetical debt amounts and same-owner consolidation transfers/fees stay separate from real records. Applying copies the included payment plans and chosen cash-reserve thresholds into the existing dashboard draft; when several plans fund from one account, the greatest selected reserve is retained. Save changes remains the persistence boundary. Source-plan edits invalidate old comparison results. Unknown real loan principal blocks applying a loan payment plan.

`money-insights.mjs` builds owner-specific annual summaries from the same daily posting result. Spending excludes transfers; debt payments and interest are shown separately. Cash totals include earmarked cash and savings and are not safe-to-spend totals. Partial years, missing categories, missing card APRs and unknown loan principal are identified. Charts have accessible text labels and visible date/value ranges. Per-account reserve warnings catch shortages hidden by aggregate owner cash.

Opening reset is a separate review/preview action requiring a value for every account, with explicit unknown loan principal allowed. It replaces current actual postings with new openings and retains the existing immutable saved-revision history. Reset-day expectations can be marked as already included to avoid counting them again. Available-versus-posted sources and unknown pending items require review. This uses the existing plan document and revision guard; no schema migration is required. A prepared private snapshot must not be applied until the deployed code supports its account types.

One-time budgets use `budgets[].oneTimeMonth`, remain fully editable and are active only in that month. They are not prorated. Purchases under their distinct category replace remaining allowance normally; later months receive no new target and no missing-target warning for that inactive category. Multiple one-time categories are allowed. A weekly calculator counts actual weekdays, respects the opening-date cutoff and writes one selected-month effective target only, leaving other months and YOY items unchanged.

Additional verification: `node --test tests/money-credit.test.mjs` plus the existing suite. Browser interaction checks remain synthetic jsdom checks unless explicitly reported otherwise. No private account names, screenshots, figures or identity belong in public code or fixtures.

Purchase promotions can have an independent `purchasePromoApr` / `purchasePromoEnd` alongside the existing promotional opening-balance bucket (`promoApr`, optional `promoStart`, `promoEnd`). New purchases remain in the purchase bucket, so the two expiration dates never overwrite each other. Regular and post-promo APRs remain separate and unknown until supplied. `transferDeadline`, nullable `transferFeePercent`, `termsProvisional`, and `termsNotes` preserve offer assumptions visibly. Transfers after the entered processing deadline are rejected in the sandbox; an unknown fee requires an explicit input, never an automatic zero. Purchase-expiry and provisional-term notices also show on zero-balance accounts. The sandbox shows selected-account estimated interest, its change from the current plan, and the first projected zero-balance date within the horizon.

The account summary groups cash, prioritized cards (`accounts[].summaryPriority`, lower first), other cards with current debt, zero/credit-balance cards, then loans; stable ordering preserves account entry order within each group. Sorting never changes postings. Negative amounts in all three columns are red. Missing APRs leave the numeric projection visible with a distinct incomplete-interest note; unknown principal and missing category targets retain their explicit unknown/incomplete states. Card rows show remaining scheduled transfers for the selected month; pre-opening due dates never create catch-up payments automatically.

## Compact sections and one-time receipts

Everything below the main Summary is in a native details panel, closed on initial load. Compact headers show deposit/bill totals and unrecorded counts, category/YOY allowance and remaining totals, debt/promotion/terms alerts, year totals, or snapshot/account counts. Collapse/Expand controls affect primary panels. Navigation links, transaction matching and credit-term editing open the appropriate details ancestors. Opening panels does not save anything; sign-out clears private header text, input values and open states. `money-sections.mjs` owns navigation/reveal behavior; existing calculations supply header amounts.

`money-income.mjs` validates and builds one-time gift, windfall, friend repayment, other deposit and business owner-distribution entries. Expected deposits use the existing schedule engine with an anchor and end on the same day (`oneTime: true`), so multiple receipts may be planned independently without repeating. An expected entry changes only the draft until Save changes. Received/pending deposits save through the existing actual-transaction flow. Matching actuals replace forecasts once, preserve cents/status, can be edited or returned to the budget, and appear in the Income table. Unmatched actual income also appears there rather than duplicating it in the other-transactions table.

Owner payouts have `kind: transfer` and `funding: distribution`, strictly from business cash to household cash. Household Income shows the incoming deposit; the business ledger/forecast shows the paired withdrawal. Annual external income and business revenue exclude this transfer. Ordinary external receipts add income once to the receiving owner (or the explicit existing income owner). Use the actual net deposit after fees; no payouts or example receipts are created during implementation. Source/type metadata is optional and backward compatible; no schema migration or balance reset is required.

## Debt screen privacy

Summary includes an independent Hide debt / Show debt button (`money-privacy.mjs`). A browser-local `money_hide_debt` flag stores only 1/0; it is applied before loading/unhiding the authenticated app, propagates across tabs and survives sign-out. If storage is unavailable, the current-page toggle still works. It never changes the saved financial plan, budget draft, forecasts or bank payment settings.

Debt rows, debt-related activity and schedules, the planner, opening-reset editor, annual debt metrics/table columns/chart, and a debt-selected detailed forecast are removed from screen layout with `display: none`, including their descendant controls. Closed-panel debt totals and the debt navigation link are hidden too. A cash-selected forecast, bank balances, budgets and overall cash totals remain available and still include debt payments. Newly rendered debt rows retain the privacy attributes as months/owners/drafts change. Transaction editors are marked according to their selected accounts, preserving typed entries while hidden. This is screen privacy for nearby viewers, not authentication, data redaction, an encrypted store or a sanitized backup/export.

## Editable review, timing, confidence and month close

The Review & reconcile panel consolidates stale/unverified balances, unrecorded expectations, unknown obligations, incomplete future category targets, provisional recurring/YOY entries and credit terms/promotional deadlines. Every actionable item routes to an existing editor or an explicit account/bill review form. Unknown bills can become real expected schedules or be marked not applicable with a reason. Account names, last four digits, individual opening loan principal, cash floors, dated cash buffers and additional business reserves are editable in Advanced. Known future recurring amount changes have a dated editor. No private balances, examples or assumptions are seeded by these features.

Category Timing edits `budgets[].timing[YYYY-MM]`: `daily`, `weekly` with weekday, `date` with a date in that month, or `month-end`. The weekly charge calculator also writes only the selected month’s timing. Ordinary categories default to weekly Friday reservations; YOY/one-time targets default to month-end. Remaining allowance is divided in exact cents after recorded and scheduled category spending; transfers never consume targets. A rebased near-term forecast spreads only the remaining allowance across the remaining dates, moving an overdue single date to the snapshot date. Timing posts planning reserves, never actual transactions. A small bounded forecast cache is cleared on sign-out.

`money-confidence.mjs` owns pure reconciliation, attention, cash-capacity and comparison functions. Reconciliation compares posted or pending-inclusive ledger balances with a bank figure on the same basis; cards use positive amount owed in the form. Account/date/status/posting changes invalidate the checkpoint. There is no automatic adjustment: a separate explicit posted-balance action and reason are required. Checkpoints and any adjustment remain previews until saved through the existing revision guard/archive. Pending-inclusive checks cannot create a posted balancing adjustment.

Available cash uses a snapshot of current actual balances through the day before the next biweekly deposit into the selected account (otherwise 30 days). It protects debit-first daily lows, the account floor and dated opening/closing buffers. It stays Needs review for missing budgets/funding, unresolved bills, overdue outgoing expectations, incomplete credit details or stale verification. Business payout capacity uses only the selected business cash account over 30 days; additional tax/working reserves must be explicitly confirmed, including explicit zero. Reserves already covered by forecast spending must not be entered twice. Neither figure is a guaranteed spendable amount or accounting profit.

Trends show 12 months of category targets and recorded purchases, with prior-year values where tracking exists; untracked months are gaps and current/opening months may be partial. Forecast comparison baselines are saved explicitly for current/future months and never fabricated for past months. Recorded cash variance bridges opening balance, income, spending, net transfers and adjustments. Current-month results are month-to-date versus a full-month plan. Closed-month comparisons stay provisional until all cash accounts have valid verification at month-end or later and pending postings are resolved. Promo gap estimates reuse the debt engine and remain subject to entered APR/terms assumptions. Debt-specific review and analytics views respect screen privacy.

`money-month-close.mjs` protects a completed month’s recorded entries, opening balances, expected occurrences and category/YOY inputs for one owner. Closing requires verified cash accounts, no pending entries, no unmatched expectations, complete monthly targets and resolved unknown bills. The saved closing-cash snapshot is fixed; historical forecast graphs remain live estimates. Save checks compare closed-month fingerprints before writing, including changes made through global schedules/account controls. Monthly controls become read-only while closed. Reopening requires an explicit reason retained in the plan and saved revision history. Recorded balances continue forward normally. New current-month corrections remain possible; unspent allowances and corrections are never silently moved. These are application safeguards using the existing plan document and history, not database-enforced accounting locks; no schema changes are made.

The Summary’s date-aware checklist covers daily recording, weekly reconciliation, month-start targets/timing, month-end cleanup and previewing extra debt payments/owner payouts. Additional panels remain collapsed by default. Automated coverage includes exact-cent timing, checkpoint invalidation, explicit adjustment requirements, conservative cash buffers, missing-input flags, business reserves, variance bridges, close/reopen protection, on-page review editing, preview/save boundaries and sign-out clearing.

Manual browser checks required: open Money on desktop/mobile; review/edit a flagged item, set a category’s date/daily/weekly timing, compare a bank balance without saving, cancel, then verify an exact match; inspect the privacy toggle with credit review selected; save/reload a forecast baseline; close a completed test month and verify a backdated edit is rejected, then reopen with a reason. Synthetic DOM checks do not replace these browser checks.

## Automatic monthly baselines and duplicate-entry review

Current-month forecast comparisons are captured automatically on authenticated load, return to the tab, preview interaction or a later save/record action. `missingBaselineOwners` and `ensureMonthlyBaselines` select only the real current month in America/New_York and owners with cash accounts. Existing manual/automatic baselines are retained; browsing a future month does not freeze it early, and skipped past months are never fabricated. Each baseline stores its real capture date and source. A mid-month capture is explicitly labeled as including previously recorded activity. Future-month manual snapshots remain available.

All missing owner baselines are saved in one normal revision-guarded write using the existing access rules and archived plan history. Capturing a baseline writes metadata only, not transactions, balances or budget edits. Returning to a new month preserves a dirty budget preview by rebasing only its saved snapshot metadata. A conflict or failed automatic save remains unsaved and visible; Refresh retries from the latest plan. Requested recording/saving is stopped if its required automatic capture fails, leaving the entry intact. No tables, policies, triggers, credentials or schema changes are introduced.

`money-duplicates.mjs` suggests similar recorded and unmatched expected entries using transaction kind, the same accounts and direction, nearby dates and amounts/descriptions. Pending entries participate. Self-edits, normal matching of the chosen expectation, card purchases versus card payments, reverse transfers and skipped/paused/stopped expectations are distinct. Equal amounts on the same account within three days are review candidates; a matching description allows a five-cent difference. Similar named expected bills/deposits within seven days can also be suggested despite variable amounts. Managed credit payments use the shared planning engine’s calculated full/capped payment, rather than the underlying schedule placeholder. Suggestions are deliberately not proof of duplication and will not catch every different description/amount/date combination.

The shared duplicate-review dialog protects both the transaction form and one-time income/payout form, including new expected deposits. It offers Back to my entry, Review/edit recorded entry, Match this expected entry (retaining the proposed amount/date for final review), or an explicit separate entry. It never silently deletes, merges or attaches a schedule key. A chosen expected match still requires recording through the transaction editor. Form/plan changes invalidate the pending warning, the displayed candidates are rechecked before continuing, failures preserve typed inputs and legitimate separate entries remain possible. Closed-month checks and the normal revision guard still apply. Debt warnings respect screen privacy and clear when debt is hidden or the session ends.

Verification covers automatic capture/idempotence for multiple owners, manual future-baseline preservation, skipped months and year changes, rollover with an unsaved preview, conflict/reload recovery, duplicate cancellation, explicit separate recording, edit-self exclusion, expected variable bill and income matching, failed-save retry, privacy/sign-out clearing and unchanged card-purchase/payment semantics. Legacy interaction fixtures now contain an existing baseline so unrelated tests retain their original persistence expectations. Manual browser checks: on refresh verify the dated automatic baseline, change a budget and reload to confirm the comparison stays fixed, then attempt a repeated test transaction and exercise Cancel, Review and Separate. Check narrow-screen dialog scrolling/keyboard dismissal. Browser QA remains separate from synthetic DOM assertions.
