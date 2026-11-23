# Shared business settings review

Prepared November 23, 2026 after reconstructing the unpublished changes from the recovery checkpoint. This is a completed review package, not an applied migration or published release.

## Owner experience

A Settings link in All work, Workspace and Finance opens the same branded secondary ERP screen. It loads and saves per-owner defaults in the existing shared Supabase test workspace. It contains:

- Hands-on labor cost per hour.
- Planning printer cost per hour and separate P1S/P2S operating costs per hour.
- Target margin percentage, which suggests revenue before tax without changing selling prices automatically.
- Mileage origin, initially OliPoly HQ; IRS trip-date rates or an explicit custom business rate.
- Office/home floor areas with a calculated percentage for reference. Saving does not create a tax deduction or expense.
- Consumer and business/PO payment terms.
- Required change reason and recent before/after history.

Starting values preserve the test assumptions: labor $30/hour, printer rates $0.53/hour, target margin 45%, IRS mileage mode, home-office values unset (zero), and the established HQ address. These are reviewable business assumptions. Saving them is an owner decision.

New requests copy saved defaults into their own laborRate, targetMargin, terms and costRates. Existing drafts receive them only through Apply current business defaults. Sent/approved projects are protected. Applying defaults leaves item prices and design charges unchanged. New intake uses terms matching its selected consumer/business preset. The internal production cost model owns machine/labor estimates and margin suggestions; customer totals still use the existing canonical quote calculator.

Actual run estimates use the project's captured printer rate, then its planning rate, then the original $0.53 legacy assumption. Later global edits do not change old project costs. Finance uses saved origin/custom rate for new mileage entries while preserving historical trips and per-trip overrides.

## Finance Pro preservation

Import legacy settings from this device reads only the existing localStorage key olipoly_finance_settings_v1 and its defaultMileageRate, officeSqft and homeSqft. It fills the form for review; Save is required to make those values shared. It does not delete or modify the old key. The import must be opened in the browser where the legacy settings were saved. This one-way bridge is not new browser-only business storage. Existing ledger records and all other Finance Pro features remain untouched.

## Exact migration for approval

File: `supabase/ops-preview/migrations/20261123153417_ops_test_business_settings.sql` (generated using Supabase CLI after workspace recovery).

Target: **OliPoly ERP Test, llscjdyiiatmuqhilube only**.

Adds only `public.ops_preview_settings_commit(jsonb,bigint,text,text)`. No tables/columns are added and no existing functions, RLS policies, identifiers or financial records are rewritten. It uses public.ops_preview_workspaces.state.settings and state.settingsHistory, increments the existing workspace revision, and writes existing public.ops_preview_receipts. No default values are inserted by migration application.

The RPC requires authentication and the owner's workspace, validates a complete versioned settings object, locks the workspace, rejects stale revisions and stores the exact command/reason/previous settings. Exact replay returns the current workspace without duplicating history or restoring outdated defaults. Only authenticated callers receive execute permission. Direct workspace/receipt updates remain denied by existing grants/RLS. The last 20 changes appear in the workspace; durable receipts retain every settings change. Existing ops_preview_load already returns the state fields and remains unchanged.

Preflight on the target confirmed a healthy test project, RLS enabled on both existing tables, no settings RPC and no stored settings. These were read-only checks. The new RPC was rehearsed locally in PostgreSQL, not applied to Supabase.

Affected reads: existing workspace load response supplies settings to the new screen, request flow and Finance. Affected writes: the new command changes only settings/history, revision/timestamp and one receipt. Existing quote/order/inventory and Finance RPCs remain unchanged. The browser adapter gives pending settings saves a distinct kind and retries the same identity through the settings RPC.

## Validation

105 checks passed on the reconstructed implementation, zero failures/skips: settings validation, legacy import, actual Settings save/history, actual Finance mileage defaults/overrides, actual draft Apply current defaults preserving selling prices, database persistence and isolation, stale writes, idempotent replay, history retention, new-request snapshot preservation and existing Finance/order/inventory/PO/shipping flows. All changed runtime scripts pass node --check; git diff --check passes. jsdom is DOM interaction coverage, not an iPad visual walkthrough.

QA dependencies are installed outside the repository. Run with OPS_JSDOM_MODULE pointing to jsdom/lib/api.js and OPS_PGLITE_MODULE to @electric-sql/pglite/dist/index.js. The new dedicated test files are tests/ops-preview-business-settings.test.js and tests/ops-preview-business-settings-db.test.mjs. The existing inventory DB rehearsal includes this new migration; Finance correction DB rehearsal discovers it automatically.

## Risks and recovery

A settings save increments the shared workspace revision, so another device editing old work must refresh before saving. Existing prices and snapshots are not repriced. Record-level overrides remain authoritative. A changed default is not a tax treatment election or actual bill amount. Home-office data is a reference until the annual tax helpers are ported/reviewed.

If a release needs recovery, preserve saved settings, project snapshots, receipts and history. Prefer a forward UI fix or an audited settings change. Resolve pending commands before a code rollback. The previous Site version has the old fixed printer-cost calculation, so do not rely on its cost previews for new projects carrying custom rates; restoring the compatible costing code is necessary before using those previews. The unused settings RPC may remain; no destructive data rollback is required. No live production/public-site replacement is authorized here.

## iPad and cross-device review after approved release

1. Settings: review assumptions, save a fictional change with a reason, inspect before/after history.
2. Open on the other device; confirm persisted values.
3. New request: select consumer or business; verify matching terms, labor and captured printer rates in Quote builder.
4. Change a draft's item price, apply current defaults, confirm that selling price is retained and save deliberately.
5. Change shared defaults again; old projects must retain their captured values. Sent/approved work must remain protected.
6. Finance: verify shared starting location and IRS/custom mileage behavior; override one trip and confirm persistence.
7. Legacy import: verify preview first and shared persistence only after Save; the old local key must remain.
8. Attempt an old-device save after a new-device settings change; refresh/review instead of overwriting.
