const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607280009_nowait_preacceptance_production_row.sql', 'utf8');
const authority = fs.readFileSync('supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql', 'utf8');
const functionBody = migration.slice(migration.indexOf('create or replace function'), migration.indexOf('revoke execute'));

assert.match(functionBody, /v_job_lock_key bigint := hashtextextended\('preacceptance-production-job:' \|\| p_job_id::text, 0\)/, 'job concurrency uses a domain-separated 64-bit key');
assert.match(functionBody, /pg_try_advisory_xact_lock\(v_job_lock_key\)/, 'same-job commands use a transaction-scoped non-waiting advisory lock');
assert.match(functionBody, /Pre-acceptance Production job lock is already held[\s\S]*errcode='55P03'[\s\S]*lockScope=job/, 'same-job contention returns distinct controlled 55P03');
assert.match(functionBody, /set_config\('lock_timeout', '2s', true\)/, 'transaction-local lock timeout is a secondary defense');
assert.doesNotMatch(functionBody, /pg_advisory_lock\(/, 'session-scoped advisory locks are forbidden');
assert.doesNotMatch(functionBody, /workflow_command_receipts where command_identity = v_command_id for update/, 'immutable receipt replay avoids unnecessary row locking');
assert.match(functionBody, /workflow_command_receipts where command_identity = v_command_id/, 'command receipt idempotency remains');
assert.match(functionBody, /production_jobs where id = p_job_id for update/, 'authoritative job row lock remains');
assert.match(functionBody, /production_jobs where id = p_job_id for update nowait/, 'authoritative new-command row lock never queues');
assert.match(functionBody, /production_jobs where id = v_receipt\.production_job_id[\s\S]*for update nowait/, 'idempotent replay row hydration never queues');
assert.match(functionBody, /updated_at is distinct from p_expected_updated_at/, 'optimistic concurrency remains');
assert.match(functionBody, /actual_grams_used is not null[\s\S]*completed_at is not null/, 'production evidence rejection remains');
assert.match(migration, /revoke execute[\s\S]*from public, anon;[\s\S]*grant execute[\s\S]*authenticated, service_role;/, 'RPC grants remain least-privilege');
assert.ok(functionBody.indexOf('pg_try_advisory_xact_lock(v_job_lock_key)') < functionBody.indexOf('production_jobs where id = p_job_id for update'), 'job try-lock precedes every mutable-job row lock');
assert.match(authority, /workflow_command_receipts \([\s\S]*command_identity text primary key/, 'existing receipt primary key uniquely supports command lookup without a redundant index');

console.log('Pre-acceptance advisory lock safety assertions passed.');
