const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/tax-rate.js');
const L = require('../js/order-line-items.js');
require('../js/quote-pricing.js');
const P = require('../js/order-pricing.js');
const A = require('../js/invoice-authority.js');
const items = [
  {id:'dragon',description:'Dragon',quantity:5,unit_price:3,hours_each:1,materials:[{inventory_pick:'PLA | Pink | Test',material:'PLA',color:'Pink',filament:'Test',grams_each:20}]},
  {id:'puppy',description:'Puppy',quantity:1,unit_price:2,hours_each:.5,materials:[{inventory_pick:'PLA | Pink | Test',material:'PLA',color:'Pink',filament:'Test',grams_each:10}]}
];
test('five dragons and one puppy retain separate prices and both material estimates', () => {
  const summary = L.productionSummary(items);
  assert.equal(summary.quantity,6);
  assert.equal(summary.subtotal,17);
  assert.equal(summary.hours,5.5);
  assert.equal(summary.grams,110);
  assert.equal(summary.recipe.length,1,'same filament is grouped before reservation');
  assert.ok(Math.abs(summary.recipe[0].grams_each*summary.quantity-110)<1e-10);
  const t = P.snapshot(items,{taxRate:7,shippingDeferred:true});
  assert.deepEqual(t.line_items.map(i=>i.line_total),[15,2]);
  assert.equal(t.final_total,18.19);
  assert.equal(t.shipping,0);
  assert.equal(t.shipping_deferred,true);
});
test('cancel the puppy and add shipping without double charging it', () => {
  const t = P.snapshot([items[0]],{taxRate:7,shipping:6});
  assert.equal(t.quantity,5);
  assert.equal(t.subtotal,15);
  assert.equal(t.taxable_subtotal,21);
  assert.equal(t.tax,1.47);
  assert.equal(t.final_total,22.47);
  const invoice = A.normalize({reconciliation_status:'verified',component_breakdown_available:true,accepted_commercial_breakdown:t,
    identity:{order_title:'Mixed toys'},current_payment_state:{order_total:22.47,balance_amount:22.47,amount_paid:0,payment_status:'unpaid'}});
  assert.deepEqual(A.totalsRows(invoice).find(r=>r[0]==='Shipping'),['Shipping',6]);
  assert.deepEqual(A.totalsRows(invoice).at(-1),['Total due',22.47]);
  assert.equal(P.snapshot([items[0]],{taxRate:7,taxExempt:true,shipping:6}).final_total,21);
});
test('zero price, fractional unit prices, discounts, and legacy net subtotal remain exact', () => {
  assert.equal(P.snapshot([{...items[0],unit_price:0}],{}).final_total,0);
  assert.equal(P.snapshot([{...items[0],quantity:1,unit_price:.1},{...items[1],unit_price:.2}],{}).subtotal,.3);
  assert.equal(P.snapshot([{...items[0],quantity:4,unit_price:5.125}],{discount:2,shipping:6,taxRate:6.5}).final_total,26.09);
  const legacy={order_title:'Legacy project',accepted:{quantity:4,taxable_subtotal:20.5,discount:2,shipping:0}};
  assert.equal(P.snapshot(P.initialItems(legacy),{taxRate:6.5}).final_total,21.83);
  assert.throws(()=>L.normalize([{...items[0],quantity:0}]),/positive whole/);
  assert.throws(()=>L.normalize([{...items[0],unit_price:NaN}]),/nonnegative/);
  assert.throws(()=>L.normalize([items[0],items[0]]),/unique/);
  assert.match(L.tableRows([{...items[0],description:'<script>bad</script>'}],String),/&lt;script&gt;/);
});
test('Finance product revenue, shipping revenue, taxable base and customer total reconcile', () => {
  const source=fs.readFileSync('finance-pro.js','utf8');
  const start=source.indexOf('const incomeSaleAmount =');
  const end=source.indexOf('function reportingEntries',start);
  const c={num:v=>Number(v)||0,calculateSalesTax:globalThis.calculateSalesTax};
  vm.createContext(c);
  vm.runInContext(source.slice(start,end)+'\nglobalThis.result={incomeSaleAmount,taxableSubtotalOf,computedSalesTax};',c);
  const entry={type:'income',amount:15,shipping_charged:6,sales_tax_rate:7,sales_tax_collected:1.47,accepted_commercial_snapshot:{accepted_commercial_breakdown:{shipping_in_taxable_subtotal:true}}};
  assert.equal(c.result.incomeSaleAmount(entry),15);
  assert.equal(c.result.taxableSubtotalOf(entry),21);
  assert.equal(c.result.computedSalesTax(entry),1.47);
  assert.equal(c.result.incomeSaleAmount(entry)+entry.shipping_charged+entry.sales_tax_collected,22.47);
});
