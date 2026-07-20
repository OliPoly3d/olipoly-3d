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

const duplicateWithoutId = {...waiting, id:null};
assert.equal(persistence.identity(duplicateWithoutId), 'quote:Q-000123');
const duplicateId = {...estimate, id:'legacy-copy', updated_at:'2026-07-16T09:59:00.000Z'};
reloaded = persistence.mergeJobs([waiting], [duplicateId]);
assert.equal(reloaded.length, 1, 'quote linkage deterministically collapses duplicate job IDs');
assert.equal(reloaded[0].id, 'job-1');

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
assert.match(production, /production_status: 'waiting_customer',[\s\S]*quote_number: draft\.quote_number/);
assert.match(production, /OliPolyProductionPersistence\.mergeJobs\(cloudMigrated, localMigrated/);

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
