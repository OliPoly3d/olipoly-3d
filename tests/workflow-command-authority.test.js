const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/202607200006_workflow_command_authority.sql', 'utf8');

assert(migration.includes('create or replace function public.production_workflow_command'), 'Production command RPC missing');
assert(migration.includes('create or replace function public.fulfillment_workflow_command'), 'Fulfillment command RPC missing');
assert(migration.includes('if p_expected_updated_at is null'), 'expected_updated_at must be required');
assert(migration.includes('drop trigger if exists orders_sync_workflow_to_production'), 'blind Order-to-Production trigger must be retired');
assert(!/\n\s*update\s+public\.project_events\b/i.test(migration), 'must not update legacy events');
assert(!/\n\s*delete\s+from\s+public\.project_events\b/i.test(migration), 'must not delete legacy events');
assert(migration.includes("revoke insert, update, delete on table public.order_tracking_public from authenticated"), 'tracking browser writes must be revoked');
assert(migration.includes("on public.project_events(correlation_id, event_type)"), 'workflow event idempotency index missing');
assert(migration.includes("v_command = 'needs_reprint'") && migration.includes("v_to := 'ready_to_print'"), 'needs_reprint must project to ready_to_print');
assert(migration.includes("raise exception 'Production Control cannot close Orders") || fs.readFileSync('production-control.html','utf8').includes('Production Control cannot close Orders'), 'Production UI must not close orders');

const source = fs.readFileSync('js/workflow-status.js', 'utf8');
const sandbox = { module: { exports: {} }, globalThis: { crypto: { randomUUID: () => 'test-correlation' } } };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const workflow = sandbox.module.exports;
assert.throws(() => workflow.productionWorkflowRpcRequest('OP-000001', 'start_print'), /expected_updated_at/, 'missing expected_updated_at rejected client-side');
assert.strictEqual(workflow.productionWorkflowRpcRequest('OP-000001', 'start_print', '2026-07-20T00:00:00Z').path, '/rest/v1/rpc/production_workflow_command');
assert.strictEqual(workflow.fulfillmentWorkflowRpcRequest('OP-000001', 'close_order', '2026-07-20T00:00:00Z').path, '/rest/v1/rpc/fulfillment_workflow_command');

console.log('workflow command authority assertions passed');
