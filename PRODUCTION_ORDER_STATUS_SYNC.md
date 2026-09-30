# Production QC status synchronization repair

Deployed to Supabase on September 29, 2026 (September 30 UTC), migration
`20260930013455_fix_production_qc_order_status_sync`. The CLI-created filename
was aligned to the version registered by the deployment tool. OP-000198's
Production, Order and tracker now all report `ready_for_fulfillment`.
Post-repair comparison confirmed that pricing, payments, Finance, Inventory,
Production evidence and the original consumption receipt were unchanged.

## Cause

Modern linked Production jobs normally have `production_source_type = NULL`.
The QC RPC assigned `v_is_standalone := production_source_type = 'legacy_standalone'`,
which yields SQL NULL. Its later `IF NOT v_is_standalone` therefore skipped the
Order, public tracker and workflow event updates, while committing Production
and the consumption receipt. The receipt incorrectly reported lifecycle completion
with Production ready and Order still in QC. The same condition bypassed the
linked Order's QC-state check.

The fix uses `IS NOT DISTINCT FROM 'legacy_standalone'` so the flag is always a
boolean. Only an explicitly approved standalone job skips Order projections.

## Scope

- Replace `public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text)`.
- Keep existing authentication, owner checks, provenance checks, lock order,
  concurrency checks, grants, Inventory behavior and receipt idempotency.
- No table structure, RLS, browser code or pricing changes.
- Existing Production buttons and Orders Admin queries keep using the same RPCs.
- Printing and print completion already update Production, Order and tracker.
  Linked orders close through Orders/Fulfillment after handoff confirmation.

## Existing order repair

`supabase/repairs/20260930_reconcile_op_000198_qc.sql` is a separately applied,
operator-authorized repair for OP-000198 / Q-000016. It verifies the current
Production row against the committed QC consumption receipt, locks the Order
and Production row, then restores the missing Order/tracker status and QC event.
It requires exactly one matching job, receipt and QC tracker row, and aborts if
the evidence changed. A repeat after successful reconciliation is a no-op.

The repair preserves the original receipt, Production evidence, Inventory,
pricing, payment state and Finance records. It does not replay QC or close the
order: the persisted Production state was Ready for Fulfillment, with no saved
close event. The existing $48.21 order total and balance remain unchanged.

## Verification

Run the executable PostgreSQL regression with PGlite 0.3.14:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite node --test tests/production-order-status-sync-postgres.test.js
```

It reproduces the original bug, executes the fixed SQL, and checks:

- NULL and repaired linked jobs, with tracked and excluded Inventory.
- Printing → QC → Ready for Fulfillment → Closed across all three records.
- Needs Reprint, explicit standalone compatibility and idempotent retries.
- Owner, stale-version and Quote provenance rejection.
- Full rollback when the tracker is missing, including Inventory consumption.
- The targeted repair, repeatability, unchanged pricing and immutable evidence.

The existing pricing PostgreSQL regression and five focused Production suites
also pass (15 checks total, no skipped checks). `orders-admin-action-regression.test.js` has its existing failure
about `shipping_or_pickup_note` in ordinary metadata; both that test and the
Orders Admin file are unchanged from main. Syntax and whitespace checks pass.

Security advisor findings are unchanged after deployment. The existing
[authenticated SECURITY DEFINER notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
for this RPC is intentional: its existing owner validation and restricted
grants are preserved; anonymous execution is denied.

Manual signed-in browser check: refresh Orders Admin, open OP-000198 and confirm
Ready for Pickup / Shipment and $48.21. Close it through Orders/Fulfillment only
when the actual handoff is complete, then refresh Production and the tracker.
The authenticated browser flow was not exercised during this repair.
