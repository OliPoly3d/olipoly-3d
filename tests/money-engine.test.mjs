import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,cents,forecast,monthly,balances,spending,occurrences} from '../js/money-engine.mjs';
const account=(id,type='cash',opening=100000)=>({id,name:id,type,entity:'household',opening,reserve:10000});
const base=()=>({version:1,start:'2026-10-16',accounts:[account('checking'),account('card','card',-5000)],transactions:[],schedules:[]});
test('cash and category totals distinguish credit purchases and card payments',()=>{
 const m=base();m.transactions=[{id:'buy',date:m.start,description:'Food',kind:'expense',category:'Groceries',status:'cleared',entries:[{account:'card',amount:-2500}]},{id:'pay',date:'2026-10-17',description:'Pay card',kind:'transfer',status:'pending',entries:[{account:'checking',amount:-7500},{account:'card',amount:7500}]}];
 validate(m);assert.deepEqual(balances(m,'2026-10-18'),{checking:92500,card:0});assert.equal(balances(m,'2026-10-18',true).checking,100000);assert.equal(spending(m,'2026-10')['household: Groceries'],2500);
});
test('matching actual replaces a schedule even when date or amount changes',()=>{
 const m=base();m.schedules=[{id:'bill',name:'Bill',frequency:'monthly',day:20,anchor:'2026-10-20',account:'checking',amount:-10000}];
 m.transactions=[{id:'actual',scheduleKey:'bill:2026-10-20',description:'Bill',date:'2026-10-21',status:'cleared',kind:'expense',category:'Utilities',entries:[{account:'checking',amount:-11000}]}];
 assert.equal(forecast(m,'2026-10-31').at(-1).closing.checking,89000);assert.equal(occurrences(m,'2026-11-30').length,1);
 m.transactions.push({...m.transactions[0],id:'duplicate'});assert.throws(()=>validate(m),/already recorded/);
});
test('first-pay stipend occurs once in a three-paycheck month; effective pay increase persists',()=>{
 const m=base();m.schedules=[{id:'pay',name:'Pay',frequency:'biweekly',anchor:'2026-10-02',account:'checking',amount:100000,firstPayBonus:4000,changes:[{date:'2026-11-01',amount:140000}]}];
 const events=occurrences(m,'2026-11-30');assert.deepEqual(events.map(x=>[x.date,x.entries[0].amount]),[['2026-10-16',100000],['2026-10-30',100000],['2026-11-13',144000],['2026-11-27',140000]]);
});
test('monthly day 31 clamps to month end without drift; year transition carries balances',()=>{
 const m=base();m.schedules=[{id:'fee',name:'Fee',frequency:'monthly',day:31,anchor:'2026-10-31',account:'checking',amount:-1000}];
 assert.deepEqual(occurrences(m,'2027-03-31').map(x=>x.date),['2026-10-31','2026-11-30','2026-12-31','2027-01-31','2027-02-28','2027-03-31']);
 const sums=monthly(forecast(m,'2027-03-31'),'checking');assert.equal(sums[3].opening,sums[2].closing);assert.equal(sums.at(-1).closing,94000);
});
test('same-day low exposes withdrawal before deposit despite positive closing',()=>{
 const m=base();m.schedules=[{id:'in',name:'Pay',frequency:'monthly',day:16,anchor:m.start,account:'checking',amount:200000},{id:'out',name:'Bill',frequency:'monthly',day:16,anchor:m.start,account:'checking',amount:-150000}];
 const day=forecast(m,m.start)[0];assert.equal(day.low.checking,-50000);assert.equal(day.closing.checking,150000);
});
test('cross-entity funding is a transfer; personally charged business expense belongs to business',()=>{
 const m=base();m.accounts.push({...account('business'),entity:'business',opening:0});m.transactions=[{id:'fund',description:'Owner funding',kind:'transfer',date:m.start,status:'cleared',funding:'contribution',entries:[{account:'checking',amount:-20000},{account:'business',amount:20000}]},{id:'tool',description:'Tool',kind:'expense',expenseEntity:'business',category:'Software',funding:'contribution',date:m.start,status:'cleared',entries:[{account:'card',amount:-2000}]}];
 validate(m);assert.equal(balances(m,m.start).business,20000);assert.deepEqual(spending(m,'2026-10'),{'business: Software':2000});
});
test('reject invalid dates, fractional cents, broken transfers, duplicate IDs and pre-opening transactions',()=>{
 assert.equal(cents('12.34'),1234);assert.throws(()=>cents('1.234'));const m=base();m.transactions=[{id:'x',description:'Bad',date:'2026-02-30',kind:'adjustment',status:'cleared',entries:[{account:'checking',amount:10}]}];assert.throws(()=>validate(m));m.transactions[0].date='2026-10-15';assert.throws(()=>validate(m),/predates/);m.transactions=[];m.accounts.push(m.accounts[0]);assert.throws(()=>validate(m),/duplicate/);
});
test('36 month forecast remains deterministic and does not mutate source',()=>{
 const m=base(),before=JSON.stringify(m);const d=forecast(m,'2029-10-15');assert.equal(d.length,1096);assert.equal(d.at(-1).closing.checking,100000);assert.equal(JSON.stringify(m),before);
});
