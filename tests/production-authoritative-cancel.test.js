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
assert.match(cancel, /if\(!authoritative \|\| !CLOSED\.includes\(authoritative\.production_status\)\)/);
assert.match(cancel, /await refreshAuthoritativeProductionState\(\)/);
assert.doesNotMatch(cancel, /cloudSaveJob\(/, 'Cancel must not use the ordinary-save PATCH fallback');
assert.doesNotMatch(cancel, /applyReservationDelta\(/, 'reservation release belongs to the atomic cancellation RPC');
assert.ok(cancel.indexOf('await sbApi') < cancel.indexOf('state.jobs = state.jobs.map'), 'UI changes only after authoritative success');

assert.match(ui, /not authoritatively linked[\s\S]*before changing its lifecycle/);
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
