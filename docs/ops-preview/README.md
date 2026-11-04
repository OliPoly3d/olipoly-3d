# OliPoly mobile operations sample

This milestone provides three unique entry pages for reviewing the mixed-item pickup workflow.

- `ops-preview.html` opens Today, sample balances, available material and work search.
- `ops-order-preview.html` opens the order workspace.
- `ops-track-preview.html` shows overall customer milestones for the selected sample.

The cream, charcoal and rose interface uses responsive forms and touch controls. The sample stores fictional records under `olipoly.ops.preview.v1` in browser local storage. The banner identifies that persistence boundary on every page. Refresh preserves sample work on the same origin and browser. Cross-device persistence requires the separate test database.

## Review scenario

1. Open Today and the sample workspace.
2. Review two support blocks, three nameplates and the separate design charge. Prices include a fictional 7% tax rate. Change fields and save, or keep the sample defaults.
3. Record approval using an available evidence method.
4. In Production, release the order. Review the reserved material on Today.
5. Start two support blocks on P1S. Finish with one accepted and one rejected, recording 160 g PETG and 20 g PLA for the whole attempt.
6. Reprint one block on P2S and accept it. Record 80 g PETG and 10 g PLA.
7. Print and accept three nameplates with 45 g PLA Black.
8. Review the prepared pickup message and record pickup.
9. In Money, record one $110 cash payment and 0.5 actual labor hours.
10. Review the itemized receipt and customer milestone preview.

Expected sample stock is PETG Black 1,760 g, PLA White 970 g and PLA Black 1,455 g. The customer balance is zero. At the sample cost settings, accepted estimated cost is $23.09, recorded cost is $26.22 and profit is $76.58. These figures are fictional interface fixtures.

## Delivered boundaries

| Capability | State |
| --- | --- |
| Draft, fixed-price approval, material reservation and printer runs | Interactive device sample |
| Counts, failures, mixed filament usage and reprints | Interactive device sample |
| Complete pickup, manually recorded payment and receipt | Interactive device sample |
| Tax-inclusive commercial pricing | Canonical `calculateQuoteTotals`, explicit opt-in |
| Actual labor totals, other costs and cost variance | Interactive sample with labeled cost assumptions |
| Database, Finance Pro posting and live tracking RPC | Connection pending separate project setup |
| County sourcing, certificates and filing/remittance | Requirements retained for connected workflow |
| Capped design additions, file uploads and photos | Requirements retained for subsequent milestone |
| Partial fulfillment, show sales and program settlement | Requirements retained for subsequent milestone |
| Physical inventory reconciliation | Deferred by Rob |

The preview uses the existing pricing, line-item normalization and workflow status helpers. Tax-inclusive inputs preserve entered gross prices, with a displayed rounding adjustment when line-level net rounding produces a cent difference. Existing callers retain tax-exclusive behavior unless `taxIncluded: true` is supplied. Snapshot consumers continue to receive net commercial lines plus the saved gross display lines.

## Test database handoff

The separate **OliPoly ERP Test** project (`llscjdyiiatmuqhilube`) was created in **OliPoly3d's Org** with Rob's authorization on November 4, 2026. The project is in `us-east-2`. Schema initialization, test-user setup and the browser connection are pending a reviewed migration. The live project is the source for schema inspection and later migration rehearsal.

Prepare the new project from a verified current schema export. The repository migrations are incremental and are insufficient as a clean starting schema by themselves. Review custom types, sequences, tables, functions, triggers, policies, grants and Storage policies. Include only the business dependencies required by the test. Keep private data and credentials out of source control.

The current live contract includes `orders`, `quotes`, `production_jobs`, `financial_entries`, `inventory_transactions`, `raw_material_inventory`, `non_filament_materials`, accepted commercial snapshots, command receipts and material reservations. Inspect dependencies before selecting a restore subset.

Reuse the verified reservation, production, fulfillment, acceptance and payment commands. In particular review `reserve_production_material`, `consume_production_attempt`, `production_workflow_command`, `fulfillment_workflow_command`, `respond_to_quote_public` and `public_order_tracking_lookup`. Verify current ownership and auth requirements against live definitions. Design a quick recorded-approval path that preserves the acceptance/snapshot contract before connecting the new order UI.

A selected source backup, a restore rehearsal, stored-file backup coverage, test-user setup and reviewed access policies are prerequisites to the connected test. Each proposed schema operation must identify its exact migration and target for approval under AGENTS.md. Preserve Finance Pro and the personal Money app during any later production migration. A production data cutover should use the current live records as authoritative and compare totals, balances, history and legacy identities before and after.

## Checks

Run from the repository root:

```sh
node --check js/ops-preview/model.js
node --check js/ops-preview/workspace.js
node --check js/quote-pricing.js
node --test tests/ops-preview.test.js tests/order-line-items-pricing.test.js tests/quote-totals-unification.test.js
git diff --check
```

Browser verification should exercise the review scenario, a new mixed-item draft, add/remove material rows, validation errors, retained values after reload, search, tax-inclusive and tax-exclusive input, exemption fixtures, exhausted sample stock and the customer view. Check portrait tablet and phone layouts and actual Safari sharing/printing on Rob's iPad before live use.
