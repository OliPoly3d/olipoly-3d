# Finance posting after fulfillment closure

OP-000198 was Closed and Paid, with a $48.21 total and no Finance posting.
Orders Admin rejected it because its Finance eligibility rule required only
`ready_for_fulfillment`. Closing fulfillment must not prevent later bookkeeping.

## Changes

- The single-order action, bulk queue, status note, and Ready to Push filter
  share one eligibility check accepting ready-for-fulfillment and closed orders.
- Existing payment, nonzero total, tax county, already-posted, and Finance Not
  Required checks remain. Raw cancellation/void/archive statuses are retained
  before display normalization so they do not become eligible completed sales.
- Show Ready selects All Orders and clears conflicting filters, making eligible
  closed orders visible. Active and Closed views remain available.
- Finance success messages describe posting; fulfillment closure is independent.
  Failed posting restores the button so the operator can retry.

## Database verification

No database migration or business-data repair is needed for this change.
The live `post_order_finance_income` function body was read from Supabase and
matched to `202607210005_authoritative_finance_posting_corrections.sql`. It already
accepts a closed order, checks owner/version/duplicate identity, and preserves
fulfillment status. Existing September 28 pricing triggers supply the revised
sale, shipping, and tax amounts atomically.

The repository's declarative `202608100004_orders_close_and_finance_finalization.sql`
is **not deployed** on this project. It restricts posting to Ready and couples
posting to closure. Do not deploy that older migration unchanged; it would
reintroduce the closed-order blocker. This fix does not deploy pending migrations.

## Validation

24 focused checks passed, including real-markup DOM button and filter tests,
confirmation, concurrent clicks, error recovery, duplicate prevention, existing
fulfillment handoff, shipping, tax metadata, and read-only closed-order behavior.
All seven Orders Admin inline scripts parse, and `git diff --check` passes.

The Postgres regression executes the deployed Finance function and pricing
triggers against synthetic data: remove an item, add shipping, mark paid/closed,
then post. It verifies the $48.21 total, unchanged accepted quote snapshot and
Closed status, owner/stale-version failures, and exactly one income entry after
retries. It also passes using the function definition exported from live Supabase.

Authenticated browser follow-up: refresh Orders Admin, open OP-000198, click Push
to Finance and confirm. Verify the income entry against the invoice, the Finance
Pushed label, and unchanged Closed status in Orders and Production. Alternatively,
Show Ready should include this order before posting. The tests do not create a
real Finance entry for this order.
