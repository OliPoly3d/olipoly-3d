const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202608100007_legacy_production_lifecycle_compatibility.sql','utf8');
const report = fs.readFileSync('supabase/verification/legacy_production_classification_report.sql','utf8');
const ui = fs.readFileSync('production-control.html','utf8');

assert.match(migration,/production_source_type in \('legacy_repaired','legacy_standalone'\)/);
assert.match(migration,/production_source_type is null or production_source_type/,'NULL does not mean standalone');
assert.match(migration,/MODERN_LINKED/); assert.match(migration,/LEGACY_REPAIRABLE/); assert.match(migration,/LEGACY_STANDALONE/); assert.match(migration,/AMBIGUOUS/);
for (const field of ['payload_quote_number','payload_order_number','payload_order_id','matching_quote_count','matching_order_count','candidate_order_id','candidate_order_number','candidate_source_quote_number','same_owner_result','modern_provenance_markers','safe_repair_eligibility','exclusion_rejection_reason']) assert.match(migration,new RegExp(field));
assert.match(migration,/created_at < timestamptz '2026-08-03/,'legacy cutoff is explicit');
assert.match(migration,/matching_order_count<>0/); assert.match(migration,/modern_provenance_markers->>'identity_fields'<>'false'/,'standalone approval rejects modern provenance');
assert.match(migration,/Expected exactly one same-owner Quote/); assert.match(migration,/Expected exactly one Order candidate/); assert.match(migration,/Order candidate owner mismatch/); assert.match(migration,/Payload has conflicting Order identity/); assert.match(migration,/Payload has conflicting Order ID/);
assert.doesNotMatch(migration,/insert into public\.orders/,'compatibility never creates Orders');
assert.match(migration,/v_is_standalone := v_job\.production_source_type='legacy_standalone'/);
assert.match(migration,/if v_job\.order_number is null then raise exception 'Accepted linked Order not found for modern Production job'/);
assert.match(migration,/Modern Production Quote\/Order provenance mismatch/);
assert.match(migration,/if not v_is_standalone then[\s\S]*update public\.orders[\s\S]*update public\.order_tracking_public/,'Order synchronization is conditional only for explicit standalone');
assert.match(migration,/insert into public\.inventory_transactions[\s\S]*insert into public\.production_attempt_consumption_receipts/);
assert.match(migration,/production_attempt_consumption_receipts where command_identity=v_key/,'QC remains idempotent');
assert.match(migration,/v_job\.updated_at is distinct from p_expected_updated_at/,'optimistic concurrency remains');
assert.match(migration,/user_id=v_actor/,'owner scoping remains');
assert.match(migration,/enable row level security|production_linkage_audit/,'existing RLS-backed audit is retained');
assert.match(ui,/standaloneLegacy = job\?\.production_source_type === 'legacy_standalone'/);
assert.match(ui,/p_production_job_id:job\.id/,'standalone transitions use authoritative RPC');
assert.match(ui,/atomicConsumption\?\.production_job \|\| await syncProductionStatusToOrder/);
assert.match(report,/where classification='AMBIGUOUS'/);
console.log('Legacy Production lifecycle compatibility assertions passed.');
