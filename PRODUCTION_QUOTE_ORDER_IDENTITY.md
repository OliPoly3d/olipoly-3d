# Production → Quote → Order identity contract

## Root cause

The public Quote acceptance transaction created a Quote-derived Order and then
searched Production by `user_id + quote_number`. Its update accepted waiting
aliases but not the live job's `estimate` state, did not require a Production
row to be updated, and did not update `job_payload.order_number` or
`job_payload.order_id`. The transaction could therefore commit OP-000189 while
job 72a14a94-b126-4dc5-b31f-32ec7cd6eb59 remained an unlinked estimate. The
Production browser then compounded the defect by inferring a lane and OP number
from the Order status and numeric suffix rather than displaying the Production
row's lifecycle.

## Canonical provenance

| Aggregate / field | Meaning and authority | Assignment / immutability | Propagation and validation |
|---|---|---|---|
| `production_jobs.id` | Production aggregate UUID; Production authority | At estimate insert; immutable | Stored as `quotes.production_job_id` for Production-origin Quotes |
| `production_jobs.user_id` | Production owner | At insert; owner-scoped | Must equal Quote and Order owners |
| `production_jobs.quote_number` | Stable allocated Quote identity | Existing `next_document_counter('quote')` policy; immutable after linked Quote save | Must equal payload Quote and `orders.source_quote_number` |
| `production_jobs.order_number` | Linked Order display identity | In atomic Order insertion or controlled repair | Must equal payload Order and canonical `orders.order_number` |
| `production_jobs.job_payload` identity keys | Denormalized hydration evidence only | Server merges `quote_number`, `quote_id`, `order_number`, `order_id` without replacing unrelated keys | Must exactly mirror canonical rows; never used to invent a relationship |
| `production_jobs.production_status` | Manufacturing lifecycle authority | Workflow commands; acceptance transaction may advance an eligible pre-production job only to `ready_to_print` | UI never projects an Order status over it |
| `quotes.id` | Quote row UUID | At atomic save; immutable | Stored in Production payload/audit |
| `quotes.quote_number` | Quote business number | Existing Quote counter; stable across edits/reloads | Unique; equals Production Quote identity |
| `quotes.production_job_id` | Nullable canonical Production provenance | Atomic Production Quote save; immutable once set | Unique partial FK; null for ordinary Quotes |
| `quotes.user_id` | Quote owner | Atomic save | Must equal source Production owner and Order owner |
| `orders.id` | Order aggregate UUID | Atomic acceptance transaction | Stored in `job_payload.order_id` |
| `orders.order_number` | Order business number | Existing `allocate_order_number()` authority; immutable | Does **not** derive from or need the Quote suffix |
| `orders.source_quote_number` | Canonical Quote provenance | Atomic acceptance transaction | Unique nonblank source; equals Production Quote number |
| `orders.created_from_quote` / `source_type` | Document origin | Acceptance sets `true` / `quote` | Both required for Production backfill or repair |
| `orders.status` | Fulfillment lifecycle | Order/workflow authority | Acceptance starts at `ready_to_print`; must align with Production before Start Print |
| `production_linkage_audit.command_identity` | Durable idempotency/audit identity | One per Quote link, Order link, or repair | Unique; owner-readable and browser non-writable |

Quote and Order numbers are correlated exclusively through canonical UUIDs and
`source_quote_number`; numeric suffix similarity has no authority.

## Transaction and lifecycle decision

Production-origin Quote save is a single server transaction which upserts the
Quote, sets immutable Production provenance, synchronizes the Quote identity,
and advances `estimate` to `waiting_customer`. An `AFTER INSERT` Order trigger
runs inside the existing Quote acceptance transaction. It validates owners,
provenance, identity mirrors, eligible pre-print lifecycle, conflicts, and lack
of actual-use evidence; then writes the Order UUID/number and advances only to
`ready_to_print`. Any failure aborts the Order insertion and rolls back the full
acceptance transaction. Ordinary Quotes have null Production provenance and
remain unchanged.

The controlled repair applies the same evidence rules, creates no actuals or
Inventory transactions, changes no financial or document-number values, and is
idempotently audited. The migration contains a still narrower guarded repair
for Q-000013 / OP-000189 and aborts deployment if any proven predicate changed.

## Manual browser acceptance required

1. Deploy the migration and frontend, then query
   `production_linkage_candidates` as the affected owner.
2. Run `supabase/verification/production_quote_order_identity.sql`; confirm the
   exact expected Q-000013 / OP-000189 UUIDs and both booleans are true.
3. Hard-refresh Production Control. Confirm the card displays Q-000013,
   OP-000189, and authoritative `ready_to_print`.
4. Click **Start Print** once. Confirm one workflow RPC succeeds, Production and
   its linked Order transition under workflow authority, and refresh preserves
   the states.
5. Create an estimate and open/save its Quote twice. Confirm one stable Q number,
   one Quote row, and `waiting_customer` in Production.
6. Accept it twice. Confirm one allocated OP number, one Order, exact source
   Quote provenance, Production payload UUID/number backfill, and authoritative
   `ready_to_print`.
7. Repeat with an ordinary Quote and confirm conversion does not require a
   Production job.
8. For an intentionally incomplete legacy fixture, confirm the warning “Order
   created, Production linkage incomplete.” appears and Start Print is absent.

## Start Print single-dispatch repair

The final page previously retained two overlapping delegated routes in the same
document click listener: a legacy `[data-start-print]` branch and the generic
`[data-status]` branch. A button composed with both markers invoked `setStatus`
twice synchronously. The generic Supabase wrapper could also replay a POST after
a 401. These are the duplicate-capable routes proven by the repository audit;
the supplied activity capture does not expose enough client metadata to prove
which route crossed the older deployed in-flight guard. Both mutation routes
have now been removed: linked lifecycle controls
now carry only `data-production-workflow-job`, and one globally guarded
dispatcher owns click/submit activation. Non-GET auth responses never replay.

The final call graph is:

`button click or canonical submit → ProductionWorkflowDispatcher.handle →
setStatus(job, status, action identity) → syncProductionStatusToOrder →
productionWorkflowRpcRequest(same identity) → sbApi(retryAuth:false) → one fetch
→ production_workflow_command → atomic Production + Order + tracking + event`.

The dispatcher locks the job/command before generating one operator action ID,
one correlation ID, and one causation ID. It logs the event/target, installation
identity, job and Order, command, dispatcher, stack, timestamp, and fetch ordinal.
It is guarded by a global Symbol, suppresses click-plus-submit and rapid double
activation, and releases pending/button state in `finally`. Recovery storage is
read only during dispatch and is never an automatic replay source.

The supplied `pg_stat_activity` rows do not include RPC parameter values, so the
historical requests' correlation IDs and commit outcome cannot be truthfully
reconstructed from that capture alone. Run
`supabase/verification/start_print_duplicate_outcome.sql` before another click;
it reports authoritative Production/Order state and all Start Print event
receipts/correlations. After deployment, the new console trace makes a future
pair distinguishable as same-identity or independently-generated dispatches.
