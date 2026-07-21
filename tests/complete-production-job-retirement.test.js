const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(repoRoot, 'supabase/migrations/202607210001_retire_complete_production_job_overloads.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.match(migration, /Expected exactly 5 deployed public\.complete_production_job overloads/i, 'migration must fail closed unless all five deployed overloads are covered');
assert.match(migration, /pg_get_function_arguments\(p\.oid\) as function_arguments/i, 'migration must preserve deployed parameter names/defaults from pg_proc');
assert.match(migration, /pg_get_function_identity_arguments\(p\.oid\) as identity_arguments/i, 'migration must preserve deployed overload identities for revoke statements');
assert.match(migration, /pg_get_function_result\(p\.oid\) as return_type/i, 'migration must preserve each deployed return type');
assert.doesNotMatch(migration, /drop function\s+(if exists\s+)?public\.complete_production_job/i, 'migration must not drop PostgREST-visible function identities');
assert.match(migration, /security definer\s+set search_path = public, pg_temp/i, 'retired SECURITY DEFINER replacements must set a fixed search_path');
assert.match(migration, /complete_production_job is retired; use production_workflow_command/i, 'retired functions must raise an explicit exception');
assert.match(migration, /revoke execute on function public\.complete_production_job\(%s\) from public, anon, authenticated, service_role/i, 'all browser roles and service_role must lose execute because no reviewed recovery need was found');
assert.match(migration, /has_function_privilege\('anon', p\.oid, 'execute'\).*expect all false/is, 'post-deployment role verification must prove browser roles cannot execute overloads');
assert.match(migration, /expect SQLSTATE 2F000 retired-function exception and no Production\/Inventory mutation/i, 'verification must prove retired overloads cannot mutate Production or Inventory');
assert.match(migration, /current_grams/); 
assert.match(migration, /remaining_grams/);
assert.match(migration, /384 raw_usage rows/);
assert.match(migration, /No new Inventory command is created/i);

const activeClientFiles = [
  'production-control.html',
  'orders-admin.html',
  'inventory-control.html',
  'finance-pro.js',
  'quote.js',
  'track.html'
];
for (const file of activeClientFiles) {
  const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  assert.doesNotMatch(content, /complete_production_job/i, `${file} must not call retired complete_production_job RPC`);
  assert.doesNotMatch(content, /rpc\/complete_production_job/i, `${file} must not contain retired PostgREST RPC path`);
}

console.log('complete_production_job retirement assertions passed.');
