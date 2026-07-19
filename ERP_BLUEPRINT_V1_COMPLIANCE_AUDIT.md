# ERP Blueprint v1 Compliance Audit

**Milestone type:** audit and planning only. No fixes, features, UI changes, schema changes, or migrations were implemented.

**Audit date:** 2026-07-19

**Authoritative Blueprint v1 documents audited against:** `ENGINEERING_ARCHITECTURE.md`, `BUSINESS_EVENT_CONTRACT.md`, `DOMAIN_CONTRACTS.md`, `DATA_OWNERSHIP_MATRIX.md`, `SHARED_SERVICES.md`, `LIFECYCLES.md`, and `ERP_MODULE_MAP.md`.

## Evidence and verification boundaries

- **Confirmed repository evidence** means source files, tests, SQL migrations, or existing docs in this repository.
- **Likely deployed behavior** means behavior implied by application code or migration intent but not verified against a live Supabase project during this audit.
- **Requires deployed-environment verification** means the repository does not prove the live database has the expected tables, constraints, triggers, RPCs, policies, or storage bucket state.
- The audit intentionally does **not** assume deployed Supabase state from migration files alone.


## Classification taxonomy

This audit uses the requested classifications: **Compliant**, **Partially compliant**, **Conflicting**, **Missing**, and **Unable to verify from repository evidence**. `Missing` is used when no current implementation artifact was found for an expected capability; `Unable to verify from repository evidence` is used when application code references deployed database behavior that is not proven by version-controlled migrations or tests.

## Executive summary

The repository shows substantial ERP 1.0/Bridge implementation work and several Blueprint-aligned pieces: a shared `calculateQuoteTotals()` function, public/server quote acceptance path, post-acceptance order workflow migrations, owner-scoped product recipes, private job asset migrations, shared auth helpers, and read-model surfaces such as Hub and Customer 360.

However, Blueprint v1 is stricter than the current implementation in several areas:

1. **Order/Production lifecycle conflict:** recent migrations make `orders.status` the canonical post-acceptance workflow state, while Blueprint v1 assigns manufacturing workflow ownership to Production Control and fulfillment ownership to Orders.
2. **Business events are not yet a canonical durable event service:** events are partly persisted to `project_events`, partly browser-local, and use legacy/non-contract event names and incomplete metadata.
3. **Inventory lifecycle is only partly aligned:** browser-side reservation demand exists, but repository evidence does not confirm authoritative inventory ledger commands for reserve, consume, release, scrap, return, or needs-reprint preservation.
4. **Finance ownership is partially implemented but mixed:** Finance Pro owns `financial_entries`, yet Orders Admin builds invoices, marks invoice-sent fields, and pushes income entries directly.
5. **Supabase authority is mixed with local fallback behavior:** multiple modules use localStorage for drafts/recovery/cache, but some read models and production/quote fallbacks can still blend browser storage with durable records.
6. **RPC/schema evidence is incomplete:** important legacy tables/RPCs such as `quotes`, `orders`, `production_jobs`, `order_tracking_public`, `financial_entries`, `project_events`, and `respond_to_quote_public` are referenced by code but are not fully defined in the current migration set.
7. **Fundraiser Manager is specification-only and mostly Blueprint-aware**, but it remains a deferred capability until schema/RPC/business decisions are made.

## Classification rollup by required audit area

| Area | Classification | Primary action bucket |
| --- | --- | --- |
| Customer & Intake ownership | Partially compliant | Low-risk implementation alignment |
| Production Control ownership | Conflicting | Workflow or data-authority conflict |
| Quote ownership and `calculateQuoteTotals()` authority | Partially compliant | Low-risk implementation alignment |
| Quote acceptance and automatic Order creation | Partially compliant | Schema/RPC investigation required |
| Orders and Fulfillment ownership | Conflicting | Workflow or data-authority conflict |
| Canonical post-acceptance lifecycle | Conflicting | Workflow or data-authority conflict |
| Inventory reservation, consumption, return, and scrap lifecycle | Partially compliant | Schema/RPC investigation required |
| Finance ownership | Partially compliant | Workflow or data-authority conflict |
| Business event vocabulary and persistence | Conflicting | Schema/RPC investigation required |
| Supabase versus browser-storage authority | Partially compliant | Low-risk implementation alignment |
| Authentication and RLS | Partially compliant | Schema/RPC investigation required |
| Job Files / private Asset ownership | Partially compliant | Schema/RPC investigation required |
| Hub, Customer 360, global search, and public tracking as read models | Partially compliant | Low-risk implementation alignment |
| `Q-######` and `OP-######` identity contracts | Partially compliant | Schema/RPC investigation required |
| Retail versus Business/PO behavior | Partially compliant | Low-risk implementation alignment |
| Fundraiser Manager specifications | Partially compliant | Deferred future capability |
| Existing documentation predating Blueprint v1 | Conflicting | Documentation cleanup only |

## Findings: no action required

### NA-01 — Shared quote total function exists

- **Blueprint requirement:** Quote owns customer pricing, and `calculateQuoteTotals()` is the single customer-facing totals engine consumed by quote surfaces, accepted Orders, and Finance handoff.
- **Current implementation evidence:** `js/quote-pricing.js` defines `calculateQuoteTotals(input = {})`, handles manual price, production suggestion, discounts, tax, deposit, balance, and exposes it on `root.calculateQuoteTotals`.
- **Exact repository evidence:** `js/quote-pricing.js`; `tests/quote-totals-unification.test.js`.
- **Compliance classification:** Partially compliant, with this sub-finding requiring no immediate action.
- **Business or technical risk:** Low for the shared helper itself. Remaining risk is whether every consumer uses the stored totals snapshot rather than recalculating.
- **Recommended future correction:** Keep this function as the only Quote total engine. Add contract tests around every customer-facing total surface before future pricing work.
- **Dependencies and suggested order:** Run after schema/RPC evidence is inventoried so tests can assert saved snapshots as well as browser-calculated display totals.
- **Evidence boundary:** Confirmed repository evidence.

### NA-02 — Private job asset contract is represented in migration and UI code

- **Blueprint requirement:** Job files use private Supabase Storage plus owner-scoped metadata and links.
- **Current implementation evidence:** Migration `202607160007_job_asset_management.sql` creates private `job-assets`, `asset_records`, `asset_links`, owner RLS policies, and storage policies. `js/job-assets-ui.js` uploads through private Storage and metadata tables, signs URLs for access, and labels Supabase metadata/private Storage as authoritative.
- **Exact repository evidence:** `supabase/migrations/202607160007_job_asset_management.sql`; `js/job-assets-ui.js`; `js/job-asset-model.js`; `tests/job-asset-model.test.js`.
- **Compliance classification:** Partially compliant, with implementation direction aligned.
- **Business or technical risk:** Medium until deployed storage bucket and policies are verified.
- **Recommended future correction:** Verify live bucket privacy, object policies, metadata table policies, and signed URL behavior in staging.
- **Dependencies and suggested order:** Run after Supabase schema inventory; no app code should change until deployed policy state is confirmed.
- **Evidence boundary:** Confirmed repository evidence for migration/application intent; deployed behavior requires verification.

## Findings: documentation cleanup only

### DOC-01 — ERP 1.0 and Bridge documents predate Blueprint v1 and may conflict with authority ownership

- **Blueprint requirement:** Blueprint v1 documents are authoritative; changes to owner, lifecycle, event meaning, identifier, snapshot rule, or handoff require approved Blueprint updates.
- **Current implementation evidence:** Numerous repository documents describe ERP 1.0 and bridge-pass behavior, including order workflow notes, workflow status dictionaries, and persistence audits. Some documents explicitly describe Orders/Admin or bidirectional sync as authoritative in ways that may predate Blueprint v1.
- **Exact files involved:** `ERP_1_0_WORKFLOW_MAP.md`, `ERP_1_0_STATUS_DICTIONARY.md`, `ERP_BRIDGE_PASS*.md`, `MILESTONE_4B_PERSISTENCE_AUDIT.md`, `MILESTONE_4D_FINAL_PERSISTENCE_AUDIT.md`, `ERP_INTEGRATION_SPRINT1_NOTES.md`.
- **Compliance classification:** Conflicting.
- **Business or technical risk:** Medium. Engineers may follow older docs and reintroduce duplicate authorities or obsolete lifecycles.
- **Recommended future correction:** Create a documentation cleanup milestone that marks pre-Blueprint docs as historical, adds a short deprecation banner, and points readers to the seven Blueprint v1 documents plus this audit.
- **Dependencies and suggested order:** Do after this audit PR; before implementation milestones that touch workflow, events, or data ownership.
- **Evidence boundary:** Confirmed repository evidence.

## Findings: low-risk implementation alignment

### LOW-01 — Customer & Intake ownership is partly represented but not fully bounded

- **Blueprint requirement:** Customer & Intake owns request intake and customer context, but must not estimate, price, reserve inventory, or create accepted Orders. Intake should hand off to Production/Quote through approved commands.
- **Current implementation evidence:** Public intake surfaces (`start-project.html`, public marketing pages) collect customer/project interest. Quote and Production pages also carry customer fields. Customer 360 builds identity from quotes, orders, and production jobs rather than an authoritative customer table.
- **Exact files involved:** `start-project.html`, `quote.html`, `production-control.html`, `customer-360.html`, `js/customer-360.js`.
- **Compliance classification:** Partially compliant.
- **Business or technical risk:** Medium. Customer identity can fragment across duplicated fields and read-model matching logic.
- **Recommended future correction:** Define an approved Customer/Intake persistence command and customer identity read model. Avoid broad customer-table edits until deployed schema is inventoried.
- **Dependencies and suggested order:** First inventory existing customer fields/tables; then create small tests around exact-match Customer 360 behavior; then align intake saves.
- **Evidence boundary:** Confirmed repository evidence for current field duplication/read-model behavior; deployed schema unknown.

### LOW-02 — Quote total use is partly unified but every render path needs snapshot verification

- **Blueprint requirement:** Quote page, Quote PDF, Quote Email, Saved Quote, Public Quote, Accepted Order, and Finance import must consume a totals snapshot from `calculateQuoteTotals()` and not independently calculate customer totals.
- **Current implementation evidence:** Quote code calls `window.calculateQuoteTotals(readQuotePricingInput())`, while persistence saves quote rows through `/rest/v1/quotes`. Orders Admin has its own invoice rendering and `buildInvoiceData()` with subtotal/tax/total logic from order fields. Finance Pro imports/stores entries separately.
- **Exact files/functions involved:** `js/quote-pricing.js::calculateQuoteTotals`, `quote.js::readQuotePricingInput`, `quote.js::acceptAndCreateOrder`, `orders-admin.html::buildInvoiceData`, `finance-pro.js` financial entry handling, `tests/quote-totals-unification.test.js`.
- **Compliance classification:** Partially compliant.
- **Business or technical risk:** High if PDF/email/invoice/Finance handoff diverge by pennies, tax exemption, deposit, or manual override.
- **Recommended future correction:** Add tests that load representative saved snapshots and assert Quote page, public quote, accepted order, invoice rendering, and Finance push use the snapshot without recomputing commercial totals.
- **Dependencies and suggested order:** Depends on schema/RPC inventory for quote/order snapshot columns and live `respond_to_quote_public` behavior.
- **Evidence boundary:** Confirmed repository evidence for shared helper and independent invoice calculation code; deployed behavior requires verification.

### LOW-03 — Supabase authority is stated but localStorage fallback remains broad

- **Blueprint requirement:** Supabase is durable authority. Browser storage may hold drafts, recovery, cache, and preferences only; it must not silently overwrite authoritative records.
- **Current implementation evidence:** `js/authoritative-persistence.js` and `js/supabase-record-store.js` are intended to standardize durable persistence. Several modules still read/write localStorage for production jobs, quote history, inventory, event logs, auth token convenience, closure checks, reorder drafts, and read-model blending.
- **Exact files/functions involved:** `js/erp-core.js::ERP.storage`, `js/erp-core.js::ERP.readProductionJobs`, `quote.js` local quote fallback, `production-control.html` local production job fallback, `customer-360.html::load`, `hub.html` local activity log handling, `orders-admin.html` closure local storage.
- **Compliance classification:** Partially compliant.
- **Business or technical risk:** High where browser fallback appears authoritative after failed cloud writes or read models merge stale local records with Supabase records.
- **Recommended future correction:** Create a browser-state audit milestone that classifies every localStorage key as draft, recovery, cache, preference, credential/session, or prohibited authority; then adjust UX labels and import paths only where needed.
- **Dependencies and suggested order:** Low-risk and can precede schema changes; must not delete recovery behavior without business approval.
- **Evidence boundary:** Confirmed repository evidence.

### LOW-04 — Hub, Customer 360, global search, and tracking are mostly read models but blend sources

- **Blueprint requirement:** Hub, Customer 360, global search, public tracking, and attention cards are read models over authoritative records and events; they should not repair source facts except through explicit commands.
- **Current implementation evidence:** Customer 360 loads `orders`, `quotes`, `production_jobs`, and `project_events`, then dedupes with local quote/job history. Hub reads local inventory and event activity, and searches across local/persisted summaries. Public tracking reads `order_tracking_public`.
- **Exact files involved:** `hub.html`, `js/hub-business-pulse.js`, `customer-360.html`, `js/customer-360.js`, `track.html`, `orders-admin.html` tracking sync code.
- **Compliance classification:** Partially compliant.
- **Business or technical risk:** Medium. Read-model views may display stale or non-authoritative browser facts as if they were durable.
- **Recommended future correction:** Mark local-only data as recovery/cache in read models, and route repairs to owning modules. Add tests that read models do not mutate source-domain facts except through approved commands.
- **Dependencies and suggested order:** After localStorage key classification; before Customer 360 enhancement work.
- **Evidence boundary:** Confirmed repository evidence.

### LOW-05 — Retail versus Business/PO behavior is one Quote path but needs contract tests

- **Blueprint requirement:** There is one Quote system; customer type determines visible fields. Retail uses customer/payment/receipt/pickup-delivery fields. Business uses company/PO/invoice/tax-exempt/billing/shipping fields. Never duplicate pricing engines.
- **Current implementation evidence:** Quote code includes business fields such as `po_number`, tax exemption fields, customer part numbers, and invoice numbers in the same quote save path. Orders Admin invoice and packing-slip rendering has business-mode behavior.
- **Exact files involved:** `quote.html`, `quote.js`, `orders-admin.html`, `customer-360.html`, `tests/quote-customer-workflow.test.js`.
- **Compliance classification:** Partially compliant.
- **Business or technical risk:** Medium. Field visibility and downstream behavior may diverge without tests proving one pricing engine and one quote persistence path.
- **Recommended future correction:** Add Retail/Business fixture tests for Quote save, acceptance, Order snapshot, public quote, invoice, and Finance handoff.
- **Dependencies and suggested order:** After quote snapshot/RPC inventory; before UI additions for customer type.
- **Evidence boundary:** Confirmed repository evidence.

## Findings: workflow or data-authority conflict

### CONFLICT-01 — Orders/Admin is treated as canonical post-acceptance workflow authority, conflicting with Blueprint Production ownership

- **Blueprint requirement:** Production Control owns manufacturing workflow, printer assignment, actual production usage, scrap, and production status. Orders owns fulfillment and post-acceptance order coordination; Orders should not own manufacturing status.
- **Current implementation evidence:** Migration `202607160004_authoritative_bidirectional_workflow.sql` states `orders.status` is the canonical post-acceptance workflow state, adds `set_linked_workflow_status`, syncs Orders to `production_jobs`, and repairs linked rows by choosing the accepted Order as authority.
- **Exact files/functions involved:** `supabase/migrations/202607160004_authoritative_bidirectional_workflow.sql::sync_order_workflow_to_production`, `supabase/migrations/202607160004_authoritative_bidirectional_workflow.sql::set_linked_workflow_status`, `orders-admin.html::syncOrderStatusToProduction`, `js/workflow-status.js`, `tests/bidirectional-workflow-persistence.test.js`.
- **Compliance classification:** Conflicting.
- **Business or technical risk:** High. Manufacturing ownership can split or invert, causing fulfillment screens to drive production state and making Production Control no longer authoritative.
- **Recommended future correction:** Architecture decision required: either update implementation so Production owns manufacturing state and Orders projects it, or formally revise Blueprint. Preferred future correction under current Blueprint: introduce/confirm Production command RPCs for manufacturing transitions and make Orders consume projected production status for fulfillment gating.
- **Dependencies and suggested order:** Must follow live schema/RPC inventory and business decision. Do not patch individual pages first.
- **Evidence boundary:** Confirmed repository evidence for migration intent; deployed trigger/RPC state requires verification.

### CONFLICT-02 — Canonical lifecycle names differ from Blueprint v1

- **Blueprint requirement:** Post-acceptance lifecycle is `ready_to_print` → `printing` → `qc_finishing` → `ready_for_pickup_shipment` → `closed`, with `needs_reprint` returning to `ready_to_print`; print completion does not close the Order.
- **Current implementation evidence:** Migrations constrain accepted Orders to `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`. Legacy status normalization maps `production_complete`/`qc_complete` to `qc` and shipped/delivered states to `ready_for_fulfillment`.
- **Exact files/functions involved:** `supabase/migrations/202607160001_milestone_2a_order_workflow.sql::normalize_accepted_order_status`, `supabase/migrations/202607160002_repair_milestone_2a_order_status.sql`, `supabase/migrations/202607160004_authoritative_bidirectional_workflow.sql::set_linked_workflow_status`, `js/workflow-status.js`, `tests/production-workflow.test.js`.
- **Compliance classification:** Conflicting.
- **Business or technical risk:** Medium-high. Status names encode business meaning; mismatches can break reporting, tracking, event mapping, and future fundraiser/order integrations.
- **Recommended future correction:** Choose canonical storage names. If Blueprint terms remain authoritative, plan a migration/RPC compatibility milestone that maps old names deliberately and updates tests/read models.
- **Dependencies and suggested order:** Requires deployed status value inventory before migration design.
- **Evidence boundary:** Confirmed repository evidence for migration constraints; live rows require verification.

### CONFLICT-03 — Finance ownership is blurred by Orders Admin invoice and Finance push behavior

- **Blueprint requirement:** Finance owns invoices, receipts, payments, refunds, expenses, revenue, reporting, and profitability. Orders consumes Finance projections and does not create duplicate ledgers.
- **Current implementation evidence:** Finance Pro stores and manages `financial_entries`. Orders Admin builds invoice data/email/PDF, marks invoice fields on orders, and pushes split income/shipping/tax rows directly into `financial_entries`.
- **Exact files/functions involved:** `finance-pro.js`, `finance-pro.html`, `orders-admin.html::buildInvoiceData`, `orders-admin.html::markInvoiceSent`, `orders-admin.html::pushOrderToFinance`, `orders-admin.html` `/rest/v1/financial_entries` insert logic.
- **Compliance classification:** Partially compliant with conflict risk.
- **Business or technical risk:** High. Duplicate revenue, invoice state mismatch, payment/invoice ambiguity, and tax-reporting divergence are possible if Orders becomes a ledger writer rather than invoking a Finance command.
- **Recommended future correction:** Define a Finance command/RPC for accepted-obligation import and invoice issuance. Orders should request Finance actions and display returned Finance projections.
- **Dependencies and suggested order:** After deployed `financial_entries` schema/RLS inventory; before payment/refund/invoice expansion.
- **Evidence boundary:** Confirmed repository evidence for direct inserts/patches; deployed Finance policies require verification.

### CONFLICT-04 — Business event vocabulary and persistence are not Blueprint v1-compliant

- **Blueprint requirement:** Business events are immutable, append-only, use lowercase dot-separated contract names, include required metadata (`event_id`, `event_type`, aggregate info, actor, occurred time, schema version, correlation/causation when available), and persist atomically with required business changes.
- **Current implementation evidence:** Orders Admin writes `project_events` with `event_type`, quote/order/project references, details, created_at, and user_id. Shared `ERP.logEvent` writes local browser events named like `production_status_changed` to `olipoly_erp_event_log_v1`. The migration set in this repo does not define `project_events`, its RLS, append-only constraints, metadata columns, or canonical event service functions.
- **Exact files/functions involved:** `orders-admin.html::logProjectEvent`, `js/erp-core.js::ERP.logEvent`, `hub.html` activity log rendering/clearing, `customer-360.html` `project_events` read, `BUSINESS_EVENT_CONTRACT.md`, migrations lacking `project_events` definition.
- **Compliance classification:** Conflicting.
- **Business or technical risk:** High. Audit timelines can be incomplete, mutable, non-atomic, locally cleared, or semantically incompatible with future integrations.
- **Recommended future correction:** Inventory live `project_events`; design an event service table/RPC or compatibility layer; migrate vocabulary deliberately; update all event producers and consumers behind tests.
- **Dependencies and suggested order:** Must follow deployed schema/RPC inventory and event vocabulary mapping.
- **Evidence boundary:** Confirmed repository evidence for current producers; live event table shape requires verification.

## Findings: schema/RPC investigation required

### SCHEMA-01 — Quote acceptance RPC is referenced but not defined in current migrations

- **Blueprint requirement:** Acceptance must atomically record the response, allocate/validate the `OP-######` identity, create exactly one Order, preserve the accepted snapshot, and emit required events, or commit none.
- **Current implementation evidence:** Quote acceptance calls `/rest/v1/rpc/respond_to_quote_public`, saves the cloud quote first, then patches `orders` and `order_tracking_public` statuses and linked production jobs after the RPC returns. The current migration set does not define `respond_to_quote_public`.
- **Exact files/functions involved:** `quote.js::acceptQuoteThroughServer`, `quote.js::acceptAndCreateOrder`, `quote.js::updateLinkedProductionJobAfterAcceptance`, `supabase/migrations` current files.
- **Compliance classification:** Partially compliant; unable to verify atomicity from repository evidence.
- **Business or technical risk:** High. If RPC and follow-up patches are not one transaction, acceptance can partially succeed with mismatched quote/order/tracking/production state.
- **Recommended future correction:** Inspect deployed RPC definition. If necessary, create a reviewed migration that makes acceptance idempotent and atomic, emits required events, and returns the accepted snapshot/order identity.
- **Dependencies and suggested order:** First Supabase schema/RPC dump; then acceptance contract tests; then migration/app alignment.
- **Evidence boundary:** Confirmed app-code evidence; RPC behavior requires deployed verification.

### SCHEMA-02 — `Q-######` and `OP-######` identity allocation is partly inferred

- **Blueprint requirement:** UUIDs are database identities; `Q-######` and `OP-######` are durable human references. Accepted Quote and Order retain the same six-digit suffix. Browser must not fabricate durable IDs.
- **Current implementation evidence:** Quote acceptance derives `orderNumberFromQuote()` as fallback and expects RPC result `order_number`. Bridge notes reference Supabase document counters/RPCs, but current migrations do not define the document counter or ID allocation RPC. Tests cover quote/order unification behavior.
- **Exact files/functions involved:** `quote.js::acceptAndCreateOrder`, `quote.js::orderNumberFromQuote`, `tests/quote-save-order-unification.test.js`, `ERP_BRIDGE_PASS2_NOTES.md`.
- **Compliance classification:** Partially compliant; unable to verify allocation authority.
- **Business or technical risk:** High. Duplicate or fabricated numbers would damage customer communication, fulfillment, finance matching, and public tracking.
- **Recommended future correction:** Verify live ID allocation objects and uniqueness constraints; document the server allocation contract; add concurrent acceptance/idempotency tests.
- **Dependencies and suggested order:** Supabase inventory before implementation.
- **Evidence boundary:** Confirmed repository evidence for fallback/expectation; deployed counters/RPCs require verification.

### SCHEMA-03 — Inventory lifecycle lacks confirmed authoritative ledger/RPC implementation

- **Blueprint requirement:** Inventory owns rolls, materials, reservations, consumption, adjustments, reorder points, returns, and scrap ledgers. Production requests reservation/consume/release/scrap commands at canonical lifecycle points.
- **Current implementation evidence:** Shared browser code computes reservation demand from `material_reservations` on production jobs. Inventory UI exists. Bridge docs describe reservation/consumption timing. The migration set in this repo does not define inventory tables, reservation ledgers, movement RPCs, scrap commands, or RLS policies.
- **Exact files/functions involved:** `inventory-control.html`, `js/inventory-lifecycle.js`, `js/erp-core.js::ERP.reservationDemandByRoll`, `production-control.html` material reservation payloads, `tests/inventory-lifecycle.test.js`, `ERP_BRIDGE_PASS4_NOTES.md`.
- **Compliance classification:** Partially compliant; unable to verify durable authority.
- **Business or technical risk:** High. Stock can be over-reserved, consumed early, released incorrectly, or lose scrap/actual history on reprint.
- **Recommended future correction:** Inventory deployed schema and actual movement behavior. Then design owner-approved Inventory command RPCs and tests for ready-to-print reserve, print complete actuals/scrap, QC pass consume/release, cancel release, needs-reprint preservation.
- **Dependencies and suggested order:** Supabase inventory schema dump; business decision on ledger granularity; migration and app changes only after approval.
- **Evidence boundary:** Confirmed app/test/doc intent; deployed inventory authority requires verification.

### SCHEMA-04 — Authentication/RLS coverage is visible only for newer migrations

- **Blueprint requirement:** Supabase Auth supplies identity and RLS scopes durable owner data. Public endpoints must use allowlisted response shapes.
- **Current implementation evidence:** Auth helper stores and refreshes Supabase tokens. Product recipes and job assets migrations enable RLS with owner policies. Existing referenced tables (`quotes`, `orders`, `production_jobs`, `order_tracking_public`, `financial_entries`, `project_events`) are not fully defined with RLS policies in current migrations.
- **Exact files/functions involved:** `olipoly-auth.js`, `js/olipoly-auth.js`, `finance-pro.js` auth setup, `supabase/migrations/202607160005_product_recipe_library.sql`, `supabase/migrations/202607160007_job_asset_management.sql`, app REST calls to core tables.
- **Compliance classification:** Partially compliant; unable to verify complete RLS.
- **Business or technical risk:** High if core ERP rows are overexposed or public routes leak private customer, cost, asset, or payment data.
- **Recommended future correction:** Export deployed policies/grants/functions for all core tables and public endpoints. Add RLS tests for owner isolation and public allowlists.
- **Dependencies and suggested order:** First schema/RLS inventory; no browser UI changes until security boundaries are confirmed.
- **Evidence boundary:** Confirmed repository evidence for auth helper and new policies; deployed policies require verification.

### SCHEMA-05 — Core Supabase table definitions are incomplete in repository migrations

- **Blueprint requirement:** Durable source records and commands must be verifiable after reload and protected by Supabase constraints/RLS/RPCs.
- **Current implementation evidence:** App code references `quotes`, `orders`, `production_jobs`, `order_tracking_public`, `financial_entries`, `project_events`, `parts_catalog`, `product_recipes`, `asset_records`, and `asset_links`. Current migrations define only product recipes, asset records/links, and workflow alterations/triggers for existing orders/production/quote tables.
- **Exact files involved:** `supabase/migrations/*.sql`, `quote.js`, `orders-admin.html`, `production-control.html`, `finance-pro.js`, `customer-360.html`.
- **Compliance classification:** Unable to verify from repository evidence.
- **Business or technical risk:** High. Application behavior depends on deployed schema not represented in version-controlled migrations.
- **Recommended future correction:** Add a schema/RPC/RLS inventory document generated from staging/production metadata, then backfill version-controlled baseline migrations only with explicit approval and without assuming live state.
- **Dependencies and suggested order:** This should be the first technical investigation milestone after documentation cleanup.
- **Evidence boundary:** Confirmed repository gap; deployed verification required.

## Findings: deferred future capability

### DEFER-01 — Fundraiser Manager specifications are Blueprint-aware but not implemented

- **Blueprint requirement:** Future modules must attach to existing owners through approved commands/events and must not create shadow pricing, inventory, fulfillment, finance, or production authorities.
- **Current implementation evidence:** Fundraiser documents identify RLS, direct-sale order creation questions, Finance allocation, Inventory lifecycle preservation, asset privacy, idempotency, public receipt tokens, and shadow-authority risks. No fundraiser application pages, migrations, or command RPCs were found in the active app files during this audit.
- **Exact files involved:** `FUNDRAISER_MANAGER_SPEC.md`, `FUNDRAISER_DATA_MODEL.md`, `FUNDRAISER_DATA_DICTIONARY_AND_API_CONTRACT.md`, `FUNDRAISER_PERMISSIONS_AND_RLS.md`, `FUNDRAISER_WORKFLOW.md`, `FUNDRAISER_THREAT_MODEL.md`, `IMPLEMENTATION_PHASES.md`.
- **Compliance classification:** Partially compliant as a specification; missing as implementation.
- **Business or technical risk:** Medium now, high if implemented without resolving direct-order, quote requirement, Finance, tax, refund, inventory, and event contracts.
- **Recommended future correction:** Keep Fundraiser Manager deferred until core acceptance/order/inventory/finance/event contracts are corrected or explicitly approved for fundraiser-specific direct-sale commands.
- **Dependencies and suggested order:** Requires business decision on whether fundraiser sales create Quotes or use a direct-order command, plus Finance/tax/refund policy and RLS design.
- **Evidence boundary:** Confirmed repository documentation; no deployed behavior verified.

## Prioritized implementation roadmap

Each milestone below is intentionally small and focused. This audit milestone must stop after creating this document and opening its PR.

### Milestone 1 — Mark pre-Blueprint docs as historical

- **Gap solved:** Prevent old ERP 1.0/Bridge notes from being mistaken for current architecture authority.
- **Requires:** Documentation only.
- **Migration SQL:** No.
- **Tests:** Markdown/link checks and `git diff --check`.
- **Manual browser validation:** No.
- **Explicit business decision:** No, unless a document is still considered authoritative.

### Milestone 2 — Supabase schema/RPC/RLS/storage inventory

- **Gap solved:** Establish repository-visible evidence for deployed tables, policies, triggers, RPCs, grants, buckets, and storage policies.
- **Requires:** Investigation document; no behavior changes.
- **Migration SQL:** No.
- **Tests:** SQL metadata queries saved as evidence; no app tests required.
- **Manual browser validation:** No.
- **Explicit business decision:** Access/approval for staging or production metadata.

### Milestone 3 — Business decision: Production-vs-Orders workflow authority

- **Gap solved:** Resolve conflict between Blueprint Production ownership and current Orders-canonical migrations.
- **Requires:** Architecture decision record.
- **Migration SQL:** No in decision milestone.
- **Tests:** None beyond documentation checks.
- **Manual browser validation:** No.
- **Explicit business decision:** Yes.

### Milestone 4 — Acceptance transaction contract verification

- **Gap solved:** Prove or correct quote acceptance idempotency, OP allocation, snapshot preservation, order creation, tracking projection, and event emission.
- **Requires:** RPC/schema analysis first; likely code and tests; possible migration SQL.
- **Migration SQL:** Likely, if `respond_to_quote_public` is not already compliant.
- **Tests:** Acceptance idempotency, duplicate submission, snapshot immutability, Q/OP suffix match, public/internal acceptance parity.
- **Manual browser validation:** Quote accept, public quote accept, reload, Orders Admin, tracking.
- **Explicit business decision:** Only if direct Orders outside Quotes are permitted.

### Milestone 5 — Event service Blueprint v1 alignment

- **Gap solved:** Replace local/legacy events with canonical durable event persistence and read projections.
- **Requires:** Code, tests, and likely migration SQL/RPC.
- **Migration SQL:** Likely.
- **Tests:** Event vocabulary, required metadata, append-only behavior, idempotent consumers, read-model projection.
- **Manual browser validation:** Hub activity, Customer 360 timeline, quote acceptance, order workflow, payment/invoice actions.
- **Explicit business decision:** Event retention and public projection policy if not already approved.

### Milestone 6 — Inventory lifecycle command design and verification

- **Gap solved:** Make Inventory the durable owner for reserve, consume, release, scrap, return, and reorder ledgers.
- **Requires:** Business process confirmation, code, tests, likely migration SQL/RPC.
- **Migration SQL:** Likely.
- **Tests:** Ready-to-print reservation, print-complete actual/scrap capture, QC pass consume/release, cancel release, needs-reprint preservation.
- **Manual browser validation:** Production Control and Inventory Control flows with staged test materials.
- **Explicit business decision:** Ledger granularity, scrap accounting, and reprint actual handling.

### Milestone 7 — Finance command boundary alignment

- **Gap solved:** Ensure Finance owns invoices, receipts, payments, refunds, expenses, revenue, and reporting while Orders consumes projections.
- **Requires:** Code, tests, likely RPC/migration depending on existing schema.
- **Migration SQL:** Possibly.
- **Tests:** Accepted obligation import, invoice issue/send, payment allocation, duplicate push prevention, refund/write-off handling if supported.
- **Manual browser validation:** Orders Admin finance request, Finance Pro ledger, invoice/PDF/email, Customer 360 finance projection.
- **Explicit business decision:** Tax/refund/write-off/overpayment policy if not already approved.

### Milestone 8 — Browser storage classification and cleanup

- **Gap solved:** Ensure localStorage is limited to drafts, recovery, cache, preferences, and session convenience—not silent authority.
- **Requires:** Code and tests.
- **Migration SQL:** No.
- **Tests:** Recovery import, no automatic overwrite of newer Supabase rows, read-model source labeling.
- **Manual browser validation:** Offline/failed-save recovery, reload, Hub/Customer 360 source display.
- **Explicit business decision:** How long recovery data should be retained.

### Milestone 9 — Retail/Business/PO contract tests

- **Gap solved:** Prove one Quote system with customer-type field differences and one pricing engine.
- **Requires:** Tests and possible small code alignment.
- **Migration SQL:** No unless missing columns are discovered.
- **Tests:** Retail quote, Business/PO quote, tax exempt, invoice terms, acceptance snapshot, Finance handoff.
- **Manual browser validation:** Quote page field behavior and Orders/Admin invoice/packing-slip output.
- **Explicit business decision:** Required/optional Business fields and tax exemption evidence policy.

### Milestone 10 — Fundraiser Manager architecture gate

- **Gap solved:** Decide how fundraiser sales enter the ERP without shadow pricing/order/inventory/finance authority.
- **Requires:** Architecture/design document first; later code/migrations only after approval.
- **Migration SQL:** No in gate milestone; likely in future implementation.
- **Tests:** Contract tests planned but not built in gate milestone.
- **Manual browser validation:** No in gate milestone.
- **Explicit business decision:** Yes: Quote-backed vs direct-order fundraiser contract, payment/refund/tax/proceeds policy, public receipt behavior, organizer permissions.

## Audit checks performed

- Repository file inventory using `find` limited by depth and file type.
- Pattern scans with `rg` for pricing, acceptance, identities, events, Supabase, localStorage, RLS, storage, inventory, finance, and fundraiser terms.
- Manual review of the seven Blueprint v1 documents and the key application/migration/test files cited above.
- No deployed Supabase metadata queries were run, and no browser workflow was manually verified during this audit.
