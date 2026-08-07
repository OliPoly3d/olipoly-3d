const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202608040002_bound_inventory_consumption_and_skip_excluded.sql','utf8');
const verification = fs.readFileSync('supabase/verification/pass_qc_attempt_timeout_outcome.sql','utf8');
const production = fs.readFileSync('production-control.html','utf8');

assert.match(migration,/create or replace function public\.consume_production_attempt\(\s*p_production_job_id uuid,\s*p_attempt_id text,\s*p_correlation_id text,\s*p_expected_updated_at timestamptz,\s*p_roll_usages jsonb,\s*p_workflow_command text\s*\)/i);
assert.match(migration,/returns jsonb/i);
assert.match(migration,/security definer[\s\S]*set search_path = public, pg_temp/i);
assert.match(migration,/set_config\('lock_timeout','2000ms',true\)/);
assert.match(migration,/pg_try_advisory_xact_lock/,'command identity lock is nonblocking');
assert.match(migration,/for update nowait[\s\S]*lockScope=production_job[\s\S]*for update nowait[\s\S]*lockScope=order/,'job and order locks fail promptly');
assert.match(migration,/coalesce\(v_job\.exclude_inventory_reduction,false\)[\s\S]*inventory_skipped[\s\S]*true/,'Inventory-excluded jobs return explicit skipped result');
assert.ok(migration.indexOf('coalesce(v_job.exclude_inventory_reduction,false)') < migration.indexOf('jsonb_array_length(p_roll_usages) = 0'),'excluded jobs skip before roll requirement');
assert.match(migration,/insert into public\.inventory_transactions[\s\S]*'production_attempt_consumption'/,'normal included jobs still write immutable inventory transactions');
assert.match(migration,/production_material_reservations set status = 'consumed'/,'normal included jobs still close reservations');
assert.match(migration,/comment on function public\.consume_production_attempt/);
assert.match(migration,/revoke execute on function public\.consume_production_attempt\(uuid,text,text,timestamptz,jsonb,text\) from public, anon/i);
assert.match(migration,/grant execute on function public\.consume_production_attempt\(uuid,text,text,timestamptz,jsonb,text\) to authenticated, service_role/i);

assert.match(production,/function isAmbiguousAttemptTransport/);
assert.match(production,/The print attempt may have been recorded\. Checking the authoritative result…/);
assert.match(production,/async function reconcileAttemptConsumption/);
assert.match(production,/inventory_transactions\?select=id,correlation_id,attempt_id,production_job_id,quantity_grams,raw_material_id,transaction_type/,'reconciliation reads ledger only');
assert.match(production,/production_jobs\?select=id,order_number,exclude_inventory_reduction,updated_at,job_payload/,'reconciliation reads authoritative Production row');
assert.doesNotMatch(production,/catch\(error\)\{[\s\S]{0,500}sbApi\(request\.path/,'ambiguous timeout handling must not replay the mutation');
assert.match(production,/sameCommandRows\.length[\s\S]*attempt_consumption_reconcile_committed/,'response-loss after commit reconciles by same command identity');
assert.match(production,/authoritativeJob\?\.exclude_inventory_reduction[\s\S]*attempt_consumption_reconcile_excluded/,'excluded authoritative state can reconcile without inventory rows');
assert.match(production,/The print attempt was not recorded\. Your entered values were retained\./,'confirmed no-commit is operator-facing');

assert.match(verification,/Read-only Pass QC \/ consume_production_attempt timeout outcome classifier/);
assert.match(verification,/classification/);
assert.match(verification,/inventory_transactions/);
assert.match(verification,/production_material_reservations/);
assert.match(verification,/recent_lifecycle_events/);
assert.doesNotMatch(verification,/^\s*(insert|update|delete)\b|perform\s+public\.consume_production_attempt/im,'verification SQL must be read-only');

console.log('Pass QC attempt consumption timeout assertions passed.');
