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
