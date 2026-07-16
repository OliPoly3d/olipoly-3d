const assert = require('node:assert/strict');
const pulse = require('../js/hub-business-pulse.js');

const today = '2026-07-16';
const jobs = [
  {id:'wait', quote_number:'Q-1', production_status:'waiting_for_customer', updated_at:'2026-07-01T12:00:00Z'},
  {id:'ready', order_number:'OP-2', production_status:'ready_to_print', due_date:'2026-07-18', estimated_total_grams:120, material_reservations:[{raw_material_roll_id:'roll-a', grams_reserved:80}]},
  {id:'printing', order_number:'OP-3', production_status:'printing', payment_status:'deposit_due', deposit_amount:50, order_total:200, material_reservations:[{raw_material_roll_id:'roll-a', grams_reserved:100}]},
  {id:'qc', order_number:'OP-4', production_status:'qc', material_reservations:[{raw_material_roll_id:'roll-b', grams_reserved:25}]},
  {id:'fulfill', order_number:'OP-5', production_status:'ready_for_fulfillment', updated_at:'2026-07-12T12:00:00Z'},
  {id:'closed', order_number:'OP-6', production_status:'closed', closed_at:'2026-07-16T10:00:00Z'},
  {id:'failed', order_number:'OP-7', production_status:'needs_reprint'}
];
const inventory = [
  {id:'roll-a', remaining_grams:100, reorder_threshold_grams:150},
  {id:'roll-b', remaining_grams:500, reorder_threshold_grams:100}
];
const result = pulse.build({jobs, inventory, today});

assert.deepEqual(result.counts, {waiting_for_customer:1, ready_to_print:1, printing:1, qc:1, ready_for_fulfillment:1, closed_today:1});
assert.equal(result.inventory.reservedGrams, 205);
assert.equal(result.inventory.belowReorder.length, 1);
assert.deepEqual(result.inventory.shortageJobs.map(row => row.id), ['ready']);
assert.equal(result.money.unpaidAcceptedTotal, 200);
assert.equal(result.money.depositsDue, 50);
assert.equal(result.money.paidTodayAvailable, false);

const titles = result.attention.map(item => item.title);
assert.ok(titles.includes('Q-1 needs quote follow-up'));
assert.ok(titles.includes('OP-2 is due soon'));
assert.ok(titles.includes('OP-3 is blocked by deposit'));
assert.ok(titles.includes('OP-4 is waiting for QC'));
assert.ok(titles.includes('OP-5 is awaiting fulfillment'));
assert.ok(titles.includes('OP-7 needs reprint review'));
assert.ok(titles.includes('OP-2 has an inventory shortage'));
assert.ok(result.attention.every((item, index, rows) => !index || rows[index - 1].priority >= item.priority));
assert.match(result.attention.find(item => item.title.includes('OP-2 is due soon')).href, /^orders-admin\.html\?search=OP-2$/);
assert.match(result.attention.find(item => item.title.includes('inventory shortage')).href, /^inventory-control\.html\?search=OP-2$/);

const money = pulse.moneySnapshot([
  {id:'unpaid', production_status:'printing', payment_status:'unpaid', order_total:300},
  {id:'deposit', production_status:'ready_to_print', payment_status:'deposit_due', order_total:200, deposit_amount:75},
  {id:'invoice', production_status:'printing', customer_type:'business', payment_status:'unpaid', order_total:100, invoice_due_date:'2026-07-15'},
  {id:'paid', production_status:'ready_for_fulfillment', payment_status:'paid', order_total:125, paid_date:today}
], {todayRevenue:999}, today);
assert.equal(money.unpaidAcceptedTotal, 600);
assert.equal(money.depositsDue, 75);
assert.equal(money.overdueInvoices.length, 1);
assert.equal(money.paidToday, 125, 'record-level paid data takes precedence over Finance summary');
assert.equal(pulse.deepLink('production-control.html', {order_number:'OP 8'}), 'production-control.html?search=OP%208');

console.log('Hub aggregation, attention priority, money, inventory, and deep-link assertions passed.');
