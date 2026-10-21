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
