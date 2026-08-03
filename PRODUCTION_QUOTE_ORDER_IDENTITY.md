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
