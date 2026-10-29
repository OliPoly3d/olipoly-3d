# Money decision dashboard release

This release implements the agreed overview and planning whiteboard without changing saved financial data during development. All financial views consume the shared posting and budget engines. New controls create previews before saving, and actual transactions remain distinct from expectations.

## Acceptance checklist

- [x] Cash outlook with cash floor, payday/bill annotations, event inspection, and near-term/90-day/year lows.
- [x] Category spending pace uses category timing, weekly charge dates, and dated one-time allowances.
- [x] Monthly-low heatmap and account cash waterfall distinguish expenses, debt payments and internal transfers.
- [x] Savings runways, optional amount/date goals, and debt promotion/payment timelines preserve privacy.
- [x] Quick purchase, card payment, income, refund and cash-wallet workflows show local save results and recover stale entries.
- [x] A searchable activity ledger includes every transaction type and supports date/account/category/status filters.
- [x] Split purchases and linked partial refunds/reimbursements affect account balances once and categories correctly.
- [x] Weekly, quarterly, semiannual, annual and custom-week schedules preserve matching keys, exceptions and closed months.
- [x] A grouped action checklist prioritizes current obligations and keeps dormant-account/planning reviews quiet.
- [x] Existing forecast entry points are consolidated; detailed help is expandable and business tools follow the owner view.
- [x] Affordability previews distinguish extra spending, existing allowances, savings funding and existing expectations.
- [x] Saved household scenarios store compact changes, compare against the current plan and apply only to preview.
- [x] Financial milestones and renewal annual costs use entered schedules, terms and effective dates.
- [x] A cash-wallet guide handles withdrawal, spending and returns as distinct movements.
- [x] Annual preparation preserves explicit future targets and existing growth, requires selection of one-times, and reviews overlaps.
- [x] A plan-change explanation distinguishes actual balance changes, remaining allowance and projected outcomes.
- [x] Multi-year volume and plan-size limits are tested; immutable history is retained and no automatic deletion is introduced.

## Verification

Use synthetic data in committed tests. Cover month locks, exact cents, partial refunds, split categories, matched expectations, recurrence boundaries, optional scenario inputs, stale saves, privacy, owner separation and large ledgers. Preserve the current public design and verify mobile layout. Do not publish until the concrete release is approved. No financial seed data or credentials belong in this repository.

## Storage and compatibility

The plan stays in the existing owner-scoped JSON document. No database migration or live financial-data rewrite is part of this release. Optional fields store compact scenario changes, savings goals, annual-review choices, overlap decisions and a bounded twenty-entry change explanation. Actual refunds link to original purchases; split allocations must total the single account posting exactly. Projections carry non-posting refund context when older transactions become snapshot opening balances.

The existing database accepts at most 2,000,000 bytes of JSONB text and archives full prior revisions. The client estimates stored spacing, warns at 1,500,000 bytes and blocks new saves above 1,900,000 estimated bytes. Errors preserve the entry. Both ledger tables cap rendered rows at 300; search covers all entries. No ledger data or archive revision is silently removed. A future archival design requires its own reviewed migration and recovery plan.

## Release verification

- 111 automated checks passed with no skips. Money assertions include accounting, owner access / immutable database history, full-page JSDOM interactions and synthetic volume / size boundaries.
- A read-only check of the current saved plan confirmed unchanged daily low / closing forecasts through December 2029, all chart tabs and zero writes. Personal data stays outside the repository.
- Native Chromium launch was blocked by this environment's socket permissions. No native desktop/mobile visual QA is claimed.

## Manual browser checks before relying on the new screens

1. On desktop and a narrow mobile screen, switch Cash / Pace / Year lows / Cash bridge; change month and bank; resize; inspect dates by tap and date picker. Check axes, wrapping, scroll areas and collapsed sections.
2. Enter a categorized card purchase and a split purchase; cancel first, then record once. Record a partial refund / friend repayment and a single checking-to-card payoff. Confirm account and category totals independently.
3. In two tabs, save in one and attempt a stale save in the other. Refresh while preserving entry fields; discard a dirty budget preview only with the explicit checkbox. Review an expectation already recorded in the other tab.
4. Preview affordability in each mode; save / reload a scenario; compare several cases; apply only payment / budget choices. Confirm hypothetical balances never replace real balances.
5. Exercise cash withdrawal, cash spending and return. Edit savings goals, renewal review dates, custom recurrence and year targets. Save and refresh after checking the preview.
6. Hide debt while reviewing the summary, scenarios, timelines, activity, duplicate prompts and a debt payment entry. Confirm purchases remain usable and debt amounts stay concealed.
7. Use month-end checklist links; attempt an edit to a closed month and verify protection. Export a backup and inspect Storage health. No automatic bank transfers or provider cancellations are performed by this app.
