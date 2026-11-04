const test=require('node:test');
const assert=require('node:assert/strict');
require('../js/tax-rate.js');require('../js/order-line-items.js');require('../js/quote-pricing.js');
const M=require('../js/ops-preview/model.js');
function request() {
  const order=M.newRequest();
  order.customer='Fictional requestor';order.title='A replacement bracket';
  order.items[0].description='Replacement bracket';
  order.intake.summary='Idea and a photo; no CAD or sliced estimate yet.';
  const state=M.seed();M.saveDraft(state,order);
  return {state,id:order.id};
}

test('an idea can enter the queue without a price, material or sliced estimate',()=>{
  const {state,id}=request();const order=state.orders.find(o=>o.id===id);
  assert.equal(M.stage(order),'request');assert.equal(M.reserved(state,'PETG / Black'),0);
  assert.equal(order.items[0].hours_each,0);assert.equal(order.items[0].materials.length,0);
  assert.equal(M.nextStep(order)[1],'request');
  assert.throws(()=>M.command(state,id,{type:'approve',method:'Email / text'}),/Prepare the quote/);
});

test('request -> draft -> shared quote -> approval keeps a frozen offer without producing early',()=>{
  let {state,id}=request();
  state=M.quoteCommand(state,id,{type:'prepare_quote'});
  let order=M.copy(state.orders.find(o=>o.id===id));
  order.items=[{...order.items[0],quantity:2,unit_price:30}, {...order.items[0],id:'other',description:'Nameplates',quantity:3,unit_price:10}];
  order.designFee=20;order.terms='Payment at pickup';order.turnaround='Two weeks from approval';
  M.saveDraft(state,order);
  state=M.quoteCommand(state,id,{type:'send_quote',via:'Email'});order=state.orders.find(o=>o.id===id);
  assert.equal(M.stage(order),'awaiting');assert.equal(order.quoteOffer.totals.total,110);
  assert.equal(order.quoteHistory.length,1);assert.equal(order.snapshot,undefined);assert.equal(order.released,false);
  assert.throws(()=>M.saveDraft(state,M.copy(order)),/quote revision/);
  state=M.command(state,id,{type:'approve',method:'Email / text'});order=state.orders.find(o=>o.id===id);
  assert.equal(M.stage(order),'approved');assert.deepEqual(order.snapshot,order.quoteOffer.totals);
  assert.equal(M.nextStep(order)[1],'production');
});

test('revised quotes retain the previous shared total and reset awaiting approval',()=>{
  let {state,id}=request();state=M.quoteCommand(state,id,{type:'prepare_quote'});
  let order=M.copy(state.orders.find(o=>o.id===id));order.items[0].unit_price=25;M.saveDraft(state,order);
  state=M.quoteCommand(state,id,{type:'send_quote',via:'Text / social message'});
  assert.throws(()=>M.quoteCommand(state,id,{type:'revise_quote',reason:''}),/reason/);
  state=M.quoteCommand(state,id,{type:'revise_quote',reason:'Customer requested another piece'});
  assert.equal(M.stage(state.orders.find(o=>o.id===id)),'quoting');
  order=M.copy(state.orders.find(o=>o.id===id));order.items[0].quantity=2;M.saveDraft(state,order);
  state=M.quoteCommand(state,id,{type:'send_quote',via:'Email'});order=state.orders.find(o=>o.id===id);
  assert.deepEqual(order.quoteHistory.map(o=>o.totals.total),[25,50]);
  assert.equal(order.quoteOffer.revision,2);assert.equal(order.quoteOffer.changeReason,'Customer requested another piece');
});

test('all-work queue distinguishes unapproved work, production, pickup, payment and completion',()=>{
  const state=M.seed();const original=state.orders[0];
  const variants=[['request',{quoteStage:'request'}],['quoting',{}],['awaiting',{quoteStage:'sent'}],['approved',{snapshot:M.totals(original)}],['queued',{snapshot:M.totals(original),released:true}],['printing',{snapshot:M.totals(original),released:true,runs:[{itemId:'blocks',status:'printing',quantity:1,printer:'P1S'}]}],['ready',{snapshot:M.totals(original),released:true,runs:[{itemId:'blocks',status:'inspected',accepted:2},{itemId:'tags',status:'inspected',accepted:3}]}],['payment',{snapshot:M.totals(original),fulfilled:true}],['complete',{snapshot:M.totals(original),fulfilled:true,payments:[{amount:110,fee:0}]}]];
  state.orders=variants.map(([id,fields])=>({...M.copy(original),...fields,id}));
  for(const [id] of variants)assert.equal(M.queue(state,id)[0].id,id);
  assert.equal(M.queue(state).length,8);assert.equal(M.queue(state,'all').length,9);
  state.orders[0].customer='Unique customer';assert.equal(M.queue(state,'all','unique')[0].id,'request');
  state.orders[1].intake={neededBy:'2026-11-15'};state.orders[2].intake={neededBy:'2026-11-10'};
  assert.equal(M.queue(state,'all')[0].id,'awaiting');
});
