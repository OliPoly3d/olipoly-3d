// Synthetic interaction checks; use MONEY_JSDOM_MODULE for jsdom@26.1.0/lib/api.js.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {setupDashboard} from '../js/money-dashboard.mjs';
import {ensureMonthlyBaselines} from '../js/money-confidence.mjs';
import {installPaymentPlan} from '../js/money-credit.mjs';
const dependency=process.env.MONEY_JSDOM_MODULE;
function fixture(){return ensureMonthlyBaselines({version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Cash',entity:'household',type:'cash',opening:100000,reserve:0}],transactions:[],schedules:[{id:'pay',name:'Paycheck',account:'cash',amount:20000,frequency:'biweekly',anchor:'2026-10-02'},{id:'bill',name:'Electric',account:'cash',amount:-10000,frequency:'monthly',anchor:'2026-10-01',day:28,category:'Electric'}],budgets:[{id:'food',name:'Groceries',shortName:'Grocery',entity:'household',account:'cash',monthly:{'2026-10':20000,'2026-11':30000}},{id:'seasonal',name:'Seasonal',entity:'household',account:'cash',seasonal:true,monthly:{'2026-10':5000}}],seasonalItems:[{id:'gift',name:'Gifts',month:10,amount:5000,entity:'household'}]},'2026-10-01');}
async function environment(){const {JSDOM}=await import(pathToFileURL(dependency).href);const dom=new JSDOM(fs.readFileSync(new URL('../money.html',import.meta.url),'utf8'),{url:'https://example.test/money.html'});const keys=['window','document','Node','FormData','fetch','Date'];const old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));globalThis.Date=class extends old.Date{constructor(...args){super(...(args.length?args:['2026-10-22T16:00:00Z']));}static now(){return +new old.Date('2026-10-22T16:00:00Z');}};for(const k of ['window','document','Node','FormData'])globalThis[k]=dom.window[k];return {dom,restore(){dom.window.close();for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
test('savings buckets record a matched contribution once and classify a savings withdrawal', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0;model.schedules=[];model.budgets=[];model.seasonalItems=[];model.accounts.push({id:'savings',name:'Savings',entity:'household',type:'cash',opening:20000,reserve:0});model.schedules=[{id:'seed',name:'Fun seed',account:'cash',to:'savings',amount:-25000,frequency:'monthly',anchor:'2026-10-22',end:'2026-10-22',day:22,oneTime:true}];model.savingsBuckets=[{id:'general',name:'General',account:'savings',start:model.start,opening:20000,scheduleIds:[]},{id:'fun',name:'Fun',account:'savings',start:model.start,opening:0,scheduleIds:['seed']}];
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>({user:{id:'test-owner'}}),authHeaders:()=>({}),logout:()=>{}};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 try{await import('../js/money-app.mjs?savings-management-test');const bucket=()=>document.querySelector('#savingsRows [data-bucket-id="fun"]');assert.equal(bucket().cells[2].textContent,'$0.00');assert.equal(bucket().cells[3].textContent,'$250.00');document.querySelector('#billRows button').click();const f=document.getElementById('transactionForm');assert.equal(f.elements.savingsBucket.value,'fun');f.querySelector('#recordTransaction').click();await tick();assert.equal(revision,1);assert.equal(model.transactions.length,1);assert.equal(bucket().cells[2].textContent,'$250.00');assert.equal(bucket().cells[3].textContent,'$250.00');assert.match(document.getElementById('savingsAccounts').textContent,/Unassigned \$0.00/);
 f.elements.date.value='2026-10-22';f.elements.description.value='Fun dinner';f.elements.kind.value='expense';f.elements.account.value='savings';f.dispatchEvent(new env.dom.window.Event('change'));f.elements.savingsBucket.value='fun';f.elements.category.value='Other';f.elements.amount.value='40.00';f.querySelector('#recordTransaction').click();await tick();assert.equal(revision,2);assert.equal(bucket().cells[2].textContent,'$210.00');assert.equal(model.transactions.at(-1).savingsBucket,'fun');assert.match(document.getElementById('savingsAccounts').textContent,/Unassigned \$0.00/);
 const withdrawal=document.getElementById('savingsWithdrawalForm');withdrawal.elements.bucket.value='fun';withdrawal.elements.name.value='Planned fun outing';withdrawal.elements.when.value='2026-10-30';withdrawal.elements.amount.value='100.00';withdrawal.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(revision,2);assert.equal(bucket().cells[2].textContent,'$210.00');assert.equal(bucket().cells[3].textContent,'$110.00');document.getElementById('savePlan').click();await tick();assert.equal(revision,3);const expected=[...document.querySelectorAll('#billRows tr')].find(r=>r.textContent.includes('Planned fun outing'));expected.querySelector('button').click();assert.equal(f.elements.savingsBucket.value,'fun');assert.equal(f.elements.category.value,'Savings · Fun');f.elements.date.value='2026-10-22';f.elements.amount.value='99.95';f.querySelector('#recordTransaction').click();await tick();assert.equal(revision,4);assert.equal(model.transactions.length,3);assert.equal(bucket().cells[2].textContent,'$110.05');assert.equal(bucket().cells[3].textContent,'$110.05');
 document.getElementById('logout').click();assert.equal(document.getElementById('savingsRows').children.length,0);
 }finally{env.restore();}
});
test('recovery previews owner history, requires confirmation, restores as a new revision and rejects stale writes', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0,patches=0;const old=structuredClone(model);model.transactions.push({id:'mistake',description:'Mistake',date:'2026-10-20',kind:'expense',category:'Groceries',status:'cleared',entries:[{account:'cash',amount:-5000}]});
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>({user:{id:'test-owner'}}),authHeaders:()=>({}),logout:()=>{}};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){const next=JSON.parse(options.body);if(!url.includes('revision=eq.'+revision))body=[];else{model=next.body;revision=next.revision;patches++;body=[{body:model,revision}];}}else if(url.includes('money_history')){assert.match(url,/user_id=eq.test-owner/);body=url.includes('select=revision,body')?[{revision:0,body:old}]:[{revision:0,archived_at:'2026-10-22T00:00:00Z'}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 try{await import('../js/money-app.mjs?recovery-management-test');document.getElementById('listRecoveryHistory').click();await tick();document.querySelector('#recoveryHistory button').click();await tick();assert.equal(patches,0);assert.match(document.getElementById('recoveryPreview').textContent,/Remove Transaction · Mistake/);const form=document.getElementById('restorePlanForm');form.elements.reason.value='Undo mistake';form.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(patches,0);assert.match(document.getElementById('recoveryMessage').textContent,/Confirm replacing/);form.elements.confirm.checked=true;form.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(patches,1);assert.equal(model.transactions.length,0);assert.equal(model.recoveryHistory.length,1);assert.match(document.getElementById('recoveryMessage').textContent,/Restored and saved/);
 document.getElementById('listRecoveryHistory').click();await tick();document.querySelector('#recoveryHistory button').click();await tick();revision++;const current=JSON.stringify(model);form.elements.reason.value='Stale recovery';form.elements.confirm.checked=true;form.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(patches,1);assert.equal(JSON.stringify(model),current);assert.match(document.getElementById('recoveryMessage').textContent,/Refresh before saving/);document.getElementById('restoreCancel').click();assert.equal(form.hidden,true);document.getElementById('logout').click();assert.equal(document.getElementById('recoveryHistory').children.length,0);
 }finally{env.restore();}
});
test('dashboard selects December 2029 and renders the full month without a horizon error', {skip:!dependency},async()=>{
 const env=await environment(),model=fixture();
 for(let year=2026;year<=2029;year++)for(let mo=1;mo<=12;mo++){const month=`${year}-${String(mo).padStart(2,'0')}`;if(month>='2026-10')model.budgets[0].monthly[month]=20000;}
 model.schedules.push({id:'future-income',name:'Future December income',account:'cash',amount:10000,anchor:'2029-12-15',end:'2029-12-15',day:15,frequency:'monthly',oneTime:true});
 try{
  const d=setupDashboard({getModel:()=>model,today:()=> '2026-10-21',message:()=>{},setStatus:async()=>{},record:()=>{},action:fn=>fn(),savePlan:async()=>{}});d.render();
  const picker=document.getElementById('budgetMonth');assert.equal(picker.max,'2031-09');picker.value='2029-12';picker.dispatchEvent(new env.dom.window.Event('change'));
  assert.match(document.getElementById('monthHeading').textContent,/December 2029/);assert.match(document.getElementById('incomeRows').textContent,/Future December income/);assert.ok(document.querySelector('#balanceChart svg'));assert.doesNotMatch(document.getElementById('projectionNote').textContent,/Missing category|Set category/);
 }finally{env.restore();}
});
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
  document.getElementById('end').value='2026-12';document.getElementById('end').dispatchEvent(new env.dom.window.Event('change'));await tick();
  const monthRow=m=>[...document.getElementById('months').children].find(r=>r.cells[0].textContent===m);
  assert.equal(monthRow('2026-10').cells[2].textContent,'$250.00');
  assert.equal(monthRow('2026-10').cells[4].textContent,'$1,250.00');
  assert.equal(monthRow('2026-12').cells[4].textContent,'Incomplete plan');
  assert.match(document.getElementById('forecastNote').textContent,/Incomplete from 2026-12/);
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
  const beforePreview=revision;
  const budget=document.querySelector('#categoryRows input');budget.value='250.00';budget.dispatchEvent(new env.dom.window.Event('change'));
  assert.equal(monthRow('2026-10').cells[4].textContent,'$1,199.62');
  assert.equal(document.querySelector('#accountSummary tr').cells[3].textContent,monthRow('2026-10').cells[4].textContent);
  assert.equal(revision,beforePreview);
  document.getElementById('resetPlan').click();
  assert.equal(monthRow('2026-10').cells[4].textContent,'$1,249.62');
  document.getElementById('end').value='2026-12';document.getElementById('end').dispatchEvent(new env.dom.window.Event('change'));await tick();
  assert.equal(monthRow('2027-01'),undefined);
  document.getElementById('budgetMonth').value='2026-12';document.getElementById('budgetMonth').dispatchEvent(new env.dom.window.Event('change'));
  assert.match(document.getElementById('accountSummary').textContent,/Incomplete plan/);
  assert.equal(document.querySelector('#balanceChart svg'),null);
  const missing=document.querySelector('#categoryRows input');missing.value='300.00';missing.dispatchEvent(new env.dom.window.Event('change'));
  assert.equal(monthRow('2026-12').cells[5].textContent,'Included');
  assert.doesNotMatch(document.getElementById('forecastNote').textContent,/Incomplete/);
  assert.equal(document.querySelector('#accountSummary tr').cells[3].textContent,monthRow('2026-12').cells[4].textContent);
  assert.equal(revision,beforePreview);
  document.getElementById('logout').click();assert.equal(document.getElementById('app').hidden,true);assert.equal(document.getElementById('accountSummary').children.length,0);assert.equal(document.getElementById('seasonalRows').children.length,0);
  assert.equal(document.getElementById('forecastNote').textContent,'');
 }finally{env.restore();}
});
test('recurring schedule editor corrects income to a bill, keeps history, cancels safely and adds typed schedules', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0,session={user:{id:'test-owner'}},failSave=false;
 model.accounts.push({id:'card',name:'Card',entity:'household',type:'card',opening:-50000,reserve:0});
 model.schedules.push({id:'phone',name:'Phone Bill',account:'cash',amount:22500,frequency:'monthly',anchor:'2026-11-15',day:15,category:'Phone',firstPayBonus:0,estimated:true,source:'synthetic source',changes:[{date:'2027-01-01',amount:23000}],overrides:{'2026-12-15':{amount:24000,date:'2026-12-16',account:'cash'}},skipped:['2027-02-15']});
 model.transactions.push({id:'old-phone',description:'Previously recorded',kind:'income',status:'cleared',scheduleKey:'phone:2026-11-15',date:'2026-11-15',entries:[{account:'cash',amount:22500}]});
 const history=structuredClone(model.transactions),original=JSON.stringify(model);
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>session,authHeaders:()=>({}),logout:()=>session=null};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){if(failSave)return {ok:false,status:409,json:async()=>({message:'Synthetic save failure'})};const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 try{
  await import('../js/money-app.mjs?schedule-editor-dom-test');
  const selectMonth=month=>{document.getElementById('budgetMonth').value=month;document.getElementById('budgetMonth').dispatchEvent(new env.dom.window.Event('change'));};
  const editPhone=()=>document.querySelector('[data-schedule-id="phone"] button').click();
  const f=document.getElementById('scheduleForm'),changeKind=kind=>{f.elements.kind.value=kind;f.elements.kind.dispatchEvent(new env.dom.window.Event('change'));},submit=async()=>{f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();};
  selectMonth('2026-12');assert.match(document.getElementById('incomeRows').textContent,/Phone Bill/);assert.doesNotMatch(document.getElementById('billRows').textContent,/Phone Bill/);
  editPhone();assert.equal(f.elements.editScheduleId.value,'phone');assert.equal(f.elements.kind.value,'income');assert.equal(f.elements.amount.value,'225.00');assert.equal(f.elements.day.value,'15');
  changeKind('expense');document.getElementById('cancelSchedule').click();assert.equal(JSON.stringify(model),original);assert.equal(revision,0);assert.equal(f.elements.editScheduleId.value,'');
  editPhone();changeKind('expense');await submit();
  assert.equal(model.schedules.length,3);assert.equal(revision,1);const phone=model.schedules.find(s=>s.id==='phone');assert.equal(phone.amount,-22500);assert.equal(phone.changes[0].amount,-23000);assert.deepEqual(phone.overrides['2026-12-15'],{amount:-24000,date:'2026-12-16',account:'cash'});assert.deepEqual(phone.skipped,['2027-02-15']);assert.equal(phone.source,'synthetic source');assert.deepEqual(model.transactions,history);
  assert.doesNotMatch(document.getElementById('incomeRows').textContent,/Phone Bill/);assert.match(document.getElementById('billRows').textContent,/Phone Bill/);assert.equal(f.elements.editScheduleId.value,'');
  editPhone();f.elements.anchor.value='2026-12-01';await submit();assert.equal(revision,1);assert.match(document.getElementById('message').textContent,/recorded history/);assert.equal(model.schedules.find(s=>s.id==='phone').anchor,'2026-11-15');document.getElementById('cancelSchedule').click();
  editPhone();f.elements.amount.value='-225.00';await submit();assert.equal(revision,1);assert.match(document.getElementById('message').textContent,/positive amount/);document.getElementById('cancelSchedule').click();
  editPhone();f.elements.amount.value='226.02';failSave=true;await submit();assert.equal(f.elements.editScheduleId.value,'phone');assert.equal(revision,1);assert.equal(model.schedules.find(s=>s.id==='phone').amount,-22500);failSave=false;await submit();assert.equal(revision,2);assert.equal(model.schedules.find(s=>s.id==='phone').amount,-22602);assert.equal(model.schedules.find(s=>s.id==='phone').overrides['2026-12-15'].amount,-24000);
  f.elements.name.value='New bill';f.elements.account.value='cash';f.elements.amount.value='80.00';f.elements.anchor.value='2026-12-08';f.elements.anchor.dispatchEvent(new env.dom.window.Event('change'));assert.equal(f.elements.day.value,'8');await submit();assert.equal(model.schedules.find(s=>s.name==='New bill').amount,-8000);assert.match(document.getElementById('billRows').textContent,/New bill/);
  f.elements.name.value='Card payment';changeKind('transfer');assert.equal(f.elements.to.disabled,false);assert.equal(f.elements.to.required,true);f.elements.account.value='cash';f.elements.to.value='card';f.elements.amount.value='100.00';f.elements.anchor.value='2026-12-09';f.elements.day.value='9';await submit();const transfer=model.schedules.find(s=>s.name==='Card payment');assert.equal(transfer.amount,-10000);assert.equal(transfer.to,'card');assert.deepEqual(model.transactions,history);
  f.elements.name.value='Extra pay';changeKind('income');f.elements.frequency.value='biweekly';f.elements.frequency.dispatchEvent(new env.dom.window.Event('change'));assert.equal(f.elements.firstPayBonus.disabled,false);assert.equal(f.elements.day.disabled,true);f.elements.account.value='cash';f.elements.amount.value='1000.00';f.elements.firstPayBonus.value='40.00';f.elements.anchor.value='2026-12-01';await submit();const income=model.schedules.find(s=>s.name==='Extra pay');assert.equal(income.amount,100000);assert.equal(income.firstPayBonus,4000);
  editPhone();f.dispatchEvent(new env.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(f.elements.editScheduleId.value,'');
  selectMonth('2026-10');assert.doesNotMatch(document.getElementById('billRows').textContent,/Phone Bill/);
  editPhone();document.getElementById('logout').click();assert.equal(f.elements.editScheduleId.value,'');assert.equal(document.getElementById('scheduleEditNote').textContent,'');assert.equal(document.getElementById('scheduleHeading').textContent,'Add recurring schedule');
 }finally{env.restore();}
});
test('debt sandbox applies payments only, one-time and weekly budgets preview, opening reset reviews before save, and logout clears insights', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0,session={user:{id:'test-owner'}};
 model.accounts[0].opening=1000000;
 model.accounts.push({id:'card',name:'Planning card',type:'card',entity:'household',opening:-100000,reserve:0,credit:{purchaseApr:0,promoBalance:0,minimum:2500,dueDay:25}},{id:'zero',name:'Unused card',type:'card',entity:'household',opening:0,reserve:0,credit:{purchaseApr:0,promoBalance:0,minimum:0}});
 for(let i=0;i<36;i++){const d=new Date(Date.UTC(2026,9+i,1));model.budgets[0].monthly[d.toISOString().slice(0,7)]=20000;}
 model=installPaymentPlan(model,'card',{amount:10000,day:25,from:'cash',asOf:model.start});
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>session,authHeaders:()=>({}),logout:()=>session=null};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 const change=(input,value)=>{input.value=value;input.dispatchEvent(new env.dom.window.Event('change'));},submit=async f=>{f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();};
 try{
  await import('../js/money-app.mjs?workbench-dom-test');
  assert.equal(document.getElementById('creditInventory').children.length,2);assert.match(document.getElementById('creditInventory').textContent,/Unused card/);assert.ok(document.querySelector('#annualCashChart svg'));assert.match(document.getElementById('annualNote').textContent,/Partial year/);
  change(document.getElementById('creditSelect'),'zero');const terms=document.getElementById('creditTerms');terms.elements.purchasePromoApr.value='0';terms.elements.purchasePromoEnd.value='2027-11-04';terms.elements.promoApr.value='0';terms.elements.promoStart.value='2026-11-04';terms.elements.promoEnd.value='2028-08-04';terms.elements.transferDeadline.value='2026-12-31';terms.elements.termsProvisional.checked=true;terms.elements.termsNotes.value='Fee pending';await submit(terms);
  assert.match(document.getElementById('creditInventory').textContent,/Purchases 0% until 2027-11-04/);assert.match(document.getElementById('creditInventory').textContent,/Balance 0% until 2028-08-04/);assert.match(document.getElementById('promoAlerts').textContent,/Provisional assumptions/);assert.equal(revision,0);
  change(document.getElementById('transferForm').elements.to,'zero');assert.equal(document.getElementById('transferForm').elements.fee.value,'');
  change(document.getElementById('budgetMonth'),'2026-10');change(document.getElementById('creditSelect'),'card');
  const f=document.getElementById('scenarioForm');f.elements.balance.value='2000.00';f.elements.amount.value='200.00';await submit(f);
  assert.equal(revision,0);assert.equal(model.accounts.find(a=>a.id==='card').opening,-100000);assert.equal(document.getElementById('scenarioApply').disabled,false);
  change(document.getElementById('creditSelect'),'zero');f.elements.balance.value='300.00';f.elements.amount.value='50.00';f.elements.day.value='25';await submit(f);assert.match(document.getElementById('scenarioNote').textContent,/2 account scenarios included/);
  document.getElementById('scenarioApply').click();assert.equal(revision,0);assert.equal(document.querySelector('#billRows input[aria-label="Expected Planning card payment"]').value,'200.00');
  document.getElementById('savePlan').click();await tick();assert.equal(revision,1);assert.equal(model.accounts.find(a=>a.id==='card').opening,-100000);assert.equal(model.transactions.length,0);assert.equal(model.accounts.find(a=>a.id==='card').credit.paymentAmount,20000);
  assert.equal(model.accounts.find(a=>a.id==='zero').opening,0);assert.equal(model.accounts.find(a=>a.id==='zero').credit.paymentAmount,5000);assert.equal(model.accounts.find(a=>a.id==='zero').credit.purchasePromoEnd,'2027-11-04');assert.equal(model.accounts.find(a=>a.id==='zero').credit.transferFeePercent,null);
  const event=document.getElementById('oneTimeBudgetForm');event.elements.name.value='Workshop';event.elements.amount.value='80.00';await submit(event);assert.equal(revision,1);assert.match(document.getElementById('categoryRows').textContent,/Workshop/);assert.ok([...document.getElementById('transactionCategory').options].some(o=>o.value==='Workshop'));
  const weekly=document.getElementById('weeklyBudgetForm');weekly.elements.budget.value='food';weekly.elements.amount.value='10.00';assert.equal(document.getElementById('weeklyCount').value,'5');await submit(weekly);assert.equal(document.querySelector('#categoryRows [data-budget-id="food"] input').value,'50.00');assert.equal(model.budgets[0].overrides,undefined);
  change(document.getElementById('budgetMonth'),'2026-11');assert.doesNotMatch(document.getElementById('categoryRows').textContent,/Workshop/);assert.equal(document.querySelector('#categoryRows [data-budget-id="food"] input').value,'200.00');assert.equal(document.getElementById('weeklyCount').value,'4');
  change(document.getElementById('baselineDate'),'2026-10-21');const opening=document.querySelector('[data-opening-id="cash"]');opening.value='9000.00';document.getElementById('baselinePreview').click();assert.equal(document.getElementById('baselineApply').hidden,false);assert.equal(model.start,'2026-10-01');
  document.getElementById('baselineApply').click();assert.equal(model.start,'2026-10-01');document.getElementById('savePlan').click();await tick();assert.equal(revision,2);assert.equal(model.start,'2026-10-21');assert.equal(model.accounts[0].opening,900000);assert.equal(model.budgets.find(b=>b.name==='Workshop').oneTimeMonth,'2026-10');
  document.getElementById('logout').click();for(const id of ['creditInventory','promoAlerts','annualRows','annualCashChart','scenarioRows','openingRows'])assert.equal(document.getElementById(id).children.length,0);assert.equal(document.getElementById('scenarioNote').textContent,'');
 }finally{env.restore();}
});
test('summary groups banks, priority cards, debt cards, zero cards and loans; red debt and dated payments stay consistent', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture();model.start='2026-10-21';model.schedules=[];model.budgets=[];model.seasonalItems=[];
 const card=(id,opening,extra={})=>({id,name:id,entity:'household',type:'card',opening,reserve:0,credit:{purchaseApr:0,promoBalance:0},...extra});
 model.accounts=[card('later',-50000,{credit:{purchaseApr:null,promoBalance:0}}),{id:'loan',name:'Unknown loan',entity:'household',type:'loan',opening:0,reserve:0,balanceUnknown:true},card('priority-two',0,{summaryPriority:1}),model.accounts[0],card('unused',0),card('earlier',-50000),card('priority-one',0,{summaryPriority:0})];
 model=installPaymentPlan(model,'later',{amount:10000,day:25,from:'cash',asOf:model.start});model=installPaymentPlan(model,'earlier',{amount:10000,day:6,from:'cash',asOf:model.start});
 const before=JSON.stringify(model),errors=[];
 try{
  const d=setupDashboard({getModel:()=>model,today:()=> '2026-10-22',message:e=>errors.push(e),setStatus:async()=>{},record:()=>{},action:fn=>fn(),savePlan:async()=>{}});d.render();
  const rows=()=>[...document.querySelectorAll('#accountSummary tr')],row=id=>rows().find(r=>r.dataset.accountId===id);
  assert.deepEqual(rows().map(r=>r.dataset.accountId),['cash','priority-one','priority-two','later','earlier','unused','loan']);
  for(const id of ['later','earlier'])for(const td of [...row(id).cells].slice(1))assert.ok(td.classList.contains('negative'));
  assert.equal(row('priority-one').querySelector('.negative'),null);assert.equal(row('loan').cells[3].textContent,'Unknown');
  assert.match(row('later').cells[3].textContent,/-\$400.00/);assert.match(row('later').cells[3].textContent,/APR needed/);assert.match(row('later').cells[3].textContent,/Payments in forecast \$100.00/);
  assert.match(row('earlier').cells[3].textContent,/-\$500.00/);assert.match(row('earlier').cells[3].textContent,/No remaining planned payment/);assert.equal(row('cash').cells[3].textContent,'$900.00');
  assert.equal(JSON.stringify(model),before);
  document.getElementById('budgetMonth').value='2026-11';document.getElementById('budgetMonth').dispatchEvent(new env.dom.window.Event('change'));
  assert.match(row('earlier').cells[3].textContent,/-\$400.00/);assert.match(row('later').cells[3].textContent,/-\$300.00/);assert.equal(row('cash').cells[3].textContent,'$700.00');assert.deepEqual(errors,[]);
 }finally{env.restore();}
});
test('collapsed sections show live totals; one-time expected income records once and owner payout moves both cash balances', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0,session={user:{id:'test-owner'}};model.schedules=[];model.budgets=[];model.seasonalItems=[];model.accounts.push({id:'business',name:'Business cash',entity:'business',type:'cash',opening:50000,reserve:0});model=ensureMonthlyBaselines(model,'2026-10-01');
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>session,authHeaders:()=>({}),logout:()=>session=null};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 const change=(input,value)=>{input.value=value;input.dispatchEvent(new env.dom.window.Event('change'));},submit=async f=>{f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();};
 try{
  await import('../js/money-app.mjs?income-collapse-test');
  const panels=[...document.querySelectorAll('#moneyWorkspace > details.section-panel')];assert.equal(panels.length,13);assert.ok(panels.some(p=>p.id==='savingsSection'));assert.ok(panels.every(p=>!p.open));assert.equal(document.getElementById('summarySection').tagName,'SECTION');assert.match(document.getElementById('incomeSectionPreview').textContent,/Deposits \$0.00/);
  document.querySelector('.section-nav a[href="#incomeSection"]').click();assert.equal(document.getElementById('incomeSection').open,true);document.getElementById('expandSections').click();assert.ok(panels.every(p=>p.open));document.getElementById('collapseSections').click();assert.ok(panels.every(p=>!p.open));
  const f=document.getElementById('oneTimeIncomeForm');f.elements.description.value='Gift';f.elements.when.value='2026-10-22';f.elements.amount.value='100.00';await submit(f);assert.equal(revision,0);assert.equal(model.schedules.length,0);assert.match(document.getElementById('incomeSectionPreview').textContent,/Deposits \$100.00/);assert.match(document.getElementById('accountSummary').textContent,/\$1,100.00/);
  document.getElementById('savePlan').click();await tick();assert.equal(revision,1);assert.equal(model.schedules[0].oneTime,true);assert.equal(model.transactions.length,0);
  document.querySelectorAll('#incomeRows button')[1].click();assert.equal(document.getElementById('removeSeries').hidden,true);assert.equal(document.getElementById('removeDelete').textContent,'Remove expected entry');document.getElementById('removeCancel').click();
  document.getElementById('collapseSections').click();document.querySelector('#incomeRows button').click();assert.equal(document.getElementById('spendingSection').open,true);assert.equal(document.getElementById('transactionEntry').open,true);
  const actual=document.getElementById('transactionForm');actual.elements.amount.value='99.98';await submit(actual);assert.equal(revision,2);assert.equal(model.transactions.length,1);assert.match(document.getElementById('accountSummary').textContent,/\$1,099.98/);assert.equal(document.getElementById('incomeRows').children.length,1);assert.equal(document.getElementById('transactions').children.length,0);
  change(document.getElementById('budgetMonth'),'2026-11');assert.match(document.getElementById('incomeRows').textContent,/No expected entries/);change(document.getElementById('budgetMonth'),'2026-10');
  change(f.elements.incomeType,'distribution');assert.equal(document.getElementById('incomeFromLabel').hidden,false);assert.equal(f.elements.from.value,'business');f.elements.description.value='Owner payout';f.elements.when.value='2026-10-22';f.elements.amount.value='50.00';change(f.elements.status,'cleared');await submit(f);assert.equal(revision,3);const payout=model.transactions.find(t=>t.funding==='distribution');assert.equal(payout.kind,'transfer');assert.deepEqual(payout.entries,[{account:'business',amount:-5000},{account:'cash',amount:5000}]);assert.match(document.getElementById('incomeRows').textContent,/Owner payout/);assert.match(document.getElementById('accountSummary').textContent,/\$1,149.98/);
  f.elements.description.value='Do not save';document.getElementById('cancelOneTimeIncome').click();assert.equal(revision,3);assert.equal(f.elements.description.value,'');
  document.getElementById('logout').click();for(const span of document.querySelectorAll('.section-preview'))assert.equal(span.textContent,'');assert.ok(panels.every(p=>!p.open));assert.equal(f.elements.description.value,'');assert.equal(f.elements.account.options.length,0);assert.equal(f.elements.from.options.length,0);
 }finally{env.restore();}
});
test('debt screen privacy remembers only a flag, masks all debt views and preserves draft calculations and actual data', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0,session={user:{id:'test-owner'}};
 model.accounts.push({id:'card',name:'Private card',type:'card',entity:'household',opening:-123456,reserve:0,credit:{purchaseApr:0,promoBalance:0,minimum:2000}},{id:'zero',name:'Unused card',type:'card',entity:'household',opening:0,reserve:0,credit:{purchaseApr:0,promoBalance:0}});
 model=installPaymentPlan(model,'card',{amount:10000,day:25,from:'cash',asOf:model.start});const original=JSON.stringify(model);
 env.dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../assets/money.css',import.meta.url),'utf8');document.head.append(style);
 env.dom.window.localStorage.setItem('money_hide_debt','1');
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>session,authHeaders:()=>({}),logout:()=>session=null};
 globalThis.fetch=async(url,options={})=>{assert.notEqual(options.method,'PATCH');return {ok:true,json:async()=>url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}]};};
 const display=e=>env.dom.window.getComputedStyle(e).display,change=(input,value)=>{input.value=value;input.dispatchEvent(new env.dom.window.Event('change'));};
 try{
  await import('../js/money-app.mjs?debt-privacy-test');const app=document.getElementById('app'),button=document.getElementById('debtPrivacy');
  assert.equal(app.dataset.debtHidden,'true');assert.equal(button.textContent,'Show debt');assert.equal(button.getAttribute('aria-pressed'),'true');
  const cardRow=()=>document.querySelector('#accountSummary [data-account-id="card"]');assert.equal(display(cardRow()),'none');assert.equal(display(document.querySelector('#accountSummary [data-account-id="zero"]')),'none');assert.notEqual(display(document.querySelector('#accountSummary [data-account-id="cash"]')),'none');
  for(const target of document.querySelectorAll('[data-debt-private]'))assert.equal(display(target),'none');
  assert.equal(display(document.getElementById('creditSectionPreview')),'block');assert.equal(display(document.getElementById('creditSection')),'none');
  document.getElementById('expandSections').click();assert.equal(display(document.getElementById('creditSection')),'none');
  change(document.getElementById('budgetMonth'),'2026-11');assert.equal(display(cardRow()),'none');
  const budget=document.querySelector('#categoryRows input');budget.value='250.00';budget.dispatchEvent(new env.dom.window.Event('change'));assert.equal(document.getElementById('planState').textContent,'Previewing changes');assert.equal(display(cardRow()),'none');
  change(document.getElementById('account'),'card');await tick();assert.equal(display(document.getElementById('forecastSectionPreview')),'none');assert.equal(display(document.getElementById('metrics')),'none');assert.notEqual(display(document.querySelector('.forecast-privacy-hint')),'none');
  change(document.getElementById('account'),'cash');await tick();assert.notEqual(display(document.getElementById('metrics')),'none');
  button.click();assert.equal(app.dataset.debtHidden,'false');assert.notEqual(display(cardRow()),'none');assert.equal(document.getElementById('planState').textContent,'Previewing changes');assert.equal(env.dom.window.localStorage.getItem('money_hide_debt'),'0');
  const payment=[...document.querySelectorAll('#billRows tr')].find(r=>r.hasAttribute('data-debt-private'));payment.querySelector('button').click();const transaction=document.getElementById('transactionForm');transaction.elements.amount.value='95.37';assert.equal(document.getElementById('transactionEntry').open,true);
  button.click();assert.equal(display(document.getElementById('transactionEntry')),'none');button.click();assert.equal(transaction.elements.amount.value,'95.37');assert.notEqual(display(document.getElementById('transactionEntry')),'none');
  button.click();assert.equal(env.dom.window.localStorage.getItem('money_hide_debt'),'1');assert.equal(JSON.stringify(model),original);assert.equal(revision,0);
  env.dom.window.dispatchEvent(new env.dom.window.StorageEvent('storage',{key:'money_hide_debt',newValue:'0'}));assert.equal(app.dataset.debtHidden,'false');env.dom.window.dispatchEvent(new env.dom.window.StorageEvent('storage',{key:'money_hide_debt',newValue:'1'}));assert.equal(app.dataset.debtHidden,'true');
  document.getElementById('logout').click();assert.equal(env.dom.window.localStorage.getItem('money_hide_debt'),'1');assert.equal(JSON.stringify(model),original);
 }finally{env.restore();}
});
test('review editors, category timing, reconciliation and month closing work in-page and enforce historical save protection', {skip:!dependency},async()=>{
 const env=await environment();env.dom.window.HTMLElement.prototype.scrollIntoView=()=>{};let model=fixture(),revision=0;model.start='2026-09-01';model.schedules=[];model.budgets=[{...model.budgets[0],monthly:{'2026-09':20000,'2026-10':20000}}];model.unscheduledBills=[{id:'web',name:'Website',entity:'household',reason:'Annual amount unknown'}];
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://test.invalid',recover:async()=>({user:{id:'test-owner'}}),authHeaders:()=>({}),logout:()=>{}};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 const change=(input,value)=>{input.value=value;input.dispatchEvent(new env.dom.window.Event('change'));},submit=async f=>{f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();};
 try{
  await import('../js/money-app.mjs?confidence-dom-test');change(document.getElementById('budgetMonth'),'2026-10');assert.match(document.getElementById('smartHelp').textContent,/Weekly/);assert.match(document.getElementById('attentionItems').textContent,/Website/);
  const bf=document.getElementById('billReviewForm');bf.elements.bill.value='web';change(bf.elements.resolution,'none');bf.elements.note.value='No longer subscribed';await submit(bf);assert.doesNotMatch(document.getElementById('attentionItems').textContent,/Annual amount unknown/);assert.equal(revision,0);
  document.querySelector('#categoryRows button').click();assert.equal(document.getElementById('timingEntry').open,true);const tf=document.getElementById('timingForm');change(tf.elements.mode,'date');tf.elements.when.value='2026-10-28';await submit(tf);assert.equal(revision,0);document.getElementById('savePlan').click();await tick();assert.equal(model.budgets[0].timing['2026-10'].date,'2026-10-28');assert.equal(model.unscheduledBills.length,0);
  const rf=document.getElementById('reconcileForm');rf.elements.account.value='cash';rf.elements.asOf.value='2026-09-30';rf.elements.balance.value='1000.00';await submit(rf);assert.match(document.getElementById('reconcileResult').textContent,/Difference \$0.00/);[...document.querySelectorAll('#reconcileResult button')].find(b=>b.textContent.startsWith('Mark verified')).click();assert.equal(document.getElementById('reconcileResult').textContent,'');document.getElementById('savePlan').click();await tick();assert.equal(model.reconciliations[0].asOf,'2026-09-30');
  change(document.getElementById('budgetMonth'),'2026-09');assert.equal(document.getElementById('closeMonth').disabled,false);document.getElementById('closeMonth').click();document.getElementById('savePlan').click();await tick();assert.equal(model.monthClosures.length,1);assert.match(document.getElementById('closedMonthBanner').textContent,/is closed/);assert.equal(document.querySelector('#categoryRows input').disabled,true);
  const transaction=document.getElementById('transactionForm');transaction.elements.date.value='2026-09-20';transaction.elements.description.value='Late change';transaction.elements.kind.value='expense';transaction.elements.category.value='Groceries';transaction.elements.account.value='cash';transaction.elements.amount.value='1.00';transaction.elements.status.value='cleared';const rev=revision;await submit(transaction);assert.equal(revision,rev);assert.match(document.getElementById('message').textContent,/is closed/);
  const reopen=document.getElementById('reopenMonthForm');reopen.elements.reason.value='Resolve missing receipt';await submit(reopen);document.getElementById('savePlan').click();await tick();assert.equal(model.monthClosures.length,0);assert.equal(model.monthReopenHistory[0].reason,'Resolve missing receipt');
  document.getElementById('logout').click();for(const id of ['attentionItems','smartHelp','nearTermCash','monthCloseStatus','trendRows','payoffGaps','closedMonthBanner'])assert.equal(document.getElementById(id).textContent,'');
 }finally{env.restore();}
});
test('automatic current-month baselines save once, survive rollover and preserve an unsaved budget preview', {skip:!dependency},async()=>{
 const env=await environment(),OriginalDate=globalThis.Date;let clock='2026-10-31T16:00:00Z',model=fixture(),revision=0,conflict=false,patches=0;
 globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return +new OriginalDate(clock);}};
 delete model.forecastSnapshots;model.schedules=[];model.seasonalItems=[];model.budgets=[model.budgets[0]];model.accounts.push({id:'shop',name:'Shop cash',entity:'business',type:'cash',opening:50000,reserve:0});
 env.dom.window.HTMLElement.prototype.scrollIntoView=()=>{};env.dom.window.OliPolyAuth={SUPABASE_URL:'https://test.invalid',recover:async()=>({user:{id:'test-owner'}}),authHeaders:()=>({}),logout:()=>{}};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){patches++;if(conflict)return {ok:true,json:async()=>[]};const next=JSON.parse(options.body);assert.equal(next.revision,revision+1);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 const change=(input,value)=>{input.value=value;input.dispatchEvent(new env.dom.window.Event('change'));};
 try{
  await import('../js/money-app.mjs?automatic-baseline-test');assert.equal(revision,1);assert.equal(model.forecastSnapshots.length,2);assert.ok(model.forecastSnapshots.every(s=>s.source==='automatic'&&s.asOf==='2026-10-31'));assert.match(document.getElementById('comparisonResult').textContent,/Captured after month start/);assert.equal(document.getElementById('snapshotForecast').hidden,true);
  document.getElementById('refresh').click();await tick();assert.equal(patches,1);
  change(document.getElementById('budgetMonth'),'2026-11');const target=document.querySelector('#categoryRows input');change(target,'150.00');assert.equal(document.getElementById('planState').textContent,'Previewing changes');assert.equal(model.budgets[0].overrides,undefined);
  clock='2026-11-01T16:00:00Z';env.dom.window.dispatchEvent(new env.dom.window.Event('focus'));await tick();assert.equal(revision,2);assert.equal(model.forecastSnapshots.length,4);assert.equal(document.querySelector('#categoryRows input').value,'150.00');assert.equal(document.getElementById('planState').textContent,'Previewing changes');assert.equal(model.forecastSnapshots.find(s=>s.month==='2026-11'&&s.entity==='household').components.spending,30000);
  const fixed=JSON.stringify(model.forecastSnapshots);document.getElementById('savePlan').click();await tick();assert.equal(revision,3);assert.equal(model.budgets[0].overrides['2026-11'],15000);assert.equal(JSON.stringify(model.forecastSnapshots),fixed);
  env.dom.window.dispatchEvent(new env.dom.window.Event('focus'));await tick();assert.equal(revision,3);
  clock='2027-01-02T16:00:00Z';env.dom.window.dispatchEvent(new env.dom.window.Event('focus'));await tick();assert.equal(revision,4);assert.ok(model.forecastSnapshots.some(s=>s.month==='2027-01'));assert.ok(!model.forecastSnapshots.some(s=>s.month==='2026-12'));
  conflict=true;clock='2027-02-01T16:00:00Z';env.dom.window.dispatchEvent(new env.dom.window.Event('focus'));await tick();assert.equal(revision,4);assert.ok(!model.forecastSnapshots.some(s=>s.month==='2027-02'));assert.match(document.getElementById('message').textContent,/another tab/);
  conflict=false;document.getElementById('refresh').click();await tick();assert.equal(revision,5);assert.ok(model.forecastSnapshots.some(s=>s.month==='2027-02'&&s.asOf==='2027-02-01'));
 }finally{globalThis.Date=OriginalDate;env.restore();}
});
test('duplicate review cancels safely, edits existing entries, allows separate purchases and matches variable bills and one-time income', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0,failSave=false;model.accounts.push({id:'card',name:'Daily card',entity:'household',type:'card',opening:0,reserve:0,credit:{purchaseApr:0}});model.transactions=[{id:'market',date:'2026-10-20',description:'Market',kind:'expense',category:'Groceries',status:'pending',entries:[{account:'card',amount:-2500}]}];model.schedules.push({id:'gift',name:'Birthday gift',account:'cash',amount:7500,frequency:'monthly',anchor:'2026-10-23',end:'2026-10-23',day:23,oneTime:true});
 env.dom.window.HTMLElement.prototype.scrollIntoView=()=>{};env.dom.window.OliPolyAuth={SUPABASE_URL:'https://test.invalid',recover:async()=>({user:{id:'test-owner'}}),authHeaders:()=>({}),logout:()=>{}};
 globalThis.fetch=async(url,options={})=>{let body;if(options.method==='PATCH'){if(failSave)return {ok:false,status:409,json:async()=>({message:'Synthetic save failure'})};const next=JSON.parse(options.body);model=next.body;revision=next.revision;body=[{body:model,revision}];}else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];return {ok:true,json:async()=>body};};
 const submit=async f=>{f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();};
 try{
  await import('../js/money-app.mjs?duplicate-review-test');const f=document.getElementById('transactionForm'),dialog=document.getElementById('duplicateDialog');
  const purchase=()=>{f.reset();f.elements.account.value='card';f.elements.date.value='2026-10-20';f.elements.description.value='Market';f.elements.category.value='Groceries';f.elements.kind.value='expense';f.elements.amount.value='25.00';f.elements.status.value='cleared';};
  purchase();await submit(f);assert.equal(dialog.open,true);assert.equal(revision,0);assert.equal(model.transactions.length,1);document.getElementById('duplicateCancel').click();assert.equal(dialog.open,false);assert.equal(f.elements.amount.value,'25.00');assert.equal(f.elements.description.value,'Market');
  await submit(f);document.querySelector('#duplicateRows button').click();assert.equal(f.elements.editTransactionId.value,'market');f.elements.status.value='cleared';await submit(f);assert.equal(dialog.open,false);assert.equal(revision,1);assert.equal(model.transactions.length,1);assert.equal(model.transactions[0].status,'cleared');
  purchase();await submit(f);assert.equal(dialog.open,true);document.getElementById('debtPrivacy').click();assert.equal(dialog.open,true);assert.match(document.getElementById('duplicateRows').textContent,/Market/);assert.equal(revision,1);document.getElementById('duplicateCancel').click();document.getElementById('debtPrivacy').click();
  await submit(f);failSave=true;document.getElementById('duplicateProceed').click();await tick();assert.equal(revision,1);assert.equal(f.elements.amount.value,'25.00');assert.match(document.getElementById('message').textContent,/Synthetic save failure/);failSave=false;await submit(f);assert.equal(dialog.open,true);document.getElementById('duplicateProceed').click();await tick();assert.equal(revision,2);assert.equal(model.transactions.length,2);
  f.reset();f.elements.account.value='cash';f.elements.date.value='2026-10-27';f.elements.description.value='Electric bill';f.elements.category.value='Electric';f.elements.amount.value='127.25';f.elements.status.value='cleared';await submit(f);assert.equal(dialog.open,true);assert.match(document.getElementById('duplicateRows').textContent,/Expected/);document.querySelector('#duplicateRows button').click();assert.equal(f.elements.scheduleKey.value,'bill:2026-10-28');assert.equal(f.elements.amount.value,'127.25');assert.equal(f.elements.date.value,'2026-10-27');await submit(f);assert.equal(revision,3);assert.equal(model.transactions.filter(t=>t.scheduleKey==='bill:2026-10-28').length,1);
  const income=document.getElementById('oneTimeIncomeForm');income.elements.description.value='Birthday gift';income.elements.when.value='2026-10-23';income.elements.amount.value='75.00';income.elements.status.value='cleared';await submit(income);assert.equal(dialog.open,true);assert.equal(revision,3);document.querySelector('#duplicateRows button').click();assert.equal(f.elements.scheduleKey.value,'gift:2026-10-23');await submit(f);assert.equal(revision,4);assert.equal(model.transactions.filter(t=>t.kind==='income').length,1);assert.equal(model.transactions.find(t=>t.kind==='income').entries[0].amount,7500);
  purchase();await submit(f);assert.equal(dialog.open,true);document.getElementById('logout').click();assert.equal(dialog.open,false);assert.equal(document.getElementById('duplicateRows').textContent,'');
 }finally{env.restore();}
});
test('chart overall offsets category overspend, includes pending and YOY once, and follows preview/reset/owner/month', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture();model.budgets.push({id:'gas',name:'Gas',entity:'household',account:'cash',monthly:{'2026-10':10000,'2026-11':10000}});model.accounts.push({id:'card',name:'Card',type:'card',entity:'household',opening:0,reserve:0},{id:'shop',name:'Shop',type:'cash',entity:'business',opening:10000,reserve:0});model.budgets.push({id:'shop-budget',name:'Supplies',entity:'business',account:'shop',monthly:{'2026-10':10000}});
 const purchase=(id,category,amount,account='card')=>({id,date:'2026-10-20',description:id,kind:'expense',category,status:'pending',entries:[{account,amount:-amount}]});
 model.transactions=[purchase('food','Groceries',25000),purchase('fuel','Gas',4000),purchase('gift','Seasonal',3000),purchase('other','Unplanned',1234),purchase('supplies','Supplies',2000,'shop'),{id:'payoff',date:'2026-10-21',description:'Payment',kind:'transfer',status:'cleared',entries:[{account:'cash',amount:-25000},{account:'card',amount:25000}]}];
 try{
  const d=setupDashboard({getModel:()=>model,today:()=> '2026-10-26',message:()=>{},setStatus:async()=>{},record:()=>{},action:fn=>fn(),savePlan:async next=>{model=next;d.render();}});d.render();const overall=()=>document.getElementById('categoryOverall');
  assert.equal(document.getElementById('monthChart').lastElementChild,overall());assert.match(overall().textContent,/Expected: \$350.00/);assert.match(overall().textContent,/Actual: \$320.00/);assert.match(overall().textContent,/\$30.00 under overall so far/);assert.match(overall().textContent,/outside these categories: \$12.34/);
  const input=document.querySelector('[data-budget-id="gas"] input');input.value='50.00';input.dispatchEvent(new env.dom.window.Event('change'));assert.match(overall().textContent,/\$20.00 over overall so far/);assert.equal(overall().querySelector('.comparison-status').classList.contains('low'),true);assert.equal(model.budgets.find(b=>b.id==='gas').overrides,undefined);
  input.value='70.00';input.dispatchEvent(new env.dom.window.Event('change'));assert.match(overall().textContent,/On budget overall so far/);
  document.getElementById('resetPlan').click();assert.match(overall().textContent,/\$30.00 under overall so far/);
  document.getElementById('budgetEntity').value='business';document.getElementById('budgetEntity').dispatchEvent(new env.dom.window.Event('change'));assert.match(overall().textContent,/Expected: \$100.00/);assert.match(overall().textContent,/Actual: \$20.00/);assert.doesNotMatch(overall().textContent,/\$320.00/);
  document.getElementById('budgetEntity').value='household';document.getElementById('budgetMonth').value='2026-11';document.getElementById('budgetMonth').dispatchEvent(new env.dom.window.Event('change'));assert.match(overall().textContent,/Actual: \$0.00/);
  document.getElementById('budgetMonth').value='2026-12';document.getElementById('budgetMonth').dispatchEvent(new env.dom.window.Event('change'));assert.match(overall().textContent,/Expected: Incomplete targets/);assert.doesNotMatch(overall().textContent,/under overall|On budget overall/);
  d.clear();assert.equal(document.getElementById('categoryOverall'),null);
 }finally{env.restore();}
});

test('debt privacy keeps card purchase entry and duplicate review usable without exposing debt summaries', {skip:!dependency},async()=>{
 const env=await environment();let model=fixture(),revision=0;
 model.accounts.push({id:'freedom',name:'Freedom',type:'card',entity:'household',opening:0,reserve:0},{id:'unlimited',name:'Freedom Unlimited',type:'card',entity:'household',opening:0,reserve:0});
 env.dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../assets/money.css',import.meta.url),'utf8');document.head.append(style);
 env.dom.window.localStorage.setItem('money_hide_debt','1');
 env.dom.window.OliPolyAuth={SUPABASE_URL:'https://test.invalid',recover:async()=>({user:{id:'test-owner'}}),authHeaders:()=>({}),logout:()=>{}};
 globalThis.fetch=async(url,options={})=>{if(options.method==='PATCH'){const next=JSON.parse(options.body);model=next.body;revision=next.revision;}return {ok:true,json:async()=>url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}]};};
 const change=(input,value)=>{input.value=value;input.dispatchEvent(new env.dom.window.Event('change',{bubbles:true}));};
 const display=e=>env.dom.window.getComputedStyle(e).display;
 try{
  await import('../js/money-app.mjs?card-purchase-privacy-regression');
  const entry=document.getElementById('transactionEntry'),f=document.getElementById('transactionForm');
  document.getElementById('spendingSection').open=true;entry.open=true;
  f.elements.description.value='Weekly groceries';f.elements.date.value='2026-10-22';f.elements.amount.value='25.00';change(f.elements.kind,'expense');change(f.elements.category,'Groceries');
  for(const id of ['freedom','unlimited']){change(f.elements.account,id);assert.equal(entry.open,true);assert.notEqual(display(entry),'none');assert.equal(f.elements.description.value,'Weekly groceries');assert.equal(f.elements.amount.value,'25.00');assert.equal(f.elements.category.value,'Groceries');assert.equal(display(document.querySelector('#accountSummary [data-account-id="'+id+'"]')),'none');}
  f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(model.transactions.length,1);assert.equal(model.transactions[0].entries[0].account,'unlimited');assert.equal(model.transactions[0].category,'Groceries');
  entry.open=true;f.elements.description.value='Weekly groceries';f.elements.date.value='2026-10-22';f.elements.amount.value='25.00';change(f.elements.kind,'expense');change(f.elements.account,'unlimited');change(f.elements.category,'Groceries');
  f.dispatchEvent(new env.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(document.getElementById('duplicateDialog').open,true);assert.notEqual(display(document.getElementById('duplicateDialog')),'none');assert.match(document.getElementById('duplicateRows').textContent,/Weekly groceries/);document.getElementById('duplicateCancel').click();assert.equal(model.transactions.length,1);assert.equal(f.elements.amount.value,'25.00');assert.notEqual(display(entry),'none');
  document.getElementById('clearMatch').click();assert.equal(entry.open,false);assert.equal(document.getElementById('app').dataset.debtHidden,'true');
 }finally{env.restore();}
});
