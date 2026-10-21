// Synthetic interaction checks; use MONEY_JSDOM_MODULE for jsdom@26.1.0/lib/api.js.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {setupDashboard} from '../js/money-dashboard.mjs';
const dependency=process.env.MONEY_JSDOM_MODULE;
function fixture(){return {version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Cash',entity:'household',type:'cash',opening:100000,reserve:0}],transactions:[],schedules:[{id:'pay',name:'Paycheck',account:'cash',amount:20000,frequency:'biweekly',anchor:'2026-10-02'},{id:'bill',name:'Electric',account:'cash',amount:-10000,frequency:'monthly',anchor:'2026-10-01',day:28,category:'Electric'}],budgets:[{id:'food',name:'Groceries',shortName:'Grocery',entity:'household',account:'cash',monthly:{'2026-10':20000,'2026-11':30000}},{id:'seasonal',name:'Seasonal',entity:'household',account:'cash',seasonal:true,monthly:{'2026-10':5000}}],seasonalItems:[{id:'gift',name:'Gifts',month:10,amount:5000,entity:'household'}]};}
async function environment(){const {JSDOM}=await import(pathToFileURL(dependency).href);const dom=new JSDOM(fs.readFileSync(new URL('../money.html',import.meta.url),'utf8'),{url:'https://example.test/money.html'});const keys=['window','document','Node','FormData','fetch'];const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));for(const k of ['window','document','Node','FormData'])globalThis[k]=dom.window[k];return {dom,restore(){dom.window.close();for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
test('single dashboard previews income/bill cents, monthly targets and seasonal recurrence before saving', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),recorded,saves=0;
 try{
  const d=setupDashboard({getModel:()=>model,today:()=> '2026-10-21',message:()=>{},setStatus:async()=>{},record:t=>recorded=t,action:fn=>fn(),savePlan:async next=>{saves++;model=next;d.render();}});d.render();
  assert.equal(document.querySelectorAll('[role=tab]').length,0);
  assert.equal(document.getElementById('incomeRows').children.length,3);
  assert.match(document.getElementById('accountSummary').textContent,/\$1,250.00/);
  const yoy=document.querySelector('#categoryRows [data-budget-id="seasonal"]');
  assert.match(yoy.textContent,/YOY extras total/);assert.equal(yoy.querySelector('input'),null);
  assert.equal(yoy.querySelector('a').getAttribute('href'),'#seasonalSection');
  assert.equal(yoy.querySelector('[data-value="allowance"]').textContent,'$50.00');
  const pay=document.querySelector('#incomeRows input[type=number]');pay.value='200.02';pay.dispatchEvent(new env.dom.window.Event('change'));
  assert.equal(model.schedules[0].overrides,undefined);assert.equal(d.hasChanges(),true);
  assert.match(document.getElementById('accountSummary').textContent,/\$1,250.02/);
  const bill=document.querySelector('#billRows input[type=number]');bill.value='101.25';bill.dispatchEvent(new env.dom.window.Event('change'));
  assert.match(document.getElementById('accountSummary').textContent,/\$1,248.77/);
  const budget=document.querySelector('#categoryRows input');budget.value='250.00';budget.dispatchEvent(new env.dom.window.Event('change'));
  assert.match(document.getElementById('accountSummary').textContent,/\$1,198.77/);
  const seasonal=document.querySelector('#seasonalRows input');seasonal.value='75.00';seasonal.dispatchEvent(new env.dom.window.Event('change'));
  assert.match(document.getElementById('accountSummary').textContent,/\$1,173.77/);
  assert.match(document.getElementById('seasonalTotals').textContent,/\$75.00/);
  assert.equal(yoy.querySelector('[data-value="allowance"]').textContent,'$75.00');
  assert.equal(yoy.querySelector('[data-value="remaining"]').textContent,'$75.00');
  document.getElementById('repeatSeasonal').click();assert.equal(d.draft().seasonalItems[0].changes[0].amount,7500);
  document.querySelector('#billRows button').click();assert.equal(recorded.entries[0].amount,-10125);
  document.getElementById('savePlan').click();await tick();assert.equal(saves,1);assert.equal(d.hasChanges(),false);
  d.clear();for(const id of ['accountSummary','incomeRows','billRows','categoryRows','seasonalRows','balanceChart'])assert.equal(document.getElementById(id).children.length,0);
 }finally{env.restore();}
});
test('YOY summary aggregates multiple items, preserves actuals and explains opening-month proration', {skip:!dependency},async()=>{
 const env=await environment(),model=fixture();model.start='2026-10-16';
 model.seasonalItems.push({id:'trip',name:'Trip',month:10,amount:2000,entity:'household'});
 model.transactions.push({id:'gift-actual',description:'Gift',date:'2026-10-20',kind:'expense',category:'Seasonal',status:'pending',entries:[{account:'cash',amount:-1000}]});
 try{
  const d=setupDashboard({getModel:()=>model,today:()=> '2026-10-21',message:()=>{},setStatus:async()=>{},record:()=>{},action:fn=>fn(),savePlan:async()=>{}});d.render();
  const row=document.querySelector('#categoryRows [data-budget-id="seasonal"]');
  assert.equal(row.querySelector('[data-value="allowance"]').textContent,'$36.13');
  assert.match(row.querySelector('[data-value="source"]').textContent,/Full month \$70.00/);
  assert.equal(row.querySelector('[data-value="spent"]').textContent,'$10.00');
  assert.equal(row.querySelector('[data-value="remaining"]').textContent,'$26.13');
  const input=document.querySelector('#seasonalRows input');input.value='80.00';input.dispatchEvent(new env.dom.window.Event('change'));
  assert.equal(row.querySelector('[data-value="allowance"]').textContent,'$51.61');
  assert.match(row.querySelector('[data-value="source"]').textContent,/Full month \$100.00/);
  assert.equal(row.querySelector('[data-value="spent"]').textContent,'$10.00');
  assert.equal(row.querySelector('[data-value="remaining"]').textContent,'$41.61');
 }finally{env.restore();}
});
test('full page records and edits an actual amount once, replaces its forecast, and clears on sign-out', {skip:!dependency},async()=>{
 const env=await environment();let session={user:{id:'test-owner'}},revision=0,model=fixture();
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>session,authHeaders:()=>({}),logout:()=>session=null};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 try{
  await import('../js/money-app.mjs?sheet-dom-test');assert.equal(document.getElementById('app').hidden,false);
  document.getElementById('budgetMonth').value='2026-10';document.getElementById('budgetMonth').dispatchEvent(new env.dom.window.Event('change'));
  document.querySelector('#billRows button').click();const f=document.getElementById('transactionForm');assert.equal(document.getElementById('transactionEntry').open,true);
  f.elements.amount.value='100.99';document.getElementById('clearMatch').click();assert.equal(model.transactions.length,0);assert.equal(document.getElementById('transactionEntry').open,false);assert.equal(f.elements.scheduleKey.value,'');assert.equal(revision,0);document.querySelector('#billRows button').click();
  f.elements.amount.value='100.37';f.elements.date.value='2026-10-27';f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();
  assert.equal(model.transactions.length,1);assert.equal(model.transactions[0].entries[0].amount,-10037);assert.equal(model.transactions[0].scheduleKey,'bill:2026-10-28');
  assert.match(document.getElementById('accountSummary').textContent,/\$1,249.63/);
  document.querySelector('#billRows button').click();f.elements.amount.value='100.38';f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();
  assert.equal(model.transactions.length,1);assert.equal(model.transactions[0].entries[0].amount,-10038);assert.equal(revision,2);
  assert.match(document.getElementById('message').textContent,/Saved/);
  document.querySelectorAll('#billRows button')[1].click();assert.equal(document.getElementById('removeDialog').open,true);document.getElementById('removeCancel').click();assert.equal(model.transactions.length,1);assert.equal(revision,2);
  document.querySelectorAll('#billRows button')[1].click();document.getElementById('removeBudget').click();await tick();assert.equal(model.transactions.length,0);assert.equal(model.schedules.find(s=>s.id==='bill').overrides['2026-10-28'].amount,-10038);
  document.querySelectorAll('#billRows button')[1].click();document.getElementById('removeDelete').click();await tick();assert.ok(model.schedules.find(s=>s.id==='bill').skipped.includes('2026-10-28'));assert.match(document.getElementById('billRows').textContent,/Skipped this time/);
  document.querySelector('#billRows button').click();await tick();assert.equal(model.schedules.find(s=>s.id==='bill').skipped.length,0);
  document.getElementById('logout').click();assert.equal(document.getElementById('app').hidden,true);assert.equal(document.getElementById('accountSummary').children.length,0);assert.equal(document.getElementById('seasonalRows').children.length,0);
 }finally{env.restore();}
});
