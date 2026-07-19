# OliPoly ERP Domain Contracts

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative commands, outputs, and invariants by domain

## Customer & Intake

**Purpose:** Capture who is asking, what they need, and service context before manufacturing and pricing decisions.

**Owns:** customer/contact identity, request/intake content, customer service notes, and links to resulting work.

**Commands:** create/update request; associate customer; submit request to Production; record customer-service context.

**Outputs:** stable request/customer references and sanitized context for Production and Quote.

**Invariants:** Intake cannot promise a price, create production actuals, reserve stock, post money, or fabricate an Order. A request may precede a Quote; it is not itself a Quote.

## Production

**Purpose:** Decide how work will be manufactured and operate it through printing and QC/finishing.

**Owns:** estimates; grams/hours; material, machine, labor, design, post-processing, packaging, shipping, and hardware assumptions; direct cost; overhead; break-even; suggested selling/piece price; recipes/revisions; job/attempt data; printer assignment; actual usage; scrap; production actions.

**Commands:** create/revise estimate; assign recipe/printer; push estimate to Quote; start print; complete print with actuals; pass QC; mark needs reprint; request inventory reservation/consumption/release.

**Outputs:** immutable estimate snapshot for Quote, manufacturing status/evidence, actuals, and Inventory requests.

**Invariants:** Quote never recreates Production calculations. Estimate reserves nothing. Start Print requires `ready_to_print`. Complete Print records actuals and moves to `qc`, not `closed`. Needs Reprint preserves attempt history and returns to `ready_to_print`.

## Quote

**Purpose:** Turn a Production estimate into the customer-facing commercial offer.

**Owns:** customer type, quantity offered, final selling-price override, discount, tax/exemption, deposit requirement, balance, notes, assumptions, turnaround, payment terms, delivery presentation, quote response, and immutable totals snapshot.

**Commands:** create from Production snapshot; revise draft/change request; calculate totals; send; accept; request change; cancel.

**Outputs:** public Quote projection, documents/email content, accepted customer-total snapshot, and acceptance command to Orders.

**Invariants:** One Quote system serves Retail and Business/PO. `calculateQuoteTotals()` is the only customer-total engine. A manual selling-price override is exclusive and explicit; an intentional zero-dollar complimentary Quote is valid. Acceptance is idempotent and creates exactly one Order. Change request and cancellation create no Order.

## Orders & Fulfillment

**Purpose:** Coordinate the customer commitment after acceptance through fulfillment and closeout.

**Owns:** Order identity; accepted snapshot reference; canonical post-acceptance status; Production linkage; pickup/shipping fulfillment; customer communication state; operational payment-status projection; closure.

**Commands:** create from accepted Quote; synchronize authorized workflow transition; record fulfillment details; mark fulfilled/close; request/send customer communication; display payment evidence.

**Outputs:** `OP-######`, fulfillment instructions, tracking projection, communication requests/events, and read links to Production and Finance.

**Invariants:** An Order begins only after Quote acceptance and initially equals `ready_to_print`. It never needs separate acceptance and never becomes `waiting_customer`. Orders does not edit Quote totals, Production actuals, Inventory balances, or Finance entries. `closed` means fulfillment/operational closeout, not merely print completion or payment.

## Inventory

**Purpose:** Preserve truthful quantities and valuation of rolls, filament, hardware, packaging, and other materials.

**Owns:** inventory items/lots/rolls, mounted-roll preference, availability, cost per gram/unit, reorder threshold, reservations, consumption, returns, scrap, and adjustments.

**Commands:** reserve; consume actual quantity; release unused reservation; return to stock; record scrap; adjust with reason; manage item/roll metadata.

**Outputs:** availability, reservation status, immutable ledger movements, shortage/reorder projections, and cost data for authorized consumers.

**Invariants:** Only Inventory changes stock. Production requests movements and supplies evidence. No reservation occurs at estimate/waiting-customer. Reservations cannot silently exceed availability; consumption/scrap is traceable to work; cancellation releases live reservation; reprint does not erase prior consumption.

## Finance

**Purpose:** Own the accounting truth for customer and business money.

**Owns:** invoices, receipts, payment allocations, deposits, refunds, expenses, POs as financial evidence, tax reporting, revenue, and realized profitability.

**Commands:** issue invoice; record/allocate receipt; record deposit; mark invoice paid through allocations; issue refund; record PO; record expense; produce financial reports.

**Outputs:** balances, payment milestones, invoice/receipt documents, ledger references, revenue/expense/tax reports, and accounting profitability.

**Invariants:** “Paid in full” is derived from authoritative Finance evidence. Orders may request or display it but cannot create revenue. Finance consumes accepted snapshots; it does not recalculate the Quote or estimate manufacturing. Refunds and corrections preserve the original ledger trail.

## Shared Services

**Purpose:** Supply technical capabilities that preserve domain ownership.

**Owns:** authentication/session, RLS patterns, ID allocation, event infrastructure, private Assets and metadata, read-model plumbing, common persistence/error semantics, and analytics infrastructure.

**Invariants:** Shared Services does not become a miscellaneous business domain. Hub, Customer 360, global search, public tracking, and analytics are projections. They deep-link to the owning module for mutation.

## Cross-domain command rules

1. A module requests work from another domain through an explicit command or RPC; it never writes the other domain's tables ad hoc.
2. The receiving domain validates identity, current state, authorization, invariants, and idempotency.
3. A command either commits all required source records/events or none.
4. Read models and cached snapshots are never used as write authority.
5. Failures retain enough context for explicit retry/recovery without inventing IDs or duplicate records.

