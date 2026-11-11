const test=require('node:test');
const assert=require('node:assert/strict');
require('../js/tax-rate.js');
require('../js/order-line-items.js');
require('../js/quote-pricing.js');
const M=require('../js/ops-preview/model.js');
const V=require('../js/ops-preview/customer-view.js');

test('a $15 all-in quote can be approved before manufacturing inputs, then costed before release',()=>{
  let state=M.seed();
  const order=state.orders[0];
  order.items=[{...order.items[0],quantity:1,unit_price:15,hours_each:0,materials:[]}];
  order.designFee=0;
  order.estimatedLabor=0;
  assert.equal(M.costsReady(order),false);
  state=M.quoteCommand(state,order.id,{type:'send_quote',via:'In person'});
  state=M.command(state,order.id,{type:'approve',method:'Verbal agreement recorded'});
  const agreed=M.copy(state.orders[0]);
  const customer=V.project(agreed);
  assert.equal(agreed.snapshot.total,15);
  const items=[{...agreed.items[0],hours_each:1,materials:[{material:'PLA',color:'Black',grams_each:30}]}];
  state=M.command(state,order.id,{type:'production_plan',items,prepHours:0.1,remainingHours:0.05});
  const prepared=state.orders[0];
  assert.equal(M.costsReady(prepared),true);
  assert.equal(M.costs(state,prepared).estimated,5.72);
  assert.equal(M.costs(state,prepared).actual,3);
  assert.equal(M.costs(state,prepared).estimatedProfit,8.30);
  assert.deepEqual(V.project(prepared),customer);
  assert.deepEqual(prepared.items,agreed.items);
  assert.equal(M.reserved(state,'PLA / Black'),0);
  const actuals=M.command(state,order.id,{type:'actuals',hours:0.2,otherCosts:0});
  assert.equal(M.costs(actuals,actuals.orders[0]).actual,6);
});

test('cost-first quoting shares the same print costs and reacts to material and labor estimates',()=>{
  const state=M.seed(),order=state.orders[0];
  assert.equal(M.costsReady(order),true);
  assert.equal(M.estimatedItemCost(state,order.items[0]),3.13);
  const before=M.costs(state,order);
  order.items[0].materials[0].grams_each+=100;
  assert.equal(M.costs(state,order).estimated,Math.round((before.estimated+4.6)*100)/100);
  order.estimatedLabor+=0.25;
  assert.equal(M.costs(state,order).estimated,Math.round((before.estimated+12.1)*100)/100);
});

test('preparation requires complete supported materials and nonnegative time',()=>{
  let state=M.seed();const id=state.orders[0].id;
  state=M.command(state,id,{type:'approve',method:'Owner fixture'});
  const items=M.copy(state.orders[0].items);
  assert.throws(()=>M.command(state,id,{type:'production_plan',items,prepHours:-1}),/nonnegative/);
  items[0].materials[0].material='Unavailable';
  assert.throws(()=>M.command(state,id,{type:'production_plan',items}),/inventory/);
});
