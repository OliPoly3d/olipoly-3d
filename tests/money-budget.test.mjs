import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetMonth, billsMonth, shiftMonth, validateBudgets} from '../js/money-budget.mjs';
import {balances,validate} from '../js/money-engine.mjs';

function plan() {
  return {version: 1, start: '2026-10-16', accounts: [
    {id:'cash',entity:'household',type:'cash',opening:10000,reserve:0,name:'Cash'},
    {id:'card',entity:'household',type:'card',opening:-5000,reserve:0,name:'Card'},
    {id:'biz',entity:'business',type:'cash',opening:0,reserve:0,name:'Business'}
  ], transactions: [], schedules: [], budgets: [
    {id:'food',name:'Groceries',aliases:['GROCERY'],entity:'household',monthly:{'2026-10':31000,'2026-11':50000,'2026-12':0}},
    {id:'gas',name:'Gas',entity:'household',monthly:{'2026-10':6200,'2026-11':6000}}
  ]};
}
const expense = (id, amount, category, account='card', status='cleared', when='2026-10-20', expenseEntity) =>
  ({id,kind:'expense',date:when,description:id,entries:[{account,amount:-amount}],category,status,expenseEntity});

test('opening month uses inclusive proration; later months reset and zero differs from missing', () => {
  const p=plan();
  assert.equal(budgetMonth(p,'2026-10','household','2026-10-21').buckets[0].allowance,16000);
  assert.equal(budgetMonth(p,'2026-11','household','2026-11-01').buckets[0].allowance,50000);
  const dec=budgetMonth(p,'2026-12','household','2026-12-31');
  assert.equal(dec.buckets[0].allowance,0); assert.equal(dec.buckets[1].allowance,null);
  assert.equal(dec.missing,1);
  assert.equal(shiftMonth('2026-12',1),'2027-01');
});
test('cash/card purchases and pending consume one bucket; payments and future entries do not', () => {
  const p=plan();
  p.transactions=[expense('a',5000,'GROCERY'),expense('b',2000,'groceries','cash','pending'),expense('later',1000,'Groceries','card','cleared','2026-10-30'),
    {id:'pay',kind:'transfer',date:'2026-10-20',entries:[{account:'cash',amount:-5000},{account:'card',amount:5000}]}];
  const r=budgetMonth(p,'2026-10','household','2026-10-21');
  assert.equal(r.buckets[0].spent,7000);assert.equal(r.buckets[0].pending,2000);
  assert.equal(r.buckets[0].remaining,9000);assert.equal(r.outside.length,0);
});
test('two categorized card purchases survive a single full payoff without double spending', () => {
  const p=plan();p.accounts[0].opening=100000;p.accounts[1].opening=0;
  p.transactions=[expense('grocery',25000,'Groceries'),expense('gas',25000,'Gas')];
  validate(p);assert.deepEqual(balances(p,'2026-10-20'),{cash:100000,card:-50000,biz:0});
  const before=budgetMonth(p,'2026-10','household','2026-10-21');
  p.transactions.push({id:'payoff',description:'Card payoff',kind:'transfer',status:'cleared',date:'2026-10-21',entries:[{account:'cash',amount:-50000},{account:'card',amount:50000}]});
  validate(p);assert.deepEqual(balances(p,'2026-10-21'),{cash:50000,card:0,biz:0});
  const after=budgetMonth(p,'2026-10','household','2026-10-21');
  assert.deepEqual(after,before);assert.deepEqual(after.buckets.map(b=>[b.name,b.spent]),[['Groceries',25000],['Gas',25000]]);
  assert.equal(after.totals.spent,50000);
});
test('business expenses on personal cards stay separate; outside purchases remain visible', () => {
  const p=plan();p.transactions=[expense('biz',2000,'Groceries','card','cleared','2026-10-20','business'),expense('other',500,'Unassigned')];
  const r=budgetMonth(p,'2026-10','household','2026-10-31');
  assert.equal(r.totals.spent,0);assert.equal(r.outside.length,1);
  assert.equal(budgetMonth(p,'2026-10','business','2026-10-31').outside[0].id,'biz');
});
test('overspend stays negative; monthly override is effective amount and never prorated twice', () => {
  const p=plan();p.budgets[0].overrides={'2026-10':1000};p.transactions=[expense('a',1500,'Groceries')];
  const r=budgetMonth(p,'2026-10','household','2026-10-31');
  assert.equal(r.buckets[0].allowance,1000);assert.equal(r.buckets[0].remaining,-500);
  assert.equal(budgetMonth(p,'2026-11','household','2026-11-30').buckets[0].remaining,50000);
});
test('bill occurrence links once to actual with changed date/amount, tracks pending and excludes pre-opening bills', () => {
  const p=plan();p.schedules=[{id:'electric',name:'Electric',account:'cash',amount:-10000,frequency:'monthly',anchor:'2026-10-01',day:2,estimated:true},
    {id:'net',name:'Internet',account:'cash',amount:-5000,frequency:'monthly',anchor:'2026-10-01',day:28}];
  p.transactions=[{...expense('bill',4900,'Internet','cash','pending','2026-11-01'),scheduleKey:'net:2026-10-28'}];
  const r=billsMonth(p,'2026-10','household','2026-10-29');
  assert.equal(r.length,1);assert.equal(r[0].actual.id,'bill');assert.equal(r[0].state,'pending');
  const nov=billsMonth(p,'2026-11','household','2026-11-03');
  assert.equal(nov.length,2);assert.equal(nov[0].state,'unrecorded');
});
test('invalid or ambiguous budgets are rejected and calculations do not mutate source', () => {
  const p=plan(),before=JSON.stringify(p);budgetMonth(p,'2026-10','household','2026-10-31');assert.equal(JSON.stringify(p),before);
  p.budgets[0].monthly['2026-11']=-1;assert.throws(()=>validateBudgets(p));
  p.budgets[0].monthly['2026-11']=100;p.budgets[1].aliases=['GROCERY'];assert.throws(()=>validateBudgets(p));
});
