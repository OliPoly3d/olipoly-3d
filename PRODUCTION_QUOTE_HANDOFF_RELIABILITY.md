# Production quote handoff reliability

## Audit conclusion

The handoff was first invoked by the document-level delegated click listener for
`[data-push-quote]`; the button is `type="button"`, so form submission was not a
second path. No page-load, autosave, visibility, online, recovery, or interval
handler invoked `pushProductionJobToQuote`.

The repeated network activity came from two unsafe dispatch behaviors:

1. There was no in-flight lock or pending UI. Every click (including clicks made
   while an earlier slow request appeared to do nothing) started another RPC.
   Those overlapping requests could finish or time out much later, making their
   appearance in Network seem periodic.
2. `sbApi` automatically refreshed authentication and repeated every failed
   write after both 401 and 403. Consequently, one lifecycle click could issue a
   second RPC POST after an authoritative 403. The generic reliability fetch
   observer only classified requests and displayed health information; it did
   not retry them.

The old click handler also supplied no immediate feedback and did not await its
promise. Its only UI appeared after the request settled. The recovery record was
saved with `quote_handoff_status: "draft_sent_to_quote"` and a locally advanced
`waiting_customer` status, although nothing read that record as a queue. Workflow
command identity was retained in `localStorage` until success. Neither recovery
record was an actual automatic page-load replay source, but both incorrectly
looked like executable pending state.

## Resulting contract

- One delegated listener is installed once on `document`.
- A per-job in-memory lock disables the initiating button and shows a pending
  label before dispatch.
- The pre-acceptance RPC explicitly opts out of authentication replay, has one
  bounded timeout, and clears its timer and persisted command identity in
  `finally`.
- 400, 401, 403, 504, abort, and network failures never schedule another call.
- An ambiguous timeout reports: “Quote handoff could not be confirmed. Refresh
  the record before retrying.”
- Recovery drafts retain quote data without advancing the local Production
  lifecycle and without pending, queued, retry, or command markers. Existing
  legacy recovery data is sanitized on load; sanitizing never executes it.
- Only a non-empty authoritative RPC response advances the cached lifecycle.

No RLS policy, grant, RPC definition, lifecycle validation, pricing, Finance, or
Inventory behavior was changed.

## Manual browser tests required

1. Clear Console and Network.
2. Open Production Control and wait at least two minutes without interacting.
3. Confirm zero `preacceptance_production` requests.
4. Click **Push to Quote** once and confirm exactly one request and the disabled
   “Pushing to Quote…” state.
5. Simulate a rejection, wait two minutes, and confirm there is no second request.
6. Refresh and confirm the failed command is not replayed.
7. Filter, sort, or otherwise rerender cards; click once and confirm one request.
8. Simulate a 504 and confirm the UI instructs the operator to refresh before
   retrying, with no automatic second request.
9. Confirm the local recovery record remains available and the Production card
   has not advanced without an authoritative success response.
