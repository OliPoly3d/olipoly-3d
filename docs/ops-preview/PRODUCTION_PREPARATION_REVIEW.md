# Approved work and production preparation

A new Production preparation form is available on approved orders before release. It captures body/support filament, grams and print hours per piece, design/preparation hours already spent, and remaining hands-on hours. Original item descriptions, quantities, prices, quote offers and accepted totals remain frozen. The production plan is stored separately in the existing test workspace and production job payload.

Quote builder shows filament/printer cost per piece beside the price inputs. The overall preview includes labor and displays profit and margin after the required manufacturing inputs are present. A price can still be quoted and accepted with incomplete estimates. Production preparation later calculates projected profit against that accepted price. Actual labor totals include preparation time once.

## Database change for approval

Apply only `20261107023919_ops_test_approved_production_preparation.sql` to **OliPoly ERP Test**, project `llscjdyiiatmuqhilube`.

- Replaces `public.ops_preview_commit(text,jsonb,jsonb,bigint,text)` to allow the scoped production-plan command before release. It validates every approved item and preserves the commercial snapshot, payment history, and existing runs. A revision check and command receipt protect concurrent edits and retries.
- Replaces `ops_preview_private.requirements(jsonb)` so release and inspection use the saved production plan. Older orders without a separate plan continue to use their existing item estimates.
- Existing workspace state, job payload and production estimate columns receive values only when the owner saves preparation. No migration-time data conversion is included. No table or permission change is included.
- The migration aborts unless both existing function definitions match the reviewed versions. The hosted test definitions matched the preflight hashes during preparation.

Run the migration before publishing the model and workspace scripts. The supplied migration is unexecuted in hosted ERP Test.

## Verification

Local PostgreSQL rehearsal covers an accepted quote with no manufacturing estimate, subsequent preparation, immutable accepted totals/customer view, invalid price changes, stale revision rejection, command replay, reservation on release, prevention of plan changes after release, and inspection using the prepared materials. Existing quoting, payment/Finance, production and owner-isolation checks run alongside it.

A model check exercises a $15 all-in quote, late material/preparation entry and profit projection. A DOM rehearsal checks adding filament, live cost/margin updates, preparation save, and the frozen agreed price. Actual iPad Safari acceptance remains a hosted walkthrough after approval.

## Risks and recovery

The preview uses the existing sample machine/energy cost of $0.53 per print hour and the entered labor rate. Projected profit assumes the entered material and labor quantities. Actual scrap, failed runs and other entered costs affect the final result.

Preparation is editable before release. After release, run usage and actual-time entry record actual costs. A broader released-plan revision workflow requires separate review.

For recovery, preserve workspace/job snapshots and command receipts. Withdraw the new preparation UI if necessary. Before restoring earlier function definitions, hold releases and reconcile any saved production plans so their material requirements remain available. Keep those saved plans as evidence.
