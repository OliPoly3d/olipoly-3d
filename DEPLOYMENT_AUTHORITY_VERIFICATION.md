# Deployment Authority Verification

**Evidence date:** 2026-08-11  
**Scope:** repository intent versus the deployed Supabase/PostgreSQL authority  
**Repository baseline:** `c303599` (the current authoritative repository state at the start of this initiative)  
**Safety:** documentation and a SELECT-only operator package; no application, migration, schema, policy, grant, function, storage, or production-data change.

## Executive answer

> **REPOSITORY INTENT VERIFIED — YELLOW.** The repository's migration chain, tests, architecture documents, browser mutation sites, repair lineage, and diagnostic scripts were inspected. The chain contains intentional supersession and temporary instrumentation, so “latest migration present” is not sufficient evidence.
>
> **LIVE DEPLOYMENT VERIFIED — NO.** No Supabase URL, database URL, or PostgreSQL credentials were available in this environment. No live query was run.
>
> **UNVERIFIED — OPERATOR QUERY REQUIRED.** Until the result grids from
> [`supabase/verification/deployment_authority_verification.sql`](supabase/verification/deployment_authority_verification.sql)
> are captured and compared, the question “does deployed authority match?” has no evidence-based yes/no answer.

This initiative therefore completes definition-of-done option **B**: one consolidated, read-only evidence package. It deliberately does **not** claim green deployment authority and does not remediate suspected drift.

## How to collect and return live evidence

1. Open the production project's Supabase SQL Editor as a database-owner/operator account.
2. Paste and run the consolidated SQL package unchanged. It consists only of `SELECT`; do not run the older install/remove trace scripts.
3. Export every labeled grid as CSV or JSON. Retain `00_RUN_CONTEXT` and the capture timestamp.
4. Provide the grids together with the project/environment name (production/staging), without customer free-text or secrets.
5. Compare exact signatures and normalized hashes—not names alone. A missing result is evidence of absence; an execution error is **YELLOW / unable to prove**, not a pass.
6. Review all RED findings before authoring any forward-only remediation migration.

The integrity grids return counts plus identifiers, not customer names, addresses, phone numbers, notes, tokens, or document paths.

## Classification rules

| Status | Meaning in this report |
|---|---|
| **GREEN** | Live output positively matches the documented repository contract. Repository inspection alone cannot produce this status for deployment. |
| **YELLOW** | Live evidence is absent/ambiguous, an object is compatibility-only, or non-critical drift needs investigation. |
| **RED** | Live evidence contradicts intent or creates security, correctness, ownership, availability, or integrity risk. |

## Intended-authority object registry

“Current source” means the repository's terminal definition after considering later cleanup/repair—not merely the lexically newest filename. Every deployed hash, signature, owner, grant, policy, and trigger must still be proven by operator output.

| Object | Type | Current intended definition source | Important superseded/cleanup sources | Relevant tests / verification | Security expectation | Business role |
|---|---|---|---|---|---|---|
| `production_workflow_command(text,…)` | RPC | `202608040001_production_workflow_nonretry_stale_conflict.sql` | 200006–008; 030002–005; temporary 030004 | `workflow-command-authority`, `production-workflow-version-contract`, `production-workflow-no-reentry`; version/graph verification | DEFINER; fixed `public,pg_temp`; authenticated/service only; owner check; bounded contention | Modern linked Production transition; raw Production `updated_at` is expected version |
| `production_workflow_command(uuid,…)` | compatibility RPC | `202608100007_legacy_production_lifecycle_compatibility.sql` | none | legacy lifecycle tests/report | DEFINER; authenticated/service only; owner check | Explicit legacy standalone Production path, not modern Order authority |
| `consume_production_attempt(uuid,…)` | RPC | `202608100007_legacy_production_lifecycle_compatibility.sql`, with atomic contract introduced by `202608100006` and locking repair `202608100003` | 210002–004, 040002, 100003, 100006 | inventory attempt, locking, QC atomicity, timeout tests | DEFINER; authenticated/service only; owner check; bounded lock; idempotent receipt | Pass QC, actual use, stock decrement, reservation closeout and linked lifecycle in one call |
| `cancel_production_job` | RPC | `202608100010_repair_survivor_tree_lifecycle.sql` | 100009 | cancel, survivor-tree tests | DEFINER; authenticated/service only; owner/link validation | Cancel and release reservation without erasing actual usage |
| `repair_production_quote_order_linkage` | operator compatibility RPC | `202608100010_repair_survivor_tree_lifecycle.sql` | 100007 | linkage/backlog verification | DEFINER; authenticated/service; ownership; never public/anon | Explicit repair for classifiable survivor records; not normal workflow |
| `approve_legacy_standalone_production` | legacy RPC | `202608100007_legacy_production_lifecycle_compatibility.sql` | none | legacy lifecycle test | DEFINER; authenticated/service; owner check | Controlled approval of records classified as legacy standalone |
| `preacceptance_production_command` | RPC | `202607280010_trace_preacceptance_transport_boundary.sql` | 200006–008; 280006–009 | preacceptance lock/row/transport tests and verification | DEFINER; authenticated/service; owner; job-scoped try-lock/NOWAIT; diagnostic mode must be reviewed | Pre-acceptance Production actions with bounded contention |
| `respond_to_quote_public` | public RPC | `202608100010_repair_survivor_tree_lifecycle.sql` | 200002, 200004–005, 280003, 020006 | quote acceptance, snapshot, phone, survivor-tree tests | Purposefully anon/auth/service; token+quote validation; safe return shape; fixed search path | Public quote response, immutable commercial snapshot, Order handoff |
| `get_quote_public` | public RPC | baseline plus grants in 200002 | earlier project definition | quote acceptance/public-security tests | Purposefully anon; unguessable token and minimal projection | Public quote display |
| `fulfillment_workflow_command` | RPC | `202608100004_orders_close_and_finance_finalization.sql` | 200006–008 | close/finalization, workflow tests | DEFINER; authenticated/service; owner/link checks | Order fulfillment lifecycle and close eligibility |
| `mark_order_paid` | RPC | `202608100002_authoritative_order_payment_command.sql` | direct-browser path superseded | payment/finance persistence tests; live verification | DEFINER; authenticated/service; owner, expected version, idempotent receipt | Authoritative payment transition |
| `post_order_finance_income` | RPC | `202608100004_orders_close_and_finance_finalization.sql` | 210005–006 | finance command/tax/close tests | DEFINER; authenticated/service; owner; command idempotency; fixed path | One primary Order income post, revenue/tax split |
| `correct_financial_entry` | RPC | `202608020003_repair_finance_adjustment_helper_resolution.sql` | 010004, 020002 | correction schema/helper/full-record tests | DEFINER; authenticated/service; owner; append-only correction | Correction without mutation of source entry |
| `get_effective_financial_entries` | projection RPC | `202608020001_effective_financial_entries_projection.sql` | none | effective reporting tests | Owner-scoped result; no public/anon exposure | Effective Finance view including corrections |
| `reserve_production_material` / `release_production_material_reservation` | RPCs | `202607210004_authoritative_production_material_reservations.sql` | none | material reservation/inventory lifecycle tests | DEFINER; authenticated/service; owner; idempotent command identity | Inventory-owned reservation lifecycle |
| `update_order_metadata` | RPC | `202608020010_orders_metadata_update_command.sql` | broad active-metadata policy in 020009 | Orders admin save tests | authenticated owner; command-owned fields excluded | Safe non-lifecycle Order metadata updates |
| `submit_campaign_submission`, `get_public_campaign` | public RPCs | `202607280004_generic_campaign_intake.sql` | 210008, 280002–003 | campaign intake/conversion tests | Intentionally public only where token/slug constrained; minimal returns | Campaign display and intake |
| `quote_accepted_commercial_snapshots` | immutable table | 200002 plus hardening 200003 | none | snapshot security tests | RLS; owner read; no browser UPDATE/DELETE; immutable trigger | Accepted customer/commercial truth consumed downstream |
| `financial_entries` + `finance_correction_receipts` | tables | 010002–004, 020002–003, 100002–004 | 210005–006, 010001/003 | finance authority/correction/tax tests | RLS owner read; ordinary browser cannot change command-owned rows; correction append-only | Finance ledger and idempotency/correction evidence |
| `workflow_command_receipts`, payment/consumption receipts | tables | 200006–008, 100002–003 | none | workflow/payment/inventory tests | owner read where required; service recovery; command-only writes | Idempotency and outcome observability |
| `orders_sync_workflow_to_production` | obsolete trigger | **must be absent** per `202608030003` and later workflow definitions | created 160004/200005; deliberately dropped 030003–040001 | no-reentry/single-dispatch tests | N/A; absence required | Former recursive competing authority |
| `orders_set_updated_at`, snapshot and finance guards | triggers | 020009; 200002–003; 010002–004; 100002 | earlier variants | Orders metadata/snapshot/finance tests | trigger functions not client executable; fixed path when DEFINER | Timestamp and immutability invariants, not lifecycle ownership |
| `job-assets` bucket / `asset_records`, `asset_links` | storage/tables | 160007 plus 280001 | none | deployed storage/asset lifecycle tests | private; authenticated owner path prefix; no anon; owner-scoped metadata | Project/quote/order asset provenance |

## Definition-hash comparison protocol

The SQL emits whitespace-normalized MD5 values for functions, trigger definitions/trigger functions, policies, and views. Repository files are the expected **source reference**, but a raw file hash is not comparable to `pg_get_functiondef`: migrations contain surrounding statements and PostgreSQL canonicalizes definitions. For each registry row:

1. locate the terminal `CREATE OR REPLACE FUNCTION` with the exact identity signature;
2. deploy that chain to a disposable database of the same PostgreSQL major version;
3. capture the same catalog query and hash;
4. compare that expected canonical hash with the production `live_hash`;
5. inspect text whenever a hash differs (format/version differences remain YELLOW until explained).

| Object | Repository expected source/hash | Live hash | Match |
|---|---|---|---|
| All registry functions/triggers/views/policies | Sources above; canonical expected hash requires disposable replay | **UNVERIFIED — section 02/03/06/18 output required** | Unknown |

## Migration lineage and deployed comparison

There are 63 repository migration files. The detailed inventory below records version, inferred purpose, principal objects, and flags. A repair/evolution remains a dependency when its final schema/function/privilege is consumed by later code; “superseded” does not mean safe to omit from a fresh replay.

### High-risk lineage conclusions

* The early bidirectional Order→Production trigger was replaced by RPC command authority and is explicitly removed in `202608030003`; live coexistence is **RED**.
* `202608030004` is temporary workflow execution tracing and is superseded by clean definitions in `030005`/`040001`; live `OP_WORKFLOW`/stage markers are **RED** when high-volume and otherwise **YELLOW pending operator explanation**.
* `202607280010` intentionally retains correlation-gated transport diagnostics in `preacceptance_production_command`; its presence is not automatically drift, but grants and bounded-lock behavior must match.
* Production expected-version semantics are repaired by `030005` then made non-retryable in `040001`; an older hash is **RED** correctness risk.
* Attempt consumption evolves repeatedly through reservation, lock bounds, pointer repair, atomic QC, and explicit legacy behavior (`210002` → `100007`). Signature coexistence is intentional only where the UUID/text overloads have distinct documented roles.
* Finance is cumulative: posting/idempotency, column privilege reconciliation, invoice/tax metadata, append-only correction, repair helpers, payment eligibility, and close finalization all matter. Replaying only the newest Finance file is not authoritative.

### Live migration comparison

**UNVERIFIED — OPERATOR QUERY REQUIRED.** Section `01_DEPLOYED_MIGRATIONS` returns the Supabase history without mutation. Compare by exact version and name:

* repository version absent live → **RED** if it supplies a current security/correctness contract; otherwise YELLOW;
* live version absent repository → YELLOW, upgraded to RED if it changes a critical object or is diagnostic;
* non-monotonic/out-of-order application or same-purpose unknown versions → YELLOW pending definition hashes;
* `202608030004` present in history is expected historical evidence, but its tracing **definition must not remain live**;
* migration-history equality never proves definitions, grants, policies, triggers, owners, or data integrity.

## Surface assessments and live decision rules

### RLS and table grants

Repository intent is owner-scoped authenticated access, narrowly permitted public intake, and service-role recovery. Section 02 reports enabled/forced flags and full policy expressions; section 19 reports table grants.

**RED:** critical public table has RLS off; `anon`/PUBLIC write access beyond explicit intake; owner UPDATE lacks both owner `USING` and owner `WITH CHECK`; a permissive legacy policy widens a restrictive one; direct grants permit command-owned lifecycle/Finance/Inventory mutation. Service role bypass is expected operationally but must not be exposed to browsers. `FORCE RLS` is not universally required for Supabase-owner functions and therefore absence alone is YELLOW, not RED.

### Functions, SECURITY DEFINER, and grants

Sections 03–05 return exact identity arguments, language, volatility, parallel flag, owner, `proconfig`, definition/body hash, and role execution. Automated `auth.uid()` and dynamic-SQL flags are triage aids, not proof: helpers may validate ownership indirectly, and the word `execute` may appear harmlessly.

**RED:** internal command executable by PUBLIC/anon; missing fixed search path on DEFINER; client-supplied owner trusted without `auth.uid()` or equivalent caller validation; unexpected owner; mutable-schema unqualified objects with unsafe path; missing authenticated execution for an active browser RPC. Expected public functions (`respond_to_quote_public`, quote lookup, constrained campaign intake/tracking) still require token validation and minimal projections.

### Triggers and immutability

Sections 06 and 20 expose every trigger and relevant guard. `orders_sync_workflow_to_production`, recursive workflow/status triggers, or two competing triggers for the same lifecycle event are **RED**. Ordinary `updated_at`, accepted-snapshot immutability, Finance eligibility, and correction guards are expected. Accepted commercial snapshots must reject UPDATE and DELETE; command-owned Finance source entries must remain unchanged while corrections append. Operator/test cleanup exceptions, if any, need separate role-specific evidence and do not justify browser mutation.

### Storage

Section 07 returns bucket configuration without object rows or customer paths plus `storage.objects` policies. Expected `job-assets` behavior is private, authenticated owner-folder read/upload/delete and no anon access. Public campaign/image assets must be classified individually. Public customer/PO/tax-exempt/project-document buckets, anon upload without constrained paths, or cross-owner access are **RED**. Bucket evidence remains unverified here.

### Status and linkage authority

| Field | Intended classification |
|---|---|
| `production_jobs.production_status` | **AUTHORITATIVE** manufacturing lifecycle |
| `production_jobs.job_status` (if deployed) | **LEGACY** adapter; never primary authority |
| `production_jobs.job_payload->production_status` | **PAYLOAD SNAPSHOT** only |
| `orders.status` | **AUTHORITATIVE** fulfillment lifecycle |
| tracking status/text | **DERIVED** public-safe projection |
| UI labels/aliases | **UI ONLY** |
| quote accepted/response/conversion columns | **AUTHORITATIVE** Quote handoff facts, with accepted commercial snapshot immutable |
| `orders.finance_pushed` | **DERIVED/receipt indicator**; Finance entry plus command receipt are posting authority |

Modern identity is `production_jobs.quote_number/order_number` ↔ `quotes.quote_number/converted_order_number` ↔ `orders.order_number/source_quote_number`, with matching owner. Payload identity is legacy/snapshot evidence, not modern authority. Section 09 detects wrong Quote linkage, cross-owner links, and duplicate Orders per Quote. Any modern mismatch is **RED**; deliberately classified legacy standalone records are YELLOW until handled through the explicit compatibility contract.

### Concurrency and contention

The intended modern Production command compares `p_expected_updated_at` to the raw authoritative **Production** row timestamp. It must not compare an Order timestamp or a browser-normalized value. Repository tests expect stale conflict to fail promptly and not be retried generically. Section 10 locates expected-version logic and SQLSTATE evidence; compare full bodies for authoritative-row selection and error (`40001`/documented application conflict semantics).

Section 11 finds blocking advisory locks, try-locks, row locks, NOWAIT, and timeout settings. Repository lineage moved preacceptance and workflow commands toward bounded contention. An old `pg_advisory_xact_lock` or unbounded `FOR UPDATE` on an interactive command where the terminal source uses try-lock/NOWAIT is **RED** availability/correctness drift. A lock flag alone is not a verdict; transaction scope and exception handling must be read.

### Pass QC and Inventory atomicity

Repository intent after `202608100006`/`100007` is a single RPC transaction: validate owner/version/attempt → idempotency receipt/locks → decrement Inventory once → reconcile/release reservation → persist actual usage and Production transition → update linked Order/tracking where applicable → return outcome. PostgreSQL functions execute within the caller transaction; an exception rolls it back. The browser must not split these authoritative writes.

Sections 03, 11 and 12 must prove the deployed terminal body, bounded lock, receipt uniqueness, and live anomalies. Duplicate attempt receipts/transactions, active terminal-job reservations, or a deployed pre-atomic body are **RED**. Exact transaction atomicity is **UNVERIFIED** until the live body hash/text is returned.

### Finance authority

Intended contract: at most one primary command-owned income entry per Order/command; retry returns the idempotent result; accepted totals preserve revenue separately from collected sales tax; `finance_pushed` agrees with posting evidence; corrections append and preserve the original; browser roles cannot directly edit command-owned entries. Sections 02–06, 13, 19 and 20 jointly verify it. Duplicate primary entries, inconsistent pushed flags, mutable command-owned rows, missing tax split, or broad table writes are **RED**.

### Public/anon surface

Section 14 enumerates every PUBLIC/anon-executable function rather than relying on migration grants. Expected-public candidates are token-constrained quote view/response, public tracking, campaign view/submission, and explicit payment handoff. Each requires manual return-shape/body review for customer, internal note, Finance, Inventory, token, and internal-ID leakage. Every workflow, repair, reserve/consume, cancellation, Finance correction/post, metadata, or payment-finalization command exposed to PUBLIC/anon is **RED**.

### Views, owners, and legacy objects

Sections 17–18 report owners, full view definitions, definition hashes, and options such as `security_invoker`/`security_barrier`. Public-facing views owned by privileged roles without `security_invoker` and exposing owner data are **RED**. Diagnostic/candidate/backlog views are **YELLOW** until consumers and grants prove whether they are still required.

| Object family | Repository classification | Live action |
|---|---|---|
| UUID Production overload and explicit legacy approval/link repair | **STILL REQUIRED** while classified legacy backlog exists | Prove restricted grants; retire only after separate reviewed initiative |
| `production_legacy_classification_report`, linkage/backlog candidate reports | **UNKNOWN — INVESTIGATE** | Check views/functions, owner, grants, current callers |
| recursive Order→Production synchronization trigger/function | **SAFE RETIREMENT CANDIDATE / intended absent** | Live presence is RED; do not drop during verification |
| temporary workflow stage trace wrappers/markers | **SAFE RETIREMENT CANDIDATE / intended absent** | Live presence requires RED/YELLOW discrepancy |
| correlation-gated preacceptance transport diagnostic | **STILL REQUIRED by current terminal repository migration**, but operationally questionable | Verify it is gated and low-volume; later retirement is separate P1 |

## Browser/direct-write bypass map

Repository browser code was searched for Supabase `.rpc()` and direct `.from(...).insert/update/upsert/delete` mutations. The authoritative command families are Production workflow/QC/cancel, Order payment/close, Finance posting/correction, and Inventory reserve/consume. Customer/profile/recipe/asset/campaign metadata may be safe owner-scoped table writes only when RLS and column grants prove the boundary. Any fallback that patches lifecycle, actual-use, receipt, Finance-owned, accepted-snapshot, or linkage columns is **QUESTIONABLE DIRECT WRITE / RED if live grants permit it**. The live package intentionally reports grants/policies; a follow-up comparison must map each concrete browser call to those results. No browser code was changed.

## Current data-integrity scan

No production records were queried. Sections 09, 12, 13 and 16 provide privacy-minimized scans for:

* Quote/Order/Production identity and owner mismatches;
* duplicate Orders per source Quote;
* Production/Order status disagreement;
* duplicate attempt consumption receipts;
* active reservations on closed/canceled jobs;
* duplicate command-owned Finance posts and two-way `finance_pushed` disagreement.

“Local/test-style” data cannot be safely inferred from customer content. The package deliberately does not search names, emails, notes, or addresses. An operator may separately provide an approved, non-sensitive tenant/environment marker rule; without one this item remains **YELLOW / unable to prove**.

## Nine observed source-contract failures

These classifications are repository-level triage, not live conclusions. Tests were not modified.

| Failure | Classification | Evidence / evidence still needed |
|---|---|---|
| `engine-rc2-6-niles-exclusion-decision` | **E — UNKNOWN** | Product/content decision is not database authority. Need approved Niles inclusion/exclusion requirement and current test output. |
| `finance-ohio-county-dependency` | **E — UNKNOWN** | Repair migrations restore validator and dependency ordering. Need failing assertion plus live function hashes/signatures for `is_ohio_county` and dependents. |
| `orders-finance-shipping-charged` | **E — UNKNOWN** | A repair exists, but live trigger/body and fixture schema decide between defect and stale fixture. Need test output and sections 03/06. |
| `orders-phone-schema-contract` | **E — UNKNOWN** | Two phone repair/evolution migrations exist. Need exact test assertion, live column/trigger output, and intended optional-phone UX contract. |
| `production-material-reservations` | **E — UNKNOWN** | Reservation authority exists; repeated consumption/QC evolution may supersede assertions. Need test output plus live policy/function/receipt evidence. |
| `production-quote-order-identity` | **E — UNKNOWN** | Modern linkage plus legacy compatibility coexist intentionally. Need fixture classification and live section 09 results before A/B/C. |
| `production-status-persistence` | **E — UNKNOWN** | `production_status` is intended authority, but browser hydration/fixture could be stale. Need failing assertion and live trigger/function definitions. |
| `quote-handoff-outcome-observability` | **E — UNKNOWN** | Receipt/outcome behavior spans public response and survivor repairs. Need failed assertion and live public RPC definition/receipts. |
| `workflow-command-authority` | **E — UNKNOWN (P0 evidence gap)** | Many superseded command bodies and temporary trace make drift plausible. Need current failure output and live exact hash/grants/triggers/locking evidence. |

## Red/yellow/green scorecard

Because no live credentials existed, all deployment surfaces remain YELLOW rather than being falsely marked GREEN or RED.

| Surface | Status | Evidence | Risk | Recommended next action |
|---|---|---|---|---|
| Migrations | **YELLOW** | 63-file repository inventory; no live history | Missing/out-of-order/unknown migration | Run 01 and exact-set diff |
| RLS | **YELLOW** | Intended owner boundaries found; no catalog output | Cross-owner or public writes | Run 02/19; inspect every permissive policy |
| RPC definitions | **YELLOW** | Terminal-source registry built | Stale/replaced bodies | Run 03 and canonical hash comparison |
| Function grants | **YELLOW** | Intended roles recorded | Internal command exposed or active command unavailable | Run 04/14 |
| SECURITY DEFINER safety | **YELLOW** | Repository commonly fixes search path; no deployed proof | Privilege escalation/data exposure | Run 05; manual body review |
| Triggers | **YELLOW** | Recursive trigger intended absent | Competing lifecycle authority | Run 06/20 |
| Storage policies | **YELLOW** | Private owner-path intent for job assets | Document exposure/cross-owner upload | Run 07 |
| Production authority | **YELLOW** | Modern text and legacy UUID paths identified | Wrong lifecycle/status authority | Run 03/06/08/10/11/16 |
| Quote/Order authority | **YELLOW** | Modern identity registry built | Wrong Quote, duplicate Order, cross-owner link | Run 09 and public RPC review |
| Inventory authority | **YELLOW** | Atomic/idempotent terminal source identified | Double decrement/stale reservation | Run 11/12 and body comparison |
| Finance authority | **YELLOW** | Cumulative ledger/correction contract identified | Duplicate/mutable/mistated revenue/tax | Run 13/19/20 and body comparison |
| Public RPC surface | **YELLOW** | Expected public families classified | Private ERP/customer leakage | Run 14, manually inspect returns |
| Browser/direct-write bypass | **YELLOW** | Mutation families mapped conceptually | Command bypass | Compare browser calls to 02/19 |
| Data integrity | **YELLOW** | Read-only scans supplied; none run | Existing contradictory rows | Run 09/12/13/16 |
| Temporary diagnostics | **YELLOW** | Temporary 030004 and gated 280010 identified | Logging/privacy/performance or stale body | Run 15 and hash terminal definitions |
| Test/repo alignment | **YELLOW** | Nine failures triaged without assumptions | Stale safety net or real defect | Capture exact test outputs and live evidence |

## Discrepancy worksheet (complete after live capture)

| Object | Current live state | Intended state | Risk/status | Recommended fix type |
|---|---|---|---|---|
| Any missing critical migration | Pending section 01 | Exact repository lineage applied | Correctness/security; RED when current | FORWARD-ONLY MIGRATION |
| Critical function hash/signature mismatch | Pending 03 | Registry terminal definition | Command correctness; RED | FUNCTION REDEPLOY |
| Internal function PUBLIC/anon executable | Pending 04/14 | authenticated/service only | Privilege escalation; RED | GRANT CORRECTION |
| Unsafe DEFINER path/owner validation | Pending 05 | fixed path + caller/owner validation | Privilege escalation; RED | FUNCTION REDEPLOY |
| Critical table broad/missing RLS | Pending 02/19 | owner-scoped RLS and narrow grants | Cross-owner/data mutation; RED | POLICY REPLACEMENT / GRANT CORRECTION |
| Recursive/duplicate lifecycle trigger | Pending 06 | RPC authority; legacy trigger absent | Competing writes/deadlock; RED | TRIGGER RETIREMENT |
| Public/private storage mismatch | Pending 07 | bucket-specific owner/public contract | File disclosure/write; RED | POLICY REPLACEMENT |
| Temporary workflow markers | Pending 15 | clean terminal command | Performance/logging/drift; RED/YELLOW | FUNCTION REDEPLOY |
| Data anomaly | Pending 09/12/13/16 | zero modern contradictions | Integrity; RED | FORWARD-ONLY DATA REPAIR (separate reviewed plan) |
| Test contradicts proven current contract | Pending test/live evidence | test mirrors authority | Safety-net drift; P1 | TEST UPDATE |
| Expected object and hash match | Pending | Registry state | GREEN | NO ACTION |

## Prioritized remediation order (conditional; do not execute yet)

| Priority | Triggering evidence | Size | Change risk | Fix type |
|---|---|---|---|---|
| P0.1 | Unsafe RLS, anon/public internal RPC, storage disclosure, unsafe DEFINER | SMALL–MEDIUM | HIGH | Grant correction/policy replacement/function redeploy |
| P0.2 | Blocking stale Production/Inventory command or recursive competing trigger | MEDIUM | HIGH | Function redeploy/trigger retirement |
| P0.3 | Non-atomic/double Inventory consumption or Finance duplicate/mutability risk | MEDIUM–LARGE | HIGH | Forward-only migration plus separately reviewed data plan |
| P0.4 | Modern cross-owner or Quote/Order/Production identity contradictions | MEDIUM–LARGE | HIGH | Stop affected command path; design forward-only repair |
| P1.1 | Temporary diagnostics or stale diagnostic views with no security impact | SMALL | MEDIUM | Function redeploy/retirement migration |
| P1.2 | Legacy adapters/reports have zero proven consumers/backlog | MEDIUM | MEDIUM | Separate retirement migration after usage evidence |
| P1.3 | Proven stale tests/status adapters/documentation | SMALL–MEDIUM | LOW | Test update/documentation only |

## Exact operator evidence still required

All of the following are required before “LIVE DEPLOYMENT VERIFIED”:

1. run context and complete deployed migration history;
2. all public/storage RLS flags, policies, policy hashes, and table grants;
3. exact public function signatures, canonical definitions/hashes, owners, languages, security/volatility/parallel flags and settings;
4. PUBLIC/anon/authenticated/service-role execute matrix;
5. manual security review of every deployed DEFINER and public RPC body/return shape;
6. all critical triggers and trigger-function definitions/hashes;
7. bucket public/private configuration and `storage.objects` policies;
8. status/linkage columns and diagnostic counts/IDs;
9. concurrency and lock scan plus complete bodies for flagged functions;
10. Inventory/Finance/immutability grids and constraint/index evidence visible in definitions;
11. object owners and view definitions/options/grants;
12. temporary tracing marker scan;
13. exact output from the nine failing tests (to classify A–D instead of E);
14. an approved non-sensitive rule if test/local-looking production data must be scanned.

## Safety confirmation

No persistent database query was executed. No application code, migration, SQL definition, RLS policy, grant, trigger, storage policy, ownership, or production row was changed. The only repository additions are this report and a reusable SELECT-only verification file under `supabase/verification`; that file is **not a migration**.

## Appendix A — complete repository migration inventory

The “class” flag is a triage aid. `REPAIR/CLEANUP` records terminal repairs; `LEGACY` means compatibility/history is explicit; `TEMP/DIAGNOSTIC` requires cleanup/body proof. “Current dependency” is determined by the registry and later references: all migrations remain replay dependencies unless a later file explicitly drops/replaces their object, and terminal definitions are identified above.

| Filename/version | Purpose | Principal objects changed | Class |
|---|---|---|---|
| `202607160001_milestone_2a_order_workflow.sql` | milestone 2a order workflow | `normalize_accepted_order_status`, `orders`, `order_tracking_public`, `enforce_accepted_order_status`, `orders_normalize_accepted_status`, `order_tracking_normalize_accepted_status` | BASE/EVOLUTION |
| `202607160002_repair_milestone_2a_order_status.sql` | repair milestone 2a order status | `orders`, `order_tracking_public`, `normalize_accepted_order_status`, `enforce_accepted_order_status`, `orders_normalize_accepted_status`, `order_tracking_normalize_accepted_status` | REPAIR/CLEANUP |
| `202607160003_persist_production_quote_status.sql` | persist production quote status | `advance_linked_production_on_quote_acceptance`, `quotes_advance_linked_production` | BASE/EVOLUTION |
| `202607160004_authoritative_bidirectional_workflow.sql` | authoritative bidirectional workflow | `sync_order_workflow_to_production`, `orders_sync_workflow_to_production`, `set_linked_workflow_status` | BASE/EVOLUTION |
| `202607160005_product_recipe_library.sql` | product recipe library | `product_recipes`, `Users` | BASE/EVOLUTION |
| `202607160006_product_recipe_revision_history.sql` | product recipe revision history | `product_recipes` | BASE/EVOLUTION |
| `202607160007_job_asset_management.sql` | job asset management | `asset_records`, `asset_links`, `asset_records_owner_select`, `asset_records_owner_insert`, `asset_records_owner_update`, `asset_records_owner_delete`, `asset_links_owner_all` | BASE/EVOLUTION |
| `202607200001_public_access_ownership_security_hardening.sql` | public access ownership security hardening | `document_counters`, `document_counters_no_browser_select`, `document_counters_no_browser_insert`, `document_counters_no_browser_update`, `document_counters_no_browser_delete`, `next_document_counter`, `parts_catalog` | BASE/EVOLUTION |
| `202607200002_quote_acceptance_authority.sql` | quote acceptance authority | `orders`, `quotes`, `quote_accepted_commercial_snapshots`, `prevent_quote_accepted_snapshot_mutation`, `quote_accepted_snapshots_no_update`, `project_events`, `respond_to_quote_public` | BASE/EVOLUTION |
| `202607200003_quote_accepted_snapshot_security.sql` | quote accepted snapshot security | `quote_accepted_commercial_snapshots`, `prevent_quote_accepted_snapshot_mutation` | BASE/EVOLUTION |
| `202607200004_quote_acceptance_runtime_correctness.sql` | quote acceptance runtime correctness | data/privilege change; inspect source | BASE/EVOLUTION |
| `202607200005_quote_acceptance_runtime_safety.sql` | quote acceptance runtime safety | `respond_to_quote_public`, `orders_sync_workflow_to_production`, `quotes_advance_linked_production`, `advance_linked_production_on_quote_acceptance`, `quote_accepted_commercial_snapshots` | BASE/EVOLUTION |
| `202607200006_workflow_command_authority.sql` | workflow command authority | `workflow_command_receipts`, `workflow_public_status_text`, `workflow_public_next_step`, `production_workflow_command`, `fulfillment_workflow_command`, `preacceptance_production_command`, `orders_sync_workflow_to_production` | BASE/EVOLUTION |
| `202607200007_workflow_command_authority_parameter_compatibility.sql` | workflow command authority parameter compatibility | `workflow_command_receipts`, `workflow_public_status_text`, `workflow_public_next_step`, `production_workflow_command`, `fulfillment_workflow_command`, `preacceptance_production_command`, `orders_sync_workflow_to_production` | LEGACY |
| `202607200008_workflow_command_authority_parameter_default_compatibility.sql` | workflow command authority parameter default compatibility | `workflow_command_receipts`, `workflow_public_status_text`, `workflow_public_next_step`, `production_workflow_command`, `fulfillment_workflow_command`, `preacceptance_production_command`, `orders_sync_workflow_to_production` | BASE/EVOLUTION |
| `202607210001_retire_complete_production_job_overloads.sql` | retire complete production job overloads | `complete_production_job` | LEGACY |
| `202607210002_consume_production_attempt_inventory.sql` | consume production attempt inventory | `consume_production_attempt` | BASE/EVOLUTION |
| `202607210003_reconcile_authoritative_inventory_consumption_repair.sql` | reconcile authoritative inventory consumption repair | `inventory_transactions`, `consume_production_attempt` | REPAIR/CLEANUP |
| `202607210004_authoritative_production_material_reservations.sql` | authoritative production material reservations | `production_material_reservations`, `production_material_reservations_owner_select`, `production_material_reservations_service_all`, `reserve_production_material`, `release_production_material_reservation`, `consume_production_attempt` | BASE/EVOLUTION |
| `202607210005_authoritative_finance_posting_corrections.sql` | authoritative finance posting corrections | `financial_entries`, `post_order_finance_income`, `append_finance_correction` | BASE/EVOLUTION |
| `202607210006_reconcile_finance_column_privileges.sql` | reconcile finance column privileges | `financial_entries`, `post_order_finance_income`, `append_finance_correction` | REPAIR/CLEANUP |
| `202607210008_campaign_manager_phase1.sql` | campaign manager phase1 | `campaigns`, `campaign_products`, `set_campaign_updated_at`, `campaigns_set_updated_at`, `campaign_products_set_updated_at`, `Users`, `get_public_campaign` | BASE/EVOLUTION |
| `202607210009_invoice_authority_contract.sql` | invoice authority contract | `version_accepted_invoice_totals`, `quote_accepted_snapshots_version_invoice_totals`, `get_order_invoice_snapshot`, `financial_entries`, `apply_invoice_authority_to_finance_post`, `financial_entries_invoice_authority` | LEGACY |
| `202607280001_authoritative_asset_lifecycle.sql` | authoritative asset lifecycle | `asset_links`, `link_recipe_manifest_revision`, `transfer_accepted_quote_asset_links`, `orders_transfer_accepted_quote_assets` | BASE/EVOLUTION |
| `202607280002_campaign_submission_authority.sql` | campaign submission authority | `campaign_products`, `campaign_submissions`, `campaign_submission_items`, `Owners`, `reject_campaign_submission_snapshot_mutation`, `campaign_submissions_immutable`, `campaign_submission_items_immutable` | BASE/EVOLUTION |
| `202607280003_campaign_order_conversion.sql` | campaign order conversion | `olipoly_order_number_seq`, `allocate_order_number`, `orders`, `campaign_submissions`, `campaign_order_conversion_snapshots`, `Owners`, `prevent_campaign_order_snapshot_mutation` | BASE/EVOLUTION |
| `202607280004_generic_campaign_intake.sql` | generic campaign intake | `get_public_campaign`, `submit_campaign_submission` | BASE/EVOLUTION |
| `202607280005_repair_preproduction_zero_actual_contamination.sql` | repair preproduction zero actual contamination | `production_jobs` | REPAIR/CLEANUP |
| `202607280006_bound_preacceptance_advisory_lock.sql` | bound preacceptance advisory lock | `preacceptance_production_command` | BASE/EVOLUTION |
| `202607280007_job_scoped_preacceptance_lock.sql` | job scoped preacceptance lock | `preacceptance_production_command` | BASE/EVOLUTION |
| `202607280008_distinguish_preacceptance_lock_failures.sql` | distinguish preacceptance lock failures | `preacceptance_production_command` | BASE/EVOLUTION |
| `202607280009_nowait_preacceptance_production_row.sql` | nowait preacceptance production row | `preacceptance_production_command` | BASE/EVOLUTION |
| `202607280010_trace_preacceptance_transport_boundary.sql` | trace preacceptance transport boundary | `preacceptance_production_command` | TEMP/DIAGNOSTIC |
| `202608010001_repair_order_finance_shipping_charged.sql` | repair order finance shipping charged | `apply_invoice_authority_to_finance_post` | REPAIR/CLEANUP, LEGACY |
| `202608010002_finance_append_only_correction_authority.sql` | finance append only correction authority | `financial_entries`, `finance_adjustment_value`, `append_finance_entry_correction`, `update_manual_financial_entry`, `delete_manual_financial_entry` | BASE/EVOLUTION |
| `202608010003_authoritative_order_finance_tax_metadata.sql` | authoritative order finance tax metadata | `orders`, `financial_entries`, `is_ohio_county`, `capture_accepted_order_tax_metadata`, `accepted_order_tax_metadata`, `get_order_invoice_snapshot`, `apply_order_tax_metadata_to_finance_post` | BASE/EVOLUTION |
| `202608010004_full_finance_correction_authority.sql` | full finance correction authority | `financial_entries`, `finance_correction_receipts`, `finance_correction_receipts_owner_select`, `correct_financial_entry`, `create_manual_financial_entry` | BASE/EVOLUTION |
| `202608020001_effective_financial_entries_projection.sql` | effective financial entries projection | `get_effective_financial_entries` | BASE/EVOLUTION |
| `202608020002_repair_finance_correction_live_schema.sql` | repair finance correction live schema | `correct_financial_entry` | REPAIR/CLEANUP |
| `202608020003_repair_finance_adjustment_helper_resolution.sql` | repair finance adjustment helper resolution | `finance_adjustment_value`, `correct_financial_entry` | REPAIR/CLEANUP |
| `202608020004_restore_ohio_county_validator.sql` | restore ohio county validator | `is_ohio_county` | REPAIR/CLEANUP |
| `202608020005_repair_orders_tax_metadata_and_finance_county.sql` | repair orders tax metadata and finance county | `orders`, `capture_accepted_order_tax_metadata`, `accepted_order_tax_metadata`, `get_order_invoice_snapshot`, `apply_order_tax_metadata_to_finance_post`, `zz_financial_entries_order_tax_metadata`, `get_order_invoice_snapshot_base` | REPAIR/CLEANUP |
| `202608020006_repair_quote_order_optional_phone.sql` | repair quote order optional phone | `respond_to_quote_public` | REPAIR/CLEANUP, LEGACY |
| `202608020007_orders_optional_customer_phone.sql` | orders optional customer phone | `orders`, `normalize_order_customer_phone`, `orders_normalize_customer_phone` | BASE/EVOLUTION |
| `202608020008_canonical_sales_tax_rate_percent_contract.sql` | canonical sales tax rate percent contract | `normalize_sales_tax_rate_percent`, `validate_order_sales_tax_percent_contract`, `zz_orders_sales_tax_percent_contract`, `validate_order_finance_sales_tax_percent_contract`, `zzz_finance_sales_tax_percent_contract`, `sales_tax_rate_contract_candidates`, `sales_tax_rate_repair_audit` | BASE/EVOLUTION |
| `202608020009_orders_admin_active_metadata_authority.sql` | orders admin active metadata authority | `orders`, `orders_owner_update_active_metadata`, `set_orders_updated_at`, `orders_set_updated_at` | BASE/EVOLUTION |
| `202608020010_orders_metadata_update_command.sql` | orders metadata update command | `orders`, `update_order_metadata` | BASE/EVOLUTION |
| `202608030001_production_quote_order_identity.sql` | production quote order identity | `quotes`, `production_linkage_audit`, `Owners`, `prevent_production_quote_provenance_drift`, `quotes_prevent_production_provenance_drift`, `save_production_quote`, `link_production_after_quote_order_insert` | LEGACY |
| `202608030002_production_workflow_fast_contention.sql` | production workflow fast contention | `production_workflow_command` | BASE/EVOLUTION |
| `202608030003_remove_recursive_workflow_trigger_paths.sql` | remove recursive workflow trigger paths | `orders_sync_workflow_to_production`, `sync_order_workflow_to_production`, `production_workflow_command` | REPAIR/CLEANUP |
| `202608030004_temporary_production_workflow_execution_trace.sql` | temporary production workflow execution trace | `production_workflow_command`, `enforce_accepted_order_status`, `set_orders_updated_at`, `sync_order_workflow_to_production`, `workflow_public_status_text`, `workflow_public_next_step` | TEMP/DIAGNOSTIC |
| `202608030005_fix_production_workflow_expected_version.sql` | fix production workflow expected version | `orders_sync_workflow_to_production`, `sync_order_workflow_to_production`, `production_workflow_command`, `workflow_public_status_text`, `workflow_public_next_step`, `enforce_accepted_order_status`, `set_orders_updated_at` | REPAIR/CLEANUP |
| `202608040001_production_workflow_nonretry_stale_conflict.sql` | production workflow nonretry stale conflict | `orders_sync_workflow_to_production`, `sync_order_workflow_to_production`, `production_workflow_command`, `workflow_public_status_text`, `workflow_public_next_step`, `enforce_accepted_order_status`, `set_orders_updated_at` | BASE/EVOLUTION |
| `202608040002_bound_inventory_consumption_and_skip_excluded.sql` | bound inventory consumption and skip excluded | `consume_production_attempt` | BASE/EVOLUTION |
| `202608100001_repair_production_attempt_pointer.sql` | repair production attempt pointer | `preserve_production_attempt_pointer`, `production_jobs_preserve_attempt_pointer` | REPAIR/CLEANUP |
| `202608100002_authoritative_order_payment_command.sql` | authoritative order payment command | `order_payment_command_receipts`, `mark_order_paid`, `require_finance_eligible_order`, `aa_financial_entries_order_eligibility` | BASE/EVOLUTION |
| `202608100003_repair_production_attempt_consumption_locking.sql` | repair production attempt consumption locking | `production_attempt_consumption_receipts`, `production_attempt_consumption_receipts_service_all`, `consume_production_attempt` | REPAIR/CLEANUP |
| `202608100004_orders_close_and_finance_finalization.sql` | orders close and finance finalization | `order_status_is_closure_eligible`, `fulfillment_workflow_command`, `post_order_finance_income` | BASE/EVOLUTION |
| `202608100006_atomic_production_attempt_qc.sql` | atomic production attempt qc | `consume_production_attempt` | TEMP/DIAGNOSTIC |
| `202608100007_legacy_production_lifecycle_compatibility.sql` | legacy production lifecycle compatibility | `production_jobs`, `production_legacy_classification_report`, `approve_legacy_standalone_production`, `production_linkage_audit`, `repair_production_quote_order_linkage`, `consume_production_attempt`, `production_workflow_command` | LEGACY |
| `202608100008_classify_production_backlog_and_repair_linkage.sql` | classify production backlog and repair linkage | data/privilege change; inspect source | REPAIR/CLEANUP, LEGACY |
| `202608100009_authoritative_production_cancel.sql` | authoritative production cancel | `cancel_production_job` | BASE/EVOLUTION |
| `202608100010_repair_survivor_tree_lifecycle.sql` | repair survivor tree lifecycle | `respond_to_quote_public`, `production_linkage_audit`, `repair_production_quote_order_linkage`, `cancel_production_job` | REPAIR/CLEANUP |
| `202608110001_reconcile_current_e2e_order_lifecycle.sql` | reconcile current e2e order lifecycle | data/privilege change; inspect source | REPAIR/CLEANUP |
## Appendix B — repository evidence inspected

Architecture and audit sources include `AGENTS.md`, `DATA_OWNERSHIP_MATRIX.md`, `DOMAIN_CONTRACTS.md`, `ERP_WORKFLOW_AUTHORITY_VERIFICATION.md`, `PRODUCTION_QUOTE_HANDOFF_DEPLOYMENT_AUDIT.md`, `PREACCEPTANCE_LOCK_SOURCE_AUDIT.md`, `PREACCEPTANCE_ROW_NOWAIT_VERIFICATION.md`, and the migration/verification/test directories. The registry gives precedence to explicit cleanup, runtime-safety repairs, focused tests, and the ownership architecture over old compatibility names.

Useful focused operator companions already in the repository are diagnostic aids, **not substitutes** for the consolidated snapshot: `production_quote_order_identity.sql`, `production_workflow_version_contract.sql`, `production_workflow_execution_graph.sql`, `orders_mark_paid_live_verification.sql`, `finance_*`, and backlog/survivor reports. `install_production_workflow_stage_trace.sql` and `remove_production_workflow_stage_trace.sql` contain persistent DDL and must **not** be run as part of this read-only initiative.
