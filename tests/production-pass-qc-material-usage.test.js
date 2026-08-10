const assert = require('node:assert/strict');
const fs = require('node:fs');

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
const inventoryRpc = fs.readFileSync(require.resolve('../supabase/migrations/202608040002_bound_inventory_consumption_and_skip_excluded.sql'), 'utf8');

assert.match(production, /id="qcUsageModal"[\s\S]*Inventory roll\/spool used[\s\S]*Actual grams used[\s\S]*Scrap grams \(optional\)/);
assert.match(production, /if\(inventoryBoundary && !j\.exclude_inventory_reduction && !attemptHasExplicitRollUsage\(j\)\)[\s\S]*openQcUsage\(j, status, commandContext\)/, 'missing usage must open the operator flow');
assert.match(production, /estimates are pre-filled only as a convenience and are not actual consumption until you confirm/, 'reservation/estimate must remain distinct from confirmed actuals');
assert.match(production, /raw_material_roll_id:.*[\s\S]*good_grams:good[\s\S]*scrap_grams:scrap[\s\S]*grams_used:good \+ scrap/, 'canonical roll usage captures good and scrap grams');
assert.match(production, /capturedAttempt = \{\.\.\.attempt, good_grams:goodTotal, scrap_grams:scrapTotal, roll_usages:usages, usage_confirmed_at:/);
assert.match(production, /await setStatus\(job\.id, pending\.status, pending\.commandContext\)/, 'confirmation must resume the single authoritative lifecycle command');
assert.match(production, /inventoryBoundary && j\.exclude_inventory_reduction[\s\S]*Inventory is excluded for this job\. No material will be consumed\./);
assert.match(production, /status === 'ready_for_fulfillment' \? 'QC passed\. Job is ready for pickup\/shipment\.'/);
assert.match(production, /status === 'ready_to_print'[\s\S]*Confirm & Start Reprint/, 'Needs Reprint must share usage capture without passing QC');
assert.match(production, /linkedWorkflowInFlight\.has\(inFlightKey\)/, 'double clicks remain guarded');
assert.match(production, /reconcileAttemptConsumption\(job, attempt, request\.body, startedAt\)/, 'ambiguous transport must reconcile before retry');
assert.match(inventoryRpc, /production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption'/, 'attempt receipt is the durable idempotency key');
assert.match(inventoryRpc, /if v_existing is not null then[\s\S]*'idempotent', true/, 'refresh/retry returns the existing receipt');
assert.match(inventoryRpc, /exclude_inventory_reduction,false[\s\S]*'inventory_skipped', true/, 'excluded Inventory consumes zero material');
assert.doesNotMatch(production, /product\.product_id/, 'QC material hydration must not dereference a missing catalog product');

console.log('Production Pass QC material usage assertions passed.');
