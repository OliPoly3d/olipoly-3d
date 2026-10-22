import test from 'node:test';import assert from 'node:assert/strict';
import {reconciliation,verifyBalance,checkpointValid,cashCapacity,attentionItems,saveForecastSnapshot,forecastComparison,categoryTrend,validateConfidence} from '../js/money-confidence.mjs';
import {planningForecast} from '../js/money-planning.mjs';
import {planningSnapshot} from '../js/money-insights.mjs';
import {closeMonth,reopenMonth,assertMonthLocks,closeRequirements} from '../js/money-month-close.mjs';
const plan=()=>({version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Checking',entity:'household',type:'cash',opening:100000,reserve:10000}],transactions:[],schedules:[],budgets:[{id:'food',name:'Food',entity:'household',account:'cash',monthly:{'2026-10':31001,'2026-11':30000}}]});
const expense=(id,when,amount)=>({id,date:when,kind:'expense',category:'Food',description:id,status:'cleared',entries:[{account:'cash',amount:-amount}]});
test('reconciliation respects pending basis, invalidates edited history and requires explicit adjustment with a reason',()=>{
 const m=plan();m.transactions=[expense('a','2026-10-02',1000),{...expense('pending','2026-10-03',2000),status:'pending'}];
 assert.equal(reconciliation(m,'cash','2026-10-04','posted',99000).difference,0);assert.equal(reconciliation(m,'cash','2026-10-04','pending',99000).difference,2000);
 const next=verifyBalance(m,{account:'cash',asOf:'2026-10-04',basis:'posted',bankBalance:99000});assert.ok(checkpointValid(next,next.reconciliations[0]));next.transactions[0].status='reconciled';assert.equal(checkpointValid(next,next.reconciliations[0]),false);
 assert.throws(()=>verifyBalance(m,{account:'cash',asOf:'2026-10-04',basis:'posted',bankBalance:98000}),/Resolve/);
 assert.throws(()=>verifyBalance(m,{account:'cash',asOf:'2026-10-04',basis:'pending',bankBalance:98000},{adjust:true,reason:'test',id:'adjust'}),/posted/);
 const adjusted=verifyBalance(m,{account:'cash',asOf:'2026-10-04',basis:'posted',bankBalance:98000},{adjust:true,reason:'Bank correction',id:'adjust'});assert.equal(adjusted.transactions.at(-1).entries[0].amount,-1000);assert.ok(checkpointValid(adjusted,adjusted.reconciliations[0]));assert.equal(m.transactions.length,2);
});
test('daily, weekly and exact-date reservations conserve cents and replace actuals without changing another month',()=>{
 for(const timing of [{mode:'daily'},{mode:'weekly',weekday:2},{mode:'date',date:'2026-10-18'},{mode:'month-end'}]){const m=plan();m.budgets[0].timing={'2026-10':timing};m.transactions=[expense('food','2026-10-05',10001)];const p=planningForecast(m,'2026-11-30'),posts=p.planned.filter(t=>t.budgetReserve&&t.date.startsWith('2026-10'));assert.equal(posts.reduce((n,t)=>n-t.entries[0].amount,0),21000);assert.equal(p.days.find(d=>d.date==='2026-10-31').closing.cash,68999);assert.equal(p.days.at(-1).closing.cash,38999);if(timing.mode==='date')assert.deepEqual(posts.map(t=>t.date),['2026-10-18']);}
 const m=plan();m.budgets[0].timing={'2026-10':{mode:'date',date:'2026-10-05'}};assert.equal(planningForecast(planningSnapshot(m,'2026-10-20'),'2026-10-31').planned.find(t=>t.budgetReserve).date,'2026-10-20');m.budgets[0].timing['2026-10'].date='2026-11-01';assert.throws(()=>planningForecast(m,'2026-10-31'),/within/);
});
test('until-payday capacity protects debit-first lows and dated buffers while unresolved data stays reviewable',()=>{
 let m=plan();m.budgets=[];m.schedules=[{id:'pay',name:'Paycheck',frequency:'biweekly',anchor:'2026-10-09',account:'cash',amount:50000},{id:'rent',name:'Rent',frequency:'monthly',day:6,anchor:m.start,account:'cash',amount:-30000}];m=verifyBalance(m,{account:'cash',asOf:'2026-10-01',basis:'posted',bankBalance:100000});
 let c=cashCapacity(m,'cash','2026-10-01');assert.equal(c.end,'2026-10-08');assert.equal(c.available,60000);assert.equal(c.complete,true);
 m.accounts[0].cashRules=[{id:'buffer',label:'Before rent',day:6,point:'opening',amount:90000}];c=cashCapacity(m,'cash','2026-10-01');assert.equal(c.available,10000);
 m.unscheduledBills=[{id:'unknown',name:'Tax',reason:'Unknown',entity:'household'}];c=cashCapacity(m,'cash','2026-10-01');assert.equal(c.complete,false);assert.ok(attentionItems(m,'2026-10-01','household','2026-10-31').some(x=>x.action==='bill'));
});
test('business payout protects only the selected account and requires an explicit additional reserve',()=>{
 let m=plan();m.budgets=[];m.accounts[0].entity='business';m.accounts.push({id:'savings',name:'Savings',entity:'business',type:'cash',opening:500000,reserve:0});m=verifyBalance(m,{account:'cash',asOf:'2026-10-01',basis:'posted',bankBalance:100000});assert.equal(cashCapacity(m,'cash','2026-10-01',{business:true}).complete,false);m.accounts[0].payoutReserve=40000;const c=cashCapacity(m,'cash','2026-10-01',{business:true});assert.equal(c.available,60000);assert.equal(c.complete,true);assert.throws(()=>validateConfidence({...m,accounts:[{...m.accounts[0],payoutReserve:-1}]}));
});
test('forecast baseline stays fixed and cash variance bridges income, spending, transfers and adjustments',()=>{
 let m=plan();m.budgets=[];m.schedules=[{id:'pay',name:'Pay',account:'cash',frequency:'monthly',day:5,anchor:m.start,amount:5000}];m=saveForecastSnapshot(m,'2026-10','household','2026-10-01');const baseline=JSON.stringify(m.forecastSnapshots[0]);m.transactions=[{id:'actual',scheduleKey:'pay:2026-10-05',date:'2026-10-05',kind:'income',description:'Pay',status:'cleared',entries:[{account:'cash',amount:6000}]},expense('a','2026-10-08',2000)];const c=forecastComparison(m,m.forecastSnapshots[0],'2026-11-01');assert.equal(c.variance,-1000);assert.equal(Object.values(c.bridge).reduce((n,v)=>n+v,0),c.variance);assert.equal(c.final,false);assert.equal(JSON.stringify(m.forecastSnapshots[0]),baseline);assert.throws(()=>saveForecastSnapshot(m,'2026-10','household','2026-10-02'),/already/);assert.throws(()=>saveForecastSnapshot(m,'2026-09','household','2026-10-02'),/past/);
 const rows=categoryTrend({...m,budgets:plan().budgets},'2026-10','household','food','2026-10-22');assert.equal(rows[0].actual,null);assert.equal(rows.at(-1).prior,null);assert.equal(rows.at(-1).actual,2000);
});
test('closing requires completed month checks, blocks historical edits and permits current corrections or explicit reopening',()=>{
 let m=plan();assert.ok(closeRequirements(m,'2026-10','household','2026-10-30').length);assert.throws(()=>closeMonth(m,'2026-10','household','2026-11-01'),/Verify/);
 m=verifyBalance(m,{account:'cash',asOf:'2026-10-31',basis:'posted',bankBalance:100000});const closed=closeMonth(m,'2026-10','household','2026-11-01');const edited=structuredClone(closed);edited.transactions.push(expense('late','2026-10-25',100));assert.throws(()=>assertMonthLocks(closed,edited),/closed/);
 const forward=structuredClone(closed);forward.transactions.push({...expense('correction','2026-11-01',100),kind:'adjustment',category:undefined,note:'Prior-month correction'});assert.doesNotThrow(()=>assertMonthLocks(closed,forward));
 const nextMonth=structuredClone(closed);nextMonth.budgets[0].overrides={'2026-11':40000};assert.doesNotThrow(()=>assertMonthLocks(closed,nextMonth));assert.throws(()=>reopenMonth(closed,'2026-10','household','','2026-11-01'),/Explain/);const reopened=reopenMonth(closed,'2026-10','household','Correct duplicate','2026-11-01');assert.doesNotThrow(()=>assertMonthLocks(closed,reopened));assert.throws(()=>assertMonthLocks(closed,{...closed,monthClosures:[]}),/reason/);
});
