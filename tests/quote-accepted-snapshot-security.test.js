const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const securityMigrationPath = 'supabase/migrations/202607200003_quote_accepted_snapshot_security.sql';
const originalMigrationPath = 'supabase/migrations/202607200002_quote_acceptance_authority.sql';
const migration = fs.readFileSync(securityMigrationPath, 'utf8');
const originalMigration = fs.readFileSync(originalMigrationPath, 'utf8');
const originalMigrationAtHead = execFileSync('git', ['show', `HEAD:${originalMigrationPath}`], { encoding: 'utf8' });

function has(pattern, message) {
  assert.match(migration, pattern, message);
}

function lacks(pattern, message) {
  assert.doesNotMatch(migration, pattern, message);
}

has(/Purpose:[\s\S]*quote_accepted_commercial_snapshots/, 'migration documents purpose');
has(/Dependency:[\s\S]*202607200002_quote_acceptance_authority\.sql/, 'migration documents dependency on acceptance authority migration');
has(/inherited broad PUBLIC\/anon\/authenticated privileges[\s\S]*RLS was disabled/, 'migration documents inherited broad grants with RLS disabled');
has(/Forward recovery guidance:/, 'migration documents forward recovery guidance');
has(/Post-deployment verification queries:/, 'migration includes post-deployment verification queries');
has(/Codex did not deploy, reapply, or otherwise mutate the Supabase project/, 'migration states Codex did not deploy it');

has(/alter table public\.quote_accepted_commercial_snapshots\s+enable row level security;/, 'RLS is enabled on accepted snapshots');
has(/revoke all\s+on table public\.quote_accepted_commercial_snapshots\s+from public, anon, authenticated;/, 'PUBLIC, anon, and authenticated table privileges are revoked');
has(/grant all\s+on table public\.quote_accepted_commercial_snapshots\s+to service_role;/, 'service_role retains snapshot table access');
has(/revoke all\s+on function public\.prevent_quote_accepted_snapshot_mutation\(\)\s+from public, anon, authenticated;/, 'browser roles cannot execute the mutation guard directly');
has(/grant execute\s+on function public\.prevent_quote_accepted_snapshot_mutation\(\)\s+to service_role;/, 'service_role can execute the mutation guard');
lacks(/create\s+policy|alter\s+policy/i, 'migration does not create browser policies');

assert.equal(originalMigration, originalMigrationAtHead, 'the original 202607200002 migration is not modified');

console.log('quote accepted snapshot security assertions passed');
