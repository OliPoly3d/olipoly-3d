import test from 'node:test';import assert from 'node:assert/strict';
import {validate,balances} from '../js/money-engine.mjs';
import {budgetMonth,addOneTimeBudget,weeklyDates,validateBudgets} from '../js/money-budget.mjs';
import {planningForecast,expectedRows} from '../js/money-planning.mjs';
import {installPaymentPlan,scenarioSnapshot,transferScenario,promoSummary,validateCredit} from '../js/money-credit.mjs';
import {resetBaseline,annualSummary,planningSnapshot} from '../js/money-insights.mjs';
function plan(){return {version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Cash',type:'cash',entity:'household',opening:100000,reserve:20000},{id:'card',name:'Card',type:'card',entity:'household',opening:-100000,reserve:0,credit:{purchaseApr:0,promoBalance:0,minimum:1000,dueDay:15}}],transactions:[],schedules:[],budgets:[]};}
test('standard zero-percent promo changes rate the day after expiry; unknown APR never becomes an implicit zero',()=>{
 const p=plan(),a=p.accounts[1];a.credit={...a.credit,promoBalance:100000,promoApr:0,promoEnd:'2026-10-15',postPromoApr:36.5,promoScope:'balance_transfer'};
 const r=planningForecast(p,'2026-10-31');assert.equal(r.days.at(-1).closing.card,-101600);assert.equal(r.planned.filter(t=>t.creditInterest).reduce((n,t)=>n-t.entries[0].amount,0),1600);
 a.credit.postPromoApr=null;const missing=planningForecast(p,'2026-10-31');assert.equal(missing.days.at(-1).credit.card.missingFrom,'2026-10-16');assert.match(missing.creditWarnings.join(' '),/missing APR/);
});
test('fixed payment caps at debt; zero monthly intent stays zero; full mode uses the real balance',()=>{
 let p=plan();p.accounts[1].opening=-25000;p=installPaymentPlan(p,'card',{amount:20000,day:15,from:'cash',asOf:p.start});const r=planningForecast(p,'2026-11-30');assert.equal(r.days.at(-1).closing.cash,75000);assert.equal(r.days.at(-1).closing.card,0);assert.deepEqual(r.planned.filter(t=>t.creditPayment).map(t=>t.entries[1].amount),[20000,5000]);
 p=installPaymentPlan(plan(),'card',{amount:0,day:15,from:'cash',asOf:'2026-10-01'});assert.equal(planningForecast(p,'2026-10-31').days.at(-1).closing.cash,100000);
 p=installPaymentPlan(plan(),'card',{mode:'full',amount:0,day:15,from:'cash',asOf:'2026-10-01'});assert.equal(planningForecast(p,'2026-10-31').days.at(-1).closing.card,0);assert.equal(expectedRows(p,'2026-10','household','bills')[0].entries[0].amount,-100000);
});
test('mid-month actual payments count toward monthly intent; matching actual removes the candidate once',()=>{
 let p=installPaymentPlan(plan(),'card',{amount:20000,day:15,from:'cash',asOf:'2026-10-01'});
 p.transactions=[{id:'early',description:'Early card payment',date:'2026-10-10',kind:'transfer',status:'cleared',entries:[{account:'cash',amount:-5000},{account:'card',amount:5000}]}];
 let r=planningForecast(p,'2026-10-31');assert.equal(r.planned.find(t=>t.creditPayment).entries[1].amount,15000);assert.equal(r.days.at(-1).closing.cash,80000);assert.equal(r.days.at(-1).closing.card,-80000);
 p.transactions[0].scheduleKey='credit-payment:card:2026-10-15';r=planningForecast(p,'2026-10-31');assert.equal(r.planned.filter(t=>t.creditPayment).length,0);assert.equal(r.days.at(-1).closing.cash,95000);
});
test('monthly overrides, skipped occurrences, pause and a below-minimum warning are honored',()=>{
 let p=installPaymentPlan(plan(),'card',{amount:10000,day:15,from:'cash',asOf:'2026-10-01',monthly:{'2026-10':500,'2026-11':0}});let r=planningForecast(p,'2026-11-30');assert.equal(r.days.at(-1).closing.cash,99500);assert.match(r.creditWarnings.join(' '),/below latest/);
 p.schedules[0].skipped=['2026-10-15'];assert.equal(planningForecast(p,'2026-11-30').days.at(-1).closing.cash,100000);
 p.schedules[0].enabled=false;assert.equal(planningForecast(p,'2026-12-31').days.at(-1).closing.cash,100000);
});
test('actual card purchases retain category spend and consume their budget once after applying a payment plan',()=>{
 let p=plan();p.accounts[1].opening=0;p.budgets=[{id:'food',name:'Food',entity:'household',account:'cash',monthly:{'2026-10':20000}}];p.transactions=[{id:'buy',description:'Food',date:'2026-10-10',kind:'expense',category:'Food',status:'pending',entries:[{account:'card',amount:-5000}]}];p=installPaymentPlan(p,'card',{mode:'full',amount:0,day:15,from:'cash',asOf:p.start});const r=planningForecast(p,'2026-10-31');assert.equal(r.days.at(-1).closing.cash,80000);assert.equal(r.days.at(-1).closing.card,0);assert.equal(budgetMonth(p,'2026-10','household','2026-10-31').totals.spent,5000);
});
test('scenario snapshot does not replay included same-day actuals; hypothetical debt and consolidation never mutate the source',()=>{
 const p=plan();p.transactions=[{id:'paid',description:'Paid',date:'2026-10-21',kind:'transfer',status:'cleared',entries:[{account:'cash',amount:-5000},{account:'card',amount:5000}]}];const before=JSON.stringify(p),trial=scenarioSnapshot(p,'2026-10-21',{card:70000});assert.equal(trial.accounts[0].opening,95000);assert.equal(trial.accounts[1].opening,-70000);assert.equal(trial.transactions.length,0);
 trial.accounts.push({id:'other',name:'Other',type:'card',entity:'household',opening:0,reserve:0,credit:{promoApr:0,promoEnd:'2027-12-31',promoScope:'balance_transfer',promoBalance:0,purchaseApr:20,postPromoApr:20}});const moved=transferScenario(trial,'card','other',50000,1500);assert.equal(moved.accounts[1].opening,-20000);assert.equal(moved.accounts[2].opening,-51500);assert.equal(moved.accounts[2].credit.promoBalance,51500);assert.equal(moved.accounts[0].opening,95000);assert.equal(JSON.stringify(p),before);assert.throws(()=>transferScenario(trial,'card','other',80000));
});
test('promo payoff target counts only due dates before expiry, with actual payments reducing the target',()=>{
 const p=plan(),a=p.accounts[1];a.credit={...a.credit,promoBalance:100000,promoApr:0,promoEnd:'2026-11-12',postPromoApr:20,promoScope:'balance_transfer'};
 assert.equal(promoSummary(p,a,'2026-10-01').opportunities,1);assert.equal(promoSummary(p,a,'2026-10-01').target,100000);
 p.transactions=[{id:'paid',description:'Paid',date:'2026-10-02',kind:'transfer',status:'cleared',entries:[{account:'cash',amount:-5000},{account:'card',amount:5000}]}];assert.equal(promoSummary(p,a,'2026-10-03').target,95000);
});
test('one-time budgets reserve their full amount in the chosen month and do not repeat; actuals replace allowance',()=>{
 let p=plan();p.accounts[1].opening=0;p=addOneTimeBudget(p,{id:'a',name:'Event A',month:'2026-10',amount:2000,entity:'household',account:'cash'});p=addOneTimeBudget(p,{id:'b',name:'Event B',month:'2026-10',amount:7000,entity:'household',account:'cash'});p.transactions=[{id:'spent',description:'Tickets',date:'2026-10-12',kind:'expense',category:'Event A',status:'cleared',entries:[{account:'cash',amount:-500}]}];
 const r=planningForecast(p,'2026-11-30');assert.equal(r.days.find(d=>d.date==='2026-10-31').closing.cash,91000);assert.equal(r.days.at(-1).closing.cash,91000);assert.equal(budgetMonth(p,'2026-11','household','2026-11-30').buckets.length,0);assert.equal(budgetMonth(p,'2026-10','household','2026-10-31').buckets[0].remaining,1500);
 p.start='2026-10-21';p.transactions=[];assert.equal(budgetMonth(p,'2026-10','household','2026-10-31').buckets[0].allowance,2000);
});
test('weekly calculator counts four/five charge dates, respects opening cutoff and leaves other months alone',()=>{
 assert.equal(weeklyDates('2026-10',5).length,5);assert.equal(weeklyDates('2026-11',5).length,4);assert.deepEqual(weeklyDates('2026-10',5,'2026-10-21'),['2026-10-23','2026-10-30']);
});
test('fresh opening reset replaces actuals, preserves future schedules and can exclude already-included reset-day activity',()=>{
 const p=plan();p.transactions=[{id:'old',date:'2026-10-15',description:'Old',kind:'expense',category:'Other',status:'cleared',entries:[{account:'cash',amount:-500}]}];p.schedules=[{id:'bill',name:'Bill',account:'cash',amount:-5000,frequency:'monthly',day:21,anchor:p.start}];const before=JSON.stringify(p),next=resetBaseline(p,'2026-10-21',{cash:200000,card:80000},['bill:2026-10-21']);validate(next);assert.equal(next.transactions.length,0);assert.equal(planningForecast(next,'2026-10-31').days.at(-1).closing.cash,200000);assert.equal(planningForecast(next,'2026-11-30').days.at(-1).closing.cash,195000);assert.equal(JSON.stringify(p),before);assert.throws(()=>resetBaseline(p,'2026-10-21',{cash:200000}));
});
test('annual summary excludes transfers from spending, separates owners and labels partial years and unknown loans',()=>{
 let p=plan();p.accounts[1].opening=-20000;p=installPaymentPlan(p,'card',{amount:10000,day:15,from:'cash',asOf:p.start});p.schedules.push({id:'salary',name:'Pay',account:'cash',amount:20000,frequency:'monthly',day:1,anchor:p.start});p.accounts.push({id:'business',name:'Business',type:'cash',entity:'business',opening:999999,reserve:0});const r=planningForecast(p,'2026-12-31'),s=annualSummary(p,r,2026,'household');assert.equal(s.partial,true);assert.equal(s.income,60000);assert.equal(s.spending,0);assert.equal(s.payments,20000);assert.equal(s.cash,140000);assert.equal(s.cardDebt,0);assert.equal(s.debtComplete,true);
 p.accounts.push({id:'loan',name:'Loan',type:'loan',entity:'household',opening:0,reserve:0,balanceUnknown:true,credit:{payoffQuote:123456}});assert.equal(annualSummary(p,planningForecast(p,'2026-12-31'),2026,'household').debtComplete,false);
});
test('credit validation rejects unknown schedule links, invalid APRs and broken funding, and links existing loan bills without a duplicate',()=>{
 const p=plan();p.accounts[1].credit.purchaseApr=-1;assert.throws(()=>validateCredit(p));p.accounts[1].credit.purchaseApr=0;p.accounts[1].credit.scheduleId='missing';assert.throws(()=>validateCredit(p));delete p.accounts[1].credit.scheduleId;assert.throws(()=>installPaymentPlan(p,'card',{amount:1000,day:15,from:'missing',asOf:p.start}));
 p.accounts.push({id:'loan',name:'Loan',type:'loan',entity:'household',opening:-500000,reserve:0,credit:{purchaseApr:0,referenceScheduleId:'loan-bill'}});p.schedules.push({id:'loan-bill',name:'Loan bill',frequency:'monthly',anchor:p.start,day:15,amount:-10000,account:'cash',category:'Loan'});const next=installPaymentPlan(p,'loan',{amount:10000,day:15,from:'cash',asOf:p.start});validateBudgets(validate(next));assert.equal(next.schedules.length,1);assert.equal(planningForecast(next,'2026-10-31').days.at(-1).closing.cash,90000);
});
test('sandbox keeps actual unspent targets instead of prorating again after its comparison date',()=>{
 const p=plan();p.budgets=[{id:'food',name:'Food',entity:'household',account:'cash',monthly:{'2026-10':20000}}];p.transactions=[{id:'food',description:'Food',date:'2026-10-10',kind:'expense',category:'Food',status:'cleared',entries:[{account:'cash',amount:-5000}]}];
 const snapshot=planningSnapshot(p,'2026-10-21');assert.equal(snapshot.budgets[0].overrides['2026-10'],15000);assert.equal(planningForecast(snapshot,'2026-10-31').days.at(-1).closing.cash,80000);assert.equal(planningForecast(p,'2026-10-31').days.at(-1).closing.cash,80000);
});
test('recorded statement interest replaces the calendar-month interest estimate once',()=>{
 const p=plan();p.accounts[1].credit.purchaseApr=36.5;p.transactions=[{id:'interest',description:'Statement interest',date:'2026-10-28',kind:'expense',category:'Interest',status:'cleared',entries:[{account:'card',amount:-2500}]}];const r=planningForecast(p,'2026-10-31');assert.equal(r.days.at(-1).closing.card,-102500);assert.equal(r.planned.filter(t=>t.creditInterest).length,0);
});
test('confirmed purchase grace period suppresses purchase interest without suppressing expired promotional interest',()=>{
 const p=plan(),a=p.accounts[1];a.credit={...a.credit,purchaseApr:36.5,purchaseGrace:true,promoBalance:50000,promoApr:0,promoEnd:'2026-10-15',postPromoApr:36.5,promoScope:'balance_transfer'};const r=planningForecast(p,'2026-10-31');assert.equal(r.planned.find(t=>t.creditInterest).entries[0].amount,-800);assert.equal(r.creditWarnings.length,0);
});
test('independent purchase and balance-transfer promotions expire separately without mixing purchase principal',()=>{
 const p=plan(),a=p.accounts[1];a.credit={...a.credit,purchaseApr:36.5,purchasePromoApr:0,purchasePromoEnd:'2026-10-15',promoBalance:50000,promoApr:0,promoStart:'2026-10-01',promoEnd:'2026-11-30',postPromoApr:36.5,promoScope:'balance_transfer'};
 p.transactions=[{id:'purchase',description:'Purchase',date:'2026-10-05',kind:'expense',category:'Other',status:'cleared',entries:[{account:'card',amount:-10000}]}];
 const r=planningForecast(p,'2026-10-31');assert.equal(r.days.at(-1).credit.card.promo,50000);assert.equal(r.days.at(-1).credit.card.interest,960);assert.equal(r.days.find(d=>d.date==='2026-10-15').credit.card.interest,0);
 a.credit.purchaseApr=null;assert.equal(planningForecast(p,'2026-10-31').days.at(-1).credit.card.missingFrom,'2026-10-16');
});
test('balance-transfer offers enforce processing deadlines and validate provisional terms without changing source balances',()=>{
 const p=plan();p.accounts.push({id:'target',name:'Target',type:'card',entity:'household',opening:0,reserve:0,credit:{purchaseApr:20,purchasePromoApr:0,purchasePromoEnd:'2027-11-04',promoApr:0,promoStart:'2026-11-04',promoEnd:'2028-08-04',promoScope:'balance_transfer',transferDeadline:'2026-12-31',transferFeePercent:null,termsProvisional:true,termsNotes:'Unconfirmed offer assumptions'}});
 validateCredit(p);const before=JSON.stringify(p),moved=transferScenario(p,'card','target',50000,1500);assert.equal(moved.accounts[2].credit.promoBalance,51500);assert.equal(JSON.stringify(p),before);
 p.start='2027-01-01';assert.throws(()=>transferScenario(p,'card','target',50000,0),/deadline/);
 p.accounts[2].credit.purchasePromoApr=null;assert.throws(()=>validateCredit(p),/purchase promotional APR/);
 p.accounts[2].credit.purchasePromoApr=0;p.accounts[2].credit.promoStart='2029-01-01';assert.throws(()=>validateCredit(p),/start/);
});
