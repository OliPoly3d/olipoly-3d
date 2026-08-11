# Test Contract Reconciliation

## Scope and conclusion

This audit ran each reported test against commit `e805546` before changing it, inspected the production surfaces, migrations, architecture/audit documents, newer domain tests, and relevant Git history, and then reran each changed test. Eight tests reproduced a source-contract assertion failure. `production-material-reservations.test.js` passed when first run alone but failed in the combined nine-test run because its brittle block extractor recognized only modern linked rows, not the current explicitly classified legacy-authority branch. No production application code or migration was changed.

## Initial failure capture

| Test | Failure | Expected | Actual | Source under test | Likely category |
|---|---|---|---|---|---|
| `engine-rc2-6-niles-exclusion-decision.test.js` | Runtime assertion at line 25 | No files outside the original RC2.6 milestone allowlist changed since `6d7a676` | Every legitimate repository change made after that historical baseline appeared as a violation | Git working tree, `niles.html`, RC2.4–2.6 docs, migrations | Legacy repository-state contract |
| `finance-ohio-county-dependency.test.js` | Source-contract assertion at line 23 | PostgreSQL fixture must not define `is_ohio_county` before migrations | Fixture contained a two-county stub (`Portage`, `Summit`) | `tests/sql/finance-adjustment-helper-postgres.test.sql`; migrations `202608020003` and `202608020004` | Fixture |
| `orders-finance-shipping-charged.test.js` | String-contract assertion at line 51 | Exact old success copy: “Order [already] posted to Finance.” | Current copy: “Finance entry [already exists/is created] and [the] Order [is] closed.” | `orders-admin.html`; shipping normalization and Finance posting migrations | Stale wording |
| `orders-phone-schema-contract.test.js` | String-contract assertion at line 49 (then the adjacent closed-edit wording assertion) | Phone rendering called `T.esc`; exact old closed-edit copy | Rendering calls the current `esc`; closed edits say “This order is closed and cannot be edited.” | `orders-admin.html`; optional-phone migrations and verification | Stale implementation-name/copy |
| `production-material-reservations.test.js` | Runtime `TypeError` at line 53 in the combined run | Extract a linked-work block, then verify RPC-owned reservations and no browser-direct mutation | Extractor returned `null` because the condition now also includes `legacy_standalone` | Reservation migration, `production-control.html`, `js/workflow-status.js` | Stale implementation shape |
| `production-quote-order-identity.test.js` | String-contract assertion at line 22 | Exact banner “Order created, Production linkage incomplete.” | Current UI reports “Production and Order are out of sync” and fails lifecycle changes closed when not authoritatively linked | Identity migration, `production-control.html`, `quote.js`, identity audit | Stale wording |
| `production-status-persistence.test.js` | Source-contract assertion at line 54 | Obsolete `typeof syncStatus !== 'function'` guard text | No `syncStatus`; pre-acceptance commands and post-command cloud hydration are authoritative | `production-control.html`, persistence helper, acceptance/status migrations | Retired contract |
| `quote-handoff-outcome-observability.test.js` | Source-contract assertion at line 15 | Diagnostic assignments in an old field order and at the handoff call site | Shared API boundary assigns `details`, application/transport `postgresCode`, and `hint`; handoff logger consumes them | `production-control.html`, handoff helper, observability audit | Stale implementation-shape |
| `workflow-command-authority.test.js` | Source-contract assertion at line 63, with further obsolete shape assertions exposed sequentially | Every linked transition directly calls one exact expression; cancellation blocked; close follows an old PATCH shape | Atomic QC can return the authoritative job without a second dispatch; cancellation has a dedicated RPC; close uses hydrated `updated_at` directly | workflow migration, `production-control.html`, `orders-admin.html`, workflow helper, newer atomic-QC/cancel tests | Retired workflow shape |

## Per-test determinations

### 1. `engine-rc2-6-niles-exclusion-decision.test.js`

- **Old expectation:** the entire repository forever differs from commit `6d7a676` only by the six files in the original RC2.6 milestone.
- **Current intended contract:** Niles remains frozen and excluded; no Niles-specific importer, migration, RPC, trigger, or conversion path exists. Future unrelated work is permitted.
- **Classification:** **C. LEGACY CONTRACT NO LONGER AUTHORITATIVE**.
- **Evidence/source of truth:** `ENGINE_RC2_6_NILES_MIGRATION_DECISION.md` defines exclusion and freezes `niles.html`; RC2.4/RC2.5 docs preserve generic campaign authority; the tracked implementation/migration inventory contains no Niles implementation; Git history shows the test was milestone-scoped in `ded23f0`.
- **Change made:** removed the historical whole-repository diff allowlist and public-page change prohibition. Retained the baseline byte hash and external-reference checks for `niles.html`, all decision assertions, and the no-Niles-schema checks; added a current tracked-file check for Niles implementation artifacts.
- **Why safe:** it removes only a temporal milestone constraint while strengthening the enduring product boundary.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** a generically named implementation could theoretically special-case Niles internally; migration contents and decision-text assertions still guard likely paths.

### 2. `finance-ohio-county-dependency.test.js`

- **Old expectation:** the PostgreSQL fixture exercises the real restored 88-county helper rather than masking it.
- **Current intended contract:** migration `202608020004` supplies the canonical helper used by the correction RPC; the fixture must load that migration before invoking the RPC.
- **Classification:** **D. ENVIRONMENT / FIXTURE ISSUE**.
- **Evidence/source of truth:** migrations `202608010003`, `202608020003`, and `202608020004`; `supabase/verification/finance_ohio_county_contract.sql`; the test itself verifies all 88 canonical counties and narrow grants.
- **Change made:** deleted only the fixture’s two-county stub. Migration order and real-RPC execution remain unchanged.
- **Why safe:** the fixture can no longer produce a false pass with a noncanonical validator.
- **Production code changed?** No.
- **Test changed?** Fixture only.
- **Remaining risk:** the SQL integration fixture still requires an available PostgreSQL environment to execute end-to-end.

### 3. `orders-finance-shipping-charged.test.js`

- **Old expectation:** exact historical success-message wording.
- **Current intended contract:** the Finance command resolves `shipping_charged`, returns an authoritative result, closes the Order transactionally, refreshes Orders, and distinguishes idempotent success semantically.
- **Classification:** **B. STALE TEST EXPECTATION**.
- **Evidence/source of truth:** `202608010001_repair_order_finance_shipping_charged.sql`, `202607210005_authoritative_finance_posting_corrections.sql`, current `postOrderToFinanceCommand`/`pushCurrentOrderToFinance`, and newer Finance command/close tests.
- **Change made:** aligned the copy assertion with current semantics and added an assertion that success consumes the command result and refreshes Orders.
- **Why safe:** all shipping resolution, non-null, contradiction, RLS, idempotency, diagnostics, and no-browser-default guards remain intact.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** this remains primarily a static contract test; live RPC behavior depends on deployed migrations.

### 4. `orders-phone-schema-contract.test.js`

- **Old expectation:** a particular escape helper name and prior closed-edit message.
- **Current intended contract:** `orders.customer_phone` is nullable, normalized, persisted as `customer_phone`, escaped when rendered, and immutable through ordinary Save after closure.
- **Classification:** **B. STALE TEST EXPECTATION**.
- **Evidence/source of truth:** migrations `202608020006`/`202608020007`, verification SQL, current Orders form/payload/hydration/list rendering, and `quote-order-phone-contract.test.js`.
- **Change made:** assert the current escaping path and semantic closed-order rejection instead of obsolete helper/copy text.
- **Why safe:** schema preflight equality, normalization, grants, trigger ownership, persistence, hydration, and output escaping are still asserted.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** no browser was used; static HTML contracts and suite coverage passed.

### 5. `production-material-reservations.test.js`

- **Old expectation:** RPC-owned durable reservations, atomic consumption authority, and no browser-direct mutation for linked work.
- **Current intended contract:** unchanged: reserve at Ready to Print, retain while Printing, atomically consume/release at QC, and preserve/re-reserve through Needs Reprint as defined by current authority.
- **Classification:** **B. STALE TEST EXPECTATION**.
- **Evidence/source of truth:** `202607210004_authoritative_production_material_reservations.sql`, `202608100006_atomic_production_attempt_qc.sql`, current Production orchestration, AGENTS architecture rules, and passing atomic-QC/attempt-consumption tests.
- **Change made:** updated only the block extractor to include the explicitly classified `legacy_standalone` command-authority branch and added a clear extraction assertion before the existing reservation checks.
- **Why safe:** every reservation, RPC privilege, concurrency, ledger, and no-browser-direct-mutation assertion remains unchanged.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** the extractor still follows source structure; focused atomic-QC runtime tests provide complementary behavior coverage.

### 6. `production-quote-order-identity.test.js`

- **Old expectation:** one exact linkage-warning sentence.
- **Current intended contract:** modern rows link `production_jobs.quote_number`, `production_jobs.order_number`, and `orders.source_quote_number`; mismatched/incomplete linkage is visible and lifecycle actions fail closed. Explicitly classified legacy rows follow separate compatibility authority.
- **Classification:** **B. STALE TEST EXPECTATION**.
- **Evidence/source of truth:** migration `202608030001`, `PRODUCTION_QUOTE_ORDER_IDENTITY.md`, current UI guards, verification SQL, and newer legacy lifecycle/backlog repair tests.
- **Change made:** replaced exact old copy with assertions for visible mismatch state and fail-closed lifecycle behavior; retained all modern identity columns/index/trigger/RPC/repair assertions.
- **Why safe:** the identity boundary is tested more directly and legacy compatibility is not conflated with modern records.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** static checks do not establish live deployment state; repository verification SQL remains required operationally.

### 7. `production-status-persistence.test.js`

- **Old expectation:** obsolete `syncStatus`-absence guard text.
- **Current intended contract:** lifecycle changes dispatch through `syncPreAcceptanceProductionStatus` or linked workflow commands, consume server-returned rows, and refresh authoritative cloud state before rendering; remote lifecycle wins over recovery cache after refresh.
- **Classification:** **C. LEGACY CONTRACT NO LONGER AUTHORITATIVE**.
- **Evidence/source of truth:** `js/production-status-persistence.js` behavioral merge/diagnostics tests, current command calls and refresh, acceptance/status migrations, authoritative hydration and browser-recovery audits.
- **Change made:** replaced the helper-name assertion with command-dispatch and post-success authoritative-refresh assertions. Existing executable merge tests already verify refresh conflict behavior.
- **Why safe:** this explicitly tests persistence behavior and never restores generic fallback saves.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** full browser refresh against live Supabase was not performed.

### 8. `quote-handoff-outcome-observability.test.js`

- **Old expectation:** exact ordered assignments at an old implementation location.
- **Current intended contract:** one shared API boundary preserves structured PostgREST diagnostics, and handoff classification/logging emits safe structured fields without credentials or payloads.
- **Classification:** **B. STALE TEST EXPECTATION**.
- **Evidence/source of truth:** current `sb` API error construction, handoff diagnostic block, `js/production-quote-handoff.js`, `QUOTE_HANDOFF_OUTCOME_OBSERVABILITY.md`, and newer transport/preacceptance trace tests.
- **Change made:** assert structured fields at the shared boundary and their structured consumption by handoff logging.
- **Why safe:** timeout outcomes, timeout disarm, field completeness, secret/payload exclusion, and unresolved-live-acceptance statements remain guarded.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** live network timing remains an operational/browser verification concern.

### 9. `workflow-command-authority.test.js`

- **Old expectation:** a pre-atomic-QC single expression, browser recovery on every QC path, blocked cancellation, and close following an obsolete preceding-PATCH shape.
- **Current intended contract:** a lifecycle action dispatches once; atomic QC/consumption may return the authoritative Production row directly; non-atomic transitions use the workflow RPC; cancellation uses `cancel_production_job`; close uses the hydrated Order version and consumes its RPC row; no generic fallback save exists.
- **Classification:** **C. LEGACY CONTRACT NO LONGER AUTHORITATIVE**.
- **Evidence/source of truth:** workflow command migration, atomic QC and authoritative cancel migrations, current Production/Orders handlers, newer single-dispatch/QC/cancel/close tests, and Git history (`f58bf64a`, later repair commits).
- **Change made:** reconciled static assertions with atomic return-or-single-dispatch, recovery only for non-atomic work, authoritative cancellation, legacy classification routing, and current close behavior.
- **Why safe:** all privilege revocation, command identity, optimistic concurrency, receipt, RLS, no-direct-status-write, no-generic-helper, inventory ordering, and authoritative-row guards remain.
- **Production code changed?** No.
- **Test changed?** Yes.
- **Remaining risk:** it is still a broad static authority test; focused runtime tests provide complementary behavioral coverage.

## Tests replaced or retired

No test file was removed. Obsolete assertions were replaced in place. The RC2.6 whole-repository historical-diff constraint, `syncStatus` text check, old Finance/phone/linkage copy, old diagnostic assignment shape, and pre-atomic workflow call-shape assertions were retired. Current security and authority boundaries remain covered.

## Manual browser tests required

No runnable UI behavior changed, so no screenshot was warranted. For release confidence, manually verify only operational integrations: refresh Production after a command and confirm cloud state wins; post a shipping-bearing Order to Finance and confirm the refreshed closed Order; render an Order with a phone number; and exercise Quote handoff error diagnostics without exposing credentials.
