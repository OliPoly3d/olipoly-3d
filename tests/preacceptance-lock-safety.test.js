const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607280006_bound_preacceptance_advisory_lock.sql', 'utf8');
const functionBody = migration.slice(migration.indexOf('create or replace function'), migration.indexOf('revoke execute'));

assert.match(functionBody, /pg_try_advisory_xact_lock\(hashtextextended\(v_command_id, 0\)\)/, 'duplicate identities use a transaction-scoped non-waiting advisory lock');
assert.match(functionBody, /Quote handoff command is already in progress; refresh before retrying\./, 'lock contention returns a controlled operator action');
assert.doesNotMatch(functionBody, /pg_advisory_lock\(/, 'session-scoped advisory locks are forbidden');
assert.match(functionBody, /workflow_command_receipts[\s\S]*for update/, 'command receipt idempotency remains');
assert.match(functionBody, /production_jobs where id = p_job_id for update/, 'authoritative job row lock remains');
assert.match(functionBody, /updated_at is distinct from p_expected_updated_at/, 'optimistic concurrency remains');
assert.match(functionBody, /actual_grams_used is not null[\s\S]*completed_at is not null/, 'production evidence rejection remains');
assert.match(migration, /revoke execute[\s\S]*from public, anon;[\s\S]*grant execute[\s\S]*authenticated, service_role;/, 'RPC grants remain least-privilege');

console.log('Pre-acceptance advisory lock safety assertions passed.');
