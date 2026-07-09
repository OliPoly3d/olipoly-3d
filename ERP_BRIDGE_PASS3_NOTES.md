# ERP Bridge Pass 3 Notes

## What this pass changes

Production Control is now treated as the manufacturing owner during active production.

### Production lifecycle additions

New/expanded Production Control statuses:

- `estimate` — internal estimate mode; Q number exists, customer may not have seen anything yet
- `quote_sent` — customer quote has been published
- `quote_accepted` — quote accepted, production needs actual planning
- `awaiting_design` — design/slicer actuals need updated
- `ready_to_print` — production plan confirmed and inventory may reserve
- `queued` — waiting for printer time
- `printing` — manufacturing active
- `post_processing` — QC / cleanup
- closeout then deducts inventory and syncs Orders Admin

### Inventory reservation timing

Inventory is no longer reserved just because a job exists or is in estimate/approval status.

Material reservation now begins only when Production Control moves the job into a real production-planning status:

- `ready_to_print`
- `queued`
- `printing`
- later post-print statuses until closeout

The page blocks `ready_to_print`, `queued`, and `printing` if there are no grams/hours entered.

### Production → Orders Admin sync

Production status now maps back to Orders Admin / public tracker:

- `quote_accepted` → `awaiting_production`
- `awaiting_design` → `in_design`
- `ready_to_print` / `queued` → `awaiting_production`
- `printing` → `in_production`
- `post_processing` → `post_processing`
- `ready` → `ready_for_pickup`
- `completed` → `completed`
- `failed_scrap` → `issue_review`
- `on_hold` → `on_hold`
- `canceled` → `canceled`

### Orders Admin

Orders Admin was lightly updated to recognize `production_complete` if we decide to use it later. This pass still primarily uses existing `post_processing`, `ready_for_pickup`, and `completed` behavior to avoid breaking current closeout/doc/payment flows.

## Test path

1. Create a new Production Control estimate. Confirm a Q number is assigned.
2. Save it as `estimate`. Confirm no inventory is reserved.
3. Push to Quote.
4. Accept quote. Confirm OP number is created and Production Control moves into accepted/design planning flow.
5. Add slicer grams and print hours.
6. Click `Confirm Plan / Reserve`. Confirm reserved grams appear in inventory.
7. Click `Start Print`. Confirm Orders Admin/tracker shows In Production.
8. Send to QC / closeout. Add scrap if needed. Confirm inventory is deducted only once.
9. Return to Orders Admin for delivery/payment/Finance Pro push.

## No SQL migration required in this pass

The added lifecycle fields are stored in existing top-level fields and `job_payload`. Pass 2 SQL for atomic counters is still required.
