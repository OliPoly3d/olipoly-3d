import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,occurrences} from '../js/money-engine.mjs';
import {seasonalMonth} from '../js/money-budget.mjs';
import {monthProjection,expectedRows,planningForecast} from '../js/money-planning.mjs';
function plan(){return {version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Cash',type:'cash',entity:'household',opening:100000,reserve:0},{id:'card',name:'Card',type:'card',entity:'household',opening:-1000,reserve:0}],transactions:[],schedules:[],budgets:[{id:'food',name:'Grocery',entity:'household',account:'cash',monthly:{'2026-10':20000,'2026-11':20000}}],planning:{cardPayoffs:[{card:'card',from:'cash'}]}};}
const expense=(account,amount)=>({id:'purchase',kind:'expense',date:'2026-10-12',description:'Market',category:'Grocery',status:'pending',entries:[{account,amount:-amount}]});
test('target changes affect month-end dollar for dollar and carry into the following month',()=>{
 const p=plan();assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,79000);
 p.budgets[0].overrides={'2026-10':25000};assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,74000);
 assert.equal(monthProjection(p,'2026-11','2026-10-21').closing.cash,54000);
});
test('cash or card actual replaces remaining budget; matching payments never double-count',()=>{
 for(const account of ['cash','card']){
  const p=plan();p.transactions=[expense(account,5000)];const result=monthProjection(p,'2026-10','2026-10-21');
  assert.equal(result.closing.cash,79000);assert.equal(result.closing.card,0);
  assert.equal(result.planned.filter(t=>t.id.startsWith('budget:')).reduce((n,t)=>n+t.entries[0].amount,0),-15000);
 }
 const p=plan();p.transactions=[expense('card',5000),{id:'pay',date:'2026-10-15',kind:'transfer',description:'Payment',status:'cleared',entries:[{account:'cash',amount:-6000},{account:'card',amount:6000}]}];
 assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,79000);
 assert.equal(monthProjection(p,'2026-10','2026-10-21').planned.some(t=>t.id.startsWith('payoff:')),false);
});
test('scheduled category spending replaces part of its budget and overspend is retained',()=>{
 const p=plan();p.schedules=[{id:'foodbox',name:'Food box',category:'Grocery',account:'cash',amount:-5000,anchor:'2026-10-01',frequency:'monthly',day:25}];
 assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,79000);
 p.transactions=[expense('cash',30000)];assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,64000);
});
test('exact cents, date and account expectations persist; matched actual replaces moved forecast once',()=>{
 const p=plan();p.schedules=[{id:'pay',name:'Pay',account:'cash',amount:12345,anchor:'2026-10-02',frequency:'biweekly',firstPayBonus:4000,overrides:{'2026-10-16':{date:'2026-11-01',amount:12347,account:'cash'}}}];
 validate(p);const list=occurrences(p,'2026-11-30');
 assert.equal(list.find(t=>t.scheduleKey==='pay:2026-10-16').date,'2026-11-01');
 assert.equal(list.find(t=>t.scheduleKey==='pay:2026-10-16').entries[0].amount,12347);
 p.transactions=[{id:'actual',scheduleKey:'pay:2026-10-16',kind:'income',description:'Pay actual',date:'2026-11-02',status:'cleared',entries:[{account:'cash',amount:12348}]}];
 assert.equal(occurrences(p,'2026-11-30').some(t=>t.scheduleKey==='pay:2026-10-16'),false);
 assert.equal(expectedRows(p,'2026-11','household','income').find(t=>t.scheduleKey==='pay:2026-10-16').actual.id,'actual');
});
test('seasonal overrides affect only one month; yearly changes leave earlier years intact and never add another budget',()=>{
 const p=plan();p.seasonalItems=[{id:'gift',name:'Gifts',month:10,amount:5000,entity:'household',overrides:{'2026-10':6000},changes:[{year:2027,amount:7000}]}];
 p.budgets.push({id:'seasonal',name:'Seasonal',entity:'household',account:'cash',seasonal:true,monthly:{'2026-10':5000}});
 assert.equal(seasonalMonth(p,'2026-10','household').total,6000);assert.equal(seasonalMonth(p,'2027-10','household').total,7000);
 assert.equal(seasonalMonth(p,'2025-10','household').total,5000);
 assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,73000);
});
test('no mutation, unknown funding/targets are disclosed and invalid expectations fail validation',()=>{
 const p=plan(),before=JSON.stringify(p);monthProjection(p,'2026-10','2026-10-21');assert.equal(JSON.stringify(p),before);
 delete p.budgets[0].account;assert.ok(monthProjection(p,'2026-10','2026-10-21').warnings.includes('Budget funding account needed'));
 p.schedules=[{id:'bad',name:'Bad',amount:100,account:'cash',anchor:'2026-10-01',frequency:'monthly',day:1,overrides:{'2026-10-01':{amount:-100}}}];assert.throws(()=>validate(p));
});
test('funding edits affect only the selected month and transfer expectations support a different destination',()=>{
 const p=plan();p.accounts.push({id:'other',name:'Other cash',type:'cash',entity:'household',opening:100000,reserve:0});
 p.budgets[0].funding={'2026-10':'other'};
 assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.cash,99000);
 assert.equal(monthProjection(p,'2026-10','2026-10-21').closing.other,80000);
 assert.equal(monthProjection(p,'2026-11','2026-10-21').closing.cash,79000);
 p.schedules=[{id:'transfer',name:'Transfer',account:'cash',to:'card',amount:-500,frequency:'monthly',anchor:'2026-10-01',day:20,overrides:{'2026-10-20':{amount:-501,account:'cash',to:'other'}}}];
 validate(p);assert.deepEqual(occurrences(p,'2026-10-31')[0].entries,[{account:'cash',amount:-501},{account:'other',amount:501}]);
 p.schedules[0].overrides['2026-10-20'].to='cash';assert.throws(()=>validate(p));
});
test('missing future budgets mark that month and all subsequent projections incomplete until filled',()=>{
 const p=plan();p.budgets[0].monthly['2027-01']=20000;
 const r=planningForecast(p,'2027-01-31');
 assert.equal(r.incompleteFrom.household,'2026-12');
 assert.deepEqual(r.issues,[{month:'2026-12',entity:'household',category:'Grocery',reason:'Missing category targets'}]);
 assert.equal(monthProjection(p,'2026-11','2026-10-21').incompleteFrom.household,undefined);
 assert.equal(monthProjection(p,'2027-01','2026-10-21').incompleteFrom.household,'2026-12');
 p.budgets[0].monthly['2026-12']=0;
 assert.deepEqual(planningForecast(p,'2027-01-31').issues,[]);
 delete p.budgets[0].account;
 assert.equal(planningForecast(p,'2027-01-31').incompleteFrom.household,'2026-10');
});
