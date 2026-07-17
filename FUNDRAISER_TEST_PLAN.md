# Fundraiser Manager Test Plan

## Test strategy

Use pure calculation/validation tests, repository contract tests, and an ephemeral/staging Supabase integration suite. Never run destructive tests against production. Each scenario records UUIDs, OP numbers, actors, timestamps, request IDs, and before/after authoritative counts.

## Automated tests

### Unit and contract

- Niles example: 8 standard + 2 personalized produces gross `$110`, personalization `$10`, payout `$65`, organizer proceeds `$45` using fixed-point arithmetic.
- Boundary quantities: all standard, all personalized, zero/negative rejection, max quantity/text, Unicode text, rounding policy.
- Item snapshot remains unchanged after catalog term/recipe deactivation.
- Status transition/guard matrix and ordering timezone boundaries, including daylight-saving transition.
- Programmed/Printed/Completed projections for none/partial/complete/reprint/canceled work.
- CSV quoting, newline/Unicode, formula-injection mitigation, stable columns, and no disallowed fields.
- Repository checks prove no migration/UI/stable workflow file changed during this specification phase.

### Supabase integration

- Anonymous can read only open/scheduled-as-allowed sanitized catalog fields and cannot enumerate private tables.
- Owner A can manage only A; Owner B cannot read/link/mutate A through direct queries, nested FKs, RPC arguments, reports, or Assets.
- Submission transaction creates exactly one authoritative Order, attribution, valid lines, and personalization rows; induced mid-transaction failure leaves none.
- Same idempotency key sequentially and concurrently returns one Order. Different keys create distinct Orders. Reuse against another fundraiser is scoped safely.
- Server rejects client-tampered prices/payouts, inactive item, closed window, invalid personalization, mismatched owner, and fabricated Order/Recipe IDs.
- Settlement inclusion uniqueness and concurrent approval/post are safe; posted snapshot is immutable.
- Finance allocation cannot be linked across owners/fundraisers and reconciles only posted eligible entries.

### Regression

Run the complete ERP 1.0 suite. Specifically verify Quote acceptance remains single/idempotent, Order status synchronization remains canonical, Production transitions/reprint remain unchanged, Inventory reservation/consumption stays exactly once, Finance records remain authoritative, Recipe behavior remains customer-free, and private Assets remain private.

### Performance

Seed multiple simultaneous fundraisers with overlapping recipes and at least the forecast high-water order/line/personalization volume. Assert fundraiser-scoped pagination, production/finance rollups, CSV snapshot generation, and public submission meet agreed budgets; review query plans for sequential scans/cross-fundraiser mixing.

## Required scenario matrix

| Area | Scenarios | Assertions |
|---|---|---|
| Simultaneous fundraisers | Same recipe/item code/customer across A and B | Separate IDs, terms, Orders, aggregates, settlements and RLS |
| Personalized products | Allowed/disallowed, one text per unit, Unicode, duplicate names, invalid length | Exact counts; no truncation/XSS; correct surcharge/payout |
| Production aggregation | By design/recipe/item/customer; partial; reprint | Sum equals included lines; milestone maps canonical evidence |
| Organizer reconciliation | Cash/online selection, unconfirmed/confirmed/disputed, partial remittance | Confirmation distinct from Finance; variance visible |
| Duplicate prevention | Double click, timeout retry, two devices, concurrent RPC | One Order per submission key and no orphan child rows |
| Finance | Niles terms, refunds/fees/tax policy, partial/overpayment, settlement cutoff | Fixed-point totals; source-to-report-to-settlement equality |
| Inventory | Estimate/open/ready/printing/QC/cancel/reprint | No fundraiser mutation; established reserve/consume/release behavior exactly once |
| Multi-device | stale owner edit, concurrent confirmation, public retry after lost response | Supabase wins; conflict shown; no local overwrite/duplicate |

## Manual staging plan

1. Create two owners and two concurrent fundraisers with overlapping Recipes but different terms/windows.
2. Inspect public pages logged out; verify source/network responses omit contact, personalization, Finance IDs, notes, and private asset paths.
3. Submit standard and personalized orders from phone and desktop; double-click and simulate a dropped response. Confirm one OP identity for each submission key in Orders Admin.
4. Confirm Customer 360 shows the authoritative Order; verify no fundraiser customer table exists.
5. Close ordering, compare raw line count/quantity with every production grouping and exported CSV.
6. Link/request Production work. Walk Ready to Print → Printing → QC → Ready for Fulfillment, including cancellation and Needs Reprint. Inspect Inventory ledger/reservations after every step.
7. Confirm cash/online selections, post partial/full evidence through Finance Pro, and verify outstanding/variance without a shadow ledger.
8. Generate, approve, and post settlement; reload on a second device and verify immutable totals and Finance reference.
9. Attempt Owner B access to every copied A URL/UUID and anonymous direct REST/RPC calls.
10. Close out; verify closing did not independently rewrite Orders, jobs, Inventory, or Finance.

## Data integrity reconciliations

- Every fundraiser Order link has exactly one existing Order; no Order is attributed twice.
- Personalized row count equals line personalized quantity.
- Included production units equal included financial units at the same cutoff.
- Sum of per-Order settlement lines equals every settlement header amount.
- Finance-posted allocation plus outstanding equals approved payout after explicit adjustments.
- No live Inventory reservation remains at qualified closeout.

## Exit criteria

All automated tests pass; full ERP regression passes; threat-model/RLS tests pass; no unexplained reconciliation difference or duplicate exists; query plans meet budgets; manual browser/mobile/multi-device evidence is recorded; migration verification and rollback are rehearsed. Production enablement requires owner sign-off.

## Specification-phase checks

For this PR: Markdown structure/link review, prohibited-artifact check (no SQL/UI/source changes), terminology/status consistency review, calculation spot-check, `git diff --check`, and documented manual tests only. Browser behavior is not claimed because no runnable UI is implemented.
