# Production estimate → editable Quote restoration

## Workflow boundary

Previously, **Push to Quote** wrote the browser draft, awaited
`preacceptance_production_command`, updated the local Production cache, and only
then assigned `window.location.href`. A hung RPC therefore blocked legacy and
new estimates equally; the shared control flow, rather than either row format,
was the defect.

The restored flow resolves the rendered job, refreshes its owner-scoped cloud
row when possible, falls back to local recovery only when necessary, validates
that it is an unaccepted `estimate` or `waiting_customer`, writes the draft and
intent, and immediately opens the linked `quote.html` URL. It issues no
lifecycle RPC before navigation.

After `public.quotes` returns a durable row, Quote reconciles the owner-visible
Production row and, when it is still an estimate, issues one controlled
`mark_waiting_customer` RPC with the current `updated_at`, Quote number, durable
Quote ID/snapshot, and a fresh correlation ID. Only the authoritative response
updates the browser Production cache.

## Browser records

`olipoly_production_to_quote_draft_v1` remains the complete editable prefill.
It includes Production/job identity, source `updated_at`, Q/INV inputs,
customer/project/quantity, suggested selling price, Production-owned cost
snapshot, notes, and turnaround.

`olipoly_production_quote_intent_v2` is recovery metadata only:

```json
{
  "version": 2,
  "created_at": "ISO timestamp",
  "production_job_id": "string",
  "quote_number": "Q-number",
  "source_updated_at": "ISO timestamp",
  "source": "production-control",
  "intended_transition": "waiting_customer",
  "status": "draft_opened | quote_saved_handoff_unconfirmed | handoff_confirmed",
  "quote_saved_at": null,
  "handoff_confirmed_at": null,
  "durable_quote_id": null,
  "recovery_warning": null
}
```

No page-load, online, visibility, unload, beacon, or background handler executes
this record. Existing legacy recovery markers continue to be neutralized.

## Failure and reconciliation

If Quote save fails, no Production command runs. If Quote save succeeds but the
Production command fails, the Quote remains durable, the intent becomes
`quote_saved_handoff_unconfirmed`, and Quote displays a nonblocking warning with
**Retry Production Status Link**. That operator action reads current authority
once and either recognizes `waiting_customer` as success or sends exactly one
fresh controlled command. It never rolls back or duplicates the Quote.

## Manual browser acceptance

1. Sign in, create a brand-new Production estimate, save it, and confirm its Q-number.
2. Click **Push to Quote** and confirm `quote.html` opens promptly without a 30-second wait.
3. Confirm Q/INV, customer name/email, project, quantity, suggested piece/total price, material, machine, design, post-processing, notes, turnaround, and Production linkage are prefilled and editable.
4. In another Production Control tab, confirm the job remains `estimate` before Quote save.
5. Save the Quote; confirm one durable `public.quotes` row and one subsequent `preacceptance_production_command` request.
6. Confirm the authoritative Production row and refreshed Production Control show `waiting_customer`.
7. Repeat steps 2–6 with the legacy **Survivor Tree Puzzles** estimate.
8. Simulate an RPC failure after a successful Quote save. Confirm the Quote remains saved, the reconciliation warning appears, and no automatic/background retry occurs.
9. Click **Retry Production Status Link** once; confirm one authority read and at most one controlled RPC, then confirm success (including an already-confirmed row).
10. Refresh Quote and confirm the draft reloads without sending a lifecycle command.
11. Save and re-save the same Quote number; confirm Supabase upserts rather than creating a duplicate.
12. Save a standalone Quote and confirm it never calls the Production RPC.

No schema migration is required. Existing `quote_data.production_estimate` and
the controlled pre-acceptance RPC carry the durable linkage. RLS, ownership,
receipts, optimistic concurrency, actual-evidence rejection, pricing, Finance,
Inventory, numbering, and public URLs are unchanged.
