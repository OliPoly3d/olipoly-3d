const assert = require('node:assert/strict');
const fs = require('node:fs');
const persistence = require('../js/production-status-persistence.js');

const active = ['estimate', 'waiting_customer', 'ready_to_print', 'printing', 'qc', 'ready_for_fulfillment'];
for(const production_status of active){
  assert.equal(persistence.canCancel({production_status}), true, `${production_status} must expose Cancel`);
}
for(const production_status of ['closed', 'canceled', 'void', 'completed', 'archived']){
  assert.equal(persistence.canCancel({production_status}), false, `${production_status} must not expose active Cancel`);
}
assert.equal(persistence.canCancel({production_status:'estimate', quote_handoff_status:'accepted', order_number:'OP-000188'}), true,
  'accepted Quote and mismatched Order metadata cannot hide canonical Estimate cancellation');

const remoteVersion = '2026-08-10T12:34:56.123456+00:00';
const recoveryVersion = '2099-01-01T00:00:00.000Z';
const merged = persistence.mergeJobs(
  [{id:'27be9786-47bb-4e20-a4b5-5ad05c407f08', job_title:'Survivor Tree Puzzles', production_status:'estimate', updated_at:remoteVersion, order_number:'OP-000188'}],
  [{id:'27be9786-47bb-4e20-a4b5-5ad05c407f08', job_title:'Survivor Tree Puzzles', production_status:'ready_to_print', updated_at:recoveryVersion}]
);
assert.equal(merged[0].updated_at, remoteVersion, 'raw remote version remains exact');
assert.equal(merged[0].production_status, 'estimate', 'recovery lifecycle cannot become authority');
assert.equal(persistence.canCancel(merged[0]), true, 'Survivor Tree canonical Estimate renders Cancel despite mismatch');

const ui = fs.readFileSync('production-control.html', 'utf8');
const card = ui.slice(ui.indexOf('function jobCard'), ui.indexOf('function renderLanes'));
assert.match(card, /OliPolyProductionPersistence\.canCancel\(j\)/);
assert.match(card, /data-cancel-job/);
assert.doesNotMatch(card.slice(card.indexOf('if(window.OliPolyProductionPersistence.canCancel')), /quote_handoff_status/);
assert.match(ui, /const CLOSED = \['closed','canceled','void'\]/);

console.log('Production cancellation lifecycle and version authority assertions passed.');
