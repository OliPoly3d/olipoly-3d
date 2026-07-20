const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/202607200006_workflow_command_authority.sql', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');
const orders = fs.readFileSync('orders-admin.html', 'utf8');

assert(migration.includes('create or replace function public.production_workflow_command'), 'Production command RPC missing');
assert(migration.includes('create or replace function public.fulfillment_workflow_command'), 'Fulfillment command RPC missing');
assert(migration.includes('create or replace function public.preacceptance_production_command'), 'Pre-acceptance Production command RPC missing');
assert(migration.includes('if p_expected_updated_at is null'), 'expected_updated_at must be required');
assert(migration.includes('p_correlation_id command identity is required'), 'stable command identity must be required');
assert(migration.includes('drop trigger if exists orders_sync_workflow_to_production'), 'blind Order-to-Production trigger must be retired');
assert(!migration.includes('actuals_captured_at'), 'migration must not reference nonexistent actuals_captured_at');
assert(!migration.includes('fulfilled_at') && !migration.includes('closed_at'), 'migration must not reference nonexistent Orders fulfillment/close columns');
assert(!/\n\s*update\s+public\.project_events\b/i.test(migration), 'must not update legacy events');
assert(!/\n\s*delete\s+from\s+public\.project_events\b/i.test(migration), 'must not delete legacy events');
assert(migration.includes('revoke insert, update, delete on table public.order_tracking_public from authenticated'), 'tracking browser writes must be revoked');
assert(migration.includes('revoke insert, update, delete on table public.orders from authenticated'), 'inherited Orders insert/update/delete privileges must be explicitly revoked');
assert(migration.includes('revoke insert, update, delete on table public.production_jobs from authenticated'), 'inherited Production insert/update/delete privileges must be explicitly revoked');
assert(!migration.includes('grant select, insert') && !migration.includes('grant insert on table public.orders'), 'orders must not have unrestricted browser insert');
assert(migration.includes('grant update(order_number') && !migration.includes('grant update(status'), 'ordinary Orders Admin updates must be column-granted without status');
assert(migration.includes('has_table_privilege') && migration.includes('has_column_privilege'), 'effective privilege verification queries must be present');
assert(migration.includes('perform pg_advisory_xact_lock'), 'command identity handling must be serialized with an advisory lock');
assert(migration.includes('create table if not exists public.workflow_command_receipts'), 'technical command receipts must be durable for pre-acceptance retries');
assert(migration.includes('command_identity text primary key') && migration.includes('workflow_command_receipts_identity_idx'), 'command receipt identity must be unique');
assert(migration.includes('v_receipt.owner_id is distinct from v_actor') && migration.includes('v_receipt.production_job_id is distinct from p_job_id') && migration.includes('v_receipt.command is distinct from v_command'), 'receipt retries must bind owner, job, and command');
assert(migration.includes('return v_job;') && migration.includes('resulting_updated_at'), 'same-command receipt retry must return the committed Production row');
assert(migration.includes('revoke all on table public.workflow_command_receipts from public, anon, authenticated'), 'command receipts must not become a browser table surface');
assert(!migration.includes('preacceptance.') && !migration.includes('production.preacceptance'), 'pre-acceptance receipts must not invent a new business event type');
assert(migration.includes('grant insert(id, user_id, job_title') && migration.includes("production_status in ('estimate','waiting_customer')"), 'production pre-acceptance insert must be narrow and state-limited');
assert(migration.includes('grant update(job_title') && !migration.includes('grant update(production_status'), 'Production ordinary edits must be column-granted without workflow status/actuals');
assert(migration.includes('actual_machine = case when v_command=') && migration.includes('completed_at = case when v_command=') && migration.includes('production_attempts'), 'complete_print must persist deployed actuals and attempt evidence');
assert(migration.includes('actual_filaments = case') && migration.includes('actual_filament_usage = case'), 'supplied filament evidence must be persisted by the RPC');
assert(migration.includes("v_command = 'pass_qc'") && migration.includes("v_to := 'ready_for_fulfillment'; v_event := 'order.qc_passed'"), 'pass_qc must be Production-owned and emit qc_passed');
assert(!migration.includes("v_command = 'ready_for_fulfillment'"), 'Fulfillment must not provide a second ready_for_fulfillment command');
assert((migration.match(/v_to := 'ready_for_fulfillment'/g) || []).length === 1, 'exactly one authority may produce ready_for_fulfillment');
assert(migration.includes("v_command = 'close_order'") && migration.includes("v_event := 'order.closed'"), 'Fulfillment owns close_order');
assert(migration.includes("'order',v_order.id::text"), 'event aggregate_id must use Orders UUID');
assert(migration.includes("jsonb_build_object('from',v_from,'to',v_to)"), 'events must capture pre/post states distinctly');
assert(migration.includes("!~ '^[0-9]+") && migration.includes("in ('NaN','Infinity','-Infinity')"), 'numeric actuals must reject invalid finite values');
assert(migration.includes('Command identity is already used for a different workflow command'), 'command identity collision must be rejected');
assert(migration.includes("when v_command='needs_reprint' then null") && migration.includes('last_completed_attempt') && migration.includes("actual_machine = case when v_command='needs_reprint' then null"), 'Needs Reprint must preserve prior attempt evidence and reset current attempt projection');
assert(migration.includes('set search_path = public, pg_temp'), 'functions must set fixed search_path');
assert(migration.includes('revoke execute on function public.workflow_public_status_text(text) from public, anon, authenticated'), 'internal helper grants must be revoked');
assert(migration.includes('production_jobs_owner_delete') && migration.includes("production_status in ('estimate','waiting_customer')") && migration.includes('order_number is null'), 'accepted/completed Production evidence must not be directly deleted');

assert(production.includes('preAcceptanceProductionRpcRequest') && production.includes('syncPreAcceptanceProductionStatus'), 'Push to Quote and pre-acceptance status edits must use the pre-acceptance command');
assert(!production.includes('/rest/v1/production_jobs?id=eq.${encodeURIComponent(job.id)}') || !production.includes("production_status: 'waiting_customer'"), 'Push to Quote must not direct PATCH production_status');
assert(production.includes('productionWorkflowRpcRequest(job.order_number, command, job.updated_at'), 'linked start_print must use persisted old job.updated_at');
assert(production.includes('const authoritative = await syncProductionStatusToOrder(j, status)'), 'success must consume server-returned row');
assert(production.includes('Object.assign(updated, authoritative'), 'server-returned row must replace local fabricated row');
assert(production.includes("ready_for_fulfillment:'pass_qc'"), 'Production UI must call pass_qc');
assert(production.includes("if(j.order_number){") && production.includes('Unsupported linked workflow transition'), 'linked setStatus must route through command path before local mutation');
assert(production.includes('Bulk workflow status changes are disabled'), 'bulk workflow mutation must be disabled');
assert(production.includes('consumeCapturedAttempt(updated') && production.includes('applyReservationDelta(reservationBase, updated)'), 'Inventory lifecycle orchestration must remain present for linked commands');
assert(/if\(j\.order_number\)\{[\s\S]*?consumeCapturedAttempt\(updated[\s\S]*?syncProductionStatusToOrder\(j, status\)/.test(production), 'linked Pass QC must reach consumeCapturedAttempt before command success updates local state');
assert(/if\(j\.order_number\)\{[\s\S]*?consume_and_reserve_reprint[\s\S]*?applyReservationDelta\(j, reservationBase\)/.test(production), 'linked Needs Reprint must reach existing reprint reservation path');
assert(production.includes('Linked accepted work cannot be moved back directly') && production.includes('Linked accepted work cannot be canceled from Production Control'), 'move-back/cancel must not bypass linked commands');
assert(production.includes('Linked accepted Production evidence cannot be directly deleted'), 'linked Production evidence direct delete must be blocked');
assert(production.includes('ordinaryJobPayload') && production.includes("delete ordinaryJobPayload[key]"), 'Production ordinary saves must omit command-owned fields');
assert(production.includes('ordinarySaveJob = isPreAcceptanceStatusChange ? {...j, production_status:previousJob.production_status} : j'), 'pre-acceptance editor status changes must not shadow-write local lifecycle state before command success');
assert(production.includes('recovery_draft_only: true') && !/writeJson\(LS_JOBS,[\s\S]{0,120}waiting_customer[\s\S]{0,120}syncPreAcceptanceProductionStatus/.test(production), 'Push to Quote must retain only a recovery draft before the pre-acceptance command succeeds');
assert(production.includes("syncProductionStatusToOrder(j, 'qc', updated)"), 'confirmClose must call complete_print with persisted old job row and captured evidence');
assert(!/if\(state\.user\?\.id\) await cloudSaveJob\(updated\);[\s\S]{0,200}syncProductionStatusToOrder\(j, 'qc', updated\)/.test(production), 'confirmClose must not cloudSaveJob before linked complete_print');
assert(!/logProjectEvent\('production_actuals_captured'[\s\S]{0,200}syncProductionStatusToOrder\(j, 'qc', updated\)/.test(production), 'confirmClose must not emit legacy event before linked complete_print');
assert(!production.includes('actual_grams_used: num(full') && !production.includes('production_status: full.production_status'), 'Production REST payload must not directly send actuals/status updates');
assert(orders.includes('const {status, public_status_text, public_next_step, shipping_or_pickup_note, ...ordinaryPayload} = payload'), 'Orders Admin ordinary saves must omit status/tracking projection fields');
assert(orders.includes("Orders are created through approved Quote acceptance"), 'Orders Admin direct create must remain disabled');
assert(orders.includes('Orders cannot be deleted from Orders Admin') && !/orders\?id=eq\.\$\{activeId\}[\s\S]{0,80}method:\s*['\"]DELETE/.test(orders), 'Orders Admin direct delete must be disabled');
assert(orders.includes('const patchedOrder =') && orders.includes('updated_at:patchedOrder.updated_at'), 'Orders close must use updated_at returned by preceding PATCH');
assert(orders.includes("if(nextStatus !== 'closed')"), 'Fulfillment RPC must only be used for close_order');
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
assert.strictEqual(workflow.preAcceptanceProductionRpcRequest('job-1', 'mark_waiting_customer', '2026-07-20T00:00:00Z').path, '/rest/v1/rpc/preacceptance_production_command');
assert.strictEqual(workflow.workflowRpcRequest, undefined);

console.log('workflow command authority assertions passed');
