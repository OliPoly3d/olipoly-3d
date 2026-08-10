const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202608100007_legacy_production_lifecycle_compatibility.sql','utf8');
const report = fs.readFileSync('supabase/verification/legacy_production_classification_report.sql','utf8');
const backlogMigration = fs.readFileSync('supabase/migrations/202608100008_classify_production_backlog_and_repair_linkage.sql','utf8');
const backlogReport = fs.readFileSync('supabase/verification/production_backlog_classification.sql','utf8');
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

for (const id of [
  '633ae5d6-33b9-4c11-86ee-1026b94f9ca6',
  '0b6c9fe4-1ed1-48ae-abe4-f27281e5b7c7',
  '27be9786-47bb-4e20-a4b5-5ad05c407f08',
  'db361c40-b958-42cf-86e5-94238d252499'
]) assert.match(backlogMigration, new RegExp(id), `migration pins approved identity ${id}`);
assert.match(backlogMigration,/production_source_type = 'legacy_standalone'/);
assert.match(backlogMigration,/source_quote_number = 'Q-000007'/);
assert.match(backlogMigration,/v_count <> 1/,'repair requires exactly one candidate');
assert.match(backlogMigration,/v_order\.user_id is distinct from v_job\.user_id/,'repair requires same owner');
assert.match(backlogMigration,/production_source_type = 'legacy_repaired'/,'repair uses the existing canonical repaired marker');
assert.doesNotMatch(backlogMigration,/insert into public\.(orders|quotes)/,'focused migration never fabricates sales records');
assert.doesNotMatch(backlogMigration,/production_status\s*=/,'focused migration does not rewrite lifecycle state');

for (const field of [
  'production_job_id','job_title','created_at','updated_at','job_type','production_source_type',
  'production_status','quote_number','order_number','payload_quote_number','payload_order_number',
  'payload_order_id','quote_handoff_status','quote_handoff_at','quote_accepted_at',
  'matching_order_count','candidate_order_id','candidate_order_number','source_quote_number',
  'same_owner_result','classification','classification_reason','safe_repair_eligibility','recommended_action'
]) assert.match(backlogReport, new RegExp(field), `read-only report includes ${field}`);
for (const classification of ['MODERN_LINKED','LEGACY_REPAIRABLE','LEGACY_STANDALONE','QUOTE_WITHOUT_ORDER_REVIEW','LINKAGE_BROKEN_HISTORY','AMBIGUOUS_REVIEW']) {
  assert.match(backlogReport, new RegExp(classification));
}
assert.doesNotMatch(backlogReport,/\b(update|insert|delete)\s+(public\.)?/i,'verification query is read-only');
assert.doesNotMatch(backlogReport,/created_at\s*[<>]/,'classification never relies on an arbitrary date cutoff');
console.log('Legacy Production lifecycle compatibility assertions passed.');
