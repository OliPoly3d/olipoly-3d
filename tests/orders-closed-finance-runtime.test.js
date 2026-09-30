const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('orders-admin.html','utf8');
function section(start,end) {
  const a=html.indexOf(start), b=html.indexOf(end,a);
  assert.ok(a>=0 && b>a,start); return html.slice(a,b);
}
async function harness(t) {
  const {JSDOM}=require(process.env.JSDOM_MODULE);
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/orders-admin.html'});
  t.after(()=>dom.window.close()); const w=dom.window;
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const $=id=>w.document.getElementById(id), calls=[];
  const row={id:'closed-order',order_number:'OP-000198',status:'closed',payment_status:'paid',order_total:48.21,
    balance_amount:0,sales_tax_amount:3.05,destination_county:'Trumbull',finance_pushed:false,updated_at:'2026-09-30T02:01:26.251021Z'};
  Object.assign(w,{$,orders:[row],activeId:row.id,currentUser:{id:'owner'},orderViewMode:'active',num:v=>Number(v)||0,
    money:v=>`$${v}`,formatDateTime:v=>v,orderClosureFlags:o=>o.flags||{},renderList:()=>{},
    clearMsg:el=>{el.textContent='';},setMsg:(el,text)=>{el.textContent=text;},confirm:()=>true,
    snapshotForm:()=>({order_number:row.order_number}),console:{error:()=>{}},
    fetchOrders:async()=>{},loadIntoForm:()=>{},
    api:async(path,opts)=>{calls.push({path,opts});w.orders=w.orders.map(o=>({...o,finance_pushed:true}));return {ok:true,data:{entry_id:'income',order_number:row.order_number}};}});
  w.eval(fs.readFileSync('js/workflow-status.js','utf8'));
  w.normalizeOrderStatusForDb=w.OliPolyWorkflow.normalizeOrderStatus;
  w.eval(section('function orderLifecycleClass(order)','function closureStatusLabel(order)'));
  w.eval(section('function isFinanceReadyOrder(o)','function buildCatalogPartPayload(payload)'));
  w.eval(section('function updateFinanceStatusNote(order','function updateAuthVisibility()'));
  w.eval(section('function filteredOrders()','function renderSummary()'));
  w.eval(section('function bind(id, handler, label)','function run(){'));
  w.eval("bind('pushFinanceBtn', requireOrder('Push to Finance', pushCurrentOrderToFinance), 'Push to Finance');");
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  return {w,$,row,calls};
}
const options={skip:!process.env.JSDOM_MODULE};
test('paid closed order posts through the existing button and stays closed',options,async t=>{
  const {w,$,row,calls}=await harness(t);
  assert.equal(w.financeIneligibilityReason(row),'');
  w.updateFinanceStatusNote(row);assert.match($('financeStatusNote').textContent,/ready to push/);
  $('pushFinanceBtn').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/rest/v1/rpc/post_order_finance_income');
  const body=JSON.parse(calls[0].opts.body);
  assert.equal(body.p_order_number,'OP-000198');assert.equal(body.p_order_id,row.id);
  assert.equal(body.p_expected_updated_at,row.updated_at);
  assert.equal(w.orders[0].status,'closed');assert.equal(w.orders[0].order_total,48.21);
  assert.equal($('pushFinanceBtn').textContent,'Pushed to Finance ✅');
  assert.match($('formMessage').textContent,/Finance entry created\./);
  await w.pushCurrentOrderToFinance();assert.equal(calls.length,1);
});
test('single, bulk, and ready-list eligibility agree, including legacy cancellation aliases',options,async t=>{
  const {w,row}=await harness(t);
  for(const status of ['ready_for_fulfillment','closed','fulfilled','completed']) {
    assert.equal(w.isFinanceReadyOrder({...row,status}),true,status);
  }
  for(const patch of [{status:'qc'},{status:'printing'},{status:'ready_to_print'},
    ...['canceled','cancelled','void','archived'].map(persisted_status=>({persisted_status,status:'closed'})),
    {payment_status:'unpaid'},{payment_status:'refunded'},{finance_pushed:true},{order_total:0},
    {flags:{finance_not_required:true}},{destination_county:null}]) {
    const order={...row,...patch};
    assert.equal(w.isFinanceReadyOrder(order),false,JSON.stringify(patch));
    assert.notEqual(w.financeIneligibilityReason(order),'');
    await assert.rejects(w.pushOrderObjectToFinance(order),/not ready/);
  }
});
test('Show Ready clears conflicting filters and includes paid closed orders in All Orders',options,async t=>{
  const {w,$,row}=await harness(t);
  w.orders=[row,{...row,id:'ready',order_number:'OP-READY',status:'ready_for_fulfillment'},
    {...row,id:'qc',status:'qc'},{...row,id:'posted',finance_pushed:true}];
  $('searchInput').value='old search';$('paymentFilter').value='unpaid';$('statusFilter').value='qc';
  w.showReadyFinanceOrders();
  assert.equal(w.orderViewMode,'all');assert.ok($('ordersAllTab').classList.contains('active'));
  assert.equal($('financeFilter').value,'ready');
  assert.deepEqual(Array.from(w.filteredOrders(),o=>o.id).sort(),['closed-order','ready']);
  assert.deepEqual(Array.from(w.readyFinanceOrders(),o=>o.id).sort(),['closed-order','ready']);
  w.setOrderViewMode('closed');assert.deepEqual(Array.from(w.filteredOrders(),o=>o.id),['closed-order']);
});
test('bulk posting includes closed orders and reports Finance independently of fulfillment',options,async t=>{
  const {w,$,row,calls}=await harness(t);
  w.orders=[row,{...row,id:'ready',order_number:'OP-READY',status:'ready_for_fulfillment'}];
  await w.pushAllReadyFinanceOrders();assert.equal(calls.length,2);
  assert.equal($('formMessage').textContent,'Posted 2 Orders to Finance.');
});
test('confirmation, concurrent clicks, and failed posting allow a safe retry',options,async t=>{
  const {w,$,calls}=await harness(t);
  w.confirm=()=>false;await w.pushCurrentOrderToFinance();assert.equal(calls.length,0);
  w.confirm=()=>true;let resolve,count=0;
  w.api=()=>{count++;return new Promise(r=>{resolve=r;});};
  const pending=w.pushCurrentOrderToFinance();assert.equal($('pushFinanceBtn').disabled,true);
  await w.pushCurrentOrderToFinance();assert.equal(count,1);
  resolve({ok:false,error:{code:'40001',message:'Order changed; refresh before posting Finance'}});await pending;
  assert.equal($('pushFinanceBtn').disabled,false);
  assert.match($('formMessage').textContent,/refresh before posting/);
  assert.equal(w.orders[0].finance_pushed,false);assert.equal(w.orders[0].status,'closed');
  w.api=async()=>{count++;return {ok:true,data:{idempotent:true,entry_id:'existing'}};};
  await w.pushCurrentOrderToFinance();assert.equal(count,2);
  assert.equal($('formMessage').textContent,'Finance entry already exists.');
});
test('fetch preserves raw cancellation status before lifecycle normalization',options,async t=>{
  const {w,row}=await harness(t);
  Object.assign(w,{getCurrentUser:async()=>{},tryOpenDeepLinkedOrder:()=>{},applyDeepLinkedOrderSearch:()=>{},
    api:async()=>({data:[{...row,status:'cancelled'}]})});
  w.eval(section('async function fetchOrders()','// ERP Bridge Pass 4:'));
  await w.fetchOrders();assert.equal(w.orders[0].status,'closed');
  assert.equal(w.orders[0].persisted_status,'cancelled');assert.equal(w.isFinanceReadyOrder(w.orders[0]),false);
});
