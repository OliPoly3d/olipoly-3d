# OliPoly ERP Lifecycles

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative lifecycle and transition contract

## General rules

- Lifecycle status is persisted by its owning domain and changed only through an authorized command.
- UI labels may be friendlier, but stored values and meanings below are canonical.
- Every transition validates current state, authorization, required evidence, and idempotency.
- Historical events and immutable snapshots remain after cancellation, reprint, refund, or closure.
- A page may project another domain's status; it cannot create a parallel lifecycle.

## Quote lifecycle

| State | Meaning | Allowed next states |
|---|---|---|
| `draft` | Offer is being prepared and is not yet customer-active | `sent`, `canceled` |
| `sent` | Customer can respond to the offered snapshot | `accepted`, `change_requested`, `canceled` |
| `change_requested` | Customer declined the current terms and requested revision | `draft`, `canceled` |
| `accepted` | Customer accepted the exact snapshot; Order exists | none |
| `canceled` | Offer was withdrawn and cannot be accepted | none |

Rules:

- Quote creation follows a saved Production estimate.
- A change-request revision returns to `draft` and keeps auditable prior snapshots/events.
- `accepted` atomically creates exactly one linked Order.
- Quote acceptance is the customer commitment; the created Order needs no second acceptance.
- “Viewed” is not a Blueprint v1 state.

## Production pre-acceptance lifecycle

| State | Meaning | Entry / exit rule |
|---|---|---|
| `estimate` | Manufacturing plan and suggested price are being prepared | No Inventory reservation |
| `waiting_customer` | Quote is with the customer | Returns to estimate/revision work or advances through Quote acceptance |

When the Quote is accepted, linked work enters the canonical post-acceptance lifecycle at `ready_to_print`. No accepted Order may remain `estimate` or `waiting_customer`.

## Canonical post-acceptance Order/Production lifecycle

| State | Business meaning | Authorized action | Next state |
|---|---|---|---|
| `ready_to_print` | Contract/promise exists; manufacturing may proceed | Start Print | `printing` |
| `printing` | Active manufacturing attempt | Complete Print and capture actuals/scrap | `qc` |
| `qc` | Print is complete; QC/finishing decision required | Pass QC | `ready_for_fulfillment` |
| `qc` | Print failed or needs another attempt | Needs Reprint | `ready_to_print` |
| `ready_for_fulfillment` | Production passed; pickup/shipment may occur | Fulfill / Close | `closed` |
| `closed` | Fulfillment and operational closeout are complete | none |

Rules:

- Orders is canonical for the post-acceptance status; Production owns manufacturing commands and linked synchronization.
- The only normal forward path is the sequence above.
- Needs Reprint records the failure/reason, preserves attempt actuals and consumed material, and creates/permits another attempt.
- Complete Print does not close the Order.
- Payment timing does not independently change manufacturing status.
- Cancellation, if supported for accepted work, is an explicit exception workflow that must reconcile production, reservations, fulfillment, and Finance; it must not be represented by reusing an unrelated canonical state.

## Inventory lifecycle by work state

| Work point | Inventory behavior |
|---|---|
| Estimate | No reservation |
| Waiting for Customer | No reservation |
| Ready to Print | Reserve required stock; mounted rolls first where applicable |
| Printing | Reservation remains; issued/use evidence may accumulate |
| Print Complete / QC | Capture actual usage and scrap; reservation remains pending disposition |
| QC Pass | Consume actual quantity and release unused reservation |
| Needs Reprint | Preserve prior actual consumption/scrap; reserve additional need for new attempt |
| Cancel | Release unused reservation; preserve any actual movements |
| Closed | No unexplained live reservation |

Inventory movements are ledger entries. A status transition requests the appropriate Inventory command but does not directly edit balances.

## Payment lifecycle

Payment is an independent Finance lifecycle projected into Orders:

| State | Meaning |
|---|---|
| `unpaid` | No allocated receipt/deposit |
| `deposit_received` | A positive amount is allocated but balance remains |
| `paid_in_full` | Allocated receipts satisfy the authoritative obligation |
| `refunded` / `partially_refunded` | Finance issued a refund; balance/reporting follow ledger evidence |

Exact stored Finance status names may remain implementation-specific, but these meanings and events are canonical. A PO or Net 30 term is not payment. Order closure and payment status are related operational checks, not the same state machine.

## Invoice lifecycle

| State | Meaning |
|---|---|
| `draft` | Finance document not issued |
| `issued` | Immutable invoice snapshot delivered/available |
| `partially_paid` | Some allocation exists and balance remains |
| `paid` | Balance is satisfied |
| `void` | Invoice canceled through an audited Finance action |

Refunds do not erase receipts or rewrite an issued invoice; they add compensating ledger evidence.

## Asset lifecycle

| State/action | Meaning |
|---|---|
| Active revision | Current approved file reference for use |
| New revision | New immutable file/metadata linked to the revision group |
| Archived | Hidden from active selection but retained for history |
| Restored | Archived Asset becomes selectable again |

Asset bytes and historical revisions are not overwritten to simulate revision.

## Recipe lifecycle

Recipes maintain immutable revision history. Revision creates a new current snapshot; activation/deactivation controls future selection. Existing Quotes, Orders, Production jobs, and fundraiser lines retain the revision/snapshot originally linked. Deactivation never rewrites history.

