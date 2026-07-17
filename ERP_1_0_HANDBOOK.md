# OliPoly ERP 1.0 Operator Handbook

> **Released operating contract.** This handbook summarizes the validated ERP 1.0 workflow. The [release audit](ERP_1_0_RELEASE_CANDIDATE_AUDIT.md) remains authoritative if an older screen label or historical note disagrees. Start with the [workflow map](ERP_1_0_WORKFLOW_MAP.md), use the [status dictionary](ERP_1_0_STATUS_DICTIONARY.md) before changing a state, and use [troubleshooting](ERP_1_0_TROUBLESHOOTING.md) rather than inventing a workaround.

## Library index

- **This handbook:** daily operation and exact workflow runbooks.
- [Workflow map](ERP_1_0_WORKFLOW_MAP.md): ownership, handoffs, data effects, and recovery paths.
- [Status dictionary](ERP_1_0_STATUS_DICTIONARY.md): allowed manufacturing, Quote, Order, inventory, payment, recipe, and asset states.
- [Troubleshooting](ERP_1_0_TROUBLESHOOTING.md): common failures, safe diagnosis, and escalation.
- [Backup and recovery](ERP_1_0_BACKUP_RECOVERY.md): durable records, browser data, JSON export/import, and incidents.
- [Deployment guide](ERP_1_0_DEPLOYMENT_GUIDE.md): ordered migrations, RLS, private Storage, release, and rollback.
- [Testing playbook](ERP_1_0_TESTING_PLAYBOOK.md): automated, migration, browser, RLS, asset, and multi-device gates.
- [ERP 1.0 release notes](ERP_1_0_RELEASE_NOTES.md) and [release audit](ERP_1_0_RELEASE_CANDIDATE_AUDIT.md).

## The four kinds of data

| Kind | Meaning | Survives another browser/device? | Operator rule |
|---|---|---:|---|
| **Durable Supabase record** | The authoritative saved row, event, ledger transaction, asset metadata, or private Storage object | Yes, after authenticated reload | A success message plus remote reload is proof. Preserve its UUID and exact Q/OP identity. |
| **Browser draft** | In-progress input intentionally held in this browser | No | Finish and save it deliberately. Never describe it as a cloud record. |
| **Recovery copy** | A local copy retained after a failed/uncertain save or as an explicit fallback | No | Review and explicitly import only a missing record. **Recovery records never upload automatically.** |
| **UI preference/cache** | Filters, theme, favorites, dismissed panels, or read acceleration | No guarantee | It may be cleared. It must never win over newer Supabase data. |

A non-durable draft or recovery copy is not a backup of the business. Clearing site data can remove it. A second device cannot see it. Reconnecting does not upload it. See [backup and recovery](ERP_1_0_BACKUP_RECOVERY.md#browser-data-and-json).

## Daily opening and closing

1. Open `hub.html`, sign in, and confirm the authenticated state. Do not operate durable workflows anonymously.
2. Review Hub attention items: customer responses, quotes awaiting action, production work, shortages, fulfillment, overdue/open balances, and failures.
3. Open the linked authoritative page rather than editing a read model: Production for manufacturing, Orders for fulfillment, Inventory for stock, Finance for money.
4. Search by exact `Q-######` or `OP-######`; customer names are not stable record keys.
5. At day end, resolve failed-save banners, verify important writes after reload, close no job with a live reservation, and export a scheduled JSON backup when due.

## Authentication, Hub, and Customer 360

### Authentication and login

- **Purpose / owner:** Supabase Auth establishes the signed-in identity used by RLS; authentication owns the session, not any business module.
- **Starting conditions:** Approved account, correct environment, network access, and no customer-facing/private browsing session mixed with operator work.
- **Operator steps:** Open Hub → enter email/password in the existing sign-in control → sign in → confirm the account indicator → reload once before sensitive work. Sign out on shared devices.
- **Statuses/effects:** No business status changes. The bearer session enables owner-scoped durable reads/writes and signed asset requests.
- **Recovery:** If sign-in fails, do not repeatedly create accounts. Confirm URL/network/time, sign out and back in, then follow [authentication failures](ERP_1_0_TROUBLESHOOTING.md#authentication-or-rls-denial). Unsaved browser work remains local only.
- **Common mistakes:** Treating a cached page as authenticated; sharing a signed URL; assuming a local token proves RLS access.
- **Verify:** Account is shown; Hub remote data reloads; a private Asset request succeeds only while authorized.

### Hub and attention items

- **Purpose / owner:** Hub is navigation and a Supabase read model; source modules own every displayed record.
- **Starting conditions:** Signed in and remote reads complete.
- **Operator steps:** Reload → scan attention cards → search Q/OP/customer → open the source record → resolve it there → return/reload Hub.
- **Statuses/effects:** Hub creates no manufacturing, fulfillment, inventory, or Finance state. Resolution in the owner module produces remote events that Hub reports.
- **Recovery:** If counts look stale, reload and compare the authoritative page. Never clear or recreate a record to fix a card.
- **Common mistakes:** Editing from memory; treating a local draft as an attention record; dismissing an item without resolving its source.
- **Verify:** Exact Q/OP and timestamp agree with the source page after reload.

### Customer 360

- **Purpose / owner:** Read-only consolidated customer/project history over durable Supabase records and `project_events`.
- **Starting conditions:** Signed in; customer has remotely saved activity.
- **Operator steps:** Search exact identifier or customer → inspect quotes, orders, production, Finance, and timeline → follow the relevant link to make changes.
- **Statuses/effects:** None; Customer 360 never merges browser records or owns edits.
- **Recovery:** If data is absent, verify the source UUID/Q/OP and its remote save. Do not manufacture a duplicate customer.
- **Common mistakes:** Expecting device-local drafts; editing the wrong same-name customer; reading cached totals after another device changed them.
- **Verify:** Totals, identifiers, statuses, and event time agree with owner pages on reload.

## Customer-to-Order workflows

### Production Control estimate

- **Purpose / owner:** Production Control owns manufacturing assumptions, costs, printer, material, labor, packaging, hardware, suggested price, and the production job.
- **Starting conditions:** Signed in; customer/request identified; no duplicate job for the same work.
- **Operator steps:** Open Production → create/open job → enter quantity and slicer grams/hours → select material and printer → enter labor, packaging, hardware, and assumptions → review suggested selling/piece price, break-even, and profit → save as `estimate` → record job UUID and assigned `Q-######` → reload.
- **Statuses/effects:** Creates/updates durable `production_jobs`; status `estimate`; assigns the persisted Quote number. No Order, reservation, consumption, invoice, or income.
- **Recovery:** On failed save, preserve the recovery copy, check Supabase after reconnect, and import only if missing. Never allocate or guess a Q number locally.
- **Common mistakes:** Starting manufacturing math in Quote; reserving stock during estimate; overwriting actuals from an earlier attempt.
- **Verify:** Reload/two-device match; six-digit Q; estimate inputs and snapshot agree; Inventory unchanged.

### Quote creation and sending

- **Purpose / owner:** Quote owns customer pricing presentation, override, discounts, tax/exemption, deposit, notes, turnaround, and terms. `calculateQuoteTotals()` is the only totals engine.
- **Starting conditions:** Saved Production estimate with Q number and suggested price; customer type selected.
- **Operator steps:** Send/open estimate in Quote → verify Q and Production snapshot → choose Retail or Professional/PO in the single Quote system → enter customer fields and terms → apply an intentional selling-price override/discount/tax rule if needed → calculate and review totals → save/send → capture public URL and totals snapshot.
- **Statuses/effects:** Production advances `estimate` → `waiting_customer`; durable Quote progresses through draft/sent/viewed/pending as applicable. No inventory reservation or Order exists.
- **Recovery:** If save/send is uncertain, check the remote Quote by Q before retrying. A browser copy is recovery, not a saved Quote.
- **Common mistakes:** Re-entering manufacturing costs; creating a second Q for a revision; claiming email was sent when only a Gmail draft was opened.
- **Verify:** PDF/email/public/saved views consume the identical totals snapshot; remote reload preserves terms; Inventory and Orders unchanged.

### Public acceptance and change requests

- **Purpose / owner:** Supabase RPC `respond_to_quote_public` owns the atomic public decision; the public page submits the exact token and Q once.
- **Starting conditions:** Valid sent Quote/public token; customer has reviewed snapshot and terms.
- **Operator steps:** Customer opens public URL → chooses Accept or Request Changes → enters requested response information → submits once → operator reloads Quote/Production/Orders rather than inferring success.
- **Statuses/effects:** Change request records attention and leaves work pre-acceptance. Acceptance returns exact `OP-######`, creates/reuses exactly one Order for the source Quote, records one acceptance event, preserves the totals snapshot, and advances Production to `ready_to_print`.
- **Recovery:** If no Order number returns, stop retries, inspect Quote and Orders remotely, and use the [acceptance incident procedure](ERP_1_0_TROUBLESHOOTING.md#public-acceptance-failed-or-duplicated). Never derive OP from Q.
- **Common mistakes:** Double-clicking; manually creating an Order; exposing private Assets on the public page; assuming Q and OP numeric portions match.
- **Verify:** One RPC request, one Order, same result on repeat/concurrent submission, exact source-Q chain, one event, Production ready, totals unchanged.

### Orders Admin and fulfillment

- **Purpose / owner:** Orders begins after acceptance and owns fulfillment, communication, payment tracking, and completion. Production remains manufacturing authority.
- **Starting conditions:** RPC-created Order with exact OP and linked Q/Production job.
- **Operator steps:** Open Order by OP → verify customer/terms/totals → monitor synchronized manufacturing readout → after `ready_for_fulfillment`, prepare pickup/shipping, packing/invoice/customer communication → record fulfillment → coordinate Finance payment → complete fulfillment only when disposition is explicit.
- **Statuses/effects:** Fulfillment/tracking/payment fields change; manufacturing changes must originate in Production. `closed` requires production/fulfillment complete, zero live reservation, and paid/refunded/approved-not-required Finance disposition.
- **Recovery:** If manufacturing displays incorrectly, refresh Production and reconcile through the workflow API. Do not use the legacy Orders manufacturing editor in normal operation.
- **Common mistakes:** Advancing manufacturing in Orders; closing at print completion; duplicating invoices or emails after a reload.
- **Verify:** Q/OP chain, remote status, tracking, fulfillment evidence, Finance balance, and no active reservation.

### Retail deposit, balance, and refund

- **Purpose / owner:** Quote sets requested deposit/terms; Orders tracks collection; Finance owns receipts, payments, refunds, and balance.
- **Starting conditions:** Retail Quote snapshot and accepted Order.
- **Operator steps:** Verify taxable total/freight/deposit → record each actual receipt once using supported payment flow → link it to OP → issue receipt → at fulfillment collect/record balance → for refund, create linked refund entry and update payment state without reversing consumed stock.
- **Statuses/effects:** Payment state moves among unpaid/deposit/paid/refunded independently of production; Finance entries and balance update.
- **Recovery:** Search Finance by OP before retrying an uncertain payment. Preserve processor/reference evidence; reconcile, never delete and recreate.
- **Common mistakes:** Treating acceptance as payment; recording a promised deposit; refunding inventory automatically.
- **Verify:** Sum of linked entries equals paid/refunded amount, tax/freight split is correct, balance is correct after reload, no duplicate entry.

### PO, tax-exempt, invoice, and Net 30

- **Purpose / owner:** Quote owns PO/customer terms and exemption evidence; Finance owns invoice/due date/payment/reporting.
- **Starting conditions:** Saved estimate; Professional/PO customer type; valid exemption information and billing/shipping details.
- **Operator steps:** In Quote enter company/contact, PO, both part numbers, revision, addresses, exemption reason/certificate indicator, freight, Net 30, and zero deposit → verify tax `0.00` → save/send/accept normally → execute production → generate invoice from Orders/Finance using invoice date → verify due date +30 days → record one payment when received.
- **Statuses/effects:** Same production states as retail; invoice open/paid state is independent. PO, exemption, freight, terms, snapshot, and Q/OP persist.
- **Recovery:** If evidence is incomplete, stop invoicing/closeout and correct the durable Quote/Finance record; do not toggle tax merely to reach a desired total.
- **Common mistakes:** Creating a second pricing engine/customer flow; applying retail deposit; taxing exempt line items; calculating due date from Quote date.
- **Verify:** zero tax with evidence, freight separate, invoice date/due date correct, full open balance then one linked payment, multi-device match.

## Recipes and private Job Files / Assets

### Product Recipe Library, revisions, and activation

- **Purpose / owner:** Product Recipes owns reusable, customer-free manufacturing snapshots. A recipe may seed a job; it cannot create an Order or reserve inventory.
- **Starting conditions:** For creation, a completed Production job; for repeat, an active reviewed recipe/revision.
- **Operator steps:** Open Recipes → Create from completed job → enter name, OliPoly part number, revision, category → save → for a change choose New Revision and review the copied snapshot → activate the approved revision/deactivate obsolete ones → Start Repeat Job → choose Production or Quote handoff → review all seeded values before durable save.
- **Statuses/effects:** Durable active/inactive recipes; new revision preserves immutable prior snapshot/history. Repeat creates only a browser preload until the destination is saved.
- **Recovery:** Browser recipe recovery is never auto-uploaded; use explicit review/import only when missing remotely. Restore an inactive recipe only after checking revision intent.
- **Common mistakes:** Copying customer/PO identity into a recipe; editing history; assuming preload is durable; leaving conflicting revisions active.
- **Verify:** remote reload, prior revision unchanged, intended active version, recipe key/revision in new job, no Order/reservation.

### Asset upload, revisions, links, archive, and restore

- **Purpose / owner:** Job Assets tables own metadata/links; private Supabase Storage bucket `job-assets` owns bytes; Supabase Auth/RLS owns access.
- **Starting conditions:** Signed in; correct stable record UUID/key for at least one `recipe`, `quote`, `order`, `production_job`, or `customer` link; file/category/designation known.
- **Operator steps:** Open Job Files/Assets on an authenticated ERP page → choose file/category → label **Internal** or **Customer supplied** → add description and stable links → Upload → reload → use New Revision for replacement (select new file; same links carry forward) → Open/download only through the generated signed request → Archive obsolete records; Restore only after review.
- **Statuses/effects:** New private object, `asset_records` revision, and `asset_links`; revisions increment and preserve the old revision. Archive hides a revision from current-version selection without deleting history or the object.
- **Recovery:** If upload partially fails, record the error/time/path and inspect Storage plus both metadata tables before retrying. Do not make the bucket public or loosen RLS. Use an exact-revision link when work must remain pinned; a current-version view may advance.
- **Common mistakes:** Linking by customer name; uploading a customer file as internal; overwriting instead of revising; sharing a five-minute signed URL as permanent access; deleting archived evidence.
- **Verify:** authenticated signed download succeeds, anonymous/other-user access fails, links deep-link to exact records, old and new revisions remain, archive/restore survives reload.

## Inventory and production execution

### Inventory master data and reservation

- **Purpose / owner:** Inventory owns materials, rolls, balances, reservation, consumption, adjustments, and reorder points; Production only requests lifecycle actions.
- **Starting conditions:** Correct material/roll exists with available grams; accepted job is `ready_to_print`; plan and actual source roll are reviewed.
- **Operator steps:** Verify roll/color/material → in Production confirm plan and transition/retain `ready_to_print` → inspect reservation ledger and shortage → mount/select actual roll before printing → start only when adequate.
- **Statuses/effects:** No reservation at estimate/waiting; reservation begins at ready-to-print, remains during printing/QC, reduces availability but not on-hand consumption.
- **Recovery:** For shortage, do not force a negative balance; receive/adjust audited stock or change reviewed plan. For stale concurrency, refresh and retry once from current state.
- **Common mistakes:** Reserving during Quote; choosing any matching roll instead of mounted roll; treating reserved grams as consumed.
- **Verify:** one active reservation equals plan, available changes, on-hand/ledger consumption does not, correct roll is named.

### Production execution, depletion, scrap, reprint, cancellation

- **Purpose / owner:** Production owns printer assignment, attempts, actual use, scrap, and transitions; Inventory owns resulting ledger entries.
- **Starting conditions:** Accepted linked Order, adequate reservation, mounted actual roll, printer ready.
- **Operator steps:** Transition `ready_to_print` → `printing` → record attempt/printer/actual grams/time/scrap → complete print to `qc` (not closed) → on failure choose Needs Reprint, preserving attempt and returning to `ready_to_print`; on pass move to `ready_for_fulfillment` → Inventory consumes actual use + scrap once and releases unused reservation. For cancellation, select cancel and record already-used material honestly.
- **Statuses/effects:** Reservation remains through printing/QC. Reprint creates/preserves distinct attempts and a new reservation without erasing actuals. Cancellation releases live reservation; consumed physical material remains consumed. QC pass leaves zero live reservation.
- **Recovery:** If a transition errors, stop, reload job plus inventory ledger, and compare transaction/attempt IDs before retry. Never post a compensating browser-only balance. Follow [inventory discrepancy](ERP_1_0_TROUBLESHOOTING.md#inventory-reservation-or-consumption-discrepancy).
- **Common mistakes:** Closing on print complete; consuming twice; putting scrap in planned use; reversing real consumption on cancellation; losing the first reprint attempt.
- **Verify:** ordered attempt history, mounted roll depleted exactly use+scrap, immutable ledger reconciles, unused release recorded, no negative or active reservation after pass/cancel.

### Completion and closeout

- **Purpose / owner:** Production closes manufacturing; Orders closes fulfillment; Finance closes monetary disposition.
- **Starting conditions:** QC passed, actuals/scrap captured, inventory reconciled, fulfillment complete, customer communication done, balance resolved or explicitly approved not required.
- **Operator steps:** Move Production to `ready_for_fulfillment` → fulfill in Orders → verify Finance disposition → close Production/Order according to existing controls → reload Hub/tracking/Customer 360.
- **Statuses/effects:** Manufacturing/Order reaches `closed`; public tracking reports complete; events/history/assets/actuals remain.
- **Recovery:** Reopen only through an approved correction path; preserve records and document reason. Do not delete a closed row.
- **Common mistakes:** Equating Print Complete with closeout; closing with reservation/open balance; removing assets/history to tidy the job.
- **Verify:** zero reservation, explicit Finance state, complete tracking, retained Q/OP/events/assets/attempts, consistent second-device read.

## Finance Pro

- **Purpose / owner:** Finance owns invoices, receipts, payments, expenses, refunds, reporting, tax, and profitability; it consumes exact Order/Quote snapshots.
- **Starting conditions:** Signed in; exact OP (or independent expense) and supporting evidence.
- **Operator steps:** Search exact OP → compare Order snapshot → create the supported invoice/receipt/payment/refund/expense once → preserve tax/freight/category/reference → reload and reconcile report/balance. Use JSON export on the backup schedule.
- **Statuses/effects:** Durable `financial_entries` and invoice/payment state; never advances manufacturing or inventory.
- **Recovery:** Search before retrying uncertain writes; preserve duplicate evidence and reconcile by audited entries rather than deletion.
- **Common mistakes:** Recalculating Quote totals; importing filament grams as revenue; marking paid without receipt; confusing local JSON with cloud persistence.
- **Verify:** exact OP link, one entry per transaction, correct sign/category/tax/freight, balance/report totals after reload and second device.

## Operator stop rules

Stop and escalate when identity is ambiguous, an acceptance returns no OP, duplicate Orders exist, a ledger would become negative/double-consume, a newer remote record conflicts with recovery data, migration history differs, or private access works anonymously. Preserve IDs, timestamps, screenshots, console/network details, and do not weaken RLS or delete evidence.

