const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const production = fs.readFileSync('production-control.html', 'utf8');
const workflowSource = fs.readFileSync('js/workflow-status.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202607210004_authoritative_production_material_reservations.sql', 'utf8');
const commandMigration = fs.readFileSync('supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql', 'utf8');

assert.match(commandMigration, /production_workflow_command\(\s*p_order_number text,\s*p_command text,\s*p_expected_updated_at timestamptz,\s*p_payload jsonb default '\{\}'::jsonb,\s*p_correlation_id text default null,\s*p_causation_id text default null\s*\)/i);
assert.match(migration, /consume_production_attempt\(\s*p_production_job_id uuid,\s*p_attempt_id text,\s*p_correlation_id text,\s*p_expected_updated_at timestamptz,\s*p_roll_usages jsonb,\s*p_workflow_command text\s*\)/i);
assert.match(migration, /reserve_production_material\(\s*p_production_job_id uuid,\s*p_expected_updated_at timestamptz,\s*p_reservation_command_id text,\s*p_roll_reservations jsonb\s*\)/i);
assert.match(migration, /release_production_material_reservation\(\s*p_production_job_id uuid,\s*p_expected_updated_at timestamptz,\s*p_release_command_id text,\s*p_reason text default null\s*\)/i);

assert.match(production, /const linkedWorkflowInFlight = new Set\(\)/, 'linked workflow commands need an in-flight guard');
assert.match(production, /linkedWorkflowInFlight\.has\(inFlightKey\)[\s\S]*Workflow command already in progress/, 'duplicate Start/QC/Reprint clicks must be visibly blocked');
assert.match(production, /finally\{ linkedWorkflowInFlight\.delete\(inFlightKey\); \}/, 'status command guard must clear after failure or success');
assert.match(production, /closeInFlightKey[\s\S]*Complete Print is already in progress/, 'Complete Print must block duplicate submits');
assert.match(production, /finally\{\s*linkedWorkflowInFlight\.delete\(closeInFlightKey\);\s*\}/, 'Complete Print guard must clear');
assert.match(production, /syncProductionStatusToOrder\(j, 'qc', updated\)/, 'Complete Print must use Production workflow RPC');
assert.doesNotMatch(production, /\/rest\/v1\/inventory_transactions[\s\S]{0,160}method:\s*['"]POST/, 'browser must not insert command-owned inventory_transactions');
assert.doesNotMatch(production, /\/rest\/v1\/orders\?[^`'"\n]*status[\s\S]{0,160}method:\s*['"]PATCH/, 'browser must not directly PATCH orders.status');
assert.doesNotMatch(production, /production_jobs\?[^`'"\n]*production_status[\s\S]{0,160}method:\s*['"]PATCH/, 'browser must not directly PATCH production_jobs.status');
assert.match(production, /actual_grams_used:closeGoodTotal[\s\S]*scrap_grams:closeScrapTotal/, 'Complete Print must keep good grams and scrap grams distinct');
assert.match(production, /consumeCapturedAttempt\(updated, \{addFinished:[\s\S]*expectedUpdatedAt:j\.updated_at/, 'Inventory consumption must use the persisted expected_updated_at, not a fabricated local timestamp');
assert.match(production, /console\.error\('Production workflow command failed'/, 'workflow failures must log actionable errors');
assert.match(production, /Complete Print failed; no durable success was recorded by the browser/, 'Complete Print failure must be visible and not claim durable success');
assert.match(production, /refreshAuthoritativeProductionState\(\)/, 'success path must refresh authoritative state');

const memory = new Map();
const sandbox = { module:{exports:{}}, globalThis:{ crypto:{randomUUID:()=> 'stable-id'}, localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)} } };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(workflowSource, sandbox);
const workflow = sandbox.module.exports;
const startA = workflow.productionWorkflowRpcRequest('OP-000222', 'start_print', '2026-07-21T00:00:00Z');
const startB = workflow.productionWorkflowRpcRequest('OP-000222', 'start_print', '2026-07-21T00:00:00Z');
assert.strictEqual(startA.path, '/rest/v1/rpc/production_workflow_command');
assert.strictEqual(startA.body.p_correlation_id, startB.body.p_correlation_id, 'same-command retry identity is stable');
assert.strictEqual(workflow.inventoryConsumptionRpcRequest({id:'job-1', current_attempt_id:'attempt-1'}, 'pass_qc', '2026-07-21T00:00:00Z', [{raw_material_roll_id:'roll-1', grams_used:48}], null).path, '/rest/v1/rpc/consume_production_attempt');
assert.throws(()=> workflow.inventoryConsumptionRpcRequest({id:'job-1'}, 'complete_print', '2026-07-21T00:00:00Z', [], null), /QC Pass or Needs Reprint/);

assert(!production.includes('OP-000010'), 'workflow wiring must not touch protected OP-000010 evidence');
console.log('production inventory live workflow wiring assertions passed');
