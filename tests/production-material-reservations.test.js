const assert = require('assert');
const fs = require('fs');

const migration = fs.readFileSync('supabase/migrations/202607210004_authoritative_production_material_reservations.sql', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');
const workflow = fs.readFileSync('js/workflow-status.js', 'utf8');

assert.match(migration, /create table if not exists public\.production_material_reservations/i, 'durable reservation table must be created');
assert.match(migration, /production_job_id uuid not null/i, 'reservation must identify Production job');
assert.match(migration, /order_number text not null/i, 'reservation must identify accepted Order linkage');
assert.match(migration, /raw_material_roll_id uuid not null/i, 'reservation must identify raw-material roll');
assert.match(migration, /reserved_grams numeric not null/i, 'reservation must persist grams');
assert.match(migration, /status text not null/i, 'reservation must persist lifecycle status');
assert.match(migration, /reservation_command_id text not null/i, 'reservation must persist command identity');
assert.match(migration, /enable row level security/i, 'RLS must be enabled');
assert.match(migration, /for select[\s\S]*to authenticated[\s\S]*using \(user_id = auth\.uid\(\)\)/i, 'authenticated clients may select only owner rows');
assert.match(migration, /revoke all on public\.production_material_reservations from public, anon, authenticated/i, 'normal browser mutation grants must be revoked');
assert.match(migration, /grant select on public\.production_material_reservations to authenticated/i, 'authenticated grant must be select-only');
assert.match(migration, /production_material_reservations_active_job_roll_once[\s\S]*where status = 'active'/i, 'exactly one active reservation per job and roll');

for (const fn of ['reserve_production_material', 'release_production_material_reservation', 'consume_production_attempt']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public, pg_temp`, 'i'), `${fn} must be SECURITY DEFINER with fixed search_path`);
  assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]*from public, anon`, 'i'), `${fn} must revoke PUBLIC/anon execution`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to authenticated, service_role`, 'i'), `${fn} must grant reviewed roles`);
}

assert.match(migration, /auth\.uid\(\)/, 'RPCs must use authenticated owner');
assert.match(migration, /p_expected_updated_at/i, 'RPCs require optimistic concurrency');
assert.match(migration, /for update/g, 'RPCs lock Production, Order, reservation, and roll rows');
assert.match(migration, /v_job\.order_number is null/i, 'RPCs verify accepted Order linkage');
assert.match(migration, /remaining_grams/i, 'remaining_grams is the on-hand authority');
assert.doesNotMatch(migration, /current_grams\s*=/i, 'current_grams must not be mutated');
assert.match(migration, /remaining_grams,0\) - coalesce\(r\.reserved_grams,0\)/i, 'available grams equals remaining minus active reserved grams');
assert.match(migration, /Duplicate roll reservation lines are not allowed/i, 'duplicate reservation roll lines rejected');
assert.match(migration, /Duplicate roll usage lines are not allowed/i, 'duplicate usage roll lines rejected');
assert.match(migration, /greater than zero and finite/i, 'non-finite/nonpositive quantities rejected');
assert.match(migration, /insufficient available material/i, 'insufficient availability rejected');
assert.match(migration, /if v_existing is not null[\s\S]*idempotent', true/i, 'same-command retries return original result');
assert.match(migration, /Command identity is already used for another owner, job, roll set, or command/i, 'command identity collision rejected');
assert.match(migration, /remaining_grams = remaining_grams - v_grams/i, 'consumption decrements remaining grams');
assert.match(migration, /reserved_grams = greatest\(coalesce\(r\.reserved_grams,0\) - a\.reserved_grams/i, 'consumption releases entire active reserved line exactly once');
assert.match(migration, /status = 'consumed'/i, 'consumption closes reservation lines');
assert.match(migration, /insert into public\.inventory_transactions/i, 'consumption writes immutable ledger rows');
assert.match(migration, /status = 'released'/i, 'release closes active reservation lines');
assert.match(migration, /Consolidated read-only JSONB verification query/i, 'migration must include consolidated verification query');

assert.match(workflow, /inventoryReservationRpcRequest/, 'client must build reserve RPC request');
assert.match(workflow, /\/rest\/v1\/rpc\/reserve_production_material/, 'client must call reserve RPC');
assert.match(workflow, /inventoryReservationReleaseRpcRequest/, 'client must build release RPC request');
assert.match(workflow, /\/rest\/v1\/rpc\/release_production_material_reservation/, 'client must call release RPC');
assert.match(workflow, /commandIdentity\('inventory-reservation'/, 'reservation must have durable command identity');
assert.match(workflow, /commandIdentity\('inventory-reservation-release'/, 'release must have durable command identity');
const linkedBlock = production.match(/if\(j\.order_number\)\{[\s\S]*?return;\n    \}/)[0];
assert.match(linkedBlock, /reserveLinkedProductionMaterial/, 'linked ready-to-print path routes reservations through RPC');
assert.match(production, /releaseLinkedProductionMaterial/, 'linked release path routes through RPC');
assert.doesNotMatch(linkedBlock, /applyReservationDelta\(/, 'linked workflow must not browser-direct mutate reserved_grams');
assert.match(production, /rememberLinkedWorkflowRecovery\(j, status, updated, lifecycleAction\)/, 'recovery remains durable before cross-domain workflow completion');
assert.match(production, /syncProductionStatusToOrder[\s\S]*reserveLinkedProductionMaterial/, 'local linked lifecycle waits for authoritative workflow response before reservation');

console.log('Production material reservation assertions passed.');
