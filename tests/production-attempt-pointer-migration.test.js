const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202608100001_repair_production_attempt_pointer.sql', 'utf8');

assert.match(migration, /before insert or update of production_status, job_payload on public\.production_jobs/i);
assert.match(migration, /new\.production_status = 'qc'[\s\S]*last_completed_attempt[\s\S]*current_attempt_id/i);
assert.match(migration, /where production_status = 'qc'[\s\S]*last_completed_attempt[\s\S]*current_attempt_id/i);
assert.doesNotMatch(migration, /raw_material_roll_id|grams_used|reserved_grams/, 'repair must not invent material evidence');

console.log('Production attempt pointer migration assertions passed.');
