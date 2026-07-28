# ERP browser persistence reliability audit

## Scope and root causes

Audited all HTML, shared JavaScript, and Supabase migrations for REST/RPC writes, upserts, load-time migration, retries, browser recovery, and lifecycle handoffs. The Production Control failure had three related causes:

1. `loadAll()` merged every browser record with cloud records and then asynchronously sent every visible row through an upsert. PostgreSQL evaluates the INSERT branch of an upsert against the restrictive initial-state policy, so owned existing rows and local advanced-lifecycle recovery rows could return 403.
2. the global reliability fetch observer treated any successful REST write as proof that the owning workflow succeeded and emitted `Saved to cloud.`; it separately emitted a failure toast for each failed attempt. Production's refresh retry and fallback PATCHes therefore produced contradictory, repeated notifications.
3. the estimate-to-Quote helper lived in the main Production script closure, while the late handoff patch lived in a separate closure. The bare identifier was consequently undefined at runtime even though a same-named function existed elsewhere in the file.

No RLS policy, grant, schema, pricing, finance, inventory, lifecycle rule, or public URL change is required.

## Changes and final behavior

- Production authenticates and loads owner-scoped cloud IDs before migration.
- Each candidate receives a deterministic `update`, `insert`, or `skip` decision. Existing owner-visible IDs use owner-filtered PATCH. Only local `estimate` and `waiting_customer` drafts without an order number use INSERT. Foreign, missing-ID, order-linked, and advanced-state recovery rows remain local and produce one concise console warning.
- Migration candidates are handled at most once per page session. Results produce at most one useful summary; failed records remain in browser recovery.
- Initial INSERT payloads contain only reviewed editable estimate columns. Server-owned lifecycle values inside legacy recovery payloads are not uploaded.
- The generic reliability observer no longer announces success. Owning callers remain responsible for success UI after parsing a successful response. Repeated generic failure notices are deduplicated for five seconds.
- The authoritative pre-acceptance RPC helper is deliberately exported through `OliPolyProductionCommands`; handoff fails closed if that command is unavailable and does not advance local Production state.

## Direct browser write-path audit

Rows group identical operations where a page has several buttons calling the same persistence function.

| File | Function/path | Target | Trigger | Prior risk | Final behavior |
|---|---|---|---|---|---|
| `production-control.html` | `migrateVisibleJobsToCloud` / `cloudSaveJob` | `production_jobs` | authenticated load, explicit repair/import | unconditional upsert invoked INSERT RLS, repeated retry/toasts, advanced recovery upload | owner IDs PATCH; eligible initial drafts INSERT; unsafe/foreign rows skip; session-bounded summary |
| `production-control.html` | `saveJob` / `cloudSaveJob` | `production_jobs` | operator save | upsert obscured insert-vs-update authority | deterministic owner PATCH or initial INSERT; local recovery retained on failure |
| `production-control.html` | `syncPreAcceptanceProductionStatus` | `preacceptance_production_command` RPC | status edit / Quote handoff | correct RPC was inaccessible to late script closure | explicit command export; RPC remains authoritative; failure is fail-closed |
| `production-control.html` | workflow, inventory reservation/consumption helpers | reviewed Production and Inventory RPCs | operator lifecycle commands | direct lifecycle mutation would bypass authority | unchanged: authenticated, idempotency-keyed RPCs own transitions |
| `production-control.html` | raw material, PM, event helpers | `raw_material_inventory`, `printer_pm`, `project_events` | operator actions / bounded PM sync | owner-table upserts; no stricter lifecycle INSERT policy found | unchanged; owner-derived user ID and existing owner RLS apply |
| `production-control.html` | delete draft | `production_jobs` | explicit operator delete | advanced delete could be rejected | unchanged; restrictive RLS permits only initial unlinked drafts |
| `orders-admin.html` | `saveOrder`, invoice/document patches | `orders` | operator action | possible lifecycle mutation through ordinary patch | unchanged: allowlisted ordinary fields only; creation disabled; lifecycle uses RPC |
| `orders-admin.html` | `syncOrderStatusToProduction` | `fulfillment_workflow_command` RPC | explicit close | stale/double transition | unchanged: RPC, expected timestamp, command identity, in-flight guard |
| `orders-admin.html` | finance posting/conversion helpers | finance and campaign conversion RPCs | explicit operator actions | duplicate posting/order creation | unchanged: controlled idempotent RPCs and in-flight guards |
| `js/quote.js` / `quote.html` | `saveCloudQuote`, publish token patches | `quotes` | explicit save/publish | upsert is user action; quote owner INSERT/UPDATE contract is equivalent | unchanged; authenticated user is fetched first and local fallback is labeled non-durable |
| `js/quote.js` / `quote.html` | acceptance/response helpers | quote response/acceptance RPCs | explicit customer/operator action | direct Production lifecycle mutation | unchanged: controlled RPC owns accepted snapshot/order/Production transition |
| `inventory-control.html` | raw/supply/finished save helpers | Inventory owner tables | explicit forms/adjustments | upsert checked against owner policies; no stricter lifecycle INSERT branch | unchanged; authenticated owner ID supplied; failures retain explicitly labeled recovery |
| `inventory-control.html` | spool/settings and authoritative inventory commands | inventory RPCs/settings | explicit actions | duplicated quantity/accounting side effects | unchanged: controlled RPC paths remain authoritative; no load-time browser recovery upload |
| `finance-pro.html` | finance entry commands | finance RPCs | explicit operator actions | duplicate/unauthorized accounting writes | unchanged: authenticated RPC boundary and command identity remain authoritative |
| `js/campaign-manager.js` / `campaign-manager.html` | campaign/product create/update | `campaigns`, `campaign_products` | explicit operator forms | owner mismatch | unchanged: session user ID is supplied and owner RLS applies |
| `js/campaign-manager.js` | review/convert | campaign review/conversion RPCs | explicit operator actions | duplicate conversion / uncontrolled status | unchanged: reviewed idempotent RPC and in-flight UI guard |
| `js/fundraiser-intake.js` | public intake RPC wrapper | public campaign submission RPCs | explicit public submit | direct anonymous table write | unchanged: narrow RPC only; no table write |
| `js/job-assets-ui.js` | upload/metadata/link/archive | Storage, `asset_records`, `asset_links`, manifest RPC | explicit operator action/retry | partial upload/link failure | unchanged: authenticated owner paths, exact cleanup, explicit partial-failure recovery |
| `js/supabase-record-store.js` / `product-recipes.html` | insert/update/import | configured owner table (`product_recipes`) | explicit create/edit/import | automatic recovery upload | unchanged: recovery requires explicit import; create and update are distinct |
| `track.html` | public tracking lookup | `public_order_tracking_lookup` RPC | explicit lookup | listable public table | unchanged: read-shaped narrow RPC only |
| `pay.html` | public tracking lookup | `public_order_tracking_lookup` RPC | explicit lookup | listable public table | unchanged: read-shaped narrow RPC only; no payment mutation |
| `hub.html` | activity clear | browser storage only | explicit operator action | mistaken cloud authority | unchanged: clearly local event-log maintenance |
| `js/erp-reliability.js` | fetch observer | observes REST/Auth traffic | every request | false success and failure-toast flood | no success claims; identical failure notices deduplicated |

## Database/security review

The current migration grants authenticated users owner-scoped SELECT, initial-column INSERT, ordinary-column UPDATE, and restricted DELETE on `production_jobs`. Its INSERT policy permits only `estimate`/`waiting_customer`, forbids an order number and actual production fields, while server-authoritative lifecycle changes remain in SECURITY DEFINER RPCs with fixed search paths. The frontend fix now matches that contract. **No SQL migration, grant, or RLS change was added.**

No browser service-role credential was found. References to `service_role` occur in tests/migrations and describe server-only grants.

## Manual browser verification required

1. Sign in, seed browser recovery with an existing cloud ID plus eligible and advanced local IDs, open Production Control, and inspect Network: the existing ID must use one PATCH, each eligible draft one POST, and advanced/foreign rows no write. Confirm no 403 loop and at most one migration summary.
2. Refresh after migration. Confirm cloud rows load normally, no duplicate INSERT occurs, and no toast flood appears.
3. Open Production Control with no local records. Confirm owner-scoped reads occur and no `production_jobs` write occurs.
4. Sign out and open Production Control with local records. Confirm no internal REST write occurs and local recovery remains available.
5. Create one estimate and one `waiting_customer` draft, save each, refresh, and confirm both persist.
6. Place `quote`, `accepted`, `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`, and `cancelled` recovery records in browser storage. Confirm each remains local and is skipped without an operator toast per row.
7. Promote an estimate to Quote. Confirm the pre-acceptance RPC returns successfully before navigation and Production becomes `waiting_customer`.
8. Simulate an RPC/network failure during handoff. Confirm the Quote recovery draft remains, navigation does not occur, and Production lifecycle does not advance locally.
9. Simulate a failed ordinary save. Confirm recovery remains and no `Saved to cloud.` message appears. Restore connectivity and confirm a successful explicit retry produces only the owning page's success message.
10. Smoke test Orders Admin ordinary edits/close RPC, Quote save/publish/accept, Inventory saves and controlled consumption, Finance posting/corrections, Hub reads/local activity clear, Campaign review/conversion, Track lookup, and Pay lookup. Confirm none writes on load unexpectedly and visible messages match responses.

## Remaining risks / deferred items

- Inventory owner-table upserts are not the Production defect: their INSERT and UPDATE ownership predicates are equivalent and saves are operator-triggered. Converting them without a failing policy contract would be unrelated churn.
- Quote's explicit-save upsert likewise remains within its owner policy and is not load-time migration. A future tightening that makes Quote INSERT stricter than UPDATE must split that path at the same boundary.
- Browser verification against the deployed Supabase project is required because this repository has no production credentials or browser automation fixture. Automated tests validate routing, decisions, payload constraints, messages, and security contracts, not deployed network traffic.
