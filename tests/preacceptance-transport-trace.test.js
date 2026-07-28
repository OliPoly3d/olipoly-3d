const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/202607280010_trace_preacceptance_transport_boundary.sql');
const previous = read('supabase/migrations/202607280009_nowait_preacceptance_production_row.sql');
const capture = read('supabase/verification/preacceptance_transport_trace_capture.sql');
const script = read('scripts/preacceptance-authenticated-trace.mjs');
const html = read('production-control.html');
const doc = read('PREACCEPTANCE_TRANSPORT_TRACE.md');

for(const authority of [
  'security definer set search_path = public, pg_temp',
  "pg_try_advisory_xact_lock(v_job_lock_key)",
  "pg_try_advisory_xact_lock(v_command_lock_key)",
  'for update nowait',
  'actual_grams_used is not null',
  'updated_at is distinct from p_expected_updated_at',
  'workflow_command_receipts',
  'returns public.production_jobs'
]) assert.ok(migration.includes(authority), `trace migration preserves ${authority}`);
assert.equal((migration.match(/for update nowait/g) || []).length, (previous.match(/for update nowait/g) || []).length);
assert.match(migration, /v_trace boolean := v_command_id like 'diagnostic:%'/);
for(const stage of ['function_enter','arguments_validated','job_try_lock_acquired','command_try_lock_acquired','receipt_lookup_started','receipt_lookup_completed','production_row_lock_started','production_row_lock_acquired','validations_complete','production_update_started','production_update_complete','receipt_insert_started','receipt_insert_complete','function_returning']){
  assert.ok(migration.includes(`s=${stage}`), `stage ${stage}`);
}
assert.match(migration, /set_config\('application_name',[\s\S]*true\)/, 'stage state is transaction-local');
assert.doesNotMatch(migration, /access_token|authorization|jwt|p_payload.*application_name/i, 'stage marker contains no credentials or payload');
assert.match(migration, /revoke execute[\s\S]*from public, anon;[\s\S]*grant execute[\s\S]*authenticated, service_role;/);

const captureStatements = capture.replace(/--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
assert.ok(captureStatements.every(statement => /^(with|select)\b/i.test(statement)), 'capture is read-only');
for(const field of ['backend_start','xact_start','query_start','transaction_age','query_age','wait_event_type','blocking_pids','backend_xid','backend_xmin','transactionid','virtualxid','production_jobs','workflow_command_receipts','committed_atomic_outcome']) assert.ok(capture.includes(field), field);

assert.equal((script.match(/await fetch\(/g) || []).length, 1, 'authenticated script has exactly one fetch');
assert.doesNotMatch(script, /\bwhile\b|setInterval|refresh\s*\(/, 'authenticated script has no auth replay or retry loop');
assert.match(script, /SUPABASE_ACCESS_TOKEN/);
assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(accessToken|anonKey)/, 'credentials are not logged');
for(const milestone of ['fetch_called','response_headers_received','response_body_read_started','response_body_read_completed','diagnostic_timeout_fired']) assert.ok(script.includes(milestone), milestone);

const sbApi = html.slice(html.indexOf('async function sbApi'), html.indexOf('function toast'));
for(const milestone of ['fetch_called','response_promise_resolved','response_body_read_started','response_body_read_completed']) assert.ok(sbApi.includes(milestone), `browser ${milestone}`);
assert.match(html, /transportTimeline:classified\.transportTimeline \|\| \[\]/);
assert.match(doc, /No failing layer or production fix is claimed/);
assert.match(doc, /disabled by default[\s\S]*202607280009_nowait_preacceptance_production_row\.sql/);

console.log('Pre-acceptance authenticated transport trace assertions passed.');
