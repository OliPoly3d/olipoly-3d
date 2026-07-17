# OliPoly ERP 1.0 Workflow Map

[Handbook](ERP_1_0_HANDBOOK.md) · [Status dictionary](ERP_1_0_STATUS_DICTIONARY.md) · [Troubleshooting](ERP_1_0_TROUBLESHOOTING.md) · [Testing](ERP_1_0_TESTING_PLAYBOOK.md)

## Authoritative lifecycle

```text
Hub intake/browser draft
  └─ explicit save/open ─> Production job (estimate; Q-###### assigned)
       └─ send to Quote ─> waiting_customer + durable Quote totals snapshot
            ├─ change request ─> Quote attention/revision loop (no Order/reservation)
            ├─ decline/expire ─> retained Quote history (no Order/reservation)
            └─ accept via respond_to_quote_public
                 └─ exact OP-###### returned; one accepted Order
                      └─ ready_to_print ─> printing ─> qc
                           ├─ Needs Reprint ─> ready_to_print (actuals retained)
                           └─ QC pass ─> ready_for_fulfillment ─> closed
```

**Inventory alongside manufacturing:** none in `estimate`/`waiting_customer` → reserve at `ready_to_print` → retain through `printing`/`qc` → on QC pass consume actual use + scrap once and release unused → on cancel release live reservation but preserve real consumption.

**Money alongside fulfillment:** Quote snapshot/terms → optional retail deposit or business invoice → receipts/payments/refunds in Finance → explicit paid/refunded/not-required disposition before closeout. Production never implies payment.

## Ownership and safe handoffs

| Stage | Authority | Input | Output / downstream effect | Recovery boundary |
|---|---|---|---|---|
| Intake | Hub only until explicit save | Operator/customer request | Browser draft or saved customer/project record | Local intake is not durable; inspect before import. |
| Estimate | Production Control | Customer need, slicer/material/labor assumptions | `production_jobs`, Q number, suggested prices | Reload by job UUID/Q; do not recreate in Quote. |
| Customer pricing | Quote | Production snapshot | Immutable totals snapshot, terms, public token | Search remote Q before retrying save/send. |
| Decision | `respond_to_quote_public` RPC | Exact Q + token + response | One OP/Order or change request | No OP returned means stop; never infer it. |
| Manufacturing | Production Control; `orders.status` canonical post-acceptance synchronized value | Accepted linked job | Attempts, printer, actuals, workflow event | Refresh stale state; use workflow RPC, not browser repair. |
| Inventory | Inventory ledger | Production reservation/consumption request | Reservation/transaction/balance | Compare transaction and attempt IDs before correction. |
| Fulfillment | Orders Admin | `ready_for_fulfillment` Order | Pickup/shipment, tracking, communication | Do not edit manufacturing here in normal operation. |
| Finance | Finance Pro | Exact OP and snapshot | Invoice/receipt/payment/refund/report | Search exact OP before retry; retain audit trail. |
| Read models | Hub, Customer 360, public tracking | Supabase records/events | Attention/history/public state | Reload source; read models do not repair authority. |
| Recipes | Product Recipes | Completed job snapshot | Revisioned template or local preload | Preload is non-durable until destination saves. |
| Assets | Asset tables + private Storage | Authorized file and stable links | Revision metadata, private object, signed access | Inspect all three layers after partial upload. |

## Key branch maps

### Customer decision

| Decision | Status/effect | Operator verification | Recovery |
|---|---|---|---|
| Request changes | Quote attention; no Order | Q retained, Production still pre-acceptance, Inventory unchanged | Revise same project/snapshot deliberately; resend. |
| Accept | One Order and OP returned; Production `ready_to_print` | one RPC/event/Order, exact Q/OP chain | Stop acceptance on missing/duplicate OP and audit remotely. |
| Decline/expire | Quote retained; no Order | no OP, reservation, or Finance income | Reopen/requote only through intentional business decision. |

### Production exception

| Event | Correct effect | Never do |
|---|---|---|
| Shortage | Block adequate-start claim; receive/adjust stock or revise plan | Create negative roll balance. |
| Needs Reprint | Keep old attempt actuals; return to ready; reserve new need | Erase prior use or consume it again. |
| Cancel before print | Release live reservation; no consumption | Delete job/Quote/Order. |
| Cancel after use | Preserve consumption/scrap; release remainder | Restore physically used grams. |
| Concurrent edit | Reject/warn stale writer; refresh current remote row | Overwrite newer remote data with recovery copy. |

## Identity and revision links

- Q and OP display values are exactly six digits, but their numeric portions are **not** inferred from one another.
- Durable links use UUID/stable record key: `orders.source_quote_number`, `quotes.converted_order_number`, and Production Q/OP fields form one chain.
- Asset links use stable `recipe`, `quote`, `order`, `production_job`, or `customer` keys. An exact asset revision link remains pinned; a current-version listing may select the newest active revision.
- Customer names, list positions, filenames, browser drafts, and signed URLs are not permanent identities.

## Verification at every handoff

1. Record source UUID and exact Q/OP.
2. Confirm the owner page reports success.
3. Reload the owner page and compare material fields/status/timestamp.
4. Open the consumer page/device and confirm it reads the same remote value.
5. Confirm forbidden side effects did not occur (early Order, reservation, consumption, Finance entry, or public Asset exposure).
6. On disagreement, stop at the authoritative owner and use [troubleshooting](ERP_1_0_TROUBLESHOOTING.md).

