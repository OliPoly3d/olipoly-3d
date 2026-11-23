# Shared business settings recovery checkpoint

Archived recovery checkpoint from November 23, 2026. The implementation was subsequently reconstructed and freshly verified; see BUSINESS_SETTINGS_REVIEW.md for the current migration, validation and release review. The historical notes below describe the interrupted working copy, not current release status.

## Durable base

Private ERP integration branch base: 03a2c3e8454b400a22229c59eaa4e5eaecaf566e (merged PR #333, editable mileage/tax defaults and HQ origin). Public main is not the ERP test integration target. Site remains https://olipoly-ops-test.siwicki05.chatgpt.site with the previous successful publication. Test Supabase target remains llscjdyiiatmuqhilube.

## Authorized milestone

Build one integrated secondary Settings screen, accessible from Finance/All work/Workspace. Settings must be shared across devices through Supabase. Preserve existing financial records, pricing snapshots, per-order overrides, original Finance Pro settings and audit history. Prepare migration and exact release for approval under AGENTS.md; do not apply or publish on general feature authorization.

## Work completed in the unavailable local working copy

The local build last passed 104 automated checks, zero failures or skips, including PostgreSQL rehearsal, jsdom form interaction and existing order/inventory/Finance regressions. This was prior to environment loss; it is not a verification of reconstructed files. Rebuild and rerun before creating the implementation PR. Full source creation/patch commands and test contents are present in the originating conversation. No remote implementation copy was pushed before the disconnection.

New files from that build:
- js/ops-preview/business-settings-model.js
- js/ops-preview/business-settings.js
- ops-settings-preview.html
- supabase/ops-preview/migrations/20261123151450_ops_test_business_settings.sql
- tests/ops-preview-business-settings.test.js
- tests/ops-preview-business-settings-db.test.mjs

Modified files:
- js/ops-preview/cloud.js
- js/ops-preview/finance-defaults.js
- js/ops-preview/finance.js
- js/ops-preview/model.js
- js/ops-preview/workspace.js
- ops-preview.html, ops-order-preview.html, ops-finance-preview.html
- tests/ops-preview-inventory-db.test.mjs

## Settings contract

Flat version-1 settings object with exactly 14 keys: version, laborRate, planningRate, p1sRate, p2sRate, targetMargin, headquarters, mileageMode, mileageRate, officeSqft, homeSqft, consumerTerms, businessTerms.

Starting values (owner-reviewable assumptions): laborRate 30; planning/P1S/P2S rates 0.53; targetMargin 45; headquarters 'OliPoly 3D LLC — HQ, 990 Aurora Hudson Rd, Aurora, OH 44202'; mileageMode 'irs'; mileageRate 0; officeSqft/homeSqft 0; consumerTerms 'Payment at pickup or completion'; businessTerms 'Net 30 from invoice date'. Rates are owner assumptions, not statutory defaults. Mileage can remain IRS-by-date or become an explicit custom business default, while individual trips remain editable.

Validation: finite nonnegative numeric fields, max 100000 for labor/printer rates, targetMargin <=99.99, mileageRate <=100 (positive for custom mode), floor areas <=1000000; office <= home and either both zero or both positive; text fields nonblank <=120 chars. Round mileageRate to four decimals and other numeric values to two. Home-office percentage is a reference calculation, not automatic tax deduction creation.

## Migration design

The migration filename was generated with Supabase CLI. Preserve that filename if recovering the actual file from the conversation; otherwise generate a new filename with the CLI and obtain approval of the final exact migration.

Add only public.ops_preview_settings_commit(p_settings jsonb, p_expected_revision bigint, p_command_id text, p_reason text). SECURITY DEFINER, fixed public/pg_temp search_path, auth.uid() check, lock owner's public.ops_preview_workspaces row. No new tables or columns. Use existing state.settings and state.settingsHistory JSON keys, increment existing workspace revision, and insert durable public.ops_preview_receipts with exact request/reason/before-settings. Retain last 20 before/after history entries in workspace state, all command receipts indefinitely. Existing ops_preview_load already returns state keys, so do not replace it. Revoke PUBLIC/anon execute, grant authenticated execute only.

Validate complete settings on server. Command retry must compare owner and request excluding the receipt's server-added 'before' key, return current workspace and never reapply old values or duplicate audit. Stale revisions reject with 40001. Existing owner RLS/read-only direct access protects workspace/receipts. No existing orders, inventory, quotes, payments or Finance rows are rewritten.

Local SQL fixes already discovered: parenthesize CASE expressions used in IF comparisons; use ordinal (not n) as history ordinality alias because n is a numeric PL/pgSQL variable. Settings receipt tests must filter request->>'type'='business_settings' because initialize creates an unrelated receipt.

## Runtime integration

Cloud: whitelist settings RPC; settingsSave validates signed-in owner and no pending workspace/Finance save, stores exact account-scoped pending kind='settings', params include UUID and reason; existing retry dispatches this kind to the new RPC and clears only on definitive outcomes. Server persistence remains authoritative.

Model: newRequest(settings) applies shared defaults only when supplied. Snapshot laborRate, targetMargin, terms and costRates={planning,P1S,P2S} into a new project. Existing/sent/approved work is not bulk-updated. Applying defaults to an existing unapproved draft is explicit and preserves item prices/design fee; shared/sent/approved snapshots are protected. EstimatedItemCost takes optional order and uses its planning rate. Actual inspected run cost uses its captured printer rate, then project planning fallback, then legacy 0.53. Never read live global settings when costing an existing project. Suggested pre-tax revenue = estimated cost/(1-targetMargin/100), reusing Production-owned cost calculations and canonical customer totals.

Workspace: add internal editable per-project rates/target margin fields, pass order through all estimate calls, explicit Apply current business defaults button, apply preset-appropriate terms on new intake save. Finance loads settings from existing workspace response, uses saved HQ and optional custom mileage default for new entries only. Historical correction form retains original values. Show shared-settings load failure and keep manually entered records possible. Default helper labels custom mode as owner-set, not IRS-standard.

Settings page: same existing branded internal frame; shared read/save, required reason, last 20 changes, exact pending retry, reload, office ratio preview. Legacy import reads only localStorage key olipoly_finance_settings_v1 (defaultMileageRate,officeSqft,homeSqft), fills form for review without saving or deleting original local settings. Save persists to Supabase. No new browser-only business settings storage.

## Required completion

Recover/reconstruct files in a fresh execution workspace, re-read AGENTS.md, verify fresh base and schema, run syntax/diff and relevant automated checks again, add a final migration/release review with risks and recovery, push coherent implementation and create one draft PR to private integration branch. Ask approval for exact test migration plus merge/private publication. Never claim the 104 prior checks cover reconstructed or changed files without rerunning them. No deployment while execution verification is unavailable.
