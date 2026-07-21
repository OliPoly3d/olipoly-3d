const assert = require('node:assert/strict');
const fs = require('node:fs');

const inventory = fs.readFileSync('inventory-control.html', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');
const workflow = fs.readFileSync('js/workflow-status.js', 'utf8');
const lifecycle = fs.readFileSync('js/inventory-lifecycle.js', 'utf8');

const authoritativeTables = [
  'raw_material_inventory',
  'finished_goods_inventory',
  'non_filament_materials',
  'inventory_transactions',
  'inventory_spool_pool'
];

for (const table of authoritativeTables) {
  const deletePattern = new RegExp(String.raw`/rest/v1/${table}[^\n;]*user_id=eq[^\n;]*[\s\S]{0,120}method:\s*['"]DELETE['"]`);
  assert.doesNotMatch(inventory, deletePattern, `${table} must not have a browser bulk DELETE reset/rebuild path`);
}

assert.doesNotMatch(inventory, /deleteUserCloudRows|Force Full Cloud Rebuild|forceRebuild/i, 'cloud rebuild/delete helper and UI must be removed');
assert.match(inventory, /id="exportLocalRecoveryBtn"/, 'local recovery export remains available');
assert.match(inventory, /function exportLocalRecovery\(\)/, 'local recovery export has a code-level owner');
assert.match(inventory, /function recoverLocalInventory\(\)[\s\S]*uploaded:false/, 'local recovery review remains browser-only');
assert.match(inventory, /Browser recovery\/cache state must never bulk-delete or rebuild authoritative cloud Inventory rows\./, 'sync path documents cloud mutation boundary');
assert.match(inventory, /Syncing reviewed inventory owner saves/, 'normal cloud sync remains an owner save path, not a rebuild path');
assert.match(inventory, /cloudSaveRaw\(normalizeRaw\(r\)\)/, 'normal raw Inventory owner save remains functional');
assert.match(inventory, /cloudSaveFg\(normalizeFg\(f\)\)/, 'normal finished-goods owner save remains functional');
assert.match(inventory, /cloudSaveSupply\(normalizeSupply\(s\)\)/, 'normal non-filament owner save remains functional');
assert.doesNotMatch(inventory, /localStorage\.removeItem\(['"]sb_|localStorage\.removeItem\(['"]olipoly_workflow_command:/, 'Inventory reset/recovery must not clear auth/session or command retry keys');
assert.match(workflow, /olipoly_workflow_command:/, 'workflow command retry keys remain defined outside Inventory reset');
assert.match(production, /requestLinkedInventoryForStatus|consumeCapturedAttempt|prepareLinkedInventoryForWorkflow/, 'Production still routes linked inventory work through reviewed workflow helpers');
assert.match(workflow, /reserve_production_material[\s\S]*release_production_material_reservation[\s\S]*consume_production_attempt/, 'authoritative reservation and consumption RPC paths remain unchanged');
assert.match(lifecycle, /reservationAction[\s\S]*attemptAlreadyConsumed/, 'Inventory lifecycle helpers remain unchanged for normal Inventory behavior');
