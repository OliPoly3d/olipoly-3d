# OliPoly ERP Data Ownership Matrix

> **Authority:** ERP Blueprint v1.0  
> **Status:** Authoritative source-of-truth matrix

## Reading the matrix

**Owner** is the only domain allowed to define and directly mutate the fact. **Writers** use an owner-approved command. **Consumers** receive snapshots, events, or read projections. A UI containing a field does not own that field.

| Business fact / record | Authoritative owner | Approved writers / command origin | Principal consumers | Required rule |
|---|---|---|---|---|
| Customer/contact identity | Customer & Intake | Intake/customer service | Quote, Orders, Finance, Customer 360 | Stable identity; do not duplicate by name |
| Intake/request | Customer & Intake | Intake | Production, Quote | Request is context, not price or Order |
| Production estimate and assumptions | Production | Production Control | Quote, profitability views | Stored snapshot; Quote does not recalculate |
| Internal manufacturing costs | Production | Production Control | Finance/reporting read models | Never public |
| Suggested selling and piece price | Production | Production Control | Quote | Recommendation only |
| Product recipe and revision history | Production | Product/Recipe Library | Production, Fundraiser catalog | Historical revisions immutable |
| Quote identity `Q-######` | Quote/ID service | Approved Quote creation path | All modules | Server allocated; never fabricated in browser |
| Customer pricing inputs | Quote | Quote | Quote documents, Finance | One Quote system |
| Customer totals snapshot | Quote | `calculateQuoteTotals()` during Quote save/acceptance | Public Quote, Order, Finance | Immutable on acceptance; consumers do not recalculate |
| Quote response/status | Quote | Quote and public response RPC | Orders, Hub, Customer 360 | `accepted`, `change_requested`, `canceled` are explicit |
| Order identity `OP-######` | Orders/ID service | Acceptance or approved direct-order contract | Production, Inventory, Finance, tracking | Exactly one per accepted Quote; same numeric suffix |
| Accepted Order snapshot | Orders | Atomic Quote acceptance | Production, Finance, tracking | Preserves accepted commercial truth |
| Canonical post-acceptance status | Orders | Authorized Orders/Production workflow command | Production, Hub, tracking, Customer 360 | Allowed states only; synchronized projections cannot diverge |
| Production job/attempt actuals | Production | Production actions | Inventory, Orders, reporting | Attempts retained; reprint never erases history |
| Fulfillment method/address/tracking | Orders & Fulfillment | Orders/Fulfillment | Tracking, Customer 360 | Public projection is allowlisted |
| Communication delivery evidence | Orders/Communication | Approved sender callback | Hub, Customer 360 | Draft/open is not sent |
| Inventory item/roll/material | Inventory | Inventory Control | Production, purchasing views | Mounted rolls preferred where applicable |
| On-hand and available quantity | Inventory | Inventory ledger commands | Production, Hub | Derived from authoritative ledger/reservations |
| Reservation | Inventory | Production request accepted by Inventory | Production, Orders | Begins at Ready to Print; released/consumed explicitly |
| Consumption/return/scrap/adjustment | Inventory | Inventory command with source evidence | Production, Finance/reporting | Immutable traceable movement |
| Invoice and invoice snapshot | Finance | Finance | Orders, customer documents | Issued document is historical evidence |
| Receipt/payment allocation/deposit | Finance | Finance/payment integration | Orders, Hub, tracking | Operational paid state is a projection |
| Refund | Finance | Finance | Orders, customer service | References original money movement |
| PO evidence | Finance | Finance/approved Orders intake | Orders, Customer 360 | PO supports terms; it is not an Order acceptance step |
| Expense | Finance | Finance | Reports | Categorized, dated, traceable |
| Revenue, tax, realized profit | Finance | Derived from Finance ledger | Hub, analytics | Production estimate is not accounting truth |
| Business event | Owning domain via event service | Transaction that completed the fact | Timeline/read models/integrations | Append-only and versioned |
| Asset bytes | Shared Asset service/private Storage | Authorized Asset workflow | Production, Orders, Recipes | Private; short-lived signed access only |
| Asset metadata/revision/link | Shared Asset service | Authorized Asset workflow | Production, Orders, Customer 360 | SHA-256 duplicate detection; archive, do not rewrite history |
| Auth identity/session | Shared Identity service | Supabase Auth | All protected modules | Session is not business data |
| Hub attention item | Read model | Derived only | Operator | Never mutated as source truth |
| Customer 360 timeline | Read model | Derived only | Operator | No independent customer/workflow writes |
| Public tracking view | Read model | Derived only | Customer | Minimum fields; no private internals |
| Browser draft/recovery/cache | Browser | Current device/user | Explicit recovery UI only | Non-durable; never automatic authority |

## Conflict and precedence rules

1. Authoritative Supabase records beat cached or equally timed browser data.
2. Stable IDs are compared before names or display numbers.
3. A newer local recovery record is not automatically uploaded; it is presented for explicit review/import.
4. Duplicate-safe imports create only missing records through approved contracts.
5. For status, ledger, accepted totals, and immutable snapshots, the owner record always wins even if a consumer has a later cache timestamp.

## Prohibited ownership patterns

- Quote duplicating Production math.
- Orders or fundraiser tools maintaining a shadow production status.
- Production directly subtracting stock.
- Orders marking Finance revenue because a button was clicked.
- Hub or Customer 360 editing source-domain records.
- Public pages receiving private Asset paths, margins, internal notes, or raw owner rows.
- Browser localStorage acting as a synchronized database.

