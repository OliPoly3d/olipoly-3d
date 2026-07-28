# Production quote handoff reliability

## Audit conclusion

The handoff was first invoked by the document-level delegated click listener for
`[data-push-quote]`; the button is `type="button"`, so form submission was not a
second path. No page-load, autosave, visibility, online, recovery, or interval
handler invoked `pushProductionJobToQuote`.

The repository audit found two unsafe dispatch behaviors in the earlier path:

1. There was no in-flight lock or pending UI. Every click (including clicks made
   while an earlier slow request appeared to do nothing) started another RPC.
   Those overlapping requests could finish or time out much later, making their
   appearance in Network seem periodic.
2. `sbApi` automatically refreshed authentication and repeated every failed
   write after both 401 and 403. Consequently, one lifecycle click could issue a
   second RPC POST after an authoritative 403. The generic reliability fetch
   observer only classified requests and displayed health information; it did
   not retry them.

The final composed source contains one module reference and one installation
call. It contains no second quote dispatcher, submit route, recovery replay,
visibility/online route, MutationObserver route, service worker, or fetch clone.
Therefore eight requests beginning within milliseconds cannot be produced by
the current authoritative composition. They prove that the live client was not
running that composition (or that another open client was also dispatching).
The unversioned helper URL and lack of immediate-propagation suppression made a
mixed/stale deployment harder to rule out. The repaired asset is versioned, its
module/controller state is stored under a global Symbol, and the handler stops
immediate propagation. A hard refresh with all old Production tabs closed is a
required deployment step.

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
  bounded timeout, and clears its timer in `finally`. The quote handoff never
  persists its command identity.
- 400, 401, 403, 504, abort, and network failures never schedule another call.
- An ambiguous timeout reports: “Quote handoff could not be confirmed. Refresh
  the record before retrying.”
- Recovery drafts retain quote data without advancing the local Production
  lifecycle and without pending, queued, retry, or command markers. Existing
  legacy recovery data is sanitized on load; sanitizing never executes it.
- Only a non-empty authoritative RPC response advances the cached lifecycle.
- The browser creates one cryptographically random correlation ID only after it
  acquires the job lock. Lower layers pass that ID through unchanged. An
  ambiguous outcome blocks another attempt in that page until an authoritative
  refresh; a refreshed page creates a new ID only for a new explicit click.
- The RPC uses `pg_try_advisory_xact_lock` with the correlation ID. A future
  duplicate fails immediately with a refresh-required error instead of joining
  an advisory-lock queue. Receipt lookup, the job row lock, evidence validation,
  optimistic concurrency, and grants remain unchanged.

No RLS policy, grant, lifecycle validation, pricing, Finance, or Inventory
behavior was changed. The one RPC definition change only replaces a waiting
transaction advisory lock with its transaction-scoped non-waiting equivalent.

## Final call graph

`button.quote-action[data-push-quote]` → the single `document` listener →
`pushProductionJobToQuote` → `patchProductionJobHandoff` →
`syncPreAcceptanceProductionStatus` → `sbApi` → the reliability observer's
single native `fetch` call → one `preacceptance_production_command` transaction.

The button is `type="button"`; the job form submit listener only saves the job
form and is not in this graph. Card render, sorting, filtering, page load,
recovery sanitation, visibility, online state, and timers do not install or
invoke this graph.

## Clearing an existing advisory-lock queue

Run these statements manually with database operator privileges. They match
only client backends whose current query invokes the affected RPC.

```sql
-- Inspect affected sessions and their granted/waiting advisory locks.
select a.pid, a.state, a.query_start, a.wait_event_type, a.wait_event,
       l.locktype, l.granted, l.classid, l.objid, l.objsubid
from pg_stat_activity a
left join pg_locks l on l.pid = a.pid and l.locktype = 'advisory'
where a.backend_type = 'client backend'
  and a.query ilike '%preacceptance_production_command%'
  and a.pid <> pg_backend_pid()
order by a.query_start, l.granted desc;

-- Cancel only those affected PostgREST command sessions.
select pg_cancel_backend(a.pid)
from pg_stat_activity a
where a.backend_type = 'client backend'
  and a.query ilike '%preacceptance_production_command%'
  and a.pid <> pg_backend_pid();

-- Verify that no affected session or advisory lock remains.
select a.pid, a.state, a.wait_event_type, a.wait_event, l.granted
from pg_stat_activity a
left join pg_locks l on l.pid = a.pid and l.locktype = 'advisory'
where a.backend_type = 'client backend'
  and a.query ilike '%preacceptance_production_command%'
  and a.pid <> pg_backend_pid();
```

## Migration application

`202607280006_bound_preacceptance_advisory_lock.sql` must be reviewed and
applied separately; the application does not assume it is deployed. It replaces
only the six-argument `public.preacceptance_production_command` definition.
Affected tables remain `production_jobs` (authoritative row update) and
`workflow_command_receipts` (idempotency receipt); neither table's schema,
policy, or grants change. The affected browser query remains the single
`POST /rest/v1/rpc/preacceptance_production_command` call. No other RPC or query
is changed.

## Manual browser tests required

1. Close every Production Control tab.
2. Cancel only stuck pre-acceptance PostgREST backends with the SQL above.
3. Confirm no affected advisory lock remains.
4. Deploy this branch.
5. Hard-refresh with cache bypass.
6. Open Production Control.
7. Clear Network and Console.
8. Wait two full minutes without interaction.
9. Confirm zero `preacceptance_production_command` requests.
10. Click **Push to Quote** once.
11. Confirm immediate disabled/`aria-busy` “Sending to Quote…” feedback.
12. Confirm exactly one Network RPC request.
13. Confirm the request contains exactly one correlation ID.
14. Confirm the RPC returns promptly.
15. Confirm only authoritative success updates Production.
16. Simulate failure and confirm recovery remains without lifecycle advancement.
17. Wait two minutes and confirm no later request.
18. Refresh and confirm no replay.
19. Filter/sort to rerender cards and repeat one-click/one-request verification.
20. Simultaneous Production Control tabs are not an intentional workflow; keep
    other tabs closed. If that workflow is introduced later, add explicit
    cross-tab coordination before enabling it.
