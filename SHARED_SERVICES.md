# OliPoly ERP Shared Services

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative shared-capability contract

## Boundary

Shared Services provides technical capabilities used by multiple domains. It must preserve, not blur, domain ownership. A shared service may validate, persist, secure, identify, publish, or project a business change; it may not invent the business rule that authorizes that change.

## Identity and authentication

Supabase Auth supplies authenticated identity and sessions. RLS scopes durable owner data. Session tokens are credentials, not business records, and must not be logged, exported, embedded in documents, or treated as backup.

Requirements:

- protected modules require an authenticated session;
- owner-scoped records use `owner_id = auth.uid()` or an approved equivalent;
- public endpoints use narrowly scoped RPCs/views rather than broad anonymous table access;
- authorization is enforced server-side on every mutation; and
- second-owner and anonymous denial tests are release gates for private data.

## Identity and number allocation

Database UUIDs are canonical relational identities. Human references are stable, server-allocated, and unique:

- Quotes: `Q-######`
- Orders: `OP-######`
- accepted Quote and resulting Order share the numeric suffix.

Clients never guess, increment, or repair these identifiers locally. Allocation and creation occur transactionally. Retrying an idempotent command returns the existing identity.

## Persistence and RPC contracts

Supabase is the durable authority. Shared persistence helpers standardize authenticated loading, inserts, updates, stale-write detection, explicit recovery import, and error reporting. They do not allow generic cross-domain writes that bypass domain commands.

Critical multi-record operations use reviewed RPCs/transactions, including public Quote response. Success means the server committed the complete invariant and returned the authoritative row/identity. A client timeout is “unknown outcome” and requires lookup/retry with the same idempotency key, not a fresh operation.

## Business event service

The event service persists the vocabulary in [BUSINESS_EVENT_CONTRACT.md](BUSINESS_EVENT_CONTRACT.md). Events carry correlation, causation, actor, aggregate, server time, and schema version. Required audit events commit with the business transaction. Consumers deduplicate and cannot treat the event store as current-state authority.

## Asset service

Job files use private Supabase Storage plus owner-scoped metadata and links.

The Asset service owns:

- private object paths;
- file name/type/size/hash metadata;
- SHA-256 duplicate detection;
- revision groups and immutable historical revisions;
- links to Recipe, Production, Order, and Customer 360 contexts;
- archive/restore state; and
- short-lived signed download URLs.

Public pages never receive bucket paths or signed URLs. Archive hides an Asset from active use without destroying historical links. Replacement creates a revision rather than overwriting evidence.

## Read models and navigation

Hub, global search, Customer 360, public tracking, and attention cards are projections over authoritative records and `project_events`.

They may:

- search and summarize;
- aggregate attention states;
- show cross-domain timelines;
- provide deep links; and
- present allowlisted public status/payment/fulfillment information.

They may not directly correct source records. When a projection disagrees with an owning page, reload the source and repair the projection pipeline rather than editing the projection.

## Communication service

Communication composes and sends confirmations, completion notices, and tracking updates using owner-approved templates and allowlisted data. It records success only after actual delivery submission succeeds. Opening a mail client or draft is not delivery evidence. Customer communication state remains linked to the Order/customer context.

## Analytics and reporting

Analytics reads stable IDs, immutable snapshots, events, and ledgers. Operational dashboards can be refreshed or rebuilt. Accounting metrics come from Finance; manufacturing efficiency and estimated margin inputs come from Production; stock metrics come from Inventory.

Reports must state their cutoff/timezone, filters, and source. Aggregation never mutates source records or silently reconciles discrepancies.

## Browser state and recovery

Allowed browser state is explicitly classified:

| Class | Purpose | Authority |
|---|---|---|
| Draft | unfinished input | none until saved remotely |
| Recovery copy | preserve failed/uncertain save | none; explicit review/import only |
| Preference | theme/filter/favorite | local UI only |
| Cache | faster read | replaceable; remote wins |

No background process uploads recovery data. Explicit recovery compares stable ID and `updated_at`, warns on conflicts, and uses duplicate-safe owner commands.

## Shared-service quality gates

- authentication and RLS owner isolation;
- anonymous public allowlist tests;
- idempotent retry and concurrency tests;
- multi-device remote-authority tests;
- event deduplication/version compatibility;
- private Asset denial and signed-URL expiry;
- read-model reconciliation with source modules; and
- no client-side service-role key, ID fabrication, or silent local sync.

