# OliPoly ERP Module Map

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative mapping of modules, pages, responsibilities, and handoffs

## Module map

| Module / surface | Domain role | May mutate | Must consume / project | Must not do |
|---|---|---|---|---|
| `hub.html` | ERP Console and attention/read model | UI preferences only | Source-domain status, events, balances, shortages | Own or repair business records |
| Customer 360 | Cross-domain customer read model | none | Customer, Quote, Order, Production, Finance, events | Merge customers or edit source facts |
| Intake / `start-project.html` / Tally flow | Customer & Intake | request/customer context through approved intake path | public service options | Estimate, price, reserve, or create accepted Order |
| `production-control.html` | Production authority | estimates, jobs, attempts, manufacturing actions/actuals | Inventory availability/cost; accepted Order linkage | Calculate customer totals or subtract stock directly |
| Product / Recipe Library | Production knowledge | recipes, revisions, activation | private Assets and production usage | Rewrite historical revisions |
| `quote.html` and public Quote | Quote authority / projection | Quote commercial terms and response through approved paths | Production snapshot; totals snapshot | Recreate manufacturing math or post-acceptance workflow |
| `orders-admin.html` | Orders & Fulfillment authority | fulfillment, operational workflow commands, communication requests | accepted Quote snapshot; Production and Finance projections | Edit Quote totals, actuals, stock, or ledger |
| `track.html` | Public read model | approved customer-facing tracking update/request only | allowlisted Order/fulfillment/payment projection | Expose internal costs, notes, assets, or mutate source state |
| `inventory-control.html` | Inventory authority | items/rolls, reservations, movements, adjustments | Production requests/source references | Own production status |
| `finance-pro.html` | Finance authority | invoices, receipts, allocations, payments, refunds, POs, expenses | accepted snapshots and source references | Estimate manufacturing or close production |
| `pay.html` | Public payment entry/projection | initiate/record through approved Finance contract | authoritative balance/terms | Mark paid locally or create duplicate revenue |
| Job Files / Asset UI | Shared Asset service | private uploads, metadata, revision, archive/restore, links | Auth identity and owning-record references | Publish private paths or overwrite revisions |
| Global search | Shared read model | none | stable IDs and allowlisted summaries | Become a record editor |
| Fundraiser Manager (specified/future) | Campaign orchestration/read model | campaign-owned configuration only under approved contract | real Orders, Production, Inventory, Finance, Recipes | Create shadow Orders/statuses/ledger or bypass domain services |

## Department alignment

| Business department | Primary modules | Supporting services |
|---|---|---|
| Customer & Intake | Intake, customer service, Quote | Customer 360, communication, Assets |
| Production | Production Control, Product/Recipe Library | Inventory, Assets, analytics |
| Fulfillment | Orders Admin, tracking | Communication, Finance payment projection |
| Finance | Finance Pro, Pay/Invoice surfaces | Orders/customer identity, analytics |
| Shared Services | Hub, Customer 360, global search, Auth, Events, Assets | Supabase persistence/RLS |

## Authoritative handoffs

| From | To | Contract passed | Result |
|---|---|---|---|
| Intake | Production | customer/request reference and requirements | Manufacturing estimate begins |
| Production | Quote | saved estimate, costs/assumptions, suggested price snapshot, Q identity | Customer offer can be prepared |
| Quote | Orders | accepted Quote identity and immutable totals/terms snapshot | Exactly one `OP-######`, initially `ready_to_print` |
| Orders | Production | accepted Order link and authorized workflow context | Manufacturing proceeds against real Order |
| Production | Inventory | reservation/consume/release/scrap command with job/attempt evidence | Inventory ledger changes |
| Orders | Fulfillment/Communication | ready evidence and customer/fulfillment context | Pickup/shipment and notices |
| Quote/Orders | Finance | accepted obligation, customer, terms, PO/invoice context | Invoice/payment accounting |
| Finance | Orders/read models | payment/refund/invoice events and references | Operational payment projection updates |
| All owners | Events/read models | immutable business events | Hub, Customer 360, tracking, analytics refresh |

## Core workflow map

`Customer request → Production estimate → Quote → Customer acceptance → Order ready to print → Printing → QC/finishing → Ready for fulfillment → Closed`

Parallel supporting flows:

- Inventory: `no reservation → reserve at Ready to Print → actuals/scrap → consume/release at QC Pass`
- Finance: `terms/PO/invoice → deposit/payment allocation → paid in full/refund`
- Communication: `confirmation → progress/tracking update → completion`

These flows coordinate through commands and events but retain separate ownership and lifecycles.

## Customer-type behavior

There is one Quote and Order architecture.

| Retail / Individual | Business / PO |
|---|---|
| Customer contact, payment/receipt, pickup/delivery | Company/contact, PO, invoice, tax exemption, billing/shipping, payment terms |

Conditional fields do not create a separate pricing engine, Quote implementation, Order lifecycle, or Finance ledger.

## Future-module rule

A new module may orchestrate existing domains only by:

1. declaring the new facts it uniquely owns;
2. using existing stable identities and domain commands;
3. projecting, not copying, foreign statuses and balances;
4. defining idempotent handoffs and public allowlists; and
5. updating Blueprint documentation before changing an ownership boundary.

Fundraiser Manager specifically owns campaign configuration, catalog assignment, public campaign presentation, and settlement snapshots once approved. It must use real Orders, Production jobs, Inventory transactions, and Finance evidence and must not maintain shadow equivalents.

## Reference order for implementation

1. [Engineering Architecture](ENGINEERING_ARCHITECTURE.md) — system principles and boundaries
2. [Domain Contracts](DOMAIN_CONTRACTS.md) — allowed commands and invariants
3. [Data Ownership Matrix](DATA_OWNERSHIP_MATRIX.md) — authoritative owner of each fact
4. [Lifecycles](LIFECYCLES.md) — legal statuses and transitions
5. [Business Event Contract](BUSINESS_EVENT_CONTRACT.md) — audit/integration facts
6. [Shared Services](SHARED_SERVICES.md) — cross-cutting technical contracts
7. This map — concrete module placement and handoffs

