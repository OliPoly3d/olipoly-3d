const assert = require('node:assert/strict');
const fs = require('node:fs');

const inventory = fs.readFileSync('inventory-control.html', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');
const workflow = fs.readFileSync('js/workflow-status.js', 'utf8');
const lifecycle = fs.readFileSync('js/inventory-lifecycle.js', 'utf8');
const persistence = fs.readFileSync('js/authoritative-persistence.js', 'utf8');
const deployedInventoryContract = fs.readFileSync('ERP_DEPLOYED_CONTRACT_INVENTORY.md', 'utf8');

const authoritativeTables = [
  'raw_material_inventory',
  'finished_goods_inventory',
  'non_filament_materials',
  'inventory_transactions',
  'inventory_settings',
  'inventory_spool_pool'
];

assert.match(inventory, /function cloudDeleteInventory\(table,id\)[\s\S]*id=eq\.\$\{encodeURIComponent\(id\)\}&user_id=eq\.\$\{encodeURIComponent\(state\.user\.id\)\}[\s\S]*method:'DELETE'[\s\S]*Prefer:'return=representation'/, 'individual inventory deletes must be owner scoped and request the deleted representation');
assert.match(inventory, /rows\.length!==1[\s\S]*String\(rows\[0\]\.id\)!==String\(id\)/, 'individual inventory deletes must reject zero, multiple, or unexpected returned rows');
for (const table of authoritativeTables) {
  const unsafeDeletePattern = new RegExp(String.raw`/rest/v1/${table}\?(?![^\x60\n]*id=eq\.)[^\x60\n]*[\s\S]{0,160}method:\s*['"]DELETE['"]`);
  assert.doesNotMatch(inventory, unsafeDeletePattern, `${table} must not have a browser bulk DELETE reset/rebuild path`);
}

assert.doesNotMatch(inventory, /deleteUserCloudRows|Force Full Cloud Rebuild|forceRebuild/i, 'cloud rebuild/delete helper and UI must be removed');
assert.doesNotMatch(inventory, /Sync Inventory to Cloud|Syncing reviewed inventory owner saves|cloud sync complete/i, 'browser-to-cloud full sync wording/path must not remain active');
assert.match(inventory, /Review Local Recovery/, 'legacy sync button is neutralized into a recovery review action');
assert.match(inventory, /reason:'browser-to-cloud full replacement is disabled'/, 'legacy local-to-cloud replacement path is visibly blocked');
assert.match(inventory, /cloudMutated:false/, 'blocked recovery review reports that cloud state was not mutated');
assert.match(inventory, /id="exportLocalRecoveryBtn"/, 'local recovery export remains available');
assert.match(inventory, /function exportLocalRecovery\(\)/, 'local recovery export has a code-level owner');
assert.match(inventory, /function recoverLocalInventory\(\)[\s\S]*uploaded:false/, 'local recovery review remains browser-only');
assert.match(inventory, /const RECOVERY_KEY='olipoly_inventory_recovery_review_v1'/, 'recovery records are stored separately from authoritative inventory cache keys');
assert.match(inventory, /function cacheAuthoritativeInventory[\s\S]*write\(RAW_KEY[\s\S]*write\(FG_KEY[\s\S]*write\(SUPPLY_KEY[\s\S]*saveLedger/, 'Supabase load replaces authoritative inventory cache');
assert.match(inventory, /cacheAuthoritativeInventory\(\{rawRows,fgRows,supplyRows,ledgerRows:cloudLedger\}\)/, 'cloud load routes through the cache replacement helper');
assert.match(inventory, /NOT saved to Supabase[\s\S]*non-durable recovery copy/, 'failed remote saves are visibly non-durable recovery, not success');
assert.match(inventory, /retainRecovery\('raw'[\s\S]*retainRecovery\('supplies'[\s\S]*retainRecovery\('finished'/, 'failed raw/supply/finished saves retain separate recovery rows');
assert.match(inventory, /await cloudDeleteRaw\(id\);saveRaw\(raw\(\)\.filter/, 'raw local cache deletion follows confirmed cloud deletion');
assert.match(inventory, /await cloudDeleteSupply\(id\);saveSupplies\(supplies\(\)\.filter/, 'supply local cache deletion follows confirmed cloud deletion');
assert.match(inventory, /await cloudDeleteFg\(id\);saveFinished\(finished\(\)\.filter/, 'finished-good local cache deletion follows confirmed cloud deletion');
assert.match(inventory, /await cloudSaveRaw\(updated\);list\[idx\]=updated;saveRaw\(list\)/, 'raw quantity adjustment saves to cloud before changing local cache');
assert.match(inventory, /await cloudSaveFg\(updated\);list\[idx\]=updated;saveFinished\(list\)/, 'finished-good quantity adjustment saves to cloud before changing local cache');
assert.doesNotMatch(inventory, /function quickRaw\(id,dir,button\)[\s\S]{0,900}saveRaw\(list\);[\s\S]{0,100}cloudSaveRaw/, 'raw quick adjustment must not write local cache before cloud');
assert.doesNotMatch(inventory, /function quickFg\(id,dir,button\)[\s\S]{0,700}saveFinished\(list\);[\s\S]{0,100}cloudSaveFg/, 'finished-good quick adjustment must not write local cache before cloud');
assert.doesNotMatch(inventory, /localStorage\.removeItem\(['"]sb_|localStorage\.removeItem\(['"]olipoly_workflow_command:/, 'Inventory reset/recovery must not clear auth/session or command retry keys');
assert.match(persistence, /source:'remote'[\s\S]*source:'local-recovery'/, 'timestamp conflict logic preserves remote authority and local recovery classification');
assert.match(deployedInventoryContract, /Inventory Browser-Authority Guard/, 'deployed Inventory contract documents this browser authority guard');
assert.match(deployedInventoryContract, /OP-000010 was not modified/, 'documentation explicitly preserves OP-000010 and historical evidence');
assert.match(deployedInventoryContract, /with stale local cache[\s\S]*newer local recovery[\s\S]*duplicate import/i, 'live verification checklist covers cache/recovery/import cases');
assert.match(workflow, /olipoly_workflow_command:/, 'workflow command retry keys remain defined outside Inventory reset');
assert.match(production, /requestLinkedInventoryForStatus|consumeCapturedAttempt|prepareLinkedInventoryForWorkflow/, 'Production still routes linked inventory work through reviewed workflow helpers');
assert.match(workflow, /reserve_production_material[\s\S]*release_production_material_reservation[\s\S]*consume_production_attempt/, 'authoritative reservation and consumption RPC paths remain unchanged');
assert.match(lifecycle, /reservationAction[\s\S]*attemptAlreadyConsumed/, 'Inventory lifecycle helpers remain unchanged for normal Inventory behavior');
assert.doesNotMatch(inventory, /OP-000010/, 'Inventory browser authority changes must not touch OP-000010 records');

console.log('inventory browser storage authority assertions passed');
