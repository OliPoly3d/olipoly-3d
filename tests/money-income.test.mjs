import test from 'node:test';import assert from 'node:assert/strict';
import {validate,balances,occurrences} from '../js/money-engine.mjs';
import {addOneTimeIncome,incomingOwner} from '../js/money-income.mjs';
import {planningForecast,expectedRows} from '../js/money-planning.mjs';
import {annualSummary} from '../js/money-insights.mjs';
import {removeActual,changeExpectation} from '../js/money-actions.mjs';
const base=()=>({version:1,start:'2026-10-01',accounts:[{id:'home',name:'Home',type:'cash',entity:'household',opening:100000,reserve:0},{id:'shop',name:'Shop',type:'cash',entity:'business',opening:50000,reserve:0},{id:'card',name:'Card',type:'card',entity:'household',opening:0,reserve:0}],transactions:[],schedules:[],budgets:[]});
const values={id:'gift',when:'2026-10-25',description:'Gift',amount:10000,account:'home',incomeType:'gift'};
test('multiple expected receipts occur once, can move dates, and carry cash forward without repeating',()=>{
 const source=base(),before=JSON.stringify(source);let p=addOneTimeIncome(source,values);p=addOneTimeIncome(p,{...values,id:'friend',incomeType:'friend',amount:2500});
 assert.equal(p.transactions.length,0);assert.equal(occurrences(p,'2026-12-31').length,2);assert.equal(planningForecast(p,'2026-12-31').days.at(-1).closing.home,112500);assert.equal(JSON.stringify(source),before);
 p.schedules[0].overrides={'2026-10-25':{date:'2026-11-03',amount:10001}};assert.equal(expectedRows(p,'2026-10','household','income').length,1);assert.equal(expectedRows(p,'2026-11','household','income').length,1);assert.equal(occurrences(p,'2026-12-31').length,2);
});
test('recording an adjusted expected deposit replaces it once; direct pending income appears in income totals',()=>{
 let p=addOneTimeIncome(base(),values);const expected=occurrences(p,'2026-10-31')[0];p.transactions.push({...expected,id:'received',date:'2026-10-26',status:'cleared',entries:[{account:'home',amount:9998}]});
 assert.equal(planningForecast(p,'2026-11-30').days.at(-1).closing.home,109998);assert.equal(expectedRows(p,'2026-10','household','income').length,1);assert.equal(expectedRows(p,'2026-10','household','income')[0].actual.id,'received');
 p=addOneTimeIncome(p,{...values,id:'pending',incomeType:'windfall',amount:1500,status:'pending'});assert.equal(expectedRows(p,'2026-10','household','income').length,2);assert.equal(balances(p,'2026-10-31',true).home,109998);assert.equal(balances(p,'2026-10-31').home,111498);
});
test('owner payouts transfer cash between owners and never add business revenue or duplicate spending',()=>{
 const p=addOneTimeIncome(base(),{...values,incomeType:'distribution',from:'shop'}),r=planningForecast(p,'2026-11-30'),end=r.days.at(-1);
 assert.equal(end.closing.home,110000);assert.equal(end.closing.shop,40000);assert.equal(end.closing.home+end.closing.shop,150000);
 assert.equal(expectedRows(p,'2026-10','household','income').length,1);assert.equal(expectedRows(p,'2026-10','business','income').length,0);assert.equal(expectedRows(p,'2026-10','business','bills').length,1);
 for(const owner of ['household','business']){const summary=annualSummary(p,r,2026,owner);assert.equal(summary.income,0);assert.equal(summary.spending,0);}
 const actual=addOneTimeIncome(base(),{...values,incomeType:'distribution',from:'shop',status:'cleared'});assert.equal(incomingOwner(actual,actual.transactions[0]),'household');assert.equal(expectedRows(actual,'2026-10','household','income')[0].actual.id,'gift');
});
test('one-time income removal can return to budget or skip without creating a recurring series',()=>{
 const p=addOneTimeIncome(base(),{...values,status:'cleared'}),returned=removeActual(p,'gift','plan');assert.equal(returned.transactions.length,0);assert.equal(occurrences(returned,'2026-12-31').length,1);
 const expected=occurrences(returned,'2026-12-31')[0],skipped=changeExpectation(returned,expected.scheduleKey,'skip');assert.equal(occurrences(skipped,'2026-12-31').length,0);assert.equal(occurrences(changeExpectation(skipped,expected.scheduleKey,'restore'),'2026-12-31').length,1);
});
test('invalid payout routes and invalid receipts fail without mutating the source',()=>{
 const p=base(),before=JSON.stringify(p);for(const change of [{amount:0},{when:'2026-09-30'},{account:'card'},{incomeType:'distribution',from:'home'},{incomeType:'distribution',from:'shop',account:'shop'}])assert.throws(()=>addOneTimeIncome(p,{...values,...change}));assert.equal(JSON.stringify(p),before);
 const payout=addOneTimeIncome(p,{...values,incomeType:'distribution',from:'shop'});payout.schedules[0].overrides={'2026-10-25':{amount:-10000,account:'card'}};assert.throws(()=>validate(payout),/Owner distributions/);
});
