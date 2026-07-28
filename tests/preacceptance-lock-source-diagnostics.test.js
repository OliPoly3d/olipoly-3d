const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');

const migration = fs.readFileSync('supabase/migrations/202607280008_distinguish_preacceptance_lock_failures.sql','utf8');
const capture = fs.readFileSync('supabase/verification/preacceptance_lock_owner_capture.sql','utf8');
const audit = fs.readFileSync('PREACCEPTANCE_LOCK_SOURCE_AUDIT.md','utf8');

for(const [scope,message] of [
  ['job','Pre-acceptance Production job lock is already held.'],
  ['command','Pre-acceptance command identity lock is already held.'],
  ['row_timeout','Pre-acceptance database row or index lock timed out.']
]){
  assert.ok(migration.includes(message), `${scope} has a distinct server message`);
  assert.ok(migration.includes(`lockScope=${scope}`), `${scope} has structured diagnostic detail`);
}
assert.ok(migration.indexOf('pg_try_advisory_xact_lock(v_job_lock_key)') < migration.indexOf('pg_try_advisory_xact_lock(v_command_lock_key)'));
assert.ok(migration.indexOf('pg_try_advisory_xact_lock(v_command_lock_key)') < migration.indexOf('production_jobs where id = p_job_id for update'));
assert.match(migration, /when lock_not_available then[\s\S]*lockScope=row_timeout/, 'later lock_timeout is not mislabeled as a try-lock failure');

const migrationFiles = execFileSync('find',['supabase/migrations','-type','f','-name','*.sql'],{encoding:'utf8'}).trim().split('\n');
const productionSql = migrationFiles.map(file=>fs.readFileSync(file,'utf8')).join('\n');
assert.doesNotMatch(productionSql, /\bpg_advisory_lock\s*\(/, 'no session-scoped blocking advisory lock exists in production migrations');
assert.doesNotMatch(productionSql, /\bpg_try_advisory_lock\s*\(/, 'no session-scoped advisory try-lock exists in production migrations');
for(const namespace of ['preacceptance-production-job:','preacceptance-production-command:']){
  const files = migrationFiles.filter(file=>fs.readFileSync(file,'utf8').includes(namespace));
  assert.deepEqual(files.map(file=>file.split('/').pop()).sort(), [
    '202607280007_job_scoped_preacceptance_lock.sql',
    '202607280008_distinguish_preacceptance_lock_failures.sql',
    '202607280009_nowait_preacceptance_production_row.sql'
  ], `${namespace} is isolated to the current/superseded preacceptance definitions`);
}
for(const marker of ['backend_start','xact_start','query_start','application_name','blocking_pids','classid','objid','objsubid','transactionid','tuple','relation','pg_get_functiondef','authenticated_can_execute']){
  assert.ok(capture.includes(marker), `live capture includes ${marker}`);
}
assert.match(capture, /to_regprocedure\('public\.preacceptance_production_command\(uuid,text,timestamptz,jsonb,text,text\)'\)/, 'PostgREST target signature is verified exactly');
assert.match(migration, /preacceptance_production_command\(\s*p_job_id uuid,\s*p_command text,\s*p_expected_updated_at timestamptz,\s*p_payload jsonb default '\{\}'::jsonb,\s*p_correlation_id text default null,\s*p_causation_id text default null\s*\)/, 'diagnostic migration replaces only the intended six-argument overload');
assert.doesNotMatch(capture, /\b(update|insert|delete|alter|drop|create|grant|revoke|truncate)\b/i, 'lock-owner capture is read-only');
assert.match(audit, /-8964079901114347293[\s\S]*classid = 2207854802[\s\S]*objid = 3688648931/, 'known job key and unsigned halves are recorded');
assert.match(audit, /returned `true, true`/, 'same-session transaction-lock reentrancy is documented from PostgreSQL execution');

console.log('Pre-acceptance lock-source diagnostic assertions passed.');
