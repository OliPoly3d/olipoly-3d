# OliPoly ERP Engineering Architecture

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative design reference  
> **Scope:** Architecture and boundaries; this document does not itself authorize implementation or schema changes.

## Purpose

OliPoly ERP is one cohesive business system built from bounded modules that share durable Supabase services. Each business fact has exactly one owner. Other modules consume snapshots, events, or read models; they do not reproduce the owner's calculations or mutate its state indirectly.

If code, UI copy, historical documentation, or a proposed feature conflicts with Blueprint v1.0, these architecture documents control until an explicitly approved Blueprint revision replaces them.

## Architectural principles

1. **One owner per fact.** Manufacturing belongs to Production, selling terms to Quote, post-acceptance coordination to Orders, stock to Inventory, and money to Finance.
2. **One workflow, not page-specific workflows.** Status transitions are domain commands persisted in Supabase and projected consistently to every UI.
3. **Events describe completed business facts.** They are append-only audit evidence, not alternate status storage.
4. **Snapshots protect historical truth.** Accepted customer totals, production assumptions, recipe revisions, and financial documents retain the values applicable when created.
5. **Stable identity crosses modules.** UUIDs are database identities; `Q-######` and `OP-######` are durable human references. An accepted Quote and its Order retain the same six-digit suffix.
6. **Supabase is durable authority.** Browser state may hold drafts, recovery copies, cache, and preferences only. It never silently overwrites authoritative records.
7. **Public surfaces are least-privilege projections.** They expose only fields required for quote response, tracking, payment, or approved ordering.
8. **Idempotency at external boundaries.** Public acceptance, payment posting, recovery import, and future direct-order entry must tolerate retry without duplication.
9. **No automatic schema mutation.** Schema work requires reviewed migrations, ordered deployment, verification, and explicit application.
10. **Prefer removal over compatibility layers.** New work must converge on these contracts rather than preserve duplicate authorities.

## Bounded domains

| Domain | Owns | Does not own |
|---|---|---|
| Customer & Intake | customer/request capture and service context | manufacturing estimates, authoritative prices, production, money |
| Production | estimates, internal costs, recipes, jobs, manufacturing workflow and actuals | customer totals, fulfillment, accounting balances |
| Quote | customer-facing offer, pricing adjustments, tax/exemption, deposits, terms, acceptance response | manufacturing calculations, post-acceptance Order status |
| Orders & Fulfillment | accepted work coordination, fulfillment, customer communication, payment-status projection | Quote revision, print actuals, stock ledger, Finance ledger |
| Inventory | items/rolls/materials, availability, reservations, consumption, returns, scrap, adjustments | production workflow or profitability |
| Finance | invoices, receipts, payments, refunds, expenses, tax reporting, accounting profitability | manufacturing estimate or operational status |
| Shared Services | identity/auth, durable persistence, IDs, events, assets, read models, analytics infrastructure | ownership of source-domain business facts |

## System-of-record model

Supabase Postgres, Auth, RPCs, RLS, and private Storage form the durable system of record. Static browser applications are clients of that system. Durable writes must be remotely acknowledged and verifiable after reload.

Browser storage is restricted to:

- unfinished drafts;
- explicit failed-save recovery copies;
- display preferences; and
- replaceable read caches.

Recovery is review-and-import, never background synchronization. Conflict resolution uses stable IDs and `updated_at`: a newer valid remote row wins equal, missing, invalid, or stale local timestamps; a newer local copy remains recovery evidence until explicitly imported.

## Cross-domain flow

1. Intake identifies the customer request.
2. Production creates the manufacturing estimate and suggested price.
3. Quote consumes the Production snapshot and creates the customer offer using `calculateQuoteTotals()`.
4. Quote acceptance runs through the authoritative idempotent acceptance contract and creates exactly one Order.
5. The Order begins `ready_to_print`; it never awaits customer acceptance.
6. Orders and Production share the canonical post-acceptance workflow while Production owns manufacturing actions.
7. Production requests Inventory reservations and reports actual usage/scrap; Inventory alone changes stock.
8. Orders owns fulfillment and customer completion communication.
9. Finance records invoices, payments, refunds, expenses, and accounting results; other modules show projections or links.
10. Events and read models provide timeline, Hub, tracking, and Customer 360 views without becoming new authorities.

## Pricing architecture

There is one Quote system for Retail and Business/PO customers. Customer type changes required fields and terms, not the pricing engine.

`calculateQuoteTotals()` is the sole authoritative customer-total calculation. Quote page, PDF, email, saved Quote, public Quote, accepted Order, and Finance handoff consume its stored totals snapshot. They must not independently recalculate totals. Production may suggest a selling price and piece price but does not determine the final customer obligation.

## Consistency and transactions

- Acceptance must atomically record the response, allocate/validate the `OP-######` identity, create the Order, preserve the accepted snapshot, and emit required events—or perform none of them.
- State-changing commands validate current state and ownership server-side. UI button availability is not authorization.
- Inventory movements and Finance postings are ledger-style records with traceable source references.
- Repeated commands with the same idempotency key return the existing result.
- Cross-module read models may be eventually refreshed, but the owning record is decisive when views disagree.

## Security and privacy

- Authenticated data is owner-scoped through RLS.
- Public quote, tracking, payment, and future fundraiser endpoints use allowlisted response shapes.
- The `job-assets` bucket remains private; signed URLs are short-lived and never exposed in public records.
- Service-role credentials never appear in browser code.
- Customer data, personalization, private notes, costs, margins, asset paths, and accounting references are excluded from public projections unless explicitly required and approved.

## Change governance

Any implementation that changes an owner, lifecycle, event meaning, identifier, snapshot rule, or cross-domain handoff requires an approved Blueprint version change and corresponding updates to all seven architecture documents. Normal implementation must cite the applicable contract and demonstrate that no second authority was introduced.

Schema changes follow `AGENTS.md`: explain the need, provide a migration, enumerate affected tables/RPCs/queries, update code and tests, and stop without assuming application.

## Related authoritative references

- [Business Event Contract](BUSINESS_EVENT_CONTRACT.md)
- [Domain Contracts](DOMAIN_CONTRACTS.md)
- [Data Ownership Matrix](DATA_OWNERSHIP_MATRIX.md)
- [Shared Services](SHARED_SERVICES.md)
- [Lifecycles](LIFECYCLES.md)
- [ERP Module Map](ERP_MODULE_MAP.md)

