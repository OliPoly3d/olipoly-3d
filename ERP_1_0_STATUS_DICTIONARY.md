# OliPoly ERP 1.0 Status Dictionary

[Handbook](ERP_1_0_HANDBOOK.md) · [Workflow map](ERP_1_0_WORKFLOW_MAP.md) · [Troubleshooting](ERP_1_0_TROUBLESHOOTING.md)

Status labels in older historical notes may differ. These are the ERP 1.0 meanings. Operators change manufacturing in **Production Control**, not the legacy Orders Admin status editor.

## Manufacturing and accepted Order status

| Stored status | Operator label | Entered from / owner action | Inventory rule | Exit / verification |
|---|---|---|---|---|
| `estimate` | Estimate | New saved Production job | No reservation | Send to Quote → `waiting_customer`; verify Q exists. |
| `waiting_customer` | Waiting for Customer | Production sends estimate to Quote | No reservation | Acceptance → `ready_to_print`; change/decline remains pre-production. |
| `ready_to_print` | Ready to Print | Atomic Quote acceptance or Needs Reprint | Reserve planned material; a reprint gets its reviewed new need | Start print only with adequate reservation and mounted roll. |
| `printing` | Printing | Production start action | Reservation remains | Record attempt actual use/scrap; print completion → `qc`. |
| `qc` | QC / Finishing | Print completion | Reservation remains | Needs Reprint → ready; QC pass → fulfillment and consumption/release. |
| `ready_for_fulfillment` | Ready for Pickup / Shipment | Production QC pass | Consume actual use + scrap once; release unused; zero active reservation | Orders fulfills; then close only with Finance disposition. |
| `closed` | Closed | Coordinated Production/Orders closeout | No active reservation; consumed history retained | Terminal history unless an audited correction is approved. |

**Needs Reprint is an action, not permission to erase history.** It transitions `qc` → `ready_to_print`, preserves the prior attempt and actual usage, and prepares a distinct reservation/attempt.

Cancellation is an exception path: release active reservations, preserve already consumed use/scrap, retain identifiers and audit events. Print Complete means entry to QC; it does not close an Order.

## Quote status

| Status | Meaning | Downstream rule |
|---|---|---|
| `draft` | Durable Quote work not sent | No Order/reservation; distinguish from a browser-only draft. |
| `sent` | Customer output published/sent | Production waits; sending evidence must be real, not only an opened email draft. |
| `viewed` | Public Quote viewed | Read signal only. |
| `pending` | Awaiting response/action | No Order/reservation. |
| `accepted` | Customer accepted | RPC must return/reuse exact Order; conversion chain must exist. |
| `converted_to_order` | Accepted Quote linked to Order | Exactly one source-Quote relationship and snapshot. |
| `declined` / `rejected` | Customer/business declined | Retain Q and history; no OP/inventory. |
| `expired` | Response window ended | Retain history; intentional reissue/revision required. |

A change request is a response/attention path, not acceptance. Do not create an Order until the authoritative acceptance RPC succeeds.

## Inventory lifecycle terms

| Term | Definition | Verification |
|---|---|---|
| Available | Stock usable after reservations | Must not imply physical consumption. |
| Reserved | Quantity committed to a ready/active job | Active from ready through QC; linked to job/roll. |
| Consumed | Immutable physical usage posted to ledger | Actual use + scrap once per attempt/QC outcome. |
| Released | Previously reserved amount returned to availability | Unused at QC pass or live amount at cancel. |
| Scrap | Physical material used but not delivered as good product | Captured separately and consumed, never hidden in plan. |
| Shortage | Planned need exceeds valid availability | Blocks a false adequate reservation/negative balance. |

## Fulfillment and payment terms

- **Ready for fulfillment:** manufacturing passed QC; it is not paid, shipped, picked up, or closed by implication.
- **Unpaid:** no settled amount; **deposit:** partial receipt; **paid:** linked receipts cover required balance; **refunded:** linked refund disposition exists. Payment state never advances production.
- **Not required:** use only an explicit supported approval/disposition, never an empty field.
- **Open invoice / Net 30:** due date derives from invoice date; tax-exempt and freight remain explicit.
- **Closed:** fulfillment and manufacturing complete, active reservation zero, and Finance disposition explicit.

## Recipe and asset states

- **Recipe active:** approved for repeat-job selection. **Inactive:** retained but excluded from normal active selection. New Revision preserves the prior immutable snapshot; activate/deactivate deliberately.
- **Asset active:** eligible for current-version selection. **Archived:** metadata/object/history retained but excluded from current-version selection. Restore returns it to active after review.
- **Internal / customer supplied:** file designation/provenance, not access policy. Both remain private.
- Asset revision numbers increase within a revision group. Superseding never overwrites or deletes prior bytes/metadata.

