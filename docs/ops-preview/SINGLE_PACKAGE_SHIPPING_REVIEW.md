# Single-box shipping in ERP Test

Open **Fulfillment** after QC passes for every piece. Enter the ship-to address, packed ounces, outside dimensions in inches, carrier, service, tracking number, label provider and purchase reference. Record the label purchase date, actual postage and optional HTTPS receipt link. Use fictional shipping details in ERP Test.

A saved label appears as **Label purchased**. For positive postage, the save creates one Shipping expense in Test Finance. If the expense already exists, supply its Finance entry ID to link it. The entry must belong to the owner and match the purchase date and amount. **Money** includes the package postage in recorded actual costs.

Select **Record carrier handoff** when the carrier has the box. This records the time of confirmation, shows **Shipped** with tracking in the customer milestone preview and prepares a copyable customer update. Handoff and payment can happen in either order. Once both are recorded, the order closes and the customer can still see shipping and tracking.

## Migration

Apply [20261111131013_ops_test_single_package_shipping.sql](../../supabase/ops-preview/migrations/20261111131013_ops_test_single_package_shipping.sql) to **OliPoly ERP Test** (`llscjdyiiatmuqhilube`) after approval of this script and target. The migration adds a private validation helper and replaces `public.ops_preview_commit` with two shipping actions. It uses the existing workspace revision lock and command receipts to make label saves and handoff safe to retry.

The migration has no data backfill. Shipping actions store a single package on the workspace order and update the linked Orders, Production and tracking projections through the existing commit transaction. The label action uses the existing Finance expense command or links an eligible expense ID. The accepted price and sales tax come from the existing commercial snapshot. Customer tracking receives carrier and tracking details after handoff. The address, postage and receipt evidence stay in the owner workspace.

Before applying, verify the test project and prerequisite migration, record the currently deployed version, and capture the existing record fingerprints using [the preservation query](../../supabase/ops-preview/verification/inventory_management_preservation.sql). Compare the results after applying. Check the private helper grants and the existing authenticated commit and public tracking boundaries. An application failure rolls back the migration transaction. If a workflow problem appears after rollout, keep the affected shipment, command and Finance records for review and prepare a corrective change.

## iPad rehearsal

1. Open an accepted test order with all pieces QC-passed. In **Fulfillment**, enter a fictional ship-to address and measure a box. Use test tracking and a fictional label reference with **$7.25** postage.
2. Save the label, reload, and check **Label purchased**. Verify that **Money** includes $7.25 once and the accepted customer total is still the same. The customer milestone preview should show the order as ready for fulfillment.
3. Confirm the carrier has the package and record handoff. Check **Shipped**, the tracking number and the prepared update. Copy the update for review.
4. Record test payment and check that the order closes, the same tracking number remains visible, and Finance still shows one postage expense for the package.
5. Use another test order to try prepayment, then record shipment. Check closure at handoff. To exercise expense reuse, enter the existing shipping expense ID on the label form and verify the Finance row count.
