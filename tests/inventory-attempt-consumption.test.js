const assert = require('assert');
const fs = require('fs');

const migration = fs.readFileSync('supabase/migrations/202607210002_consume_production_attempt_inventory.sql', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');
const workflow = fs.readFileSync('js/workflow-status.js', 'utf8');

assert.match(migration, /create or replace function public\.consume_production_attempt/i, 'Inventory command RPC must be created');
assert.match(migration, /security definer\s*set search_path = public, pg_temp/i, 'RPC must be SECURITY DEFINER with fixed search_path');
assert.match(migration, /auth\.uid\(\)/, 'RPC must verify authenticated owner');
assert.match(migration, /for update/g, 'RPC must lock Production, Order, and raw-material rows');
assert.match(migration, /v_job\.updated_at is distinct from p_expected_updated_at/i, 'RPC must enforce optimistic concurrency');
assert.match(migration, /v_command not in \('pass_qc','needs_reprint'\)/i, 'RPC must reject arbitrary browser workflow states');
assert.match(migration, /jsonb_array_length\(p_roll_usages\) = 0/i, 'RPC must reject missing roll evidence');
assert.match(migration, /raw_material_roll_id/i, 'RPC must require roll ids');
assert.match(migration, /remaining_grams = remaining_grams - v_grams/i, 'RPC must update the verified raw quantity authority');
assert.doesNotMatch(migration, /current_grams\s*=/i, 'RPC must not update current_grams as a competing quantity authority');
assert.match(migration, /inventory_transactions_production_attempt_roll_once/i, 'RPC must include uniqueness by attempt and roll');
assert.match(migration, /idempotent', true/i, 'Same-command retry must return original authoritative result');
assert.match(migration, /correlation_id is distinct from p_correlation_id/i, 'Identity collisions must fail');
assert.match(migration, /insufficient available material/i, 'Insufficient material must be denied');
assert.match(migration, /revoke execute on function public\.consume_production_attempt.*from public, anon/is, 'PUBLIC and anon execute must be revoked');
assert.match(migration, /grant execute on function public\.consume_production_attempt.*to authenticated, service_role/is, 'Only reviewed roles get execute');
assert.match(migration, /Historical unlinked inventory_transactions rows remain untouched/i, 'Historical unlinked transactions must remain untouched');

assert.match(workflow, /inventoryConsumptionRpcRequest/, 'Client must build Inventory consumption RPC requests');
assert.match(workflow, /\/rest\/v1\/rpc\/consume_production_attempt/, 'Client must call command RPC path');
assert.match(workflow, /commandIdentity\('inventory-consumption'/, 'Inventory command must have durable correlation identity');
assert.match(production, /consumeCapturedAttempt\(updated, \{addFinished:[\s\S]*workflowCommand:status === 'ready_to_print' \? 'needs_reprint' : 'pass_qc'/, 'QC Pass and Needs Reprint must select approved orchestration commands');
const consumeBlock = production.match(/async function consumeCapturedAttempt[\s\S]*?\n  }\n\n  async function confirmClose/)[0];
assert.doesNotMatch(consumeBlock, /applyRollCloseoutLocal\(/, 'Linked attempt consumption must not locally decrement raw inventory');
assert.doesNotMatch(consumeBlock, /syncRawInventoryAfterConsumption\(/, 'Linked attempt consumption must not browser-write raw material rows after consumption');
assert.match(consumeBlock, /sbApi\(request\.path/, 'Linked attempt consumption must use RPC');
assert.match(production, /rememberLinkedWorkflowRecovery\(j, status, updated, lifecycleAction\)/, 'Client must retain durable recovery if workflow RPC fails after Inventory succeeds');
assert.match(production, /state\.jobs = state\.jobs\.map[\s\S]*clearLinkedWorkflowRecovery/, 'Local lifecycle state must update only after authoritative workflow command succeeds');

console.log('Inventory attempt consumption assertions passed.');
