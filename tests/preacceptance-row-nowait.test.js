const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607280009_nowait_preacceptance_production_row.sql','utf8');
const capture = fs.readFileSync('supabase/verification/production_job_write_lock_capture.sql','utf8');
const doc = fs.readFileSync('PREACCEPTANCE_ROW_NOWAIT_VERIFICATION.md','utf8');
const body = migration.slice(migration.indexOf('create or replace function'), migration.indexOf('revoke execute'));

assert.equal((body.match(/for update nowait/g) || []).length, 2, 'new command and receipt replay both lock Production NOWAIT');
assert.ok(body.indexOf('pg_try_advisory_xact_lock(v_job_lock_key)') < body.indexOf('for update nowait'), 'job advisory authority remains first');
assert.match(body, /v_lock_stage := 'production_row'[\s\S]*for update nowait/);
assert.match(body, /v_lock_stage := 'receipt_replay_production_row'[\s\S]*for update nowait/);
assert.match(body, /Production job row is busy in another operation\.[\s\S]*lockScope=row_nowait/);
assert.match(body, /Pre-acceptance database lock timeout\.[\s\S]*lockScope=database_lock_timeout[\s\S]*stage=%s/);
assert.match(body, /v_lock_stage := 'receipt_lookup'[\s\S]*v_lock_stage := 'production_update'[\s\S]*v_lock_stage := 'receipt_insert'/);
assert.match(body, /actual_grams_used is not null[\s\S]*updated_at is distinct from p_expected_updated_at/, 'evidence and optimistic checks remain');
assert.match(migration, /revoke execute[\s\S]*from public, anon;[\s\S]*grant execute[\s\S]*authenticated, service_role;/);
const captureStatements = capture.replace(/--.*$/gm, '').split(';').map((statement) => statement.trim()).filter(Boolean);
assert.ok(captureStatements.every((statement) => /^(with|select)\b/i.test(statement)), 'write-lock capture contains only read-only statements');
for(const marker of ['backend_start','xact_start','query_start','wait_event_type','wait_event','blocking_pids','relation_name','tuple','transactionid','27be9786-47bb-4e20-a4b5-5ad05c407f08']) assert.ok(capture.includes(marker), marker);
assert.match(doc, /returned in \*\*156 ms\*\*[\s\S]*exactly one receipt/, 'real local two-session result is recorded');

console.log('Pre-acceptance Production row NOWAIT assertions passed.');
