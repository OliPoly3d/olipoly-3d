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

test('owner review shell contains no internal navigation or authoritative browser-only storage',()=>{
 const html=fs.readFileSync('ops-customer-preview.html','utf8'),js=fs.readFileSync('js/ops-preview/customer-preview.js','utf8');
 assert.match(html,/OWNER REVIEW/);assert.doesNotMatch(html,/href="ops-(order|preview)|Back to workspace|sidebar/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|window\.open|location\.assign|buy\.stripe|paypal\.com|venmo\.com/);
 assert.match(js,/cloud\.load\(\)/);assert.match(js,/cloud\.save\(/);assert.match(js,/state\.revision/);
 assert.match(js,/Owner preview sign-in required/);
});
