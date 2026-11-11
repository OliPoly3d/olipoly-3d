const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('../js/order-line-items.js');require('../js/tax-rate.js');require('../js/quote-pricing.js');
const M=require('../js/ops-preview/model.js'),V=require('../js/ops-preview/customer-view.js');
function fixture(accepted=true){let state=M.seed(),order=state.orders[0];order.reference='OP-0000002';order.customer='<Fictional customer>';order.turnaround='Two weeks after approval';order.validUntil='2026-12-04';state=M.quoteCommand(state,order.id,{type:'send_quote',via:'Email'});if(accepted)state=M.command(state,order.id,{type:'approve',method:'Owner test'});return state.orders[0];}

test('customer preview reads the frozen commercial offer, never a new price calculation',()=>{
 const o=fixture(false),saved=o.quoteOffer.totals.total;
 o.items[0].unit_price=999;o.terms='mutated';o.customer='mutated';
 const p=V.project(o);assert.equal(p.totals.total,saved);assert.equal(p.customer,'<Fictional customer>');assert.equal(p.terms,'Payment at pickup');
 assert.equal(p.revision,1);assert.match(V.render(p),/&lt;Fictional customer&gt;/);
 const raw=fs.readFileSync('js/ops-preview/customer-view.js','utf8');assert.doesNotMatch(raw,/calculateQuoteTotals|M\.totals/);
});

test('no unsent draft is presented as a customer quote',()=>{
 assert.equal(V.project(M.seed().orders[0]),null);
 assert.match(V.render(null),/no saved shared quote/);
});

test('customer projection strips internal costs, inventory, usage and payment fees',()=>{
 const o=fixture();o.privateNotes='PRIVATE-NOTE';o.otherCosts=123.47;o.laborRate=987;o.payments=[{amount:25,fee:17,method:'Cash',reference:'PRIVATE-REFERENCE'}];
 const p=V.project(o),html=V.render(p,'pay');
 assert.equal(p.balance,85);assert.equal(p.paid,25);
 for(const key of ['runs','inventory','estimateBaseline','laborRate','otherCosts','approval','database','privateNotes'])assert.equal(p[key],undefined);
 assert.deepEqual(p.payments,[{amount:25,method:'Cash',date:''}]);
 assert.doesNotMatch(JSON.stringify(p),/grams_each|hours_each|PRIVATE-|unitCost/);
 assert.match(html,/\$85\.00/);assert.match(html,/do not add it again/);
 assert.doesNotMatch(html,/ops-order|production job|finance-pro|laborRate/);
});

test('paid, unpaid, business and unapproved payment views have distinct actions',()=>{
 const o=fixture();assert.match(V.render(V.project(o),'pay'),/data-method="card"/);
 o.preset='business';assert.doesNotMatch(V.render(V.project(o),'pay'),/data-method=/);assert.match(V.render(V.project(o),'pay'),/invoice terms/);
 o.preset='individual';o.payments=[{amount:110,method:'Cash'}];assert.match(V.render(V.project(o),'pay'),/paid in full/);assert.doesNotMatch(V.render(V.project(o),'pay'),/data-method=/);
 o.payments=[{amount:115,method:'Cash'}];assert.equal(V.project(o).credit,5);assert.match(V.render(V.project(o),'pay'),/not been treated as a tip/);
 assert.doesNotMatch(V.render(V.project(fixture(false)),'pay'),/data-method=/);
});

test('acceptance remains explicit and milestones remain separate from payment',()=>{
 const o=fixture(false),html=V.render(V.project(o));
 assert.match(html,/name="confirm" required/);assert.match(html,/Accept quote · \$110\.00/);assert.doesNotMatch(html,/checked/);
 o.snapshot=o.quoteOffer.totals;o.approvedAt=new Date().toISOString();o.payments=[{amount:110,method:'Cash'}];
 assert.equal(V.project(o).phase,'approved');assert.match(V.render(V.project(o),'track'),/awaiting production release/);
 assert.doesNotMatch(V.render(V.project(o)),/id="customer-accept"/);
});

test('owner review shell keeps ERP navigation hidden by default and uses shared test storage',()=>{
 const html=fs.readFileSync('ops-customer-preview.html','utf8'),js=fs.readFileSync('js/ops-preview/customer-preview.js','utf8');
 assert.match(html,/OWNER REVIEW/);assert.match(html,/id="owner-return" hidden/);assert.doesNotMatch(html,/sidebar/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|window\.open|location\.assign|buy\.stripe|paypal\.com|venmo\.com/);
 assert.match(js,/cloud\.load\(\)/);assert.match(js,/cloud\.save\(/);assert.match(js,/state\.revision/);
 assert.match(js,/Owner preview sign-in required/);
});

test('Back to ERP stays available across owner previews and recovers from a failed load',async()=>{
 const vm=require('node:vm');
 const script=fs.readFileSync('js/ops-preview/customer-preview.js','utf8');
 const order=fixture();
 const allWork='ops-preview.html?database=test';
 async function launch(signedIn,search,load){
  const link={getAttribute:()=>allWork};
  const ownerReturn={hidden:true,querySelector:()=>link};
  const nodes={'owner-return':ownerReturn,'customer-app':{},'customer-message':{}};
  vm.runInNewContext(script,{
   URLSearchParams,location:{search},
   document:{getElementById:id=>nodes[id],addEventListener(){}},
   window:{OliPolyCustomerView:V,OliPolyOpsPreview:M,OliPolyLineItems:{escape:String},OliPolyOpsCloud:{create:()=>({signedIn:()=>signedIn,load,pending:()=>false})}},
  });
  await new Promise(resolve=>setImmediate(resolve));
  return {hidden:ownerReturn.hidden,href:link.href};
 }
 const load=async()=>({orders:[order]});
 assert.deepEqual(await launch(false,'',load),{hidden:true,href:allWork});
 assert.deepEqual(await launch(true,'',async()=>{throw new Error('Session expired');}),{hidden:false,href:allWork});
 assert.deepEqual(await launch(true,'?order=missing',load),{hidden:false,href:allWork});
 for(const view of ['quote','track','pay']){
  const selected=await launch(true,`?order=${encodeURIComponent(order.id)}&view=${view}`,load);
  assert.equal(selected.hidden,false);
  const target=new URL(selected.href,'https://test.example');
  assert.equal(target.pathname,'/ops-order-preview.html');
  assert.equal(target.searchParams.get('database'),'test');
  assert.equal(target.searchParams.get('order'),order.id);
  assert.equal(target.searchParams.get('section'),'production');
 }
});

test('post-QC milestone follows the confirmed handoff and the accepted quote keeps its timing and total', () => {
  const order = fixture();
  order.released = true;
  order.runs = order.items.map(item => ({itemId: item.id, status: 'inspected', accepted: item.quantity}));
  const view = () => V.project(order);
  assert.match(V.render(view(), 'track'), /Ready · fulfillment to be arranged/);
  assert.doesNotMatch(V.render(view(), 'track'), /Agreed timing/);
  assert.match(V.render(view(), 'quote'), /Two weeks after approval/);

  for (const [method, ready, complete] of [
    ['shipping', 'Ready to ship', 'Shipped'],
    ['pickup', 'Ready for pickup', 'Picked up'],
    ['delivery', 'Ready for local delivery', 'Delivered'],
  ]) {
    order.fulfillmentPlan = {method, totals: {...order.snapshot, total: 120, tax: 8, customerShipping: 9.2}};
    order.fulfilled = false;
    assert.match(V.render(view(), 'track'), new RegExp(`aria-current="step"><strong>${ready}</strong>`));
    assert.match(V.render(view(), 'pay'), /\$120\.00/);
    assert.match(V.render(view(), 'quote'), /\$110\.00/);
    order.fulfilled = true;
    assert.match(V.render(view(), 'track'), new RegExp(`aria-current="step"><strong>${complete}</strong>`));
  }
});

test('order summary adds post-quote charges to the original tax-inclusive quote', () => {
  const order = fixture();
  order.snapshot = {...order.snapshot, total: 15, beforeTax: 14.02, tax: .98, customerShipping: 0};
  order.fulfillmentPlan = {method: 'shipping', totals: {
    ...order.snapshot, total: 22.76, beforeTax: 21.27, tax: 1.49, customerShipping: 7.25, taxIncluded: false,
  }};
  delete order.fulfillmentPlan.totals.grossShipping;
  const summary = view => V.render(V.project(order), view).split('<aside')[1];
  for (const view of ['track','pay']) {
    const html = summary(view);
    assert.match(html, /Quoted total<\/span><strong>\$15\.00/);
    assert.match(html, /Additional sales tax<\/span><strong>\$0\.51/);
    assert.match(html, /Shipping charged<\/span><strong>\$7\.25/);
    assert.match(html, /Agreed total<\/small><strong>\$22\.76/);
    assert.match(html, /Total sales tax included: \$1\.49/);
    assert.doesNotMatch(html, /Before tax|Discount or Adjustment|Rounding adjustment/);
  }
  assert.match(summary('quote'), /Quoted total<\/small><strong>\$15\.00/);
  order.fulfillmentPlan.totals.total = 21.76;
  assert.match(summary('track'), /Discount or Adjustment<\/span><strong>-\$1\.00/);
});

test('shipment method is under Shipped and missing tracking is omitted', () => {
  const order = fixture();
  order.released = true;
  order.runs = order.items.map(item => ({itemId: item.id, status: 'inspected', accepted: item.quantity}));
  order.shipment = {carrier: 'USPS', service: 'Ground Advantage', tracking: 'TEST-321'};
  const progress = () => V.render(V.project(order), 'track');
  assert.doesNotMatch(progress(), /Ground Advantage|TEST-321/);
  order.fulfilled = true;
  order.shipment.handoffAt = new Date().toISOString();
  assert.match(progress(), /aria-current="step"><strong>Shipped<\/strong>.*Shipping method · USPS · Ground Advantage.*Tracking number · TEST-321/);
  delete order.shipment.tracking;
  assert.match(progress(), /Ground Advantage/);
  assert.doesNotMatch(progress(), /Tracking number|undefined/);
});
