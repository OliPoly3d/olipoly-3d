const assert = require('node:assert/strict');
const fs = require('node:fs');

// Always assert the final deployed authority, not the superseded implementation.
const migration = fs.readFileSync('supabase/migrations/202608100003_repair_production_attempt_consumption_locking.sql','utf8');
const verification = fs.readFileSync('supabase/verification/pass_qc_attempt_timeout_outcome.sql','utf8');
const waits = fs.readFileSync('supabase/verification/consume_production_attempt_waits.sql','utf8');
const production = fs.readFileSync('production-control.html','utf8');

assert.match(migration,/create or replace function public\.consume_production_attempt\(\s*p_production_job_id uuid,\s*p_attempt_id text,\s*p_correlation_id text,\s*p_expected_updated_at timestamptz,\s*p_roll_usages jsonb,\s*p_workflow_command text\s*\)/i);
assert.match(migration,/returns jsonb/i);
assert.match(migration,/security definer[\s\S]*set search_path\s*=\s*public\s*,\s*pg_temp/i);
assert.match(migration,/set_config\('lock_timeout','2000ms',true\)/);
assert.match(migration,/pg_try_advisory_xact_lock/,'command identity lock is nonblocking');
assert.match(migration,/for update nowait[\s\S]*lockScope=production_job/,'Production lock fails promptly');
assert.match(migration,/for update of a,r nowait[\s\S]*lockScope=reservation_roll/,'reservation and roll locks fail promptly');
assert.doesNotMatch(migration,/\b(pg_advisory_xact_lock|for update)(?!\s+(?:of\s+a,r\s+)?nowait)\b/i,'final authority cannot introduce an unbounded lock wait');
assert.match(migration,/coalesce\(v_job\.exclude_inventory_reduction,false\)[\s\S]*inventory_skipped[\s\S]*true/,'Inventory-excluded jobs return explicit skipped result');
assert.ok(migration.search(/coalesce\(v_job\.exclude_inventory_reduction\s*,\s*false\)/) < migration.search(/jsonb_array_length\(p_roll_usages\)\s*=\s*0/),'excluded jobs skip before roll requirement');
assert.match(migration,/insert into public\.inventory_transactions[\s\S]*'production_attempt_consumption'/,'normal included jobs still write immutable inventory transactions');
assert.match(migration,/production_material_reservations set status\s*=\s*'consumed'/,'normal included jobs still close reservations');
assert.match(migration,/production_attempt_consumption_receipts[\s\S]*result_snapshot/,'durable receipt supports response-loss reconciliation');
assert.match(migration,/if found then[\s\S]*result_snapshot[\s\S]*'idempotent',true/,'receipt replay returns without consuming again');
assert.doesNotMatch(migration,/perform\s+(?:public\.)?consume_production_attempt|select\s+(?:public\.)?consume_production_attempt/i,'authority cannot recursively invoke itself');
assert.match(migration,/comment on function public\.consume_production_attempt/);
assert.match(migration,/revoke execute on function public\.consume_production_attempt\(uuid,text,text,timestamptz,jsonb,text\) from public\s*,\s*anon/i);
assert.match(migration,/grant execute on function public\.consume_production_attempt\(uuid,text,text,timestamptz,jsonb,text\) to authenticated\s*,\s*service_role/i);

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

assert.match(waits,/pg_stat_activity/);
assert.match(waits,/pg_blocking_pids/);
assert.match(waits,/pg_locks/);
assert.match(waits,/wait_event_type/);
assert.match(waits,/transaction_age/);
assert.match(waits,/query_age/);
assert.doesNotMatch(waits,/^\s*(insert|update|delete|alter|create|drop|perform)\b/im,'wait inspection must be read-only');

console.log('Pass QC attempt consumption timeout assertions passed.');
