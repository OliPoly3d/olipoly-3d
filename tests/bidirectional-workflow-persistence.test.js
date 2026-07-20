const assert = require('node:assert/strict');
const fs = require('node:fs');
const workflow = require('../js/workflow-status.js');
const persistence = require('../js/production-status-persistence.js');
const lifecycle = require('../js/inventory-lifecycle.js');

for (const status of workflow.POST_ACCEPTANCE_STATUSES) {
  assert.equal(workflow.workflowRpcRequest('OP-000123', status).body.p_status, status);
}
for (const status of ['estimate', 'waiting_customer', 'quote_pending', 'quoted', 'draft_quote']) {
  assert.throws(() => workflow.workflowRpcRequest('OP-000123', status), /post-acceptance/);
}
assert.equal(workflow.transitionDirection('ready_to_print', 'closed'), 'forward');
assert.equal(workflow.transitionDirection('closed', 'printing'), 'backward');
assert.match(workflow.backwardMoveWarning('qc', 'ready_to_print'), /consumed inventory will be preserved/);

const remote = {id:'job-1', order_number:'OP-000123', production_status:'qc', updated_at:'2026-07-16T12:00:00Z'};
const staleLocal = {...remote, production_status:'printing', updated_at:'2026-07-16T11:59:00Z'};
assert.equal(persistence.mergeJobs([remote], [staleLocal])[0].production_status, 'qc');
assert.equal(persistence.mergeJobs([remote], [{...remote, production_status:'printing'}])[0].production_status, 'qc');

assert.equal(lifecycle.reservationAction('ready_for_fulfillment', 'qc'), 'preserve_consumed_no_reserve');
assert.equal(lifecycle.reservationAction('closed', 'ready_to_print'), 'preserve_consumed_no_reserve');
assert.equal(lifecycle.reservationAction('qc', 'ready_to_print'), 'consume_and_reserve_reprint');

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
const orders = fs.readFileSync(require.resolve('../orders-admin.html'), 'utf8');
const quote = fs.readFileSync(require.resolve('../js/quote.js'), 'utf8');
const migration = fs.readFileSync(require.resolve('../supabase/migrations/202607160004_authoritative_bidirectional_workflow.sql'), 'utf8');

assert.match(production, /workflowRpcRequest\(job\.order_number, targetStatus\)/);
assert.match(orders, /workflowRpcRequest\(orderNumber, nextStatus\)/);
assert.match(migration, /create or replace function public\.set_linked_workflow_status/);
assert.match(migration, /orders_sync_workflow_to_production/);
assert.match(migration, /p\.production_status is distinct from o\.status/);
assert.match(quote, /acceptQuoteThroughServer/);
assert.doesNotMatch(quote, /function (?:buildOrderPayload|upsertOrder|updateQuoteAccepted|updateLinkedProductionJobAfterAcceptance)\b/);

const laneStatuses = [...production.matchAll(/statuses:\['([^']+)'\]/g)].map(match => match[1]);
assert.equal(new Set(laneStatuses).size, laneStatuses.length, 'each canonical lane status appears once');

console.log('Bidirectional workflow persistence assertions passed.');
