const assert = require('node:assert/strict');
const fs = require('node:fs');
const persistence = require('../js/production-status-persistence.js');

const estimate = {id:'job-1', quote_number:'Q-000123', production_status:'estimate', updated_at:'2026-07-16T10:00:00.000Z'};
const waiting = persistence.transition(estimate, 'waiting_customer', {production_quote_id:'Q-000123'}, '2026-07-16T10:01:00.000Z');
assert.equal(waiting.production_status, 'waiting_customer');
assert.equal(waiting.production_quote_id, 'Q-000123');

let reloaded = persistence.mergeJobs([waiting], [estimate]);
assert.equal(reloaded.length, 1);
assert.equal(reloaded[0].production_status, 'waiting_customer', 'newer remote waiting state wins over stale local estimate');

const ready = persistence.transition(waiting, 'ready_to_print', {order_number:'OP-000123'}, '2026-07-16T10:02:00.000Z');
reloaded = persistence.mergeJobs([ready], [waiting]);
assert.equal(reloaded[0].production_status, 'ready_to_print');

const tiedLocalEstimate = {...estimate, updated_at:waiting.updated_at};
reloaded = persistence.mergeJobs([waiting], [tiedLocalEstimate]);
assert.equal(reloaded[0].production_status, 'waiting_customer', 'remote wins deterministic timestamp ties');

const localQc = {...ready, production_status:'qc', updated_at:'2026-07-16T10:09:00.000Z'};
reloaded = persistence.mergeJobs([ready], [localQc]);
assert.equal(reloaded[0].production_status, 'ready_to_print', 'remote lifecycle wins even when recovery has a newer synthetic timestamp');
assert.deepEqual(persistence.lifecycleDiagnostics([ready], [localQc], reloaded), [{
  job_id:'job-1', remote_production_status:'ready_to_print', recovery_production_status:'qc',
  final_production_status:'ready_to_print', source_of_truth:'remote-production_jobs',
  remote_updated_at:'2026-07-16T10:02:00.000Z', recovery_updated_at:'2026-07-16T10:09:00.000Z',
  final_updated_at:'2026-07-16T10:02:00.000Z'
}]);

const duplicateWithoutId = {...waiting, id:null};
assert.equal(persistence.identity(duplicateWithoutId), 'quote:Q-000123');
const duplicateId = {...estimate, id:'legacy-copy', updated_at:'2026-07-16T09:59:00.000Z'};
reloaded = persistence.mergeJobs([waiting], [duplicateId]);
assert.equal(reloaded.length, 1, 'quote linkage deterministically collapses duplicate job IDs');
assert.equal(reloaded[0].id, 'job-1');

const cloudIds = new Set(['job-1']);
assert.deepEqual(persistence.migrationDecision(estimate, cloudIds, 'user-1'), {action:'update', reason:'owned-cloud-row'});
assert.deepEqual(persistence.migrationDecision({...estimate, id:'local-estimate'}, cloudIds, 'user-1'), {action:'insert', reason:'eligible-local-draft'});
assert.deepEqual(persistence.migrationDecision({...estimate, id:'local-waiting', production_status:'waiting_customer'}, cloudIds, 'user-1'), {action:'insert', reason:'eligible-local-draft'});
assert.equal(persistence.migrationDecision({...estimate, id:'advanced', production_status:'ready_to_print'}, cloudIds, 'user-1').action, 'skip');
assert.equal(persistence.migrationDecision({...estimate, id:'quote', production_status:'quote'}, cloudIds, 'user-1').action, 'skip');
assert.equal(persistence.migrationDecision({...estimate, id:'foreign', user_id:'user-2'}, cloudIds, 'user-1').reason, 'ownership-mismatch');
assert.equal(persistence.migrationDecision(estimate, cloudIds, null).reason, 'authentication-unavailable');

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
assert.match(production, /syncPreAcceptanceProductionStatus[\s\S]*mark_waiting_customer/);
assert.match(production, /OliPolyProductionPersistence\.mergeJobs\(cloudMigrated, localMigrated/);
assert.doesNotMatch(production, /production_jobs\?on_conflict=id/, 'Production saves must not use upsert against restrictive INSERT RLS');
assert.match(production, /method:decision\.action === 'update' \? 'PATCH' : 'POST'/, 'owned rows update while eligible drafts insert');
assert.match(production, /OliPolyProductionCommands = Object\.freeze\(\{syncPreAcceptanceProductionStatus\}\)/, 'handoff command crosses script scope explicitly');
assert.match(production, /typeof syncStatus !== 'function'/, 'handoff fails closed if authoritative command wiring is unavailable');

const reliability = fs.readFileSync(require.resolve('../js/erp-reliability.js'), 'utf8');
assert.doesNotMatch(reliability, /toast\('Saved to cloud\.'/i, 'generic fetch observer cannot claim workflow success');
assert.match(reliability, /dedupedToast\('cloud-write-failed'/, 'generic failures are deduplicated');

const quote = fs.readFileSync(require.resolve('../quote.js'), 'utf8');
const quoteSave = quote.slice(quote.indexOf('async function saveCloudQuote'), quote.indexOf('async function deleteCloudQuote'));
assert.doesNotMatch(quoteSave, /production_status/, 'ordinary quote save must not reset Production status');
assert.doesNotMatch(quote, /production_status: 'ready_to_print'/, 'browser quote acceptance must not patch Production ready state');
const acceptanceMigration = fs.readFileSync(require.resolve('../supabase/migrations/202607200002_quote_acceptance_authority.sql'), 'utf8');
assert.match(acceptanceMigration, /production_status = 'ready_to_print'/, 'acceptance RPC owns the ready_to_print handoff');

const migration = fs.readFileSync(require.resolve('../supabase/migrations/202607160003_persist_production_quote_status.sql'), 'utf8');
assert.match(migration, /customer_response = 'accepted'/);
assert.match(migration, /production_status = 'ready_to_print'/);
assert.match(migration, /production_status = 'waiting_customer'/);

console.log('Production status persistence assertions passed.');
