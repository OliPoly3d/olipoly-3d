# Browser Recovery Authority Audit

**Initiative:** P0 browser recovery authority containment  
**Audited state:** repository `4a6b6fb` plus this focused containment change  
**Scope:** Production Control, Orders Admin, Quote, Inventory Control, Hub, shared auth and persistence helpers. Finance Pro was not changed.

## Authority contract

1. A successful, owner-scoped cloud response—including an empty result—is authoritative.
2. Cloud rows replace browser workflow records; timestamps never allow a browser row to beat a successful response.
3. Recovery is permitted only after a definitive cloud failure. It must be labeled **RECOVERY / OFFLINE DATA**, carry a capture time, and disable authoritative commands.
4. Reconnection replaces recovery state. Recovery data is never automatically uploaded.
5. Drafts contain editable input only. Command-owned lifecycle, acceptance, linkage, payment, Finance, reservation, consumption, correction, and remaining-quantity fields are denied to generic draft/save payloads.
6. Operational caches are versioned, timestamped, source-labelled, owner-scoped, and short-lived. `js/browser-recovery-authority.js` defines the envelope and enforcement primitives. Current legacy raw-array keys remain read-only compatibility inputs until retired.
7. Logout clears operational/recovery caches. A different authenticated user clears them before the new session is persisted. UI preferences may remain.
8. Legacy browser evidence may be displayed or explicitly reviewed, but cannot create a modern Quote/Order/Production linkage.

### Cache lifetime rationale

New operational envelopes use a caller-supplied TTL because acceptable age differs by view: Hub summaries should use minutes; workflow recovery should use no more than one operator session; editable drafts may use days. The helper deliberately has no arbitrary default. A missing TTL is therefore an explicit caller decision, not accidental indefinite validity. Legacy un-enveloped caches fail version inspection and are not eligible for automatic authority-aware hydration.

## Browser persistence registry

“Cloud write” means the browser value can reach a server path today, not that the browser value is authoritative.

| Key / location | Page | Purpose and paths | Class | Workflow status? | Cloud write? | Current risk / disposition |
|---|---|---|---|---:|---:|---|
| `sb_token`, `sb_refresh_token`, `sb_user`, `olipoly_auth_session_v1` / localStorage | shared/all | Auth read/write in `olipoly-auth.js` | session | No | Auth only | **KEEP.** Logout/user change now clears operational caches. |
| `olipoly_production_jobs_v3` / localStorage | Production, Orders production panel, Inventory demand, Hub | Production recovery/cache; written after cloud hydration and commands | RECOVERY ONLY / legacy cache | Yes | Explicit migration/repair formerly possible | **HIGH, CONTAINED.** Successful cloud load replaces it; absent cloud rows become ghosts; offline lifecycle commands are blocked. Explicit import/repair remains operator initiated. |
| Production v1/v2/local, Active Projects keys / localStorage | Production | `migrateLocalJobs()` compatibility reads | LEGACY | Yes | Explicit import/repair only | **READ-ONLY COMPATIBILITY / RETIRE CANDIDATE.** Only estimate/waiting-customer unlinked drafts qualify for explicit migration. Linked/advanced rows are skipped. |
| `olipoly_linked_workflow_recovery_v1` / localStorage | Production | Idempotent pending-command side-effect evidence | RECOVERY ONLY | Yes | Retry of same RPC | **MEDIUM.** Exact id/from/status/`updated_at` match required; cleared after authoritative hydration/command and on logout/user switch. |
| `olipoly_printer_pm_v3`, `olipoly_printer_pm_log_v1` | Production | Maintenance cache/log | CACHE | No production lifecycle | PM save | **MEDIUM.** Separate non-lifecycle domain; explicit repair can sync. |
| `olipoly_production_closeout_audit_v1` | Production | Local audit presentation | CACHE | Display only | No | **KEEP read-only.** Cannot drive lanes. |
| `olipoly_production_to_quote_draft_v1`, `olipoly_production_quote_intent_v2` | Production → Quote | Explicit handoff draft/intent | DRAFT | Pre-acceptance only | Explicit Quote save | **KEEP.** Does not accept/convert. Legacy recovery is neutralized after handoff. |
| `olipoly_workflow_draft_v1`, `olipoly_recipe_repeat_preload_v1` | Hub/Production | New estimate/recipe preload | DRAFT | Initial estimate only | Explicit save | **KEEP.** Cannot establish accepted linkage. |
| `olipoly_order_closure_overrides_v1` | Orders | Closure requirement metadata | UI/metadata cache | Indirect | Metadata RPC | **MEDIUM.** Cleared across auth boundary; does not own `orders.status`. |
| `olipoly_transfer` | Orders | One-time legacy inbound form transfer | LEGACY | Potentially | Explicit save | **MIGRATION-ONLY / RETIRE CANDIDATE.** Removed after read; cannot create Orders (Quote acceptance owns creation). |
| `olipoly_catalog_parts_v1` | Orders | Catalog backup | CACHE | No | Catalog table | **KEEP.** User-scoped key generation; no lifecycle fields. |
| `olipoly_reorder_quote_draft_v1` | Orders/Customer 360 → Quote | Reorder form preload | DRAFT | No accepted state | Explicit Quote save | **KEEP.** New editable quote only. |
| `olipoly_quote_history_v3` | Quote | Failed-save recovery copies | RECOVERY ONLY | Previously included `quoteStatus` | Explicit reviewed save | **HIGH, CONTAINED.** Accepted/conversion/linkage fields are stripped and recovery review does not merge row lifecycle aliases. Cloud library never silently selects recovery. |
| `olipoly_raw_material_inventory_v3` | Inventory, Production costing, Hub | Authoritative-cloud cache / recovery display | RECOVERY ONLY | Inventory authority | Ordinary item save | **HIGH, CONTAINED.** All-table hydration must succeed before cache replacement. Failure makes recovery read-only and drafts are retained separately. |
| `olipoly_finished_goods_inventory_v3`, `olipoly_non_filament_supplies_v1` | Inventory/Production/Hub | Same as raw inventory | RECOVERY ONLY | Inventory quantity | Ordinary item save | **HIGH, CONTAINED** by the same all-table hydration gate. |
| `olipoly_inventory_ledger_v2` | Inventory/Production/Hub | Movement display cache | CACHE/RECOVERY | Consumption evidence | Transaction commands | **HIGH.** Cloud transactions replace cache; recovery cannot reconcile server consumption. Legacy local log remains display/export evidence only. |
| `olipoly_inventory_recovery_review_v1` | Inventory | Failed-save drafts for review/export | RECOVERY ONLY | May contain proposed quantities | Explicit reviewed import | **KEEP.** Never bulk replaces cloud; now cleared across user boundary. |
| Inventory legacy raw/finished/ledger keys | Inventory/Hub | Compatibility reads/import review | LEGACY | Yes | Explicit import only | **READ-ONLY COMPATIBILITY / RETIRE CANDIDATE.** Shape guards reject Production jobs. No automatic cloud promotion. |
| `olipoly_spool_pool_v1` | Inventory/Production | Spool UI cache | CACHE | Inventory support | `spool_pool`/settings | **MEDIUM.** Server primary/fallback are cloud sources; browser is not chosen over successful server data. |
| `olipoly_erp_event_log_v1` | Hub/shared ERP | Read-only recent activity | CACHE | Summary only | No | **KEEP.** Cannot mutate source pages. |
| Production/Orders/Inventory/Finance summary keys read by Hub | Hub | Operational summary/search | CACHE | Display only | No | **MEDIUM.** Hub is explicitly a read-only projection. Existing raw keys lack captured age; versioned Hub summary migration remains follow-up. |
| in-memory `state.jobs`, `orders`, Quote form, Inventory arrays | respective pages | Render state | CACHE/DRAFT | Yes | Commands/forms | **CONTAINED.** Cloud replacement wins; authoritative commands replace/re-read instead of stale-local precedence. |
| `sessionStorage`, `indexedDB`, Cache API | audited repository | No operational uses found in scoped runtime | — | No | No | **NONE FOUND.** |

## Hydration timelines

### Production Control

```text
shared auth ensure/getUser
  → read legacy/local recovery arrays (not rendered as authority)
  → owner-scoped production_jobs query + linked orders query
  ├─ success (including [])
  │    → normalize top-level production_status
  │    → replace state.jobs exactly; quarantine ghosts
  │    → write cache from authoritative state
  │    → refresh authoritative inventory → render
  └─ definitive failure
       → RECOVERY / OFFLINE DATA mode → render recovery
       → lifecycle commands blocked
       → reconnect/load replaces recovery
```

No hydration render triggers auto-save. Explicit backup import and Sync/Repair are the only migration entry points. Lanes use normalized `production_status`; `job_payload.production_status`, `job_status`, and legacy aliases cannot beat a modern top-level cloud field.

### Orders Admin

```text
shared auth ensure/getCurrentUser
  → owner-scoped orders query
  ├─ success → normalize orders.status → replace orders[] → render list/form
  └─ failure → show load error; no local Order fallback render
command → RPC response → replace/re-fetch row → load form → rerender
```

Orders has no local selected-Order authority cache. Normal Save uses `update_order_metadata`, whose client denylist excludes lifecycle/payment/Finance fields. Close and Mark Paid use commands and authoritative responses.

### Quote

```text
shared auth ensure
  → cloud quote-library query
  ├─ success → show cloud rows as authoritative; recovery is review-only
  └─ failure → show Supabase unavailable + recovery count; no automatic draft load
explicit cloud selection → fetch full quote → replace form → render totals snapshot
explicit recovery review → editable fields only; accepted/conversion identity stripped
accept → save commercial snapshot → server acceptance RPC → returned order identity → UI
```

### Inventory Control

```text
shared auth getUser
  → parallel owner-scoped raw/finished/supplies/transactions queries
  ├─ all succeed → replace all browser caches from cloud → render live
  └─ any fails → authorityUnavailable; state.cloud=false
       → browser data labelled recovery → mutation forms retain review drafts only
reconnect → complete all-table hydration → replace recovery → render
```

### Hub

```text
page boot → read browser summary/event caches → label as browser-derived pulse
  → render read-only counts/search/activity
  → source-page authoritative refresh events cause rerender
  → no Hub path writes Production/Order/Quote/Inventory rows
```

Hub currently has no direct multi-domain cloud hydration. It is therefore a convenience summary, never a workflow authority. Raw legacy summaries do not yet expose a reliable capture timestamp; this is documented remaining containment work rather than falsely presenting them as live.

## Dangerous resurrection paths found and disposition

1. **Production merge/newer-local precedence:** older generic persistence chose a newer local timestamp. Production's active `authoritativeHydration` now returns only owner-scoped cloud rows, and `normalizeCloudJob` gives top-level `production_status` precedence. **Contained.**
2. **Production offline command dispatch:** recovery cards could reach lifecycle handlers. `setStatus` now rejects every lifecycle action unless `authorityMode === 'authoritative'`. **Fixed.**
3. **Production generic save lifecycle fields:** `cloudSaveJobUncoordinated` removes `production_status`, order linkage, closeout and usage fields for ordinary edits; commands own lifecycle. **Already contained; regression-covered.**
4. **Quote recovery acceptance resurrection:** recovery records stored and restored `quoteStatus`, and row aliases could re-add it. Recovery now strips status/response/conversion/linkage and review restores editable fields only. **Fixed.**
5. **Inventory partial hydration + old cache edit:** one table failure left `state.cloud` true while old arrays remained available. Failure now exits cloud authority mode; mutation forms retain non-durable review drafts without changing inventory. **Fixed.**
6. **Cross-user operational cache reuse:** auth logout previously removed only tokens. Operational caches now clear on logout and confirmed user-id change. **Fixed.**
7. **Hub raw summaries appear current:** summaries are browser-derived and read-only, but several lack envelope timestamp/age. **Remaining medium presentation risk; cannot mutate workflows.**

## Generic-save field classification

| Save path | Allowed | Denied / command owned |
|---|---|---|
| Production `cloudSaveJob` ordinary update | title, notes, estimates, recipe/planning fields | `production_status`, `order_number`, `closed_at`, actual/usage lifecycle fields |
| Orders `update_order_metadata` | customer, fulfillment detail, tracking and ordinary metadata permitted by RPC | `status`, `payment_status`, `finance_pushed`, acceptance/source identity |
| Quote ordinary save | editable commercial draft and authoritative totals snapshot before acceptance | customer response, accepted/conversion/order/production identity from recovery |
| Inventory item saves | explicit live form edits after complete cloud hydration | consumption/reservation/transaction reconciliation from browser recovery |
| shared `stripCommandOwnedFields` | arbitrary editable fields | canonical lifecycle denylist exported by the helper |

Every audited lifecycle button has one owning RPC boundary. No new database migration was needed; existing server commands and metadata RPCs provide the authority boundary.

## Legacy fallback decisions

* **KEEP:** auth session, UI preferences, catalog cache, read-only event log, explicit new-estimate/reorder drafts.
* **READ-ONLY COMPATIBILITY:** legacy Production and Inventory arrays; local closeout/activity evidence.
* **MIGRATION-ONLY:** `olipoly_transfer`, explicitly reviewed initial Production drafts, explicitly reviewed Inventory recovery exports.
* **RETIRE CANDIDATE:** Active Projects job aliases, Production v1/v2 keys, Inventory v1/v2 aliases, unversioned Hub operational summary reads.

Repository inspection cannot identify bad live rows because no authenticated production database read was performed. Any unlinked advanced-status or identity-conflicting live row requires a separate read-only data audit and explicit repair plan; no cleanup SQL or data rewrite is included.

## Regression matrix mapping

* A–D and H: cloud Production hydration/refresh, cancel ghost removal, QC/pass-QC single dispatch, inventory atomicity, and offline command gates are asserted by the new suite plus existing Production suites.
* E: close RPC response and active-list behavior remain covered by Orders close/authority suites.
* F: Quote recovery lifecycle stripping is asserted here; acceptance remains covered by Quote acceptance suites.
* G: Inventory all-table cloud replacement and read-only failed hydration are asserted here and by Inventory authority suites.
* I: helper recovery mode explicitly disables commands; Production and Inventory runtime gates assert the page wiring.
* J: auth source and regression assertion verify logout/user-change operational clearing; Finance keys are intentionally excluded.

## Manual browser tests required

1. Run A–J against a non-production test tenant using two test users and DevTools storage seeding.
2. For Production, seed cache `ready_to_print` while cloud is `qc`; reload and verify QC lane, then take network offline and verify the recovery label and disabled lifecycle actions.
3. Start Print, Complete Print, Pass QC, Needs Reprint and Cancel once each; verify one RPC in Network and reload after every response.
4. Close and Mark Paid in Orders; verify the returned/re-read row, list membership and refresh persistence.
5. Accept a Quote, leave an older recovery draft, reload and verify the converted cloud quote cannot be reverted by Review Recovery.
6. Consume/release Inventory, seed older browser grams, reload, then simulate one failed table request and verify mutation forms do not change cached authoritative quantities.
7. Log out user A, confirm operational keys are removed, log in as user B, and verify no A records render.
8. Verify Hub summaries remain navigation-only and cannot initiate a lifecycle mutation.

## Deployment and verification status

* **Deployment:** not performed.
* **Live verification:** not performed; manual authenticated browser testing is required above.
* **Database migration:** none.
* **Live data cleanup:** none.
* **Finance:** Finance Pro HTML/JS, Finance RPCs, posting, correction, reporting, and caches were unchanged. Shared auth clearing intentionally excludes every Finance key, so Finance behavior is unchanged by this focused runtime containment.
