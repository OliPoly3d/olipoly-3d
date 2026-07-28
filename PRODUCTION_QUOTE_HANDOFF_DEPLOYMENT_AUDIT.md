# Production quote handoff deployment-state audit

## Evidence boundary

This is a repository and Git-state audit. It does not claim that GitHub Pages or
Supabase has been changed. This checkout has no configured Git remote, Supabase
CLI session, database URL, or deployment credentials. Consequently, push,
GitHub PR, Pages deployment, and live migration status are **unknown until an
operator verifies them**.

## Required commits

| Commit | Responsibility | Current branch | Last known merged main | Origin/pushed | Draft PR | Dependency |
|---|---|---:|---:|---:|---:|---|
| `be5116c` | RLS-safe Production page-load persistence and regression coverage | Yes | Yes, ancestor of merge `66d8fd0` | Unknown: no remote configured | Baseline, not introduced by current PR | Existing Production persistence/RLS contract |
| `b0b84ed` | NULL-versus-zero evidence semantics and safe zero-contamination repair | Yes | Yes, merged by `66d8fd0` | Unknown: no remote configured | Baseline, not introduced by current PR | Must precede handoff testing; migration `202607280005` |
| `f17529c` | Single-dispatch delegated handoff, recovery neutralization, 30-second bound, and no controlled auth replay | Yes | No local merge commit contains it | Unknown: no remote configured | Yes, included in current draft PR lineage | `be5116c`, `b0b84ed` |
| `9b7c7b3` | Global guard, one cryptographic identity, cache-busted asset, single-fetch tests, and non-waiting advisory-lock migration | Yes | No local merge commit contains it | Unknown: no remote configured | Yes | `f17529c`; migration `202607280006` follows `202607280005` |
| `843fc3e` | Clarifies non-persisted identity/deployment behavior | Yes | No local merge commit contains it | Unknown: no remote configured | Yes | `9b7c7b3` |
| `5522ceb` | Codifies confirmed nullable actual columns and adds the deployment/SQL verification package | Yes | No local merge commit contains it | Unknown: no remote configured | Yes | `b0b84ed`, `9b7c7b3`; completes migration `202607280005` reconciliation |
| `1fc3962` | Serializes pre-acceptance commands by Production job, preserves command receipts, maps controlled errors, and documents concurrency verification | Yes | No local merge commit contains it | Unknown: no remote configured | Yes | `9b7c7b3`; migration `202607280007` follows `202607280006` |

The production schema nullability correction is codified in
`202607280005_repair_preproduction_zero_actual_contamination.sql`. Dropping
`NOT NULL` and dropping defaults are idempotent. The guarded cleanup is safe to
rerun because repaired rows no longer match its all-zero predicate.

## Expected frontend markers

- `production-control.html` loads exactly
  `js/production-quote-handoff.js?v=20260728-job-lock-v3` once.
- The client timeout is `setTimeout(() => controller.abort(), 30000)`.
- The controlled RPC options contain `retryAuth:false`.
- Rendered actions use `.quote-action[data-push-quote]` and `type="button"`.
- The module guard is `Symbol.for('olipoly.productionQuoteHandoff')`.
- The final HTML has no obsolete document listener that directly calls
  `pushProductionJobToQuote`.
- `js/erp-reliability.js` wraps native fetch once for health classification; it
  returns the same promise/response and contains no request retry loop.

### Read-only browser-console verification

Run this on the live Production Control page. It fetches static assets with a
unique audit query and `cache: 'no-store'`; it does not read or change business
data.

```js
(async () => {
  const nonce = `deployment-audit-${Date.now()}`;
  const pageUrl = new URL('production-control.html', location.href);
  pageUrl.searchParams.set('audit', nonce);
  const html = await fetch(pageUrl, { cache: 'no-store' }).then(r => r.text());
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const handoffScripts = [...parsed.scripts]
    .map(script => script.getAttribute('src') || '')
    .filter(src => src.includes('production-quote-handoff.js'));
  const assetUrl = new URL(handoffScripts[0] || '', pageUrl);
  assetUrl.searchParams.set('audit', nonce);
  const handoffJs = handoffScripts.length === 1
    ? await fetch(assetUrl, { cache: 'no-store' }).then(r => r.text())
    : '';
  const report = {
    pageUrl: pageUrl.href,
    handoffScripts,
    oneVersionedHandoffScript:
      handoffScripts.length === 1 && handoffScripts[0] ===
        'js/production-quote-handoff.js?v=20260728-job-lock-v3',
    timeout30000: html.includes('setTimeout(() => controller.abort(), 30000)'),
    controlledNoAuthReplay: html.includes('retryAuth:false'),
    canonicalButtons:
      html.includes('class="mini-btn quote-action" data-push-quote="${j.id}" type="button"'),
    globalSymbolGuard:
      handoffJs.includes("Symbol.for('olipoly.productionQuoteHandoff')"),
    canonicalDelegatedSelector:
      handoffJs.includes("'.quote-action[' + 'data-push-quote]'"),
    obsoleteInlineDispatcher:
      /document\.addEventListener\(['"]click['"][\s\S]{0,250}pushProductionJobToQuote/.test(html),
    activeModulePresent: !!window.OliPolyProductionQuoteHandoff,
    activeGlobalModulePresent:
      !!window[Symbol.for('olipoly.productionQuoteHandoff')]
  };
  console.table(report);
  return report;
})();
```

Every Boolean except `obsoleteInlineDispatcher` must be `true`;
`obsoleteInlineDispatcher` must be `false`. In DevTools Network, inspect the
audit-suffixed HTML and JS response bodies—not only the original tab resources.

## Required migrations and order

Do not infer application from Git. Compare the verification report in
`supabase/verification/production_quote_handoff_deployment_state.sql` with
`supabase_migrations.schema_migrations` before applying anything.

1. `202607280005_repair_preproduction_zero_actual_contamination.sql`
   - **Purpose:** make `actual_print_hours` and `actual_filaments` nullable;
     remove evidence-manufacturing defaults from optional actual fields; repair
     only the reviewed pre-production all-zero legacy signature.
   - **Idempotency:** schema alterations are idempotent; repaired rows no longer
     match the guarded update.
   - **Expected verification:** `actual_print_hours` and `actual_filaments` show
     `is_nullable = YES` and `column_default IS NULL`; the documented all-zero
     candidate query returns zero eligible contaminated rows.
2. `202607280006_bound_preacceptance_advisory_lock.sql`
   - **Purpose:** replace only the six-argument pre-acceptance RPC with the
     non-waiting transaction advisory try-lock and controlled `55P03`, while
     preserving receipts, ownership, evidence validation, row locking,
     optimistic concurrency, RLS posture, and grants.
   - **Idempotency:** `CREATE OR REPLACE FUNCTION`, `REVOKE`, and `GRANT` are
     repeatable. It performs no data update.
   - **Expected verification:** `pg_get_functiondef` contains
     `pg_try_advisory_xact_lock` and `55P03`, and does not contain the standalone
     blocking call `perform pg_advisory_xact_lock`.
3. `202607280007_job_scoped_preacceptance_lock.sql`
   - **Purpose:** serialize by Production job UUID before any row lock, retain a
     distinct command-identity try-lock/receipt contract, and add transaction-local
     `lock_timeout = 2s` as secondary protection.
   - **Idempotency:** `CREATE OR REPLACE FUNCTION`, `REVOKE`, and `GRANT` are
     repeatable and perform no data update.
   - **Expected verification:** the definition derives `v_job_lock_key` from
     `p_job_id`, acquires it before `production_jobs ... FOR UPDATE`, contains
     both controlled `55P03` paths, and contains transaction-local `lock_timeout`.

Earlier workflow migrations through
`202607200008_workflow_command_authority_parameter_default_compatibility.sql`
must already be recorded before these three forward migrations. Stop rather than
replaying the complete historical chain against an unknown live database.

## Deployment procedure

1. Configure/fetch the authoritative Git remote and confirm commit ancestry:
   `git fetch origin --prune`, then
   `git merge-base --is-ancestor 843fc3e origin/<deployment-branch>`.
2. Confirm the required commits above are pushed and merged into the branch
   GitHub Pages actually deploys. This checkout cannot identify that branch
   because no remote is configured.
3. Run the read-only SQL report and retain its output with the deployment log.
4. Review/apply missing migrations in the stated order using the repository's
   approved Supabase migration process. Do not paste application source or use
   browser credentials to mutate schema.
5. Rerun the read-only SQL. Confirm nullable/default results, migration records,
   exact RPC markers, receipt indexes/constraints, and only expected triggers.
6. Deploy the merged GitHub Pages branch and wait for the Pages deployment to
   complete successfully.
7. Close every old Production Control tab.
8. Inspect affected backends. If stale calls remain, cancel only matching PIDs
   with the targeted SQL already documented in
   `PRODUCTION_QUOTE_HANDOFF_RELIABILITY.md`; verify the result set is empty.
9. Open a new private window or hard-refresh with cache bypass. Run the browser
   verification snippet above and retain its output.
10. Clear Network and Console; wait two full minutes and confirm zero
    `preacceptance_production_command` requests.
11. On a reviewed clean estimate, click once. Confirm one request, one
    correlation ID, an authoritative returned row, Production advancement, and
    Quote navigation.
12. Wait two minutes, refresh, filter, and sort. Confirm no later replay and no
    additional request without another explicit click.

## Cache and deployment findings

- No service-worker registration or service-worker file exists in the active
  repository.
- GitHub Pages/cache headers are not repository-controlled here. HTML staleness
  must be checked through a unique query, `cache: 'no-store'`, response headers,
  and response body inspection.
- Shared JS assets commonly use version query parameters. The handoff asset was
  changed from an unversioned reference to
  `?v=20260728-job-lock-v3` after the handoff fixes.
- A browser tab that loaded old HTML keeps its already-registered listeners even
  after a new deployment. Close old tabs; a refresh is not equivalent to
  changing code inside an already-running document until navigation completes.

## Live acceptance gate

- [ ] Required commits are present on the actual Pages deployment branch.
- [ ] Live audit-suffixed HTML and handoff JS match every expected marker.
- [ ] Live timeout source contains `30000`.
- [ ] Live RPC definition contains try-lock and controlled `55P03`.
- [ ] Actual columns are nullable and optional defaults are NULL.
- [ ] Receipt indexes/constraints and strict RPC protections remain present.
- [ ] One click creates one handler invocation, correlation ID, and Network RPC.
- [ ] Controlled request performs no auth replay.
- [ ] No advisory-lock waiting queue appears.
- [ ] The clean estimate receives a successful authoritative response and moves
      to Waiting for Customer before Quote navigation.
- [ ] Recovery draft remains data-only on a simulated failure.
- [ ] Two-minute idle, post-click wait, and refresh produce no background replay.
- [ ] RLS, evidence validation, optimistic concurrency, receipts, pricing,
      Finance, Inventory, order numbering, and public URLs remain unchanged.

Until every item is checked against live output, the runtime issue is **not
reported fixed**.
