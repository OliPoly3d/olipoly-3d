const assert = require('node:assert/strict');
const fs = require('node:fs');

const production = fs.readFileSync('production-control.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202608100006_atomic_production_attempt_qc.sql', 'utf8');

assert.match(migration, /select \* into v_order[\s\S]*for update nowait;[\s\S]*select \* into v_job[\s\S]*for update nowait/, 'atomic QC uses the canonical Order then Production lock order');
assert.match(migration, /v_reservation public\.production_material_reservations%rowtype/);
assert.match(migration, /reserved_grams=greatest\(coalesce\(reserved_grams,0\)-v_reservation\.reserved_grams,0\)/, 'the already-locked reservation value replaces the scalar subquery');
assert.match(migration, /where id=v_reservation\.id and user_id=v_actor/, 'the locked reservation updates by primary key');
assert.match(migration, /insert into public\.inventory_transactions[\s\S]*update public\.production_jobs[\s\S]*update public\.orders[\s\S]*insert into public\.production_attempt_consumption_receipts/, 'Inventory, Production, Order, and receipt commit in one function transaction');
assert.match(migration, /production_status=v_target/);
assert.match(migration, /'production_job',to_jsonb\(v_job\)/, 'the response carries the authoritative row used by the UI');
assert.match(migration, /if found then[\s\S]*result_snapshot \|\| jsonb_build_object\('idempotent',true\)/, 'same-command replay returns its receipt without consuming again');
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /v_job\.updated_at is distinct from p_expected_updated_at/);
assert.match(migration, /revoke all on function public\.consume_production_attempt[\s\S]*from public,anon/);
assert.doesNotMatch(migration, /OP_ATTEMPT_CONSUME/, 'the durable definition contains no temporary high-volume trace');
assert.doesNotMatch(migration, /select reserved_grams from public\.production_material_reservations/, 'the slow-path scalar rescan is removed');
assert.match(production, /atomicConsumption\?\.production_job \|\| await syncProductionStatusToOrder/, 'an atomic QC response prevents a second lifecycle mutation');
assert.match(production, /select=id,order_number,exclude_inventory_reduction,updated_at,job_payload,production_status/, 'ambiguous response reconciliation reloads canonical Production lifecycle state');
assert.match(production, /production_job:authoritativeJob/, 'reconciliation supplies the cloud row rather than moving locally');

console.log('Atomic authoritative Production QC assertions passed.');
