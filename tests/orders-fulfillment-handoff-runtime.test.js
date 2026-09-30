const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('orders-admin.html','utf8');
function section(start,end) {
  const a=html.indexOf(start); const b=html.indexOf(end,a);
  assert.ok(a>=0 && b>a, start); return html.slice(a,b);
}
async function harness() {
  const {JSDOM}=require(process.env.JSDOM_MODULE);
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/orders-admin.html?order=OP-000198&action=close#fulfillmentClosePanel'});
  const w=dom.window;
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const $=id=>w.document.getElementById(id);
  const calls=[];
  const row={id:'synthetic-order',order_number:'OP-000198',status:'ready_for_fulfillment',order_total:48.21,balance_amount:0,payment_status:'paid',fulfillment:'shipping',updated_at:'2026-09-30T01:41:23.136020Z'};
  Object.assign(w,{$,orders:[row],activeId:null,currentUser:{id:'test-owner'},num:Number,
    normalizeOrderStatusForDb:v=>v,orderIsClosed:o=>o?.status==='closed',orderClosureFlags:()=>({}),
    renderList:()=>{},clearMsg:el=>{el.textContent='';el.style.display='none';},
    setMsg:(el,text)=>{el.textContent=text;el.style.display='block';},
    confirm:()=>true,api:async(path,opts)=>{calls.push({path,opts});return {data:{...row,status:'closed'}};}});
  w.eval(fs.readFileSync('js/workflow-status.js','utf8'));
  w.eval(fs.readFileSync('js/orders-lifecycle-visual.js','utf8'));
  w.statusLabel=w.OliPolyWorkflow.orderStatusLabel;
  w.eval(section('function updateFulfillmentCloseState(order)','function applyOrderEditState(order)'));
  w.eval(section('function ordersAdminV2StatusText(value)','function ordersAdminV2CopyTrackerLink()'));
  w.loadIntoForm=o=>{w.activeId=o.id;$('orderNumber').value=o.order_number;$('status').value=o.status;$('paymentStatus').value=o.payment_status;w.updateFulfillmentCloseState(o);w.ordersAdminV2RefreshWorkspace();};
  w.eval(section('const closeOrderRequestsInFlight = new Set();','function sourceQuoteFromOrderNumber'));
  w.eval(section('function bind(id, handler, label)','function run(){'));
  w.eval("bind('closeOrderBtn', requireOrder('Close Order', closeCurrentOrder), 'Close Order');");
  w.eval(section('function deepLinkOrderParam()','function applyDeepLinkedOrderSearch()'));
  let scrolled=''; w.HTMLElement.prototype.scrollIntoView=function(){scrolled=this.id;};
  w.setTimeout=fn=>{fn();return 1;};
  return {w,$,calls,row,dom,get scrolled(){return scrolled;}};
}
test('close handoff renders a visible action and only closes after confirmation',{skip:!process.env.JSDOM_MODULE},async t=>{
  const h=await harness();t.after(()=>h.dom.window.close());const {w,$,calls}=h;
  assert.equal(w.document.querySelectorAll('#closeOrderBtn').length,1);
  assert.ok($('fulfillmentClosePanel').contains($('closeOrderBtn')));
  assert.ok($('closeOrderBtn').compareDocumentPosition($('orderNumber')) & w.Node.DOCUMENT_POSITION_FOLLOWING,'close action precedes the long form');
  assert.equal($('closeOrderBtn').disabled,true,'no order selected');
  w.tryOpenDeepLinkedOrder();
  assert.equal(h.scrolled,'fulfillmentClosePanel');
  assert.equal(w.document.activeElement.id,'fulfillmentClosePanel');
  assert.equal(calls.length,0,'navigation never closes automatically');
  assert.equal($('closeOrderBtn').disabled,false);
  assert.match($('fulfillmentCloseHelp').textContent,/OP-000198.*select Close Order/);
  w.confirm=()=>false;await w.closeCurrentOrder();assert.equal(calls.length,0);
  w.confirm=()=>true;$('closeOrderBtn').click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/rest/v1/rpc/fulfillment_workflow_command');
  const body=JSON.parse(calls[0].opts.body);
  assert.equal(body.p_command,'close_order');assert.equal(body.p_order_number,'OP-000198');
  assert.equal(body.p_expected_updated_at,h.row.updated_at);
  assert.equal($('closeOrderBtn').disabled,true);
  assert.match($('fulfillmentCloseMessage').textContent,/Order closed/);
  assert.match($('fulfillmentCloseHelp').textContent,/OP-000198 is closed/);
  assert.equal(w.document.querySelector('.timeline-step.is-active').dataset.step,'closed');
  assert.match($('workspaceStatusPill').textContent,/closed/i);
  assert.equal(w.orders[0].order_total,48.21);assert.equal(w.orders[0].payment_status,'paid');
});
test('failed close is visible beside the button and does not show Closed',{skip:!process.env.JSDOM_MODULE},async t=>{
  const h=await harness();t.after(()=>h.dom.window.close());const {w,$}=h;
  w.tryOpenDeepLinkedOrder();w.api=async()=>({error:{code:'40001',message:'stale'}});
  await w.closeCurrentOrder();
  assert.match($('fulfillmentCloseMessage').textContent,/changed.*Refresh/);
  assert.equal($('fulfillmentCloseMessage').style.display,'block');
  assert.equal($('closeOrderBtn').disabled,false);
  assert.equal(w.orders[0].status,'ready_for_fulfillment');
  w.orders=[{...h.row,status:'qc'}];w.loadIntoForm(w.orders[0]);
  assert.equal($('closeOrderBtn').disabled,true);
  await w.closeCurrentOrder();assert.match($('fulfillmentCloseMessage').textContent,/must be Ready/);
});
test('duplicate close clicks cannot send duplicate requests',{skip:!process.env.JSDOM_MODULE},async t=>{
  const h=await harness();t.after(()=>h.dom.window.close());const {w,$}=h;
  w.tryOpenDeepLinkedOrder();let resolve;let count=0;
  w.api=()=>{count++;return new Promise(r=>{resolve=r;});};
  const pending=w.closeCurrentOrder();assert.equal($('closeOrderBtn').disabled,true);
  await w.closeCurrentOrder();assert.equal(count,1);
  resolve({data:{...h.row,status:'closed'}});await pending;
  assert.equal(w.orders[0].status,'closed');
});
test('Production links to the fulfillment action, and form hydration refreshes the timeline',()=>{
  const production=fs.readFileSync('production-control.html','utf8');
  assert.match(production,/&action=close#fulfillmentClosePanel">Review \/ Close in Orders/);
  assert.match(section('function loadIntoForm(o)','let orderPricingEditor;'),/ordersAdminV2RefreshWorkspace\(\)/);
});
test('returning to a cached Production page reloads authoritative statuses',async()=>{
  const production=fs.readFileSync('production-control.html','utf8');
  const start=production.indexOf("window.addEventListener('pageshow'");
  const end=production.indexOf('async function fetchAuthoritativeProductionJob',start);
  let handler,reads=0,renders=0;
  const context={window:{addEventListener:(_,fn)=>{handler=fn;}},state:{user:{id:'owner'},authorityMode:'authoritative'},
    refreshAuthoritativeProductionState:async()=>{reads++;},render:()=>{renders++;},console,toast:()=>{}};
  vm.runInNewContext(production.slice(start,end),context);
  await handler({persisted:false});assert.equal(reads,0);
  await handler({persisted:true});assert.equal(reads,1);assert.equal(renders,1);
  context.state.authorityMode='recovery';await handler({persisted:true});assert.equal(reads,1);
});
