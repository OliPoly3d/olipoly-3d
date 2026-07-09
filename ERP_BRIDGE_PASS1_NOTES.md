# OliPoly ERP Bridge Pass 1

Changed files:
- production-control.html
- quote.js
- orders-admin.html

What this pass does:
1. Production Control auto-assigns a Q-number when saving a new estimate/job if the Quote # field is blank.
   - Uses Supabase `document_counters` key `quote` when logged in.
   - Falls back to a local non-reused counter only if cloud counter cannot be reached.
   - Canceled estimates keep their assigned Q-number; numbers are not reused.

2. Production Control → Quote handoff now carries:
   - production job id
   - quote number
   - derived OP order number
   - suggested total/piece price
   - customer/project notes

3. Quote acceptance now updates the linked Production Control job:
   - sets order_number to OP-######
   - sets production_status to `ready_to_print`
   - marks quote_handoff_status as `accepted_created_order`

4. Orders Admin gained `awaiting_production` as a status option/label.

5. Production Control status changes now sync downstream to Orders Admin and public tracker when an OP number exists:
   - printing → in_production
   - post_processing → post_processing
   - ready → ready_for_pickup
   - completed → completed
   - failed_scrap → issue_review
   - canceled → canceled
   - on_hold → on_hold

Important test flow:
1. Open Production Control while logged in.
2. Create/save a new estimate with Quote # blank.
3. Confirm Q-###### auto-populates after save.
4. Push to Quote.
5. Confirm Quote Tool opens with same Q-number.
6. Accept + Create Order.
7. Confirm Orders Admin has OP-same-number.
8. Confirm Production Control job receives order_number and ready_to_print.
9. From Production Control, move to Printing.
10. Confirm Orders Admin/public tracker updates to In Production.
11. Close/QC complete from Production Control.
12. Confirm inventory closeout still works and Orders Admin moves forward.

