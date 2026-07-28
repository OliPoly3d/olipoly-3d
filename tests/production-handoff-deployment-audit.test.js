const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/202607280005_repair_preproduction_zero_actual_contamination.sql');
const verification = read('supabase/verification/production_quote_handoff_deployment_state.sql');
const audit = read('PRODUCTION_QUOTE_HANDOFF_DEPLOYMENT_AUDIT.md');

assert.match(migration, /alter column actual_print_hours drop not null/);
assert.match(migration, /alter column actual_filaments drop not null/);
assert.match(migration, /actual_grams_used = 0[\s\S]*actual_filaments is null[\s\S]*set actual_grams_used = null/, 'cleanup remains evidence-guarded');
assert.doesNotMatch(verification, /\b(update|insert|delete|alter|drop|create|grant|revoke|truncate)\b/i, 'live verification SQL is read-only');
for(const marker of ['information_schema.columns','pg_get_functiondef','preacceptance-production-job:','pg_try_advisory_xact_lock(v_job_lock_key)','pg_advisory_xact_lock','lock_timeout','55P03','supabase_migrations.schema_migrations','pg_indexes','pg_constraint','pg_trigger']){
  assert.ok(verification.includes(marker), `verification includes ${marker}`);
}
for(const commit of ['be5116c','b0b84ed','f17529c','9b7c7b3','843fc3e','5522ceb','1fc3962']) assert.ok(audit.includes(commit), `audit inventories ${commit}`);
assert.match(audit, /runtime issue is \*\*not\s+reported fixed\*\*/);

console.log('Production handoff deployment audit assertions passed.');
