const assert = require('node:assert/strict');
const fs = require('node:fs');
const workflow = require('../js/workflow-status.js');
const persistence = require('../js/production-status-persistence.js');
const lifecycle = require('../js/inventory-lifecycle.js');

assert.equal(workflow.productionWorkflowRpcRequest('OP-000123', 'start_print', '2026-07-20T00:00:00Z').body.p_expected_updated_at, '2026-07-20T00:00:00Z');
assert.equal(workflow.productionWorkflowRpcRequest('OP-000123', 'pass_qc', '2026-07-20T00:00:00Z').body.p_command, 'pass_qc');
assert.equal(workflow.fulfillmentWorkflowRpcRequest('OP-000123', 'close_order', '2026-07-20T00:00:00Z', {fulfillment_confirmed_at:'2026-07-20T00:00:00Z', fulfillment_method:'pickup'}).body.p_command, 'close_order');
assert.equal(workflow.preAcceptanceProductionRpcRequest('job-1', 'mark_waiting_customer', '2026-07-20T00:00:00Z').path, '/rest/v1/rpc/preacceptance_production_command');
assert.equal(workflow.workflowRpcRequest, undefined);
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

assert.match(production, /productionWorkflowRpcRequest\(job\.order_number, command, job\.updated_at/);
assert.match(orders, /fulfillmentWorkflowRpcRequest\(orderNumber, command/);
assert.match(migration, /create or replace function public\.set_linked_workflow_status/);
assert.match(migration, /orders_sync_workflow_to_production/);
assert.match(migration, /p\.production_status is distinct from o\.status/);
assert.match(quote, /acceptQuoteThroughServer/);
assert.doesNotMatch(quote, /function (?:buildOrderPayload|upsertOrder|updateQuoteAccepted|updateLinkedProductionJobAfterAcceptance)\b/);

const laneStatuses = [...production.matchAll(/statuses:\['([^']+)'\]/g)].map(match => match[1]);
assert.equal(new Set(laneStatuses).size, laneStatuses.length, 'each canonical lane status appears once');

console.log('Bidirectional workflow persistence assertions passed.');
