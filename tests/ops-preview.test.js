const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../js/tax-rate.js');
require('../js/order-line-items.js');
require('../js/quote-pricing.js');
const M = require('../js/ops-preview/model.js');
const id = 'sample-mixed-order';
function apply(state, action) { return M.command(state, id, action); }
function approveAndRelease() {
  return apply(apply(M.seed(), {type: 'approve', method: 'Verbal agreement recorded'}), {type: 'release'});
}
function print(state, itemId, quantity, good, rejected, printer = 'P1S') {
  state = apply(state, {type: 'start', itemId, quantity, printer});
  const order = state.orders[0];
  const run = order.runs.at(-1);
  const item = order.items.find(item => item.id === itemId);
  return apply(state, {type: 'inspect', runId: run.id, accepted: good, rejected,
    hours: item.hours_each * quantity,
    usage: item.materials.map(m => ({key: M.materialKey(m), grams: m.grams_each * quantity})), notes: 'Sample check'});
}

test('mixed-item pickup, failed run, reprint and one payment reconcile', () => {
  let state = approveAndRelease();
  const initialTotal = state.orders[0].snapshot.total;
  assert.equal(M.reserved(state, 'PETG / Black'), 160);
  state = print(state, 'blocks', 2, 1, 1);
  assert.equal(M.remaining(state.orders[0], state.orders[0].items[0]), 1);
  assert.equal(state.inventory[0].grams, 1840);
  assert.equal(M.reserved(state, 'PETG / Black'), 80);
  const firstRun = state.orders[0].runs[0];
  assert.throws(() => apply(state, {type: 'inspect', runId: firstRun.id}), /already been inspected/);
  state = print(state, 'blocks', 1, 1, 0, 'P2S');
  state = print(state, 'tags', 3, 3, 0);
  assert.equal(state.orders[0].status, 'ready_for_fulfillment');
  assert.equal(state.inventory[0].grams, 1760);
  assert.equal(state.inventory[1].grams, 970);
  assert.equal(state.inventory[2].grams, 1455);
  assert.equal(M.reserved(state, 'PETG / Black'), 0);
  assert.equal(state.orders[0].snapshot.total, initialTotal);
  state = apply(state, {type: 'pickup'});
  assert.equal(state.orders[0].status, 'ready_for_fulfillment');
  state = apply(state, {type: 'pay', amount: initialTotal, fee: 0, method: 'Cash'});
  assert.equal(state.orders[0].status, 'closed');
  assert.equal(state.orders[0].payments.length, 1);
  assert.equal(M.balance(state.orders[0]), 0);
  assert.throws(() => apply(state, {type: 'pay', amount: initialTotal, fee: 0, method: 'Cash'}), /remaining balance/);
  state = apply(state, {type: 'actuals', hours: 0.5, otherCosts: 0});
  const costs = M.costs(state, state.orders[0]);
  assert.equal(costs.actual, 26.22);
  assert.equal(state.orders[0].estimateBaseline, 23.09);
  assert.equal(costs.actualProfit, 76.58);
});

test('incomplete QC, occupied printer, invalid usage and excess fulfillment are rejected', () => {
  let state = approveAndRelease();
  assert.throws(() => apply(state, {type: 'pickup'}), /Inspect all/);
  state = apply(state, {type: 'start', itemId: 'blocks', quantity: 2, printer: 'P1S'});
  assert.throws(() => apply(state, {type: 'start', itemId: 'tags', quantity: 1, printer: 'P1S'}), /active run/);
  assert.throws(() => apply(state, {type: 'start', itemId: 'blocks', quantity: 1, printer: 'P2S'}), /exceeds/);
  const runId = state.orders[0].runs[0].id;
  assert.throws(() => apply(state, {type: 'inspect', runId, accepted: 1, rejected: 0}), /must equal/);
  assert.throws(() => apply(state, {type: 'inspect', runId, accepted: 1, rejected: 1, usage: []}), /each material/);
  assert.equal(state.inventory[0].grams, 2000);
});

test('accepted scope is locked and partial payments retain one combined balance', () => {
  let state = approveAndRelease();
  assert.throws(() => M.saveDraft(state, M.copy(state.orders[0])), /accepted price/);
  assert.throws(() => apply(state, {type: 'release'}), /once/);
  state = apply(state, {type: 'pay', amount: 10, fee: 0.5, method: 'Stripe', reference: 'sample'});
  assert.equal(M.balance(state.orders[0]), 100);
  assert.equal(state.orders[0].snapshot.total, 110);
  assert.throws(() => apply(state, {type: 'pay', amount: 5, fee: 6, method: 'Stripe'}), /Fee exceeds/);
});

test('reservations protect material from a second sample order', () => {
  let state = approveAndRelease();
  const second = M.copy(state.orders[0]);
  second.id = 'second'; second.released = false; second.items[0].quantity = 30;
  state.orders.push(second);
  assert.throws(() => M.command(state, 'second', {type: 'release'}), /Not enough/);
});

test('tax-inclusive amounts reuse canonical engine and preserve all-in prices', () => {
  for (const rate of [0, 6.5, 7, 7.25, 8]) {
    for (const price of [0.01, 0.07, 0.99, 10, 11.99, 30]) {
      const t = global.calculateQuoteTotals({taxIncluded: true, taxRate: rate,
        lineItems: [{id: 'a', description: 'A', quantity: 3, unit_price: price}, {id: 'b', description: 'B', quantity: 2, unit_price: 2.19}]});
      assert.equal(t.total, Math.round((3 * price + 4.38) * 100) / 100);
      assert.equal(Math.round((t.beforeTax + t.tax + t.roundingAdjustment) * 100) / 100, t.total);
      assert.equal(t.tax, Math.round((t.total * rate / (100 + rate) + Number.EPSILON) * 100) / 100);
    }
  }
  const exempt = global.calculateQuoteTotals({taxIncluded: true, taxExempt: true, taxRate: 7,
    lineItems: [{description: 'Exempt sample', quantity: 2, unit_price: 10}]});
  assert.equal(exempt.total, 20); assert.equal(exempt.tax, 0);
});

test('tax-inclusive shipping, discount and deposit reconcile', () => {
  const t = global.calculateQuoteTotals({taxIncluded: true, taxRate: 7, customerShipping: 5.35,
    discount: 10.70, depositPercent: 50, lineItems: [{description: 'Sample', quantity: 2, unit_price: 53.50}]});
  assert.equal(t.total, 101.65);
  assert.equal(t.deposit, 50.83);
  assert.equal(t.balance, 50.82);
  assert.equal(t.grossLineItems[0].unit_price, 53.50);
});

test('sample entry pages isolate their optional staging connection from production auth', () => {
  for (const path of ['ops-preview.html', 'ops-order-preview.html', 'ops-track-preview.html']) {
    const text = fs.readFileSync(path, 'utf8');
    assert.match(text, /Fictional records saved on this device/);
    assert.match(text, /js\/ops-preview\/cloud\.js/);
    assert.doesNotMatch(text, /olipoly-auth|alffoktlwhpfothieude|supabase\.co/);
  }
  const script = fs.readFileSync('js/ops-preview/workspace.js', 'utf8');
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|supabase\.co/);
});

test('many tiny tax-inclusive lines and a full discount retain zero net revenue', () => {
  const items = Array.from({length: 100}, (_, i) => ({id: `tiny-${i}`, description: 'Tiny item', quantity: 1, unit_price: 0.07}));
  const t = global.calculateQuoteTotals({taxIncluded: true, taxRate: 7, lineItems: items});
  assert.equal(t.beforeTax, 6.54);
  assert.equal(t.tax, 0.46);
  assert.equal(t.total, 7);
  assert.equal(t.roundingAdjustment, 0);
  const free = global.calculateQuoteTotals({taxIncluded: true, taxRate: 7, lineItems: items, discount: 7});
  assert.equal(free.beforeTax, 0); assert.equal(free.tax, 0); assert.equal(free.total, 0);
});

test('an unnamed new draft cannot be approved or released', () => {
  const state = M.seed();
  state.orders[0].customer = '';
  assert.throws(() => apply(state, {type:'approve', method:'Email / text'}), /Save the customer/);
});


test('all-in shipping and discount cent boundaries retain the commercial breakdown', () => {
  for (const [price,discount,shipping] of [[0.09,0.08,0.07],[0.10,0.08,0.06],[0.31,0.14,0.22],[0.08,0,0],[0.01,0.01,0.08]]) {
    const t = calculateQuoteTotals({taxIncluded:true,taxRate:7,discount,customerShipping:shipping,
      lineItems:[{description:'Small item',quantity:1,unit_price:price}]});
    assert.equal(Math.round((t.preDiscount-t.discount+t.customerShipping)*100)/100,t.beforeTax);
    assert.equal(Math.round((t.beforeTax+t.tax)*100)/100,t.total);
    assert.equal(t.lineItems.reduce((sum,row)=>sum+row.line_total,0),t.preDiscount);
  }
});
