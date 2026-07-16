const assert = require('node:assert/strict');
const fs = require('node:fs');
const lifecycle = require('../js/inventory-lifecycle.js');

assert.deepEqual(lifecycle.RESERVATION_STATUSES, ['ready_to_print', 'printing', 'qc']);
assert.equal(lifecycle.shouldReserve('estimate'), false);
assert.equal(lifecycle.shouldReserve('waiting_customer'), false);
assert.equal(lifecycle.shouldReserve('ready_to_print'), true);
assert.equal(lifecycle.shouldReserve('printing'), true);
assert.equal(lifecycle.shouldReserve('qc'), true);
assert.equal(lifecycle.shouldReserve('ready_for_fulfillment'), false);
assert.equal(lifecycle.shouldReserve('closed'), false);

assert.equal(lifecycle.reservationAction('estimate', 'ready_to_print'), 'reserve');
assert.equal(lifecycle.reservationAction('ready_to_print', 'printing'), 'keep');
assert.equal(lifecycle.reservationAction('printing', 'qc'), 'capture_actuals_keep_reservation');
assert.equal(lifecycle.reservationAction('qc', 'ready_for_fulfillment'), 'consume_and_release');
assert.equal(lifecycle.reservationAction('qc', 'ready_to_print'), 'consume_and_reserve_reprint');
assert.equal(lifecycle.reservationAction('printing', 'canceled'), 'release');
assert.equal(lifecycle.reservationAction('ready_for_fulfillment', 'closed'), 'release');

const reservedJob = {production_status:'printing', material_reservations:[{raw_material_roll_id:'roll-1', grams_reserved:100}]};
assert.equal(lifecycle.activeReservations(reservedJob).length, 1);
assert.equal(lifecycle.activeReservations({...reservedJob, production_status:'qc'}).length, 1);
assert.deepEqual(lifecycle.activeReservations({...reservedJob, production_status:'ready_for_fulfillment'}), []);

const consumed = {
  current_attempt_id:'attempt-1',
  production_attempts:[{id:'attempt-1', good_grams:90, scrap_grams:10, consumed_at:'2026-07-16T00:00:00Z'}]
};
assert.equal(lifecycle.attemptAlreadyConsumed(consumed), true);
assert.equal(lifecycle.attemptAlreadyConsumed({...consumed, current_attempt_id:'attempt-2'}), false);

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
assert.match(production, /consumeCapturedAttempt\(updated/);
assert.match(production, /attempt\.consumed_at/);
assert.match(production, /updated\.material_reservations = j\.material_reservations \|\| \[\]/);
assert.match(production, /inventory will be consumed on QC Pass/);
assert.doesNotMatch(production, /rpc\/complete_production_job/);

console.log('Inventory reservation lifecycle assertions passed.');
