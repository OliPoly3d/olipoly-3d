# OliPoly ERP Business Event Contract

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative event vocabulary

## Contract

A business event is an immutable statement that a meaningful action completed. Events support audit, timelines, attention views, notifications, and integration. They do not replace source records, ledgers, or current status.

Every persisted event must contain:

| Field | Rule |
|---|---|
| `event_id` | Globally unique durable ID |
| `event_type` | Stable name from this contract |
| `occurred_at` | Server-assigned timestamp |
| `actor_type` / `actor_id` | Authenticated user, public customer, system, or approved integration |
| `aggregate_type` / `aggregate_id` | Owning domain object and stable UUID |
| `quote_number` / `order_number` | Human reference when applicable; never a substitute for UUID |
| `correlation_id` | Connects one business operation across records/events |
| `causation_id` | Prior command/event when available |
| `payload` | Minimal immutable context; no duplicate mutable record and no secrets |
| `schema_version` | Event payload version |

Event names are lowercase dot-separated past-tense facts. Consumers must ignore unknown additive payload fields and must not infer success from an event until its source transaction commits.

## Canonical event catalog

### Quote

| Event | Meaning | Producer | Required result |
|---|---|---|---|
| `quote.created` | A durable Quote was created from a Production estimate | Quote | Quote identity and initial snapshot exist |
| `quote.sent` | The customer offer was made available/sent | Quote | Quote is `sent`; delivery mechanism may be recorded separately |
| `quote.accepted` | Customer accepted the exact offered snapshot | Quote acceptance service | Quote is `accepted`; exactly one Order is created in the same operation |
| `quote.change_requested` | Customer requested revision instead of accepting | Quote acceptance service | Quote is `change_requested`; no Order is created |
| `quote.canceled` | Quote was intentionally withdrawn/canceled | Quote | Quote is terminal `canceled`; no new acceptance is allowed |

`quote.viewed` is intentionally excluded from Blueprint v1. It may be telemetry, but it is not a contracted business event or Quote lifecycle state.

### Order and production workflow

| Event | Meaning | Producer | Resulting canonical status |
|---|---|---|---|
| `order.created` | Accepted work became an Order | Acceptance/Orders service | `ready_to_print` |
| `order.ready_to_print` | Work is authorized and queued for manufacturing | Orders workflow | `ready_to_print` |
| `order.printing_started` | Manufacturing began | Production | `printing` |
| `order.print_completed` | Print actuals were recorded and work entered QC/finishing | Production | `qc` |
| `order.qc_passed` | QC/finishing passed | Production | `ready_for_fulfillment` |
| `order.needs_reprint` | QC/production determined another attempt is required | Production | `ready_to_print` |
| `order.closed` | Fulfillment and closeout completed | Orders/Fulfillment | `closed` |

`order.needs_reprint` preserves earlier attempt actuals. `order.print_completed` never closes an Order. A status synchronization mechanism may update linked representations, but it emits one logical event per completed command rather than one event per replicated row.

### Payment

| Event | Meaning | Producer | Notes |
|---|---|---|---|
| `payment.deposit_received` | Finance recorded and allocated a deposit | Finance | Amount, currency, Finance reference, and allocation required |
| `payment.paid_in_full` | Finance evidence makes the customer obligation fully paid | Finance | Orders may project paid-in-full; it does not create revenue independently |
| `payment.refund_issued` | Finance posted a refund | Finance | References original receipt/payment and amount |

### Finance

| Event | Meaning | Producer |
|---|---|---|
| `finance.invoice_issued` | An authoritative invoice snapshot was issued | Finance |
| `finance.invoice_paid` | The invoice balance was satisfied by Finance allocations | Finance |
| `finance.po_received` | A customer PO was recorded and linked | Finance/Orders command under Finance contract |
| `finance.expense_recorded` | An expense entered the Finance ledger | Finance |

Payment events express cash movement/allocation; invoice events express document/balance milestones. They must not be collapsed into one ambiguous “paid” event.

### Inventory

| Event | Meaning | Producer |
|---|---|---|
| `inventory.reserved` | Available stock was committed to authorized work | Inventory |
| `inventory.consumed` | Actual stock was permanently used | Inventory |
| `inventory.returned_to_stock` | Previously reserved/issued stock became available again | Inventory |
| `inventory.scrap_recorded` | Material loss was recorded against production evidence | Inventory |

Every Inventory event references its ledger transaction and source job/order. Events never change on-hand quantities themselves.

### Communication

| Event | Meaning | Producer |
|---|---|---|
| `communication.confirmation_sent` | An order/acceptance confirmation was actually sent | Communication service |
| `communication.completion_sent` | A completion/ready notification was actually sent | Communication service |
| `communication.tracking_update_posted` | A customer-visible tracking update was published | Orders/Communication |

Opening an email draft is not “sent.” Failed or canceled delivery attempts may be technical logs but are not these success events.

## Delivery and processing rules

- Event persistence is atomic with the business change when the event is required evidence for that change.
- Consumers are at-least-once safe and deduplicate by `event_id`.
- Events are append-only. Correction uses a new compensating/correction event plus source-domain repair; historical payloads are not edited.
- Consumers may build read models and notifications but may not mutate another domain merely because they observed an event unless an explicit command contract authorizes it.
- Payloads contain identifiers and immutable snapshots needed by consumers, not entire live rows.
- Public event projections are separately allowlisted and omit private fields.

## Versioning

Additive optional payload fields may retain the existing `schema_version`. Renames, removals, changed meaning, changed required fields, or new side effects require a new version and a migration plan for every consumer. New event types require Blueprint approval when they establish a new business milestone.

