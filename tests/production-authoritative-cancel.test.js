const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('production-control.html', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/202608100009_authoritative_production_cancel.sql',
  'utf8'
);

const cancel = ui.slice(ui.indexOf('async function cancelJob'), ui.indexOf('async function deleteJob'));
assert.match(cancel, /rpc\/cancel_production_job/);
assert.match(cancel, /await sbApi/);
assert.match(cancel, /await fetchAuthoritativeProductionJob\(id\)/);
assert.match(cancel, /p_expected_updated_at:current\.updated_at/);
assert.match(cancel, /postgresCode \|\| err\?\.code\) === '40001'/);
assert.match(cancel, /latest state has been refreshed/);
assert.match(cancel, /Production and Order are out of sync/);
assert.match(cancel, /if\(!authoritative \|\| !CLOSED\.includes\(authoritative\.production_status\)\)/);
assert.match(cancel, /await refreshAuthoritativeProductionState\(\)/);
assert.doesNotMatch(cancel, /cloudSaveJob\(/, 'Cancel must not use the ordinary-save PATCH fallback');
assert.doesNotMatch(cancel, /applyReservationDelta\(/, 'reservation release belongs to the atomic cancellation RPC');
assert.equal((cancel.match(/rpc\/cancel_production_job/g) || []).length, 1, 'one Cancel path issues one authoritative RPC');
assert.equal((cancel.match(/await sbApi\('\/rest\/v1\/rpc\/cancel_production_job'/g) || []).length, 1, 'Cancel is never automatically retried');
assert.ok(cancel.indexOf('await sbApi') < cancel.indexOf('state.jobs = state.jobs.map'), 'UI changes only after authoritative success');

const revalidate = ui.slice(ui.indexOf('async function fetchAuthoritativeProductionJob'), ui.indexOf('async function syncProductionStatusToOrder'));
assert.match(revalidate, /production_jobs\?select=\*&id=eq\./);
assert.match(revalidate, /user_id=eq\./);
assert.match(revalidate, /raw\.user_id !== state\.user\.id/);
assert.match(revalidate, /authoritative\.updated_at = raw\.updated_at/);
assert.doesNotMatch(revalidate, /job_payload.*updated_at|Date\.now\(/);
assert.ok(cancel.indexOf('fetchAuthoritativeProductionJob') < cancel.indexOf("rpc/cancel_production_job"), 'revalidation precedes cancellation');
assert.ok(cancel.indexOf("rpc/cancel_production_job") < cancel.indexOf('state.jobs = state.jobs.map'), 'active card changes only after RPC success');
assert.doesNotMatch(cancel.slice(cancel.indexOf('{') + 1), /(?:await|return)\s+cancelJob\(/, 'conflict recovery must not retry the destructive function');

assert.match(ui, /Production and Order are out of sync\./);
assert.match(ui, /Sync \/ Repair/);
assert.match(migration, /security definer/);
assert.match(migration, /user_id = v_actor/);
assert.match(migration, /v_job\.updated_at is distinct from p_expected_updated_at/);
assert.match(migration, /workflow_command_receipts/);
assert.match(migration, /production_material_reservations[\s\S]*status = 'active'/);
assert.match(migration, /raw_material_inventory/);
assert.doesNotMatch(migration, /delete\s+from/i);
assert.doesNotMatch(migration, /truncate/i);
assert.match(migration, /revoke all .* from public, anon/);

console.log('Authoritative Production cancellation assertions passed.');
