# ERP Deployed Contract Inventory and Verification

> **Milestone:** ERP Deployed Contract Inventory and Verification  
> **Blueprint:** ERP Blueprint v1  
> **Scope:** Discovery and documentation only. No application behavior, UI, migration, data, Supabase table, RPC, trigger, function, grant, RLS policy, Storage bucket, or deployed data was changed.

## Evidence boundary

- **Confirmed deployed evidence:** operator-supplied deployment verification is recorded only where explicitly labeled, including the 2026-07-20 closeout for migration `202607200001_public_access_ownership_security_hardening.sql`. This repository environment still has no service credentials, SQL connection string, Supabase CLI session, or owner session for independent deployed inspection.
- **Repository-inferred evidence:** migration SQL, browser REST calls, Supabase client calls, tests, architecture documents, recovery/import code paths, and comments in this repository.
- **Important limitation:** a migration file is not proof that the deployed Supabase project contains the object. Every item marked `repository-inferred` remains a deployment-verification gate until read-only metadata confirms it, unless a later operator-supplied deployed verification note explicitly closes that gate.
- **Branch baseline:** the checkout had no `origin` remote and no `main` branch. `git fetch origin main` failed because `origin` was not configured. This document was created on a fresh feature branch from the available `work` branch.

## Repository evidence inspected

### Authoritative Blueprint documents read

- `ENGINEERING_ARCHITECTURE.md`
- `BUSINESS_EVENT_CONTRACT.md`
- `DOMAIN_CONTRACTS.md`
- `DATA_OWNERSHIP_MATRIX.md`
- `SHARED_SERVICES.md`
- `LIFECYCLES.md`
- `ERP_MODULE_MAP.md`
- `ERP_BLUEPRINT_V1_COMPLIANCE_AUDIT.md`
- `AGENTS.md`

### Repository contract surfaces inspected

- Migration SQL under `supabase/migrations/`
- Browser REST calls to `/rest/v1/*`
- Supabase JS client calls to `.from(...)`
- Public RPC calls under `/rest/v1/rpc/*`
- Trigger/function definitions in migration SQL
- RLS and grant definitions in migration SQL
- Storage bucket and Storage object policies in migration SQL
- Tests under `tests/`
- Browser storage, recovery, import, and fallback paths in application HTML/JS
- Public anonymous endpoints: `quote-response.html`, `track.html`, public quote acceptance paths in `quote.js`
- Authenticated owner workflows in Production Control, Orders Admin, Inventory Control, Finance Pro, Product Recipes, and Job Assets
- Fundraiser Manager planning documents

## Inventory status vocabulary

| Status | Meaning |
|---|---|
| Confirmed deployed | Read-only deployed metadata or representative structure was inspected directly. Not available in this milestone. |
| Repository-inferred | Present in migrations, application calls, tests, or docs, but deployment was not verified. |
| Obsolete | Compatibility or archived path still present and not part of the intended Blueprint contract. |
| Unresolved | Referenced or required by application/Blueprint, but repository evidence is incomplete or conflicting. |


## Deployed verification update — 2026-07-19 / hardening milestone 2026-07-20

Direct Supabase verification on 2026-07-19 confirmed the first corrective milestone: **Public Access and Ownership Security Hardening**. Migration `supabase/migrations/202607200001_public_access_ownership_security_hardening.sql` addresses only the confirmed public/ownership gaps below and does not apply itself automatically.

### Confirmed structures and live aggregate findings

| Object | Confirmed deployed finding | Hardening response |
|---|---|---|
| `public.document_counters` | RLS disabled; broad `anon`, `authenticated`, and `service_role` privileges; two rows present; anonymous callers could read and increment global counters through direct table access and executable SECURITY DEFINER RPCs. | Enable RLS, revoke direct browser table access, preserve existing rows, keep atomic allocation through `next_document_counter(text)`, allowlist counter keys, revoke anon/PUBLIC counter RPC execution, and restrict archived `next_quote_invoice_number()` to `service_role`. |
| `public.parts_catalog` | RLS disabled; anon had broad privileges; one row exists with non-null `user_id`; one distinct owner. | Enable RLS, revoke anon access, add owner-scoped authenticated select/insert/update policies using `user_id = auth.uid()`, and avoid delete because active Orders Admin evidence only selects/upserts this compatibility table. |
| `public.project_events` | RLS disabled; anon had broad privileges; 16 rows exist, all with non-null `user_id`; one distinct owner; no append-only protection. | Enable RLS, revoke anon access, add owner-scoped authenticated select/insert only, and intentionally omit normal authenticated update/delete policies to align with the append-only event contract. |
| `public.order_tracking_public` | RLS enabled, but deployed policies `Public can read tracking by lookup` and `order_tracking_public_read_all` granted anonymous SELECT with `USING (true)`; deployed owner policies were named `order_tracking_public_delete_own`, `order_tracking_public_insert_own`, and `order_tracking_public_update_own`; four rows exist, all with non-null `user_id`; rows include order totals, payment links, tracking, PO/invoice data, status, and owner `user_id`; anonymous callers could enumerate all rows. | Drop the exact deployed anonymous and owner-policy names before installing reviewed replacements; remove anonymous direct table reads, keep owner-scoped authenticated write policies for Orders Admin tracking workflows, and introduce `public_order_tracking_lookup(text)` with exact identifier validation, fixed `search_path`, `limit 1`, and an explicit customer-safe field allowlist that omits `user_id`. |

### Confirmed RPCs, grants, triggers, and public read path

- `next_document_counter(text)` and `next_quote_invoice_number()` were confirmed as SECURITY DEFINER RPCs executable by `anon`; the hardening migration revokes `PUBLIC`/`anon` execution from both and grants only the minimum required roles. `next_document_counter(text)` remains executable by authenticated ERP users because active Production Control code allocates quote counters through that RPC. `next_quote_invoice_number()` is referenced only by archived quote tooling in this repository, so browser execution is not preserved.
- The new public read path is `public.public_order_tracking_lookup(tracking_identifier text)`. It accepts only exact `OP-######` identifiers or approved `Q-######` compatibility input normalized to the matching OP number, returns at most one row, and excludes owner/private columns.
- Existing workflow triggers and acceptance/Finance/Inventory authority issues remain out of scope for this milestone and are not corrected by this migration.

### Confirmed private Job Asset security

The private `job-assets` bucket and owner-folder Storage policies were verified as correctly secured during the deployed verification. This milestone intentionally does not change Asset migrations or behavior.

### Deployment and recovery note

Apply the migration before deploying the updated `track.html` client, verify `public_order_tracking_lookup(text)` against a known OP number, then deploy the static client. The old static tracker will temporarily fail after direct anonymous table reads are removed; forward recovery is to deploy the updated client or correct the RPC in a new reviewed migration, not to weaken RLS.

### Remaining unresolved architecture gaps

This hardening milestone does not address quote acceptance behavior, Quote-to-Order linkage, Order/Production workflow authority, Inventory lifecycle, Finance architecture, customer identity, Fundraiser Manager, Product Recipes, Job Assets, or unrelated UI/styling. Those remain separate corrective milestones.


## Deployment closeout — 2026-07-20 Public Access and Ownership Security Hardening

### Repository evidence

- Migration `supabase/migrations/202607200001_public_access_ownership_security_hardening.sql` is the repository artifact for this milestone. It hardens public access and owner-scoped security for `document_counters`, `parts_catalog`, `project_events`, and `order_tracking_public`; replaces anonymous direct tracking table reads with `public.public_order_tracking_lookup(text)`; and keeps the public tracking RPC on an explicit customer-safe allowlist.
- `track.html` now uses `/rest/v1/rpc/public_order_tracking_lookup` for the public tracker instead of directly selecting from `order_tracking_public`.
- This closeout is documentation-only. No application code, migration SQL, data migration, destructive data change, or deployed Supabase state was changed by this documentation update.

### Deployed verification supplied by the operator

The operator reports that migration `202607200001_public_access_ownership_security_hardening.sql` was successfully applied to the deployed Supabase project and manually verified. Supplied verification evidence:

- `public_order_tracking_lookup(text)` successfully returned the customer-safe tracking projection for `OP-000184`.
- The returned projection omitted `user_id` and other non-allowlisted fields.
- The `OP-000184` order was closed and paid, with the expected public status, tracking, PO, invoice, and terms fields.
- The post-deployment `order_tracking_public` security review gate returned zero rows.
- Valid public tracking worked.
- Invalid tracking returned no order.
- Authenticated Orders Admin tracking behavior remained operational.
- Anonymous direct access and cross-owner access checks passed.
- No data migration or destructive data changes were required.

### Still unverified by this repository environment

- This agent did not independently connect to deployed Supabase or inspect live metadata/data because deployed credentials and sessions are not present in the repository environment.
- Browser behavior was not manually exercised by this agent. The public tracking and Orders Admin results above are operator-supplied deployed verification evidence.
- Unrelated Blueprint gaps remain open: quote acceptance behavior, Quote-to-Order linkage, Order/Production workflow authority, Inventory lifecycle, Finance architecture, customer identity, Fundraiser Manager, Product Recipes, Job Assets, and unrelated UI/styling.

## Deployment closeout — 2026-07-20 Public Quote Acceptance Transaction Verification

This closeout is documentation-only and records operator-supplied deployed Supabase evidence. This repository environment did not independently connect to Supabase, mutate deployed data, alter schema/RLS/grants, run live acceptance, or repair historical records.

### Confirmed deployed acceptance behavior

- `public.respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text)` exists as a PL/pgSQL, volatile, `SECURITY DEFINER` RPC with fixed `search_path=public` and `jsonb` return type.
- The RPC validates quote number/public token, accepts only `accepted` or `declined`, derives the Order number by replacing `Q-` with `OP-`, updates Quote response/status and `converted_order_number`, inserts `orders` with `ON CONFLICT (order_number) DO NOTHING`, and upserts `order_tracking_public`.
- The RPC does not populate `orders.source_quote_number`, does not populate `created_from_quote` or `accepted_date`, does not preserve an explicit immutable accepted commercial snapshot, and does not emit `quote.accepted` or `order.created` events.
- All RPC and trigger writes participate in the PostgreSQL function transaction, but the transaction omits required Blueprint state.

### Confirmed grants and access posture

- `get_quote_public` and `respond_to_quote_public` are executable by `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`.
- `set_linked_workflow_status` is executable by `PUBLIC` and `anon` as well as authenticated roles. It is `SECURITY INVOKER`, so deployed RLS currently prevents anonymous mutation.
- `orders` and `order_tracking_public` policies are authenticated-only and owner-scoped. Workflow RPC grants are unnecessarily broad, but are not confirmed anonymous-write bypasses.

### Confirmed deployed records and interpretation

- `Q-000006` is accepted/converted and references `OP-000006`, but no Order exists; its Production job references `Q-000006`/`OP-000006` and is marked `accepted_created_order`.
- `Q-000008` has one correctly linked test Order. The operator confirmed `Q-000006`, `Q-000008`, and most other early rows are historical test/abandoned data, so they are test residue rather than current customer workflow failures.
- `OP-000178` / Rocky-PHM is a direct/manual Order, not Quote-created.
- `OP-000184` / PETG Pocket Door Spacer Clip is marked `created_from_quote` and references missing Quote `Q-000184`; public tracking lookup for `OP-000184` succeeded and both `OP-000178` and `OP-000184` have synchronized closed public tracking rows. Neither has a linked Production row.
- A blank-order-number tracking row titled `500 Toys` is operator-confirmed test/abandoned residue.
- Existing real records cannot prove a complete current end-to-end Quote acceptance transaction.

### Confirmed event and snapshot gaps

- Deployed `project_events` columns are `id`, `user_id`, `project_id`, `quote_number`, `order_number`, `event_type`, `details`, and `created_at`; the Blueprint event envelope fields are absent.
- No `quote.accepted` or `order.created` events were found; matching deployed events were Production lifecycle and `quote_voided` evidence only. Blueprint-compliant acceptance events are Missing/Conflicting.
- `quotes` contains `quote_total` and `quote_data`; `orders` contains `order_total`, `deposit_amount`, `balance_amount`, and `invoice_terms`; no accepted snapshot columns exist. The immutable accepted commercial snapshot is Missing.

### Confirmed constraints, idempotency, and trigger interactions

- `orders.order_number` is globally unique; `orders.source_quote_number` is not unique and has no foreign key; no constraint enforces exactly one Order per accepted Quote.
- `ON CONFLICT (order_number) DO NOTHING` prevents one narrow duplicate case but does not validate ownership/linkage; a pre-existing Order-number collision could cause the RPC to mark the Quote accepted, return the conflicting number, and overwrite its tracking projection. Idempotency is Partially compliant/Conflicting.
- `advance_linked_production_on_quote_acceptance` is `SECURITY DEFINER` and advances `waiting_customer` Production rows to `ready_to_print`. `enforce_accepted_order_status` normalizes legacy statuses. `sync_order_workflow_to_production` is `SECURITY DEFINER` and links/synchronizes Production using `order_number` or `source_quote_number`. Because acceptance does not populate `source_quote_number`, Order-trigger linkage is incomplete unless Production already has the derived order number.
- Root `quote.js` browser follow-up Production/tracking writes remain a conflicting second authority.

### Focused future milestone

The confirmed deployed evidence supports one focused future implementation milestone: **Make `respond_to_quote_public` the sole atomic Quote acceptance authority.** That milestone must address validated permanent Quote→Order linkage, collision-safe and retry-safe idempotency, exactly one Order per accepted Quote, immutable accepted commercial snapshot, required append-only acceptance events, one approved Production handoff path, customer-safe tracking projection, removal of browser acceptance side effects, and least-privilege RPC grants. It should not include speculative unrelated schema, Finance, Inventory, UI, or cleanup work.

## Deployed or repository-inferred contract catalog

### Summary table of found Supabase tables, views, RPCs, functions, triggers, policies, and buckets

| Object | Type | Owning Blueprint domain | Status |
|---|---|---|---|
| `public.quotes` | table | Quote | Repository-inferred; definition unresolved |
| `public.orders` | table | Orders & Fulfillment | Repository-inferred; definition unresolved |
| `public.order_tracking_public` | table/read model | Orders & Fulfillment / Shared public projection | Repository-inferred; definition unresolved |
| `public.production_jobs` | table | Production | Repository-inferred; definition unresolved |
| `public.raw_material_inventory` | table | Inventory | Repository-inferred; definition unresolved |
| `public.finished_goods_inventory` | table | Inventory | Repository-inferred; definition unresolved |
| `public.non_filament_materials` | table | Inventory | Repository-inferred; definition unresolved |
| `public.inventory_transactions` | table/ledger | Inventory | Repository-inferred; definition unresolved |
| `public.inventory_settings` | table/settings | Inventory / Shared preferences | Repository-inferred; definition unresolved |
| `public.inventory_spool_pool` | table/settings | Inventory | Repository-inferred; definition unresolved |
| `public.financial_entries` | table/ledger-like records | Finance | Repository-inferred; definition unresolved |
| `public.project_events` | table/event log | Shared Services / Events | Repository-inferred; definition unresolved |
| `public.product_recipes` | table | Production | Repository-inferred from migrations |
| `public.asset_records` | table | Shared Services / Assets | Repository-inferred from migrations |
| `public.asset_links` | table | Shared Services / Assets | Repository-inferred from migrations |
| `public.document_counters` | table | Shared Services / Identity | Repository-inferred; definition unresolved |
| `public.printer_pm` | table | Production | Repository-inferred; definition unresolved |
| `public.catalog_parts` | table | Orders/catalog compatibility | Repository-inferred; definition unresolved |
| `public.parts_catalog` | table | Orders/catalog compatibility | Repository-inferred; definition unresolved |
| `storage.buckets: job-assets` | private Storage bucket | Shared Services / Assets | Repository-inferred from migration |
| `public.respond_to_quote_public` | RPC | Quote acceptance / Orders handoff | Confirmed deployed; Partially compliant/Conflicting with Blueprint acceptance contract |
| `public.set_linked_workflow_status` | RPC | Orders workflow in current implementation | Repository-inferred from migration |
| `public.next_document_counter` | RPC | Shared Services / Identity | Repository-inferred call; definition unresolved |
| `public.next_quote_invoice_number` | RPC | Quote/Finance document numbering compatibility | Repository-inferred archived call; obsolete/unresolved |
| `public.normalize_accepted_order_status` | function | Orders workflow compatibility | Repository-inferred from migration |
| `public.enforce_accepted_order_status` | trigger function | Orders workflow compatibility | Repository-inferred from migration |
| `public.advance_linked_production_on_quote_acceptance` | trigger function | Quote-to-Production sync | Repository-inferred from migration |
| `public.sync_order_workflow_to_production` | trigger function | Orders-to-Production sync | Repository-inferred from migration; conflicts with Blueprint ownership |
| `orders_normalize_accepted_status` | trigger | Orders workflow compatibility | Repository-inferred from migration |
| `order_tracking_normalize_accepted_status` | trigger | Public tracking compatibility | Repository-inferred from migration |
| `quotes_advance_linked_production` | trigger | Quote-to-Production sync | Repository-inferred from migration |
| `orders_sync_workflow_to_production` | trigger | Orders-to-Production sync | Repository-inferred from migration; conflicts with Blueprint ownership |
| `Users manage own product recipes` | RLS policy | Production recipe ownership | Repository-inferred from migration |
| `asset_records_owner_select` | RLS policy | Assets | Repository-inferred from migration |
| `asset_records_owner_insert` | RLS policy | Assets | Repository-inferred from migration |
| `asset_records_owner_update` | RLS policy | Assets | Repository-inferred from migration |
| `asset_records_owner_delete` | RLS policy | Assets | Repository-inferred from migration |
| `asset_links_owner_all` | RLS policy | Assets | Repository-inferred from migration |
| `job_assets_owner_select` | Storage RLS policy | Assets | Repository-inferred from migration |
| `job_assets_owner_insert` | Storage RLS policy | Assets | Repository-inferred from migration |
| `job_assets_owner_delete` | Storage RLS policy | Assets | Repository-inferred from migration |

## Domain inventories

### 1. Customers and intake records

**Repository-inferred contract:** No authoritative `customers` or `intake_records` table definition was found in the current migrations. Customer facts are duplicated across `quotes`, `orders`, `production_jobs`, public tracking, local browser history, and Customer 360 read-model matching.

| Aspect | Inventory |
|---|---|
| Exact names found | No customer table definition found. Customer fields appear in `quotes`, `orders`, `production_jobs`, `order_tracking_public`, local quote/job storage, and read models. |
| Purpose | Capture customer/contact/project context for Quote, Production, Orders, tracking, and Customer 360. |
| Owning Blueprint domain | Customer & Intake owns customer/contact identity and intake; Quote/Orders/Production should consume sanitized references/snapshots. |
| Primary key | Unresolved. No repository migration defines a customer/intake PK. |
| Stable business identifiers | Unresolved. Customer matching appears field-based by name/email/project identifiers rather than a durable customer ID. |
| Important columns | Repository-inferred field names include customer name/email/phone/company, billing/shipping/PO fields, `quote_number`, `order_number`, and production job customer fields. Exact deployed columns unresolved. |
| Foreign-key relationships | Unresolved. No customer FK relationship is defined in the inspected migrations. |
| Status fields and values | Intake status unresolved. Customer 360 reads source statuses from Quotes, Orders, Production, Finance, and events. |
| Insert/update/delete authority | Unresolved. Browser pages write duplicated customer facts through Quote, Production, and Orders saves. |
| Public vs authenticated access | Public quote response/tracking uses limited quote/order identifiers and public token/order lookup. Authenticated owner pages query full records. |
| RLS behavior | Unresolved. No migration in this repo defines customer/intake RLS. |
| Application files/functions | `quote.js`, `production-control.html`, `orders-admin.html`, `customer-360.html`, `js/customer-360.js`, `track.html`. |
| Relevant migrations | None found for customer/intake. |
| Relevant tests | `tests/customer-360.test.js`, `tests/quote-customer-workflow.test.js`. |
| Blueprint conflict | Customer identity fragmentation risk. Blueprint expects Customer & Intake to own customer/request capture; repository evidence shows duplicated customer facts without an inventoried authority. |

### 2. Production jobs and estimates

| Aspect | Inventory |
|---|---|
| Exact name | `public.production_jobs` table. |
| Purpose | Durable production estimates/jobs, manufacturing snapshots, quote/order linkage, workflow state, actuals, inventory evidence, printer assignment, and Production Control records. |
| Owning Blueprint domain | Production. |
| Primary key | Repository-inferred `id`, likely UUID, because application filters `production_jobs?id=eq...`; exact deployed type unresolved. |
| Stable business identifiers | `quote_number`, `order_number`, job title/project fields; `Q-######`/`OP-######` linkage is repository-inferred but not verified. |
| Important columns | `id`, `user_id`, `quote_number`, `order_number`, `production_status`, `job_payload`, `updated_at`, production estimate/calculation fields, material/color/grams, actual and scrap fields. Exact deployed columns unresolved. |
| Foreign-key relationships | `user_id` owner relationship inferred from queries. No migration confirms FKs. Order/quote linkage is text-key based in migration sync logic. |
| Status fields and values | `production_status`; repository code uses/normalizes `estimate`, `waiting_customer`, `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`, plus legacy names. The authoritative Blueprint v1 lifecycle uses `qc` and `ready_for_fulfillment`. |
| Insert/update/delete authority | Production Control saves, patches, and deletes production jobs. Quote acceptance code and workflow triggers also patch linked production status. |
| Public vs authenticated access | Authenticated owner workflow. Public pages should not expose production/cost/margin; no public direct query found. |
| RLS behavior | Unresolved. No migration here defines `production_jobs` RLS. |
| Application files/functions | `production-control.html` save/load/delete and status flows; `quote.js` linked production updates after acceptance; `orders-admin.html` status sync paths; `js/workflow-status.js`; `js/product-recipe-model.js` can use source production job snapshots. |
| Relevant migrations | `202607160003_persist_production_quote_status.sql`, `202607160004_authoritative_bidirectional_workflow.sql`. |
| Relevant tests | `tests/production-workflow.test.js`, `tests/production-status-persistence.test.js`, `tests/estimate-actual-analytics.test.js`, `tests/bidirectional-workflow-persistence.test.js`. |
| Status | Repository-inferred; deployed schema and triggers unresolved. |
| Blueprint conflict | High. Migration `202607160004` states `orders.status` is canonical post-acceptance and syncs it into Production, while Blueprint says Production owns manufacturing workflow. |

### 3. Quotes

| Aspect | Inventory |
|---|---|
| Exact name | `public.quotes` table. |
| Purpose | Durable customer-facing offer, quote status/response, public token, totals snapshot/source fields, customer fields, Quote document state. |
| Owning Blueprint domain | Quote. |
| Primary key | Unresolved. Application primarily addresses rows by `quote_number`; likely `id` exists but not verified. |
| Stable business identifiers | `quote_number` (`Q-######`), `public_token`; source production linkage inferred. |
| Important columns | `quote_number`, `public_token`, `customer_response`, totals/customer/pricing fields, `updated_at`; exact deployed columns unresolved. |
| Foreign-key relationships | Unresolved. No migration here defines quote FKs. Text linkage to `production_jobs.quote_number` and `orders.source_quote_number` is inferred. |
| Status fields and values | `customer_response` uses values such as `accepted`; public response supports accept/change-request decisions. Full allowed values unresolved. |
| Insert/update/delete authority | Quote page saves/updates quotes; public RPC should own customer response; triggers may advance linked production. |
| Public vs authenticated access | Authenticated quote authoring via anon key plus bearer token; public acceptance through `respond_to_quote_public` with `p_quote_number` and `p_public_token`. Direct public select policy unknown. |
| RLS behavior | Unresolved. No `quotes` RLS migration in this repo. |
| Application files/functions | `quote.js`, `js/quote.js`, `quote-response.html`, archived quote tools. |
| Relevant migrations | `202607160003_persist_production_quote_status.sql` trigger on `quotes`. No table definition found. |
| Relevant tests | `tests/quote-save-order-unification.test.js`, `tests/quote-totals-unification.test.js`, `tests/quote-customer-workflow.test.js`, `tests/release-candidate-acceptance.test.js`. |
| Status | Repository-inferred; deployed table/RLS/RPC behavior unresolved. |
| Blueprint conflict | Quote owns pricing, but application has follow-up acceptance side effects outside the RPC; atomicity/idempotency remain unverified. |

### 4. Quote totals snapshots

| Aspect | Inventory |
|---|---|
| Exact names | `calculateQuoteTotals()` in `js/quote-pricing.js`; storage columns unresolved on `quotes`, `orders`, `financial_entries`, invoice rendering. |
| Purpose | One customer-facing total calculation and immutable accepted total snapshot. |
| Owning Blueprint domain | Quote owns customer totals; Finance consumes accepted snapshots. |
| Primary key | Snapshot row/column contract unresolved. |
| Stable business identifiers | `quote_number` and linked `order_number`. |
| Important columns | Unresolved. Expected commercial fields include subtotal, discount, tax, deposit, balance, total, tax exemption, manual override, quantity. |
| Foreign-key relationships | Unresolved. |
| Status fields | Accepted snapshot should be immutable after acceptance. No deployed constraint verified. |
| Insert/update/delete authority | Quote save/acceptance should write; downstream consumers should not recalculate. Repository evidence shows Orders invoice and Finance import logic can build/write financial values. |
| Public vs authenticated access | Public quote must receive allowlisted totals only. |
| RLS behavior | Unresolved. |
| Application files/functions | `js/quote-pricing.js`, `quote.js`, `orders-admin.html`, `finance-pro.js`, `quote-response.html`. |
| Relevant migrations | None found defining snapshot columns/immutability. |
| Relevant tests | `tests/quote-totals-unification.test.js`. |
| Status | Unresolved repository-inferred contract. |
| Blueprint conflict | Medium-high. Shared calculator exists, but accepted snapshot immutability and downstream no-recalculation are not proved by schema evidence. |

### 5. Public Quote response and acceptance

| Aspect | Inventory |
|---|---|
| Exact name | `public.respond_to_quote_public` RPC. |
| Purpose | Public customer decision endpoint for accepting a quote or requesting changes. Should atomically record response, create/return exactly one Order on acceptance, preserve snapshot, and emit events. |
| Owning Blueprint domain | Quote acceptance service with Orders handoff. |
| Primary key | No internal primary key exposed by the RPC. Input uses `p_quote_number` and `p_public_token`; Order identity is derived by replacing `Q-` with `OP-`. |
| Stable business identifiers | Input `p_quote_number`; returned `order_number`; Quote `converted_order_number` is updated. Deployed RPC does not populate `orders.source_quote_number`. |
| Important parameters/columns | Signature is `respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text)` and return type is `jsonb`. It updates Quote response/status and `converted_order_number`, inserts `orders`, and upserts `order_tracking_public`. |
| Foreign-key relationships | Deployed evidence found no FK on `orders.source_quote_number`; no constraint enforces exactly one Order per accepted Quote. |
| Status fields | Accepts only `accepted` or `declined`; updates Quote response/status; triggers can advance/synchronize Production and normalize Order/tracking statuses. |
| Insert/update/delete authority | RPC writes acceptance state, Order, and tracking projection, but root `quote.js` still performs post-RPC Production/tracking patches. This is a conflicting second authority. |
| Public vs authenticated access | Executable by `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`; public token access is intended, but grant scope is broader than least privilege. |
| RLS behavior | RPC is `SECURITY DEFINER` with fixed `search_path=public`. `orders` and `order_tracking_public` policies are authenticated-only and owner-scoped. Broad `set_linked_workflow_status` grants are not confirmed anonymous-write bypasses because it is `SECURITY INVOKER` and RLS blocks anonymous mutation. |
| Application files/functions | `quote-response.html` calls `rpc('respond_to_quote_public', ...)`; `quote.js` calls `/rest/v1/rpc/respond_to_quote_public` and performs follow-up writes. |
| Relevant migrations | None found for RPC definition; repository migrations define related triggers/RPCs. |
| Relevant tests | `tests/release-candidate-acceptance.test.js`, `tests/quote-save-order-unification.test.js`. |
| Status | Confirmed deployed; Partially compliant/Conflicting. |
| Blueprint conflict | RPC is transactional but omits required permanent Quote→Order linkage, immutable accepted snapshot, acceptance events, complete collision-safe idempotency, exactly-one-Order enforcement, and single handoff authority. |

### 6. Orders

| Aspect | Inventory |
|---|---|
| Exact name | `public.orders` table. |
| Purpose | Accepted work coordination, operational workflow/status in current implementation, fulfillment, communication, customer/payment projection, invoice fields. |
| Owning Blueprint domain | Orders & Fulfillment. Current migrations also make Orders canonical for post-acceptance workflow, conflicting with Blueprint Production ownership. |
| Primary key | Repository-inferred `id`; exact deployed type unresolved. |
| Stable business identifiers | `order_number` (`OP-######`), `source_quote_number`, customer/project identifiers. |
| Important columns | `id`, `user_id`, `order_number`, `source_quote_number`, `status`, `updated_at`, `customer_name`, `customer_email`, payment/invoice/fulfillment fields. Exact deployed columns unresolved. |
| Foreign-key relationships | `user_id` owner inferred. Quote link via `source_quote_number`; no FK verified. |
| Status fields and values | Migration-enforced repository set: `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`. Blueprint v1 uses `qc` and `ready_for_fulfillment`. |
| Insert/update/delete authority | Acceptance RPC creates orders; Orders Admin reads/writes orders; `set_linked_workflow_status` RPC updates status; triggers normalize status. |
| Public vs authenticated access | Authenticated owner workflows query full orders. Public tracking uses separate `order_tracking_public`. |
| RLS behavior | Unresolved. No `orders` RLS migration in this repo. |
| Application files/functions | `orders-admin.html`, `production-control.html`, `quote.js`, `js/workflow-status.js`, `track.html`. |
| Relevant migrations | `202607160001`, `202607160002`, `202607160004`. |
| Relevant tests | `tests/bidirectional-workflow-persistence.test.js`, `tests/production-workflow.test.js`, `tests/quote-save-order-unification.test.js`. |
| Status | Repository-inferred; deployed table/RLS unresolved. |
| Blueprint conflict | High: repository migration declares Orders status canonical post-acceptance. Blueprint assigns manufacturing workflow to Production and fulfillment/closeout to Orders. |

### 7. Quote-to-Order identity linkage

| Aspect | Inventory |
|---|---|
| Exact names | `quotes.quote_number`, `orders.order_number`, `orders.source_quote_number`, `production_jobs.quote_number`, `production_jobs.order_number`, `order_tracking_public.order_number`, `document_counters`, `next_document_counter`. |
| Purpose | Durable human references and permanent linkage between accepted Quote and one Order. |
| Owning Blueprint domain | Shared Services identity allocation; Quote/Orders consume stable IDs. |
| Primary key | UUID PKs unresolved; text identities used by application. |
| Stable business identifiers | `Q-######` and `OP-######`; accepted Quote and Order should share six-digit suffix. |
| Important columns | `quote_number`, `order_number`, `source_quote_number`, counter `key/value`. |
| Foreign-key relationships | No FK/unique constraints verified. |
| Status fields | Acceptance should set quote accepted and order ready to print. |
| Insert/update/delete authority | Server-side counters/RPC should allocate. Production Control calls `next_document_counter`; the browser-side `document_counters` upsert fallback was removed by the 2026-07-20 hardening milestone. Quote acceptance expects RPC `order_number` and has fallback derivation. |
| Public vs authenticated access | Public acceptance should not allocate/fabricate outside RPC. |
| RLS behavior | Unresolved for counters and identity RPC. |
| Application files/functions | `production-control.html` `next_document_counter` and fallback; `quote.js` `orderNumberFromQuote` and acceptance; `orders-admin.html`; tests. |
| Relevant migrations | No counter table/RPC definition found in current migrations. |
| Relevant tests | `tests/quote-save-order-unification.test.js`. |
| Status | Unresolved. |
| Blueprint conflict | High if browser fallbacks allocate durable IDs or if uniqueness/one-order constraints are absent. |

### 8. Canonical workflow status ownership

| Aspect | Inventory |
|---|---|
| Exact names | `orders.status`, `production_jobs.production_status`, `order_tracking_public.status`, `normalize_accepted_order_status`, `set_linked_workflow_status`, `sync_order_workflow_to_production`. |
| Purpose | Persist and synchronize post-acceptance workflow state. |
| Owning Blueprint domain | Production owns manufacturing workflow; Orders owns fulfillment and closeout. Current migration says Orders is canonical. |
| Primary key | Depends on `orders.id` and `production_jobs.id`; unresolved. |
| Stable business identifiers | `order_number`, `source_quote_number`, `quote_number`. |
| Important columns | Status and updated timestamps. |
| Foreign-key relationships | Text-link sync by `order_number` or `source_quote_number`; no FK verified. |
| Status fields and values | Repository set: `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`. Blueprint v1 set: `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`; `needs_reprint` returns to `ready_to_print`. |
| Insert/update/delete authority | `set_linked_workflow_status` updates `orders` and `order_tracking_public`; trigger updates `production_jobs`. Production Control and Orders Admin also have status-related paths. |
| Public vs authenticated access | Public sees tracking projection only. Authenticated owners mutate. |
| RLS behavior | Unresolved. Security invoker/definer semantics partially visible in migrations. |
| Application files/functions | `js/workflow-status.js`, `orders-admin.html`, `production-control.html`, `track.html`. |
| Relevant migrations | `202607160001`, `202607160002`, `202607160003`, `202607160004`. |
| Relevant tests | `tests/bidirectional-workflow-persistence.test.js`, `tests/production-workflow.test.js`, `tests/production-status-persistence.test.js`. |
| Status | Repository-inferred conflict. |
| Blueprint conflict | Blocking architecture conflict: authority is inverted or at least duplicated relative to Blueprint v1. |

### 9. Production-to-Order synchronization

| Aspect | Inventory |
|---|---|
| Exact names | `quotes_advance_linked_production`, `advance_linked_production_on_quote_acceptance`, `orders_sync_workflow_to_production`, `sync_order_workflow_to_production`, `set_linked_workflow_status`. |
| Purpose | Keep Quote acceptance, Order status, public tracking, and Production job status aligned. |
| Owning Blueprint domain | Shared synchronization should not become authority; Production/Orders own their respective commands. |
| Primary key | Uses row triggers; exact PKs unresolved. |
| Stable business identifiers | `quote_number`, `source_quote_number`, `order_number`. |
| Important columns | `quotes.customer_response`, `production_jobs.production_status`, `orders.status`, `order_tracking_public.status`, `updated_at`, `job_payload`. |
| Foreign-key relationships | Text matching in trigger code; no FK verified. |
| Status fields and values | Same as workflow section. |
| Insert/update/delete authority | Trigger `quotes_advance_linked_production` changes waiting production jobs to `ready_to_print` on quote acceptance. Trigger `orders_sync_workflow_to_production` changes production jobs after order status changes. |
| Public vs authenticated access | Public acceptance can cause trigger changes if deployed. Authenticated workflow RPC causes updates. |
| RLS behavior | Security definer trigger functions may bypass normal RLS depending on owner/grants; deployed ownership unresolved. |
| Application files/functions | `quote.js` post-acceptance update, `orders-admin.html`, `production-control.html`, `js/workflow-status.js`. |
| Relevant migrations | `202607160003`, `202607160004`. |
| Relevant tests | `tests/bidirectional-workflow-persistence.test.js`, `tests/production-status-persistence.test.js`. |
| Status | Repository-inferred; recursion/drift duplicate-event behavior unresolved. |
| Blueprint conflict | Current trigger direction makes Orders state update Production state and can duplicate app-side patches. Need deployed trigger/RPC inventory before fixing. |

### 10. Inventory items, rolls, reservations, and transactions

| Aspect | Inventory |
|---|---|
| Exact names | `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, `inventory_settings`, `inventory_spool_pool`; local keys `olipoly_raw_material_inventory_v3`, `olipoly_finished_goods_inventory_v3`, `olipoly_inventory_ledger_v2`, `olipoly_spool_pool_v1`. |
| Purpose | Inventory items/rolls/supplies, availability, settings, spool pool, movement ledger/recovery. |
| Owning Blueprint domain | Inventory. |
| Primary key | Application uses `id` and `user_id`; exact deployed types unresolved. |
| Stable business identifiers | Item/material/color/roll identifiers are application-defined; no durable SKU/lot contract verified. |
| Important columns | For raw/supplies/finished/ledger: item names, material/color, grams/quantities, reserved grams, reorder policy, user_id, updated_at/created_at. Exact deployed columns unresolved. |
| Foreign-key relationships | Owner `user_id` inferred; source job/order references in ledger unresolved. |
| Status fields and values | Inventory transaction type CHECK exists according to comments, but allowed values unresolved. Reorder policy values include `auto` and do-not-reorder style fields. |
| Insert/update/delete authority | Inventory Control reads/writes/deletes/rebuilds cloud inventory. Production Control reads raw/supplies and saves raw material rows for deductions. This may blur Inventory authority. |
| Public vs authenticated access | Authenticated owner workflow; no public direct inventory endpoint should exist. |
| RLS behavior | Unresolved. No inventory table RLS migrations found. |
| Application files/functions | `inventory-control.html`, `production-control.html`, `js/inventory-lifecycle.js`, Hub/search read models. |
| Relevant migrations | None found for these table definitions. |
| Relevant tests | `tests/inventory-lifecycle.test.js`, `tests/printer-dashboard.test.js`, `tests/hub-business-pulse.test.js`. |
| Status | Repository-inferred; authoritative command paths unresolved. |
| Blueprint conflict | Medium-high. Production-side writes and local rebuild/delete paths may bypass an authoritative Inventory command/ledger model. Reservation, consumption, return, release, and scrap command paths are not proved server-authoritative. |

### 11. Finance entries, invoices, receipts, payments, refunds, expenses, and POs

| Aspect | Inventory |
|---|---|
| Exact names | `financial_entries`; invoice/payment/PO fields on `orders`; tax-rate read in Quote from `financial_entries`. No separate deployed `invoices`, `receipts`, `payments`, `refunds`, `expenses`, or `purchase_orders` table definitions found in current migrations. |
| Purpose | Finance Pro ledger-like entries and reports; Orders Admin invoice/PDF/email and push-to-Finance; Quote tax-rate history lookup. |
| Owning Blueprint domain | Finance. |
| Primary key | Application uses `id`, `user_id`; exact deployed type unresolved. |
| Stable business identifiers | Order numbers, invoice numbers, PO numbers, financial entry IDs. |
| Important columns | `type`, `title`, `notes`, `destination_county`, `sales_tax_rate`, `entry_date`, `created_at`, order/invoice/payment fields; exact deployed columns unresolved. |
| Foreign-key relationships | Unresolved. No Finance FKs found. |
| Status fields and values | Payment/invoice statuses exist on Orders/read models; Finance canonical payment/allocation status model unresolved. |
| Insert/update/delete authority | Finance Pro inserts/updates/deletes `financial_entries`. Orders Admin directly inserts split financial entries and marks invoice fields. Quote reads Finance entries for tax-rate choices. |
| Public vs authenticated access | Authenticated owner workflow. Public tracking exposes payment status/link/invoice terms from `order_tracking_public`, not full finance. |
| RLS behavior | Unresolved. No `financial_entries` RLS migration found. |
| Application files/functions | `finance-pro.js`, `orders-admin.html`, `quote.js`, `track.html`, Customer 360/Hub read models. |
| Relevant migrations | None found for Finance tables. |
| Relevant tests | Release and workflow tests; no authoritative Finance allocation model test found. |
| Status | Repository-inferred; deployed schema unresolved. |
| Blueprint conflict | High. Finance lacks an inventoried invoice/receipt/payment/allocation/refund schema, and Orders Admin writes ledger-like entries directly. |

### 12. Business/project events

| Aspect | Inventory |
|---|---|
| Exact names | `project_events`; browser key `olipoly_erp_event_log_v1`; `ERP.logEvent`. |
| Purpose | Project/customer timelines, Hub activity, audit-ish event records. |
| Owning Blueprint domain | Shared Services / Events, with source domains producing events atomically. |
| Primary key | Unresolved. |
| Stable business identifiers | Quote/order/project references in application payloads; no required Blueprint event fields verified. |
| Important columns | Application writes `event_type`, quote/order/project refs, details, `created_at`, `user_id`; exact deployed columns unresolved. |
| Foreign-key relationships | Unresolved. |
| Status fields and values | Current event names include underscore local events and ad hoc project events; Blueprint requires lowercase dot-separated vocabulary. |
| Insert/update/delete authority | Orders Admin and Production Control insert `project_events`; `ERP.logEvent` writes local browser event log. Atomicity with source changes not verified. |
| Public vs authenticated access | Authenticated read in Customer 360/Hub. Public projection unresolved. |
| RLS behavior | Unresolved. No migration defines `project_events` RLS or append-only constraints. |
| Application files/functions | `orders-admin.html`, `production-control.html`, `js/erp-core.js`, `hub.html`, `customer-360.html`, `js/customer-360.js`. |
| Relevant migrations | None found. |
| Relevant tests | `tests/customer-360.test.js`, `tests/hub-business-pulse.test.js`; no complete event vocabulary contract test found. |
| Status | Unresolved repository-inferred. |
| Blueprint conflict | High. Event vocabulary, metadata, append-only behavior, and atomic persistence do not match confirmed Blueprint contract. |

### 13. Product Recipes and immutable revision history

| Aspect | Inventory |
|---|---|
| Exact name | `public.product_recipes`. |
| Purpose | Versioned internal manufacturing recipe snapshots excluding customer contact fields; immutable prior revision history. |
| Owning Blueprint domain | Production. |
| Primary key | `id uuid primary key default gen_random_uuid()`. |
| Stable business identifiers | `recipe_key`, `revision_number`, `revision`, optional `olipoly_part_number`; unique `(user_id, recipe_key, revision_number)`. |
| Important columns | `user_id`, `recipe_key`, `revision_number`, `revision`, `name`, `active`, `default_quantity`, suggested prices, `manufacturing_snapshot`, notes/descriptions, source job/order refs, `supersedes_recipe_id`, `revision_history`, timestamps. |
| Foreign-key relationships | `user_id references auth.users(id) on delete cascade`; `supersedes_recipe_id references product_recipes(id)`. |
| Status fields and values | `active boolean`; revision number > 0. |
| Insert/update/delete authority | Authenticated owner manages own recipes through RLS. Application has local backup fallback. |
| Public vs authenticated access | Authenticated only. Customer fields intentionally excluded. |
| RLS behavior | Policy `Users manage own product recipes` for all using/checking `auth.uid() = user_id`. |
| Application files/functions | `js/product-recipe-model.js`, Product Recipe UI references, Production Control integration. |
| Relevant migrations | `202607160005_product_recipe_library.sql`, `202607160006_product_recipe_revision_history.sql`. |
| Relevant tests | `tests/product-recipe-model.test.js`. |
| Status | Repository-inferred from migration; deployment unresolved. |
| Blueprint conflict | Mostly aligned, pending deployed verification and immutability guarantees for history beyond application discipline. |

### 14. Job Assets, Asset links, private Storage, and signed downloads

| Aspect | Inventory |
|---|---|
| Exact names | `public.asset_records`, `public.asset_links`, Storage bucket `job-assets`. |
| Purpose | Private file metadata, immutable-ish revisions, links from assets to recipes/quotes/orders/production jobs/customers, owner-scoped storage paths, signed downloads. |
| Owning Blueprint domain | Shared Services / Assets. |
| Primary key | `asset_records.id uuid primary key default gen_random_uuid()`; `asset_links.id uuid primary key default gen_random_uuid()`. |
| Stable business identifiers | `storage_path` unique; `revision_group_id` + `revision`; `record_type` + `record_key`; SHA-256 duplicate/revision constraint. |
| Important columns | Asset filename, storage path, MIME, category, size, revision, supersession, description, uploaded metadata, status, designation, SHA-256; links have `asset_revision_id`, `record_type`, `record_key`. |
| Foreign-key relationships | `owner_id references auth.users(id)`; `asset_links.asset_revision_id references asset_records(id)`; self-reference `supersedes_asset_id`. |
| Status fields and values | `asset_records.status in ('active','archived')`; category and designation CHECK values; bucket `public=false`. |
| Insert/update/delete authority | Authenticated owner. Storage policy requires first folder segment equal to `auth.uid()`. |
| Public vs authenticated access | Authenticated only; private bucket. Public quote/tracking must not expose storage paths or signed URLs. |
| RLS behavior | Owner-scoped select/insert/update/delete on metadata; owner-folder select/insert/delete on `storage.objects`; grant metadata DML to authenticated. |
| Application files/functions | `js/job-asset-model.js`, `js/job-assets-ui.js`. |
| Relevant migrations | `202607160007_job_asset_management.sql`. |
| Relevant tests | `tests/job-asset-model.test.js`. |
| Status | Repository-inferred from migration; deployment unresolved. |
| Blueprint conflict | Aligned if deployed exactly and public surfaces never expose paths. Need verify signed URL implementation and update/delete policy effects. |

### 15. Authentication, owner identity, grants, and RLS

| Aspect | Inventory |
|---|---|
| Exact names | Supabase Auth `/auth/v1/user`, `/auth/v1/token`, `/auth/v1/signup`; owner columns `user_id` and `owner_id`; RLS policies listed above; grants on asset tables. |
| Purpose | Owner-scoped authenticated workflows and public anonymous endpoints with least privilege. |
| Owning Blueprint domain | Shared Services / Identity/Auth. |
| Primary key | `auth.users.id`; application stores session token in browser storage. |
| Stable business identifiers | User UUID and email/session. |
| Important columns | `user_id`, `owner_id`, `uploaded_by`, session token local keys. |
| Foreign-key relationships | Product recipes and assets reference `auth.users`. Other table owner FKs unresolved. |
| Status fields | Auth/session state. |
| Insert/update/delete authority | Authenticated owner pages use anon key plus bearer token. Public quote response/tracking use anon key and constrained token/order filters. |
| Public vs authenticated access | Public pages: quote response and tracking. Owner pages: Quote, Production, Orders, Inventory, Finance, Assets. |
| RLS behavior | Only product recipes/assets RLS visible in migrations. All core tables' RLS is unresolved. |
| Application files/functions | `olipoly-auth.js`, `js/olipoly-auth.js`, per-page auth helpers, `finance-pro.js`. |
| Relevant migrations | `202607160005`, `202607160007`; no core grants/RLS migrations found. |
| Relevant tests | Release tests; no comprehensive RLS test found. |
| Status | Partially repository-inferred; core RLS unresolved. |
| Blueprint conflict | Deployment gate. Public endpoints and owner scoping cannot be certified without deployed policy metadata. |

### 16. Hub, Customer 360, global search, public tracking, and payment read models

| Aspect | Inventory |
|---|---|
| Exact names | `order_tracking_public`; `project_events`; read-model code in Hub/Customer 360/search; local caches. |
| Purpose | Non-authoritative projections for tracking, customer history, attention cards, business pulse, and search. |
| Owning Blueprint domain | Shared Services read models; source domains remain authoritative. |
| Primary key | `order_tracking_public` likely keyed by `order_number` because upsert uses `on_conflict=order_number`; exact constraint unresolved. |
| Stable business identifiers | `order_number`, `quote_number`, customer identifiers, project identifiers. |
| Important columns | `order_number`, `order_title`, `status`, `payment_status`, `order_total`, public status text/next step, shipping/pickup note, tracking number, payment links, paid date, PO/invoice fields. |
| Foreign-key relationships | Unresolved; likely text order linkage. |
| Status fields and values | `order_tracking_public.status` constrained by migrations to repository workflow values if deployed. Payment status values unresolved. |
| Insert/update/delete authority | Orders Admin upserts/deletes tracking projection; `set_linked_workflow_status` updates status and public text. Public tracking reads only. |
| Public vs authenticated access | `track.html` anonymous read by order number from `order_tracking_public`. Hub/Customer 360 authenticated plus local reads. |
| RLS behavior | Unresolved. Public read policy must be allowlisted to prevent private exposure. |
| Application files/functions | `track.html`, `orders-admin.html`, `hub.html`, `js/hub-business-pulse.js`, `customer-360.html`, `js/customer-360.js`. |
| Relevant migrations | `202607160001`, `202607160002`, `202607160004` alter/normalize tracking status. |
| Relevant tests | `tests/customer-360.test.js`, `tests/hub-business-pulse.test.js`, `tests/release-1.0.test.js`. |
| Status | Repository-inferred; public RLS unresolved. |
| Blueprint conflict | Medium. Read models blend local and remote sources and public tracking exposes financial/payment-link fields; must verify no private customer, cost, margin, asset, or Finance data leaks. |

### 17. Browser drafts, recovery records, caches, and explicit imports

| Aspect | Inventory |
|---|---|
| Exact names | Many local keys including `olipoly_production_jobs_v3`, `olipoly_raw_material_inventory_v3`, `olipoly_finished_goods_inventory_v3`, `olipoly_inventory_ledger_v2`, `olipoly_spool_pool_v1`, `olipoly_erp_event_log_v1`, Quote history/recovery keys, auth token keys. |
| Purpose | Drafts, backups, recovery imports, preferences, caches, legacy compatibility. |
| Owning Blueprint domain | Browser storage is Shared Services only for drafts/recovery/cache/preferences, never durable authority. |
| Primary key | Browser-generated IDs and stable business identifiers vary by module. |
| Stable business identifiers | Quote/order/job/inventory IDs in browser storage; durability not guaranteed. |
| Important columns | JSON blobs; not schema-enforced. |
| Foreign-key relationships | None. |
| Status fields | Local copies can contain production/order/quote/inventory statuses. |
| Insert/update/delete authority | Browser pages can read/write/import/rebuild/delete local/cloud data. |
| Public vs authenticated access | Browser-local; private to client but can become stale authority in UI if blended. |
| RLS behavior | Not applicable. |
| Application files/functions | `js/erp-core.js`, `js/authoritative-persistence.js`, `js/supabase-record-store.js`, `quote.js`, `production-control.html`, `inventory-control.html`, `orders-admin.html`, Hub/Customer 360. |
| Relevant migrations | None. |
| Relevant tests | `tests/authoritative-persistence.test.js`, `tests/release-1.0.test.js`. |
| Status | Repository-confirmed browser behavior; classification of every key remains a future audit. |
| Blueprint conflict | High where local fallback/rebuild paths can appear authoritative or replace cloud records. Durable business records must not exist only in browser storage. |

### 18. Fundraiser Manager proposed extension points

| Aspect | Inventory |
|---|---|
| Exact names | Proposed fundraiser tables/RPCs are documented but not found in current migrations. Existing extension points: `orders`, `production_jobs`, `financial_entries`, `product_recipes`, `asset_links`, `order_tracking_public`, future idempotent public order transaction. |
| Purpose | Time-bounded catalog, organizer-collected sales, production grouping, settlement, and attribution to real ERP Orders. |
| Owning Blueprint domain | Fundraiser is orchestration only; Orders, Production, Inventory, Finance, Recipes, Assets remain authoritative. |
| Primary key | Proposed only; unresolved. |
| Stable business identifiers | Must create/return real `OP-######` Orders; must not create fake Quotes or shadow Orders. |
| Important columns | Fundraiser campaign/catalog/order-line/settlement attribution proposed in Fundraiser docs; no deployed evidence. |
| Foreign-key relationships | Proposed links to real Orders/Recipes/Assets/Finance; unresolved. |
| Status fields | Proposed fundraiser campaign/sale statuses; unresolved. |
| Insert/update/delete authority | Future public fundraiser submission must use one narrow idempotent server-side transaction. Anonymous clients must not insert into `orders` directly or allocate `OP-` numbers. |
| Public vs authenticated access | Public catalog/submission must be allowlisted; organizer/admin access unresolved. |
| RLS behavior | Fundraiser RLS proposed in docs only; no migration found. |
| Application files/functions | `FUNDRAISER_MANAGER_SPEC.md` and related fundraiser planning docs; no implementation files found in current contract scan. |
| Relevant migrations | None found. |
| Relevant tests | Fundraiser test plan docs only; no executable fundraiser tests found. |
| Status | Proposed/unresolved. |
| Blueprint conflict | Extension point is valid only if it creates standard ERP Orders through an authoritative idempotent order-entry command and never fabricates Quotes/shadow records. |

## Object-by-object unresolved details and deployment-verification gates

### Core tables without repository DDL

The following objects are actively used by application code but do not have table-definition migrations in the inspected migration set:

- `quotes`
- `orders`
- `order_tracking_public`
- `production_jobs`
- `raw_material_inventory`
- `finished_goods_inventory`
- `non_filament_materials`
- `inventory_transactions`
- `inventory_settings`
- `inventory_spool_pool`
- `financial_entries`
- `project_events`
- `document_counters`
- `printer_pm`
- `catalog_parts`
- `parts_catalog`

Each is a deployment-verification gate for primary keys, unique constraints, FKs, allowed status values, RLS, grants, triggers, and public exposure.

### RPCs/functions without repository definitions

- `respond_to_quote_public`: called by public quote response flows; definition absent from current migrations.
- `next_document_counter`: called by Production Control; definition absent from current migrations.
- `next_quote_invoice_number`: referenced in archived quote tool; definition absent and path is likely obsolete.

### Trigger/RPC recursion, drift, and duplicate-event risk

Repository-inferred synchronization has these possible duplicate paths:

1. Public quote acceptance RPC may update Quote/Order and return an Order.
2. `quote.js` performs follow-up patches to linked Production and public tracking after the RPC returns.
3. `quotes_advance_linked_production` may also advance linked Production on `quotes.customer_response` update.
4. `set_linked_workflow_status` updates `orders` and `order_tracking_public`.
5. `orders_sync_workflow_to_production` updates linked Production when `orders.status` changes.
6. Orders Admin and Production Control also contain status/event logging paths.

Without deployed trigger definitions, event table constraints, and current app call-order verification, the risk of recursion, drift, stale overwrites, or duplicate logical events remains unresolved.

## Read-only Supabase verification appendix

Run these only in a read-only SQL editor/session. They inspect metadata and representative structure. Do not run any mutation or DDL.

### Table/view existence and type

```sql
select n.nspname as schema_name,
       c.relname as object_name,
       c.relkind as object_kind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relname in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog',
    'buckets','objects'
  )
order by schema_name, object_name;
```

### Columns, defaults, nullability, and generated expressions

```sql
select table_schema, table_name, ordinal_position, column_name, data_type,
       udt_name, is_nullable, column_default, identity_generation,
       generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog'
  )
order by table_name, ordinal_position;
```

### Primary keys, unique constraints, checks, and foreign keys

```sql
select n.nspname as schema_name,
       c.relname as table_name,
       con.conname as constraint_name,
       con.contype as constraint_type,
       pg_catalog.pg_get_constraintdef(con.oid) as constraint_definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog'
  )
order by c.relname, con.contype, con.conname;
```

### Indexes

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog'
  )
order by tablename, indexname;
```

### RLS enablement and policies

```sql
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog'
  )
order by tablename;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and tablename in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog',
    'objects'
  )
order by schemaname, tablename, policyname;
```

### Grants

```sql
select table_schema, table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and table_name in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','inventory_settings','inventory_spool_pool',
    'financial_entries','project_events','product_recipes','asset_records',
    'asset_links','document_counters','printer_pm','catalog_parts','parts_catalog',
    'objects','buckets'
  )
  and grantee in ('anon','authenticated','service_role')
order by table_schema, table_name, grantee, privilege_type;
```

### RPC/function definitions, volatility, security, and grants

```sql
select n.nspname as schema_name,
       p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       pg_catalog.pg_get_function_result(p.oid) as result_type,
       case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
       p.prosecdef as security_definer,
       pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'respond_to_quote_public','set_linked_workflow_status','next_document_counter',
    'next_quote_invoice_number','normalize_accepted_order_status',
    'enforce_accepted_order_status','advance_linked_production_on_quote_acceptance',
    'sync_order_workflow_to_production'
  )
order by p.proname;

select routine_schema, routine_name, grantee, privilege_type, is_grantable
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'respond_to_quote_public','set_linked_workflow_status','next_document_counter',
    'next_quote_invoice_number','normalize_accepted_order_status',
    'enforce_accepted_order_status','advance_linked_production_on_quote_acceptance',
    'sync_order_workflow_to_production'
  )
order by routine_name, grantee;
```

### Triggers

```sql
select event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'quotes','orders','order_tracking_public','production_jobs',
    'raw_material_inventory','finished_goods_inventory','non_filament_materials',
    'inventory_transactions','financial_entries','project_events'
  )
order by event_object_table, trigger_name, event_manipulation;
```

### Storage bucket and object policy verification

```sql
select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at
from storage.buckets
where id = 'job-assets';

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'job_assets%'
order by policyname;
```

### Representative row-shape checks without exposing full private data

Use `limit 0` to verify row shape only:

```sql
select * from public.quotes limit 0;
select * from public.orders limit 0;
select * from public.order_tracking_public limit 0;
select * from public.production_jobs limit 0;
select * from public.raw_material_inventory limit 0;
select * from public.finished_goods_inventory limit 0;
select * from public.non_filament_materials limit 0;
select * from public.inventory_transactions limit 0;
select * from public.inventory_settings limit 0;
select * from public.inventory_spool_pool limit 0;
select * from public.financial_entries limit 0;
select * from public.project_events limit 0;
select * from public.product_recipes limit 0;
select * from public.asset_records limit 0;
select * from public.asset_links limit 0;
select * from public.document_counters limit 0;
select * from public.printer_pm limit 0;
select * from public.catalog_parts limit 0;
select * from public.parts_catalog limit 0;
```

### Safe aggregate value checks for statuses and event vocabulary

These expose counts only, not row details:

```sql
select status, count(*) from public.orders group by status order by status;
select status, count(*) from public.order_tracking_public group by status order by status;
select production_status, count(*) from public.production_jobs group by production_status order by production_status;
select customer_response, count(*) from public.quotes group by customer_response order by customer_response;
select event_type, count(*) from public.project_events group by event_type order by event_type;
select type, count(*) from public.financial_entries group by type order by type;
```

### One-Order-per-accepted-Quote checks

```sql
select source_quote_number, count(*) as order_count
from public.orders
where source_quote_number is not null
  and source_quote_number <> ''
group by source_quote_number
having count(*) > 1
order by order_count desc, source_quote_number;

select q.quote_number,
       q.customer_response,
       count(o.*) as linked_orders
from public.quotes q
left join public.orders o on o.source_quote_number = q.quote_number
where q.customer_response = 'accepted'
group by q.quote_number, q.customer_response
having count(o.*) <> 1
order by q.quote_number;
```

### Quote/Order suffix linkage checks

```sql
select q.quote_number, o.order_number, o.source_quote_number
from public.orders o
join public.quotes q on q.quote_number = o.source_quote_number
where regexp_replace(q.quote_number, '^Q-', '') is distinct from regexp_replace(o.order_number, '^OP-', '')
order by q.quote_number
limit 100;
```

### Public tracking private-field exposure check

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'order_tracking_public'
  and column_name ~* '(cost|margin|profit|asset|storage|private|internal|email|phone|address|finance|ledger)'
order by column_name;
```

## Required attention on unresolved audit risks

| Audit risk | Evidence-based finding | Gate |
|---|---|---|
| Orders or Production authoritative for post-acceptance status | Repository migration says `orders.status` is canonical and syncs Production; Blueprint says Production owns manufacturing workflow. | Blocking decision after deployed trigger/RPC verification. |
| Status synchronization recursion/drift/duplicate events | Multiple app and trigger paths can update statuses; event atomicity is unresolved. | Inspect deployed triggers/functions and event writes. |
| `respond_to_quote_public` atomic/idempotent | RPC is called but not defined in current migrations. App performs follow-up writes. | Inspect deployed function definition, grants, constraints, and tests. |
| Exactly one Order per accepted Quote | No unique constraint found in repository migrations. | Verify unique/index constraints and duplicate aggregate query. |
| `Q-######` and `OP-######` allocation/linkage | `next_document_counter` and document counters are referenced but not defined; browser fallback exists. | Verify counter table/RPC, uniqueness, and fallback behavior. |
| Accepted totals immutable snapshot | No migration proves snapshot columns or immutability. | Verify columns, constraints/triggers, and downstream reads. |
| Inventory command authority | Inventory REST tables are used directly; Production also writes inventory rows; transaction CHECK unresolved. | Verify inventory schema/RLS and define command paths later. |
| Finance payment/allocation authority | `financial_entries` exists by use, but no invoice/payment/allocation schema found; Orders writes finance entries. | Verify Finance schema and decide Finance command model. |
| `project_events` vocabulary | Table used, but no DDL/vocabulary constraints found; local events use underscore names. | Verify table schema and event values; plan event contract milestone. |
| Durable records only in browser storage | Broad local fallback/rebuild/import paths remain. | Browser-state key classification milestone. |
| Public endpoint privacy | `track.html` reads public tracking fields including totals/payment links/invoice info; public quote RPC/RLS unknown. | Verify policies and response shapes. |
| Fundraiser extension | Planning docs require real Orders through idempotent server transaction; no implementation/migration found. | Defer until Order/identity/RLS contracts are verified. |

## 1. Confirmed contracts safe for future implementation

No deployed contracts are confirmed safe from direct deployed inspection in this milestone.

Repository-inferred contracts that appear structurally safe to use as design inputs, pending deployment verification, are:

1. `product_recipes` as Production-owned recipe snapshots with owner-scoped RLS, if migrations `202607160005` and `202607160006` are deployed exactly.
2. `asset_records`, `asset_links`, and private `job-assets` as Shared Services asset metadata/storage, if migration `202607160007` is deployed exactly and public endpoints do not expose paths or signed URLs.
3. `calculateQuoteTotals()` as the intended single Quote totals engine, pending verification that every persisted/public/downstream surface consumes stored snapshots rather than recalculating.

## 2. Conflicting or duplicated authorities

1. **Workflow authority conflict:** `orders.status` is repository-inferred as canonical post-acceptance workflow authority, while Blueprint v1 assigns manufacturing workflow to Production.
2. **Acceptance side-effect duplication:** public acceptance RPC, app follow-up patches, Quote trigger, Order trigger, and status RPC may all update linked statuses.
3. **Finance authority blur:** Orders Admin directly creates `financial_entries` and invoice state, while Finance should own invoices, receipts, payments, refunds, expenses, and allocations.
4. **Inventory authority blur:** Inventory Control writes inventory directly and Production Control also updates inventory records for deductions, while Inventory should own all stock changes through authoritative commands/ledger.
5. **Event authority/vocabulary conflict:** `project_events` and local event logs are not proven append-only, atomic, or vocabulary-compliant.
6. **Customer identity duplication:** customer facts exist in multiple module rows without a verified Customer & Intake authority.

## 3. Missing contracts

1. Deployed DDL/RLS/grants for core tables: `quotes`, `orders`, `order_tracking_public`, `production_jobs`, inventory tables, `financial_entries`, `project_events`, `document_counters`, `printer_pm`, catalog tables.
2. Deployed RPC definitions/grants for `next_document_counter` and any Finance/Inventory command functions. `respond_to_quote_public` is now operator-confirmed, but its acceptance contract is Partially compliant/Conflicting.
3. Unique one-Order-per-accepted-Quote enforcement.
4. Database-allocated and permanently linked `Q-######`/`OP-######` identity contract.
5. Accepted totals immutable snapshot contract.
6. Finance invoice/payment/allocation/refund/expense/PO authoritative schema.
7. Inventory reservation/consume/return/release/scrap authoritative command and ledger contract.
8. Complete Blueprint v1 `project_events` event vocabulary and append-only metadata contract.
9. Customer/Intake canonical persistence contract.
10. Fundraiser idempotent direct standard-Order creation contract.

## 4. Obsolete compatibility paths

1. Archived quote tools reference legacy RPCs such as `next_quote_invoice_number` and should not be treated as authoritative without explicit revival.
2. Browser localStorage fallbacks and legacy keys preserve recovery/compatibility but are not durable authority.
3. Status normalization maps legacy terms like `in_production`, `post_processing`, `production_complete`, `qc_complete`, `ready`, `shipped`, `delivered`, and `completed`; these are compatibility inputs, not Blueprint v1 canonical statuses.
4. Catalog compatibility tables `catalog_parts` and `parts_catalog` are referenced by Orders Admin but lack inventoried schema/ownership.

## 5. Required deployed verification

Before implementation changes, perform read-only deployed verification for:

1. All core table columns, PKs, FKs, unique constraints, CHECK constraints, indexes, RLS policies, and grants.
2. Future corrective implementation for the confirmed `respond_to_quote_public` gaps: permanent linkage, collision-safe idempotency, immutable snapshot, events, single handoff path, tracking safety, browser side-effect removal, and least-privilege grants.
3. `next_document_counter`/`document_counters` allocation semantics and uniqueness guarantees.
4. Active triggers and whether both Quote-to-Production and Orders-to-Production sync are deployed.
5. Public policies for `order_tracking_public` and RPC access to ensure least-privilege projections.
6. `financial_entries` structure and whether separate Finance invoice/payment/allocation objects exist in deployed schema.
7. `inventory_transactions` CHECK values and whether reservation/consumption/scrap source references are enforced.
8. `project_events` columns and current event vocabulary counts.
9. Storage bucket `job-assets` privacy and owner-folder Storage policies.
10. Whether any durable rows exist only in local browser backups with no matching remote authority.

## 6. Blocking decisions

1. Decide whether Blueprint v1 remains authoritative that Production owns manufacturing workflow. If yes, the current repository-inferred Orders-canonical workflow must be corrected in a later migration/application milestone.
2. Confirm any remaining legacy compatibility mapping while preserving the authoritative Blueprint v1 persisted names (`qc`, `ready_for_fulfillment`).
3. Decide the server-side acceptance contract: one RPC/transaction that owns Quote response, Order creation, identity linkage, snapshot immutability, tracking projection, and event emission.
4. Decide whether Finance will keep `financial_entries` as the only ledger-like table or introduce/verify separate invoice, receipt, payment, allocation, refund, expense, and PO contracts.
5. Decide Inventory command boundaries before touching reservation/consumption/release/scrap behavior.
6. Decide whether Customer & Intake needs a new canonical customer/intake table or a deliberately constrained read model over existing module rows.
7. Decide Fundraiser Manager's entry point only after standard direct Order creation and identity allocation are verified.

## 7. Recommended next single implementation milestone

**Recommended next milestone from the audit roadmap:** perform the audit roadmap's **schema/RPC investigation and deployed verification milestone** before any corrective implementation.

**Reasoning:** the strongest evidence-based blockers are not missing UI or simple code defects; they are unknown deployed contracts for `respond_to_quote_public`, `orders`, `quotes`, identity allocation, RLS, Finance, Inventory, and event persistence. Implementing the workflow, acceptance, Finance, Inventory, or Fundraiser corrections before read-only deployed verification would risk patching against inferred rather than actual production contracts.

**Stop condition:** after deployed verification, choose exactly one corrective implementation milestone based on confirmed deployed facts. Do not begin that implementation automatically from this document.

## Reviewed corrective contract inventory update — repository evidence, not deployed proof (2026-07-20)

A focused corrective migration has been added at `supabase/migrations/202607200002_quote_acceptance_authority.sql`. It has not been applied by Codex and is not evidence that the deployed Supabase project has changed.

When reviewed and deployed, the intended contract is that `respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text)` becomes the single acceptance command for both anonymous public and authenticated internal acceptance. The migration adds compatible event-envelope columns to the legacy `project_events` table, an immutable `quote_accepted_commercial_snapshots` table owned by Quote, a partial unique index for exactly one nonblank `orders.source_quote_number`, least-privilege RPC grants, and an RPC body that handles Order creation/retry/collision checks, snapshot creation, required events, valid Production handoff, and tracking projection in one PostgreSQL transaction.

The migration deliberately avoids historical repair and does not add a Quote foreign key, so known historical anomalies such as OP-000184 referencing a deleted/missing Q-000184 row do not block deployment. Duplicate nonblank `orders.source_quote_number` rows remain a hard preflight stop because the uniqueness contract cannot be safely enforced until those rows are reviewed outside this milestone.

Browser inventory is updated accordingly: root `quote.js` and legacy `js/quote.js` now call the RPC for acceptance and do not perform acceptance-time writes to Orders, Production, tracking, or events after the RPC.

## Deployed snapshot security repair closeout — operator evidence (2026-07-20)

Operator-supplied deployed evidence records that the new `quote_accepted_commercial_snapshots` table from the quote acceptance authority migration was initially deployed with row level security disabled, and that `anon` and `authenticated` inherited broad table privileges from the default Supabase grant posture.

The operator immediately applied and verified the deployed security repair. The deployed table now has RLS enabled, and `PUBLIC`, `anon`, and `authenticated` have no direct table privileges on `quote_accepted_commercial_snapshots`. Snapshot creation remains internal to the SECURITY DEFINER acceptance RPC; no browser policies are part of the deployed contract.

The operator also verified that the duplicate source-Quote check and the duplicate acceptance-event check returned no rows. Repository migration `supabase/migrations/202607200003_quote_accepted_snapshot_security.sql` is therefore a forward-only synchronization of already-applied deployed state, not a Codex deployment action.

## 202607200004 planned corrective contract inventory update

Repository evidence now includes `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql` as a forward-only corrective migration for the confirmed deployed Quote acceptance issues. Codex did **not** apply or deploy this migration.

Planned contract after reviewed deployment: `respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text)` remains the only public/internal Quote acceptance command. First acceptance must create or reuse exactly one validated Order, persist the immutable accepted snapshot, emit exactly-once `quote.accepted` and `order.created` events, initialize customer-safe tracking projection, and perform the sole acceptance-time Production handoff. Accepted idempotent retries that already have the required Order, snapshot, and events must return the same `order_number` without updating Quote, Order, snapshot, tracking, Production, events, accepted/responded timestamps, or `updated_at`.

The planned corrective migration retires the overlapping `quotes_advance_linked_production` trigger while preserving `orders_sync_workflow_to_production` for normal post-acceptance Order workflow synchronization. It does not repair historical records, redesign UI, modify Finance or Inventory, deploy data changes, or broaden access to `quote_accepted_commercial_snapshots`.

## Repository update — 2026-07-20 Quote Acceptance Runtime Safety correction

Migration `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql` was merged as repository evidence but was **not deployed**. Review found transaction, payment-ownership, response-vocabulary, fulfillment, causation, and tracking-idempotency defects, so it must not be deployed as written.

Migration `supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql` supersedes `202607200004` for deployment. The correction preserves the intended forward-only acceptance authority milestone while adding explicit transaction boundaries, an UPDATE-only Order workflow trigger contract, exact `Q-######` Quote identity validation, strict commercial value validation, due/unpaid payment semantics, deployed compatibility normalization to `change_requested`, constrained fulfillment projection, durable event-ID causation, and tracking `DO NOTHING` idempotency.

Neither Codex nor this milestone deployed SQL, applied migrations, modified deployed data, or repaired historical records. The deployed contract remains unchanged until an operator applies a reviewed migration through the normal deployment process. After deployment, `respond_to_quote_public` is intended to be the sole initial acceptance-time Production handoff; `orders_sync_workflow_to_production` should synchronize only post-acceptance Order status updates.

## Repository update — 2026-07-20 migration-chain neutralization for 202607200004

Migration `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql` was merged as repository evidence but was never deployed. Before any migration runner executed it, review found it unsafe, and this PR neutralizes it as a transaction-safe no-op supersession marker.

`supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql` supersedes `202607200004` and is the only runtime deployment artifact for the Quote acceptance runtime-safety correction. Existing deployed databases that manually applied `202607200002` and `202607200003` should apply only `202607200005`; fresh/sequential environments may safely execute the no-op `202607200004` marker and then `202607200005`.

No deployed SQL was run by Codex in this milestone, and no deployed data was modified or repaired.

## Deployment closeout — 2026-07-20 Quote Acceptance Runtime Safety

This documentation-only closeout records operator-supplied deployed evidence for the Quote Acceptance Runtime Safety milestone. Codex did not reopen or redesign the implementation, deploy SQL, modify application code, create another migration, alter schema/RLS/grants/functions/triggers, mutate deployed data, or repair historical records.

### Deployment status

- Migration `202607200002_quote_acceptance_authority.sql` was applied.
- Migration `202607200003_quote_accepted_snapshot_security.sql` was applied.
- Migration `202607200004_quote_acceptance_runtime_correctness.sql` was neutralized in source control as a no-op.
- Migration `202607200005_quote_acceptance_runtime_safety.sql` was successfully applied.
- The `202607200005` transaction completed successfully.
- No historical Quote, Order, Production, tracking, snapshot, or event repair was performed.

### Operator-supplied preflight evidence

- `duplicate_source_quotes = 0`.
- `duplicate_events = 0`.
- Snapshot RLS was enabled.
- `anon` and `authenticated` could not read accepted commercial snapshots.
- `PUBLIC` could not execute `respond_to_quote_public`.
- `anon` could execute the token-protected `respond_to_quote_public`.
- The deployed fulfillment constraint allowed only `pickup`, `delivery`, and `shipping`.
- Before `202607200005`, `orders_sync_workflow_to_production` still fired on `INSERT OR UPDATE`.
- Before `202607200005`, `quotes_advance_linked_production` was already absent. This records only the observed deployed state and does not speculate about how or when it was removed.

### Operator-supplied post-deployment verification evidence

| Verification item | Operator-supplied result |
|---|---:|
| `anon_can_accept` | `true` |
| `public_can_accept` | `false` |
| `rpc_security_definer` | `true` |
| `rpc_search_path` | `public, pg_temp` |
| `rpc_has_quote_lock` | `true` |
| `rpc_validates_quote_identity` | `true` |
| `rpc_uses_deposit_due` | `true` |
| `rpc_maps_change_requested` | `true` |
| `rpc_uses_real_event_causation` | `true` |
| `snapshot_rls_enabled` | `true` |
| `anon_can_read_snapshots` | `false` |
| `authenticated_can_read_snapshots` | `false` |
| `duplicate_source_quotes` | `0` |
| `duplicate_events` | `0` |
| `quote_trigger_removed` | `true` |
| `order_trigger_has_insert` | `false` |

Deployed Order trigger definition:

```sql
CREATE TRIGGER orders_sync_workflow_to_production
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN ((old.status IS DISTINCT FROM new.status))
EXECUTE FUNCTION sync_order_workflow_to_production()
```

### Deployed database contract classification

The deployed database contract is now classified as **Compliant** for the following Quote acceptance runtime-safety contract areas:

- least-privilege public acceptance execution;
- fixed `SECURITY DEFINER` search path;
- Quote-row locking;
- exact Quote identity validation;
- exactly-one source Quote uniqueness prerequisite;
- protected immutable snapshot storage;
- Finance-safe `deposit_due`/unpaid projection;
- canonical change-request handling;
- durable event causation;
- RPC-only initial Production handoff;
- update-only post-acceptance Order workflow synchronization.

### Manual browser verification status

Manual browser verification remains **pending, not passed**. The following operator tests are still required before end-to-end browser behavior can be closed:

- fresh Quote acceptance;
- returned `OP-######` identity;
- exactly one Order;
- immutable snapshot contents;
- exactly-once `quote.accepted` and `order.created` events;
- tracking projection;
- Production handoff;
- repeated acceptance returning the same Order without writes;
- Request Changes creating no Order;
- network confirmation that browser clients perform no acceptance side-effect writes.

The database deployment is verified from operator-supplied deployed evidence. Full end-to-end browser behavior remains pending operator testing and must not be claimed as passed until those browser checks are actually performed.

## Production vs. Orders Workflow Authority Verification closeout — 2026-07-20

> **Scope:** Documentation-only deployed evidence closeout. No functionality, migration, application/UI code, tests, deployed Supabase objects, or historical data were changed.

### Confirmed deployed function and trigger evidence

- `public.normalize_accepted_order_status(text)` is deployed as `SECURITY INVOKER` and `IMMUTABLE`. It maps manufacturing and legacy aliases into the accepted Order statuses, defaults unknown values to `ready_to_print`, and grants `EXECUTE` to `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`.
- `public.set_linked_workflow_status(text, text, timestamptz)` is deployed as `SECURITY INVOKER` with `search_path=public`. It is executable by `authenticated`, `postgres`, and `service_role`; accepts `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, and `closed`; locks and updates `orders`; then directly updates `order_tracking_public`. Its optimistic concurrency check is optional and is bypassed when the expected timestamp is null. It does not enforce domain-specific transition ownership or legal transition edges.
- `public.sync_order_workflow_to_production()` is deployed as `SECURITY DEFINER` with `search_path=public`. It grants `EXECUTE` to `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role`; blindly copies changed `orders.status` into linked `production_jobs.production_status`; and can overwrite Production state, including backward movement or closure, without a Production-owned command.
- The deployed Orders trigger is limited to changed status updates:

```sql
CREATE TRIGGER orders_sync_workflow_to_production
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN ((old.status IS DISTINCT FROM new.status))
EXECUTE FUNCTION sync_order_workflow_to_production()
```

- Orders and `order_tracking_public` normalize status on `INSERT` and `UPDATE`.
- Orders, tracking, and Production have `updated_at` triggers.
- The retired Quote acceptance trigger is absent.

### Confirmed deployed RLS, grant, and policy evidence

- RLS is enabled on `orders`, `production_jobs`, and `order_tracking_public`.
- Owner isolation is present.
- Authenticated owners retain direct CRUD capability on all three tables.
- Orders and Production have broad browser table grants.
- Production has duplicate owner CRUD policy sets.
- Anonymous table grants exist on Orders and Production, although deployed RLS owner checks prevent ordinary anonymous row access.
- Direct authenticated table writes can bypass the intended workflow command boundary.
- Public tracking is not technically enforced as projection-only because authenticated owners can write it directly.

### Confirmed deployed data evidence

- `order_tracking_public`: `closed=3`, `ready_to_print=1`.
- `orders`: `closed=3`.
- `production_jobs`: `closed=23`, `estimate=2`, `ready_to_print=3`.
- No current `printing`, `qc`, or `ready_for_fulfillment` records exist.
- The focused linked-record mismatch query returned no rows.
- Current linked records are consistent, but live workflow handoff behavior cannot be verified from current data.
- Confirmed real Orders:
  - `OP-000178`, Rocky-PHM, direct/manual Order, `closed`, with matching tracking and no Production job.
  - `OP-000184`, PETG Pocket Door Spacer Clip, source Quote `Q-000184`, `created_from_quote=true`, `closed`, with matching tracking and no Production job.

### Historical/test/abandoned records

The operator confirmed that the following Production rows reference absent Orders and are historical/test/abandoned evidence:

- `OP-000006` / `Q-000006`
- `OP-000002` / `Q-000002`
- `OP-805877` / `Q-805877`
- `OP-000005` / `Q-000005`

This milestone does not propose deleting, repairing, backfilling, or otherwise cleaning them.

### Manufacturing-actuals deployed data-integrity check

- The first query produced five early-state rows only because `actual_filaments` and `actual_filament_usage` contain empty JSON arrays rather than empty objects.
- The corrected query treated both empty arrays and empty objects as empty.
- The corrected query returned no rows.
- Therefore, no current `estimate`, `waiting_customer`, or `ready_to_print` Production job retains nonempty manufacturing actuals, start timestamps, or completion timestamps.

Classification: **Compliant**.

### Event evidence

- `project_events` contains the full Blueprint envelope columns: `event_id`, `occurred_at`, `aggregate_type`, `aggregate_id`, `actor_type`, `actor_id`, `correlation_id`, `causation_id`, `schema_version`, and `payload`.
- All 16 existing events are legacy pre-envelope records: `production_closed=1`, `production_job_canceled=8`, `production_status_changed=3`, and `quote_voided=4`.
- All 16 have null envelope fields.
- The non-null `event_id` duplicate query returned no rows.
- Null legacy event IDs are not characterized as duplicate IDs.
- No envelope-format events currently exist.
- Historical event evidence is **Partially compliant**.
- Existing envelope completeness is **Missing**.
- Duplicate assigned event identities were not found.
- Current runtime event-envelope emission is **Unable to verify** because no new workflow transition has been performed since the contract was introduced.

### Closeout classifications

| Area | Classification |
|---|---|
| Owner isolation | Compliant |
| Current linked-record status consistency | Compliant |
| Early-state Production jobs retaining manufacturing actuals | Compliant; none found |
| Least-privilege table/function grants | Partially compliant |
| Production policy duplication | Partially compliant |
| Workflow command boundary | Conflicting |
| Production ownership of printing, qc, reprint, and manufacturing actuals | Conflicting |
| Orders/Fulfillment ownership of ready_for_fulfillment and closed | Conflicting or not technically enforced |
| Public tracking as projection-only | Conflicting |
| Optional optimistic concurrency enforcement | Partially compliant |
| Historical event evidence | Partially compliant |
| Blueprint event-envelope completeness for existing records | Missing |
| Duplicate non-null event IDs | Compliant; none found |
| Current runtime workflow event emission | Unable to verify |
| Live Production-to-Fulfillment handoff behavior | Unable to verify because no active real linked workflow exists |

### Decision gate and next milestone

The deployed workflow authority is **not Blueprint-compliant**, even though current linked rows are consistent. The primary conflict is that authenticated browser clients can directly mutate workflow tables and the Orders trigger blindly writes Order status into Production.

Recommend exactly one next corrective milestone: **Enforce Production and Fulfillment Workflow Command Authority.**

That future milestone is limited to Production-owned commands for `printing`, `qc`, `needs_reprint`, and manufacturing actuals; Orders/Fulfillment-owned commands for `ready_for_fulfillment` and `closed`; explicit legal transition validation; mandatory optimistic concurrency for workflow changes; projection-only public tracking updates; removal of blind Orders-to-Production status overwrites; removal of unnecessary function/table grants and duplicate Production policies; Blueprint-envelope event emission for new transitions; preservation of existing historical records without cleanup or backfill unless separately approved; focused contract tests; and read-only deployment verification.

Explicit exclusions: Finance, Inventory consumption, Quote acceptance redesign, UI redesign, Fundraiser work, and historical data cleanup.

No corrective migration is created in this milestone.

## Repository-planned inventory update — workflow command authority (2026-07-20)

`supabase/migrations/202607200006_workflow_command_authority.sql` is planned but **not deployed**. It records the next corrective database contract for Production/Fulfillment workflow authority after the deployed Quote Acceptance Runtime Safety contract. Codex did not deploy the migration and did not apply data repair.

Planned changes: authenticated browser clients lose direct workflow table write privileges; `production_workflow_command` and `fulfillment_workflow_command` become the narrow mutation authorities; `orders_sync_workflow_to_production`/`sync_order_workflow_to_production` and `set_linked_workflow_status` are retired from client/trigger use; public tracking becomes server-side projection-only; workflow events use the Blueprint envelope without modifying existing legacy rows; and pre-acceptance Production commands use RLS-protected technical command receipts for retry identity rather than a new business-event vocabulary. The planned client contract treats linked Production plus Inventory side effects as a recoverable browser saga with pending recovery records for post-Inventory/pre-RPC failures; it does not claim cross-domain transactional atomicity.

Classification: **Repository-planned, not deployed until operator verification is provided**.

## Deployment closeout — 2026-07-20 Workflow Command Authority Parameter Default Compatibility

This closeout is documentation-only and records operator-supplied deployment evidence for `supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql`. This repository update did not change application code, SQL migrations, tests, schema, RLS, grants, data, deployed Supabase state, or UI.

### Operator-reported deployment inventory

| Artifact | Inventory status | Deployment evidence |
|---|---|---|
| `supabase/migrations/202607200006_workflow_command_authority.sql` | Failed, fully rolled back, superseded. Must not be executed. | Operator reports migration 006 failed and rolled back because legacy function parameter names were not preserved. |
| `supabase/migrations/202607200007_workflow_command_authority_parameter_compatibility.sql` | Failed, fully rolled back, superseded. Must not be executed. | Operator reports migration 007 failed and rolled back because the existing third-parameter default was removed. |
| `supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql` | Operator-reported deployed. | Operator reports migration 008 executed successfully in Supabase and returned “Success. No rows returned.” |

### Contract interpretation

Migration 008 is inventoried as the deployed workflow command authority compatibility artifact. The deployment result confirms successful migration execution as reported by the operator; it does not confirm verified runtime behavior. This inventory therefore distinguishes **deployed migration application** from **post-deployment contract verification**.

Classification: **Operator-reported deployed; runtime verification pending; not full Blueprint compliance**.

### Deferred verification inventory

| Verification area | Inventory status |
|---|---|
| Post-deployment SQL verification | Pending; intentionally deferred by operator. |
| Manual Production workflow testing | Pending. |
| Manual QC workflow testing | Pending. |
| Manual Needs Reprint testing | Pending. |
| Manual Fulfillment closure testing | Pending. |
| Manual Inventory retry/recovery testing | Pending. |
| Manual concurrency testing | Pending. |
| Manual cross-owner testing | Pending. |

### Remaining risk

Proceeding after migration 008 without SQL and manual browser verification leaves material runtime risk. The deployed system may still have incompatible RPC signatures/defaults, grants or RLS mismatches, direct table mutation paths, cross-domain status overwrites, missing command-event envelopes, stale optimistic-concurrency acceptance, Inventory retry/recovery gaps, public tracking projection errors, cross-owner exposure, or UI paths that fail only under deployed browser credentials. These risks remain open until verified by read-only SQL checks and manual browser workflow tests.


## Corrective milestone — 2026-07-21 Retire legacy `complete_production_job` RPC overloads

This focused milestone records operator-supplied deployed evidence and the planned forward-only correction in `supabase/migrations/202607210001_retire_complete_production_job_overloads.sql`. This repository environment did not connect to deployed Supabase, execute SQL, deploy, merge, or modify historical data.

### Operator-supplied deployed findings

- Five overloads of `public.complete_production_job` coexist.
- All overloads grant `EXECUTE` to `PUBLIC`, `anon`, `authenticated`, and `service_role`.
- Multiple overloads are `SECURITY DEFINER`.
- The overload bodies directly update `production_jobs` workflow status and actuals.
- The overload bodies directly reduce `raw_material_inventory`, add `finished_goods_inventory`, and insert `inventory_transactions`.
- The overloads use conflicting legacy quantity columns, including `current_grams` and `remaining_grams`.
- The deployed `inventory_transactions` ledger contains 384 `raw_usage` rows with no Production, attempt, command, or reference linkage.
- Migration `202607200008_workflow_command_authority_parameter_default_compatibility.sql` is deployed successfully and is the active workflow command authority.

### Planned correction

- Preserve every deployed `complete_production_job` overload identity by reading parameter names, defaults, identity arguments, and return types from `pg_proc`.
- Do not drop the functions, preserving PostgREST compatibility and avoiding dependency churn.
- Replace each body with an explicit retired-function exception using `SECURITY DEFINER` and fixed `search_path = public, pg_temp`.
- Revoke `EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and `service_role`; no reviewed recovery path requires retaining service-role execution for this obsolete bypass.
- Include read-only preflight and post-deployment verification queries.
- Do not create a new Inventory command, alter migration 008, redesign schema/UI/Finance/Quote/workflow authority, or clean historical transaction data.

### Active-client inspection

Repository inspection found no active client call to `complete_production_job`. The focused test scans Production Control, Orders Admin, Inventory Control, Finance Pro, Quote, and public tracking entry points to keep the retired RPC out of active browser paths.

## Corrective contract update — Production-attempt Inventory consumption (2026-07-21)

Repository migration `supabase/migrations/202607210002_consume_production_attempt_inventory.sql` defines `public.consume_production_attempt(...)`, an authenticated owner-scoped Inventory command for linked Production-attempt material consumption. It is a forward-only successor to the legacy `complete_production_job` retirement migration and does not re-enable any retired overload.

Contract summary:

- Consumption is attempted only from the browser orchestration at QC Pass or Needs Reprint, using workflow command/correlation identity.
- The RPC locks the Production job, linked accepted Order, and affected raw material rows; verifies owner isolation; verifies attempt evidence in Production `job_payload`; requires completed manufacturing actuals; and rejects missing roll IDs, invalid attempt identity, invalid quantities, cross-owner rolls, insufficient material, stale `updated_at`, and arbitrary workflow states.
- The Inventory decrement and immutable `inventory_transactions` insert occur in one database function transaction.
- The raw authority column is `raw_material_inventory.remaining_grams`; `current_grams` is not updated as a competing authority.
- Idempotency is enforced with uniqueness on consumed attempt/roll evidence and command identity. A valid same-command retry returns the original result without consuming material again; identity reuse for another owner, job, attempt, roll set, or command fails.
- Production, Orders, tracking, Finance, finished goods, Quote acceptance, and historical unlinked transactions remain untouched by the Inventory command.

The Production Control client now calls the command RPC for linked attempt consumption instead of directly decrementing raw inventory and writing raw-usage ledger rows in the browser. Existing Inventory Control CRUD remains unchanged for this milestone.

## Deployment reconciliation — 2026-07-21 authoritative Inventory consumption repair

This section records operator-supplied deployed evidence for the authoritative Inventory consumption repair and the matching repository reconciliation. The operator already applied the equivalent repair manually in the deployed Supabase environment and should not manually rerun the reconciliation SQL solely for deployment.

### Confirmed deployed structure and RPC contract

- The prior repository migration for authoritative consumption failed and rolled back because `inventory_transactions.attempt_id` did not exist.
- The deployed repair added `inventory_transactions.occurred_at timestamptz`, `attempt_id text`, `correlation_id text`, `quantity_grams numeric`, `order_number text`, and `quote_number text`.
- Existing rows were backfilled only with `occurred_at = created_at` where `occurred_at` was `NULL`, and `occurred_at` now defaults to `now()`.
- The deployed ledger has `inventory_transactions_production_attempt_roll_once`, unique on `user_id`, `production_job_id`, `raw_material_id`, and `attempt_id` for authoritative `production_attempt_consumption` rows.
- The deployed ledger has `inventory_transactions_production_command_roll_once`, unique on `user_id`, `correlation_id`, and `raw_material_id` for authoritative `production_attempt_consumption` rows.
- The rejected correlation-only unique index is intentionally absent because one command may consume multiple rolls.
- `public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text)` is deployed with `SECURITY DEFINER`, fixed `search_path = public, pg_temp`, `PUBLIC` execute revoked, `anon` execute revoked, `authenticated` execute granted, and `service_role` execute granted.
- `remaining_grams` is the sole raw quantity authority for consumption; `current_grams` is not updated.
- Completed retry recognition occurs before optimistic-concurrency rejection.
- There are currently zero authoritative `production_attempt_consumption` rows.

### Current verification status

| Contract test area | Status |
| --- | --- |
| Database structure verification | Passed |
| Live consumption workflow | Pending |
| Same-command retry workflow | Pending |
| Insufficient-material rejection | Pending |
| Cross-owner rejection | Pending |
| Needs Reprint workflow | Pending |
| Workflow recovery after Inventory success | Pending |

### Repository reconciliation

Migration `supabase/migrations/202607210003_reconcile_authoritative_inventory_consumption_repair.sql` is the forward-only repository reconciliation for the manually repaired deployed contract. It is idempotent for the already repaired deployment and for future repository-sequential environments, preserves historical rows except the required `occurred_at` null backfill, avoids the rejected correlation-only index, and includes a consolidated read-only JSONB verification query based on ACL inspection rather than `has_function_privilege('PUBLIC', ...)`.

## Durable Production raw-material reservation contract (2026-07-21 forward-only milestone)

The next deployed Inventory contract is represented by `supabase/migrations/202607210004_authoritative_production_material_reservations.sql`.

- `public.production_material_reservations` is the durable technical state for linked Production raw-material reservations. It is owner-scoped and records reservation identity, Production job UUID, accepted Order linkage, roll UUID, reserved grams, status, command/correlation identities, and lifecycle timestamps.
- Inventory remains the only authority that mutates raw-material `remaining_grams` and linked `reserved_grams`. Available material is `remaining_grams - active reserved_grams`.
- Browser clients may select their own reservation rows for visibility, but normal authenticated clients are not granted direct insert, update, or delete. Mutations go through `reserve_production_material`, `release_production_material_reservation`, and `consume_production_attempt`.
- The reviewed RPCs are authenticated owner-only, `SECURITY DEFINER`, pinned to `search_path = public, pg_temp`, and granted only to `authenticated` and `service_role` after revoking `PUBLIC` and `anon` execution.
- Linked Ready to Print reservation and linked reservation release orchestration in Production Control must use these RPCs. Browser-direct linked `reserved_grams` writes are retired; ordinary Inventory Control CRUD is unchanged.
- `consume_production_attempt` remains the authoritative attempt consumption command and now validates applicable active reservations, decrements `remaining_grams`, releases the active reserved amount, marks reservation rows consumed, and inserts immutable attempt-linked ledger evidence exactly once.

This milestone does not merge, deploy, run SQL, backfill historical data, reinterpret unlinked transactions, re-enable retired Production completion RPCs, or broaden Inventory table privileges.

## Deployment closeout — authoritative Inventory reservation, release, and Production-attempt consumption (2026-07-21)

This documentation-only closeout records the operator-reported deployment result for the merged Inventory authority milestone. It does not modify application code, migrations, schema, RLS, grants, tests, data, UI, or deployed Supabase state.

### Operator-reported deployed migration

- Exact merged migration recorded as deployed: `supabase/migrations/202607210004_authoritative_production_material_reservations.sql`.
- Operator-reported Supabase result: `Success. No rows returned.`
- Database deployment classification: **successful SQL execution, operator-reported**.
- Runtime classification: **manual/runtime workflow testing pending**.

This contract inventory treats successful SQL execution as deployment evidence only. It is not evidence that live Production Control, reservation retry, consumption retry, Needs Reprint, insufficient-material, cross-owner, or recovery workflows passed in a browser or with deployed runtime credentials.

### Deployed reservation → consume/release contract

The deployed linked-workflow Inventory contract is:

1. `reserve_production_material(...)` is the authoritative linked Production reservation command.
2. `release_production_material_reservation(...)` is the authoritative linked Production reservation release command.
3. `consume_production_attempt(...)` is the authoritative linked Production-attempt consumption command.
4. `production_material_reservations` stores durable owner-scoped linked reservation state for active, released, and consumed reservation lines.
5. `raw_material_inventory.remaining_grams` remains the raw on-hand quantity authority.
6. Consumption is expected to validate the active reservation contract, decrement `remaining_grams`, release reserved grams, mark reservation rows consumed, and append attempt-linked `inventory_transactions` evidence.

### Ordinary Inventory CRUD remains separate

Browser-direct ordinary Inventory CRUD remains available for ordinary Inventory maintenance and has not been reclassified as a linked workflow authority. Linked Production reservation, release, and attempt consumption are command-authority operations and should not be treated as ordinary direct table edits.

### Historical transactions

Historical unlinked `inventory_transactions` remain historical evidence only. This milestone did not clean historical rows, reinterpret unlinked rows as authoritative linked consumption, delete records, or perform historical data repair. No historical cleanup or reinterpretation occurred.

### Verification status

| Verification area | Status | Contract interpretation |
| --- | --- | --- |
| Forward-only migration execution | Successful | Operator reports Supabase returned `Success. No rows returned.` |
| Prior consumption structure/security verification | Passed | Operator reports the prior `consume_production_attempt` structure and security verification passed. |
| Live Production workflow | Pending | No live Production workflow test was performed. |
| Reservation retry | Pending | No runtime reservation retry test was performed. |
| Consumption retry | Pending | No runtime consumption retry test was performed. |
| Needs Reprint | Pending | No runtime Needs Reprint test was performed. |
| Insufficient material | Pending | No runtime insufficient-material test was performed. |
| Cross-owner rejection | Pending | No runtime cross-owner test was performed. |
| Recovery | Pending | No runtime recovery test was performed. |

### Remaining risk

- SQL deployment success does not prove browser orchestration, deployed auth/RLS behavior, retry idempotency, Needs Reprint sequencing, insufficient-material rejection, cross-owner rejection, or recovery behavior.
- Ordinary Inventory CRUD still exists separately and may require future ownership verification for direct writes.
- The deployed contract is narrower than full ERP Blueprint compliance; full Blueprint compliance is **not** claimed.

### Exactly one recommended next milestone

**Finance ownership and cross-domain write verification.**

Review Finance-owned writes and cross-domain writes between Finance, Inventory, and Production so each domain mutates only its own authoritative records or uses reviewed command boundaries.


## Finance authority corrective milestone evidence — 2026-07-21

Operator-supplied deployed Finance findings for this milestone:

- `financial_entries` has 74 rows: 22 income and 52 expense.
- Income totals 1179.33; expense totals 4181.64.
- All three paid/closed Orders have matching Finance evidence.
- No Finance references point to missing Orders.
- No negative or impossible financial values were found.
- One entry has shipping charged without shipping cost; this milestone does not alter it.
- Five craft-show income rows are duplicate candidates but are not proven duplicates; they are unresolved, not duplicates.
- No refund, reversal, or correction evidence exists.
- RLS is enabled.
- Authenticated clients can directly mutate `financial_entries`.
- `anon` has table-level mutation privileges, although deployed RLS is owner-scoped.
- Historical cleanup and duplicate reinterpretation are prohibited.

Repository migration `supabase/migrations/202607210005_authoritative_finance_posting_corrections.sql` is the forward-only planned correction for authoritative, idempotent Finance posting and append-only Finance correction/reversal commands. Codex did not deploy it, run SQL, backfill historical Orders, reinterpret craft-show candidates, alter historical rows, merge, or clean deployed data.

## Deployment reconciliation — Finance column privileges (2026-07-21)

This section records operator-supplied deployed evidence for the manually corrected Finance column privileges and the matching repository reconciliation. The operator already applied equivalent SQL manually in the deployed Supabase environment and should not rerun `supabase/migrations/202607210006_reconcile_finance_column_privileges.sql` solely for deployment.

### Operator-supplied deployed evidence

- Migration `202607210005_authoritative_finance_posting_corrections.sql` deployed successfully after correcting the parenthesized `CASE` expression in `append_finance_correction`.
- The deployed Finance RPCs and indexes verified successfully.
- A privilege defect was found after deployment: authenticated users could update all Finance command-owned columns because table-level `UPDATE` was granted after column revocation.
- The operator manually corrected privileges successfully.
- Final deployed verification showed `anon` direct `INSERT`, `UPDATE`, and `DELETE` are `false`.
- Final deployed verification showed authenticated table-level `INSERT` and `UPDATE` are `false`, while authenticated `DELETE` is `true`.
- Final deployed verification showed authenticated manual-column `INSERT` and `UPDATE` for `title` and `amount` are `true`.
- Final deployed verification showed authenticated `INSERT` and `UPDATE` for `order_id` and `finance_command_id` are `false`.
- Final deployed verification showed authenticated `UPDATE` for `correction_of_entry_id` and `reversal_of_entry_id` are `false`.
- There are currently zero authoritative Order postings, corrections, or reversals.

### Repository reconciliation

Migration `supabase/migrations/202607210006_reconcile_finance_column_privileges.sql` is the forward-only repository reconciliation for the already repaired deployed Finance privilege contract. It revokes table-level `INSERT` and `UPDATE` from `PUBLIC`, `anon`, and `authenticated`; preserves authenticated `SELECT` and `DELETE`; grants authenticated `INSERT` and `UPDATE` only on reviewed manual Finance Pro columns; excludes command-owned columns from browser `INSERT` and `UPDATE`; preserves RPC and service-role command authority; and includes one consolidated read-only JSONB verification query.

This reconciliation does not change historical Finance rows, post historical Orders, reinterpret duplicate candidates, alter the known shipping inconsistency, deploy SQL, execute SQL, backfill data, merge, or perform cleanup.

### Verification status

| Verification area | Status | Contract interpretation |
| --- | --- | --- |
| Database privilege verification | Passed | Operator reports the manually repaired deployed privileges match the repository reconciliation contract. |
| Live posting workflow | Pending | No deployed browser live posting test was performed. |
| Same-command retry workflow | Pending | No deployed browser retry/idempotency test was performed. |
| Correction workflow | Pending | No deployed correction test was performed. |
| Reversal workflow | Pending | No deployed reversal test was performed. |
| Concurrency workflow | Pending | No deployed concurrency test was performed. |
| Runtime browser tests | Pending | Runtime browser behavior remains pending, not passed. |

## Repository-planned browser storage guard — not deployed (2026-07-21)

Status: **Repository-planned, not deployed. Manual browser verification pending.**

A focused repository change is planned to guard Inventory authority from browser localStorage recovery/reset behavior. The planned contract removes the Inventory Control Force Full Cloud Rebuild path and the unused browser helper that bulk-deleted user rows from `raw_material_inventory`, `finished_goods_inventory`, `non_filament_materials`, `inventory_transactions`, and `inventory_spool_pool`. Local recovery review/export remains available without cloud mutation, and duplicate local ledger cleanup remains local-only.

This is not deployed-contract evidence. It does not change Supabase schema, RLS, grants, data, or historical records. The deployed contract remains unchanged until the branch is reviewed, merged, deployed, and manually browser-verified.

## Repository-planned Orders Admin action regression correction (2026-07-21)

This focused corrective milestone addresses a deployed Orders Admin ordinary-save regression introduced by the workflow-authority privilege boundary. `orders-admin.html` still captured `user_id` in `snapshotForm()`, and `saveOrder()` only removed status/public projection fields before PATCHing `orders`. Because deployed workflow authority intentionally does not grant authenticated `UPDATE` on `orders.user_id`, unchanged ordinary saves could fail under PostgREST column privilege checks.

Repository changes made in this milestone:

- Ordinary Order save now builds a positive allowlist via `ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS` and `buildOrdinaryOrderEditPayload()`. The ordinary PATCH excludes identity, workflow-owned status, source Quote linkage, accepted commercial snapshots, public tracking projection fields, Finance command-owned fields, completion-email command marker fields, and catalog link command fields.
- Direct Orders Admin creation remains disabled; Orders are still created through approved Quote acceptance.
- Workflow status changes continue to call the approved fulfillment workflow RPC path instead of directly PATCHing `orders.status`.
- Visible Orders Admin action buttons are rebound once after page initialization by a focused action guard so legacy duplicate handlers do not stack on the Core Order Actions, Customer Communication, Documents & Labels, Closeout Exceptions, and Business/Finance action areas.
- Database-writing visible actions now surface API failures beside the action area and log actionable errors to the browser console.
- Document/label actions retain visible pop-up-blocked messaging; no browser behavior was manually verified by Codex.

Permission reconciliation:

- The ordinary save allowlist matches the narrow authenticated `orders` UPDATE grant in deployed migration `202607200008_workflow_command_authority_parameter_default_compatibility.sql`.
- A forward-only migration is required for non-workflow Orders Admin action markers that are proven necessary but absent from the deployed grant: `completion_email_sent`, `completion_email_sent_at`, and `catalog_part_id`.
- The planned migration is `supabase/migrations/202607210007_reconcile_orders_admin_action_column_privileges.sql`.
- This migration intentionally does **not** grant UPDATE on `user_id`, `status`, source Quote linkage, accepted commercial snapshots, public tracking projection fields, or Finance command-owned flags.
- Codex did not deploy SQL, execute migrations, modify deployed Supabase state, backfill data, repair historical rows, or alter OP-000010.

Post-merge operator deployment note: deploy `supabase/migrations/202607210007_reconcile_orders_admin_action_column_privileges.sql` only after review. Then perform manual browser testing for Save Order, completion-email marking, catalog linking, document pop-up handling, and Finance push RPC behavior with deployed credentials.
