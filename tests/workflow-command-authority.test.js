const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/202607200006_workflow_command_authority.sql', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');
const orders = fs.readFileSync('orders-admin.html', 'utf8');

assert(migration.includes('create or replace function public.production_workflow_command'), 'Production command RPC missing');
assert(migration.includes('create or replace function public.fulfillment_workflow_command'), 'Fulfillment command RPC missing');
assert(migration.includes('if p_expected_updated_at is null'), 'expected_updated_at must be required');
assert(migration.includes('p_correlation_id command identity is required'), 'stable command identity must be required');
assert(migration.includes('drop trigger if exists orders_sync_workflow_to_production'), 'blind Order-to-Production trigger must be retired');
assert(!migration.includes('actuals_captured_at'), 'migration must not reference nonexistent actuals_captured_at');
assert(!/\n\s*update\s+public\.project_events\b/i.test(migration), 'must not update legacy events');
assert(!/\n\s*delete\s+from\s+public\.project_events\b/i.test(migration), 'must not delete legacy events');
assert(migration.includes('revoke insert, update, delete on table public.order_tracking_public from authenticated'), 'tracking browser writes must be revoked');
assert(migration.includes('revoke update on table public.orders from authenticated'), 'direct order status update must be removed before column grants');
assert(migration.includes('grant update(order_number') && !migration.includes('grant update(status'), 'ordinary Orders Admin updates must be column-granted without status');
assert(migration.includes('grant select, insert, delete on table public.orders, public.production_jobs to authenticated'), 'ordinary order/production creates and deletes must remain authorized');
assert(migration.includes('grant update(job_title') && !migration.includes('grant update(production_status'), 'Production estimates/pre-order edits must be column-granted without workflow status/actuals');
assert(migration.includes("v_command = 'needs_reprint'") && migration.includes("v_to := 'ready_to_print'"), 'needs_reprint must project to ready_to_print');
assert(!migration.includes("v_command = 'pass_qc'"), 'Production must not own ready_for_fulfillment handoff');
assert((migration.match(/v_to := 'ready_for_fulfillment'/g) || []).length === 1, 'exactly one authority may produce ready_for_fulfillment');
assert(migration.includes("v_from := v_job.production_status") && migration.includes("jsonb_build_object('from',v_from,'to',v_to)"), 'events must capture pre/post states distinctly');
assert(migration.includes("!~ '^[0-9]+") && migration.includes("in ('NaN','Infinity','-Infinity')"), 'numeric actuals must reject invalid finite values');
assert(migration.includes('if exists (select 1 from public.project_events where correlation_id = v_command_id'), 'command identity reuse must be idempotent');
assert(migration.includes('set search_path = public, pg_temp'), 'functions must set fixed search_path');
assert(migration.includes('revoke execute on function public.workflow_public_status_text(text) from public, anon, authenticated'), 'internal helper grants must be revoked');

assert(production.includes('productionWorkflowRpcRequest(job.order_number, command, job.updated_at'), 'linked start_print must use persisted old job.updated_at');
assert(production.includes('const authoritative = await syncProductionStatusToOrder(j, status)'), 'success must consume server-returned row');
assert(production.includes('Object.assign(updated, authoritative'), 'server-returned row must replace local fabricated row');
assert(production.includes('Approve Handoff in Orders'), 'Production QC handoff UI must route to Orders/Fulfillment');
assert(!production.includes("pass_qc"), 'Production UI must not call pass_qc');
assert(!orders.includes('/rest/v1/order_tracking_public?on_conflict=order_number'), 'Orders Admin must not directly mutate tracking projection');

const source = fs.readFileSync('js/workflow-status.js', 'utf8');
const memory = new Map();
const sandbox = {
  module: { exports: {} },
  globalThis: {
    crypto: { randomUUID: () => 'stable-command-id' },
    localStorage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) }
  }
};
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const workflow = sandbox.module.exports;
assert.throws(() => workflow.productionWorkflowRpcRequest('OP-000001', 'start_print'), /expected_updated_at/, 'missing expected_updated_at rejected client-side');
const first = workflow.productionWorkflowRpcRequest('OP-000001', 'start_print', '2026-07-20T00:00:00Z');
const second = workflow.productionWorkflowRpcRequest('OP-000001', 'start_print', '2026-07-20T00:00:00Z');
assert.strictEqual(first.path, '/rest/v1/rpc/production_workflow_command');
assert.strictEqual(first.body.p_correlation_id, second.body.p_correlation_id, 'same command retry must reuse command identity');
assert.strictEqual(workflow.fulfillmentWorkflowRpcRequest('OP-000001', 'close_order', '2026-07-20T00:00:00Z').path, '/rest/v1/rpc/fulfillment_workflow_command');

console.log('workflow command authority assertions passed');
