import test from 'node:test';import assert from 'node:assert/strict';
import {occurrences,balances} from '../js/money-engine.mjs';
import {expectedRows} from '../js/money-planning.mjs';
import {changeExpectation,removeActual} from '../js/money-actions.mjs';
function plan(){return {version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Cash',type:'cash',entity:'household',opening:100000,reserve:0},{id:'card',name:'Card',type:'card',entity:'household',opening:-5000,reserve:0}],transactions:[{id:'actual',scheduleKey:'bill:2026-10-20',date:'2026-10-21',description:'Actual bill',kind:'expense',status:'cleared',category:'Electric',entries:[{account:'cash',amount:-10501}]}],schedules:[{id:'bill',name:'Electric',account:'cash',amount:-10000,frequency:'monthly',anchor:'2026-10-01',day:20}],budgets:[]};}
test('put back in budget removes actual, preserves exact changed amount/date, and creates one expected occurrence',()=>{
 const p=plan(),before=JSON.stringify(p),next=removeActual(p,'actual','plan');assert.equal(JSON.stringify(p),before);
 assert.equal(next.transactions.length,0);assert.equal(balances(next,'2026-10-31').cash,100000);
 const events=occurrences(next,'2026-11-30');assert.equal(events.length,2);assert.equal(events[0].date,'2026-10-21');assert.equal(events[0].entries[0].amount,-10501);assert.equal(events[1].entries[0].amount,-10000);
});
test('delete matched actual skips only that occurrence, preserves later repeats, and can restore',()=>{
 const next=removeActual(plan(),'actual','delete');assert.equal(occurrences(next,'2026-10-31').length,0);assert.equal(occurrences(next,'2026-11-30').length,1);
 const skipped=expectedRows(next,'2026-10','household','bills')[0];assert.equal(skipped.skipped,true);
 const restored=changeExpectation(next,skipped.scheduleKey,'restore');assert.equal(occurrences(restored,'2026-10-31').length,1);
});
test('skip and stop preserve recorded history; stopped history stays visible',()=>{
 const p=plan(),stopped=changeExpectation(p,'bill:2026-10-20','stop');assert.equal(stopped.transactions.length,1);assert.equal(occurrences(stopped,'2026-12-31').length,0);
 assert.equal(expectedRows(stopped,'2026-10','household','bills')[0].actual.id,'actual');
 const restored=removeActual(stopped,'actual','plan');assert.equal(occurrences(restored,'2026-11-30').length,1);assert.equal(restored.schedules[0].stoppedFrom,'2026-10-20');
});
test('one-off return creates one editable expectation; deleting ordinary actual creates none',()=>{
 const p=plan();delete p.transactions[0].scheduleKey;p.schedules=[];
 const restored=removeActual(p,'actual','plan');assert.equal(occurrences(restored,'2026-12-31').length,1);assert.equal(restored.schedules[0].end,'2026-10-21');
 assert.equal(removeActual(p,'actual','delete').schedules.length,0);
});
test('paired transfer deletion removes both postings; invalid modes/adjustment plans fail',()=>{
 const p=plan();p.transactions[0]={...p.transactions[0],kind:'transfer',entries:[{account:'cash',amount:-5000},{account:'card',amount:5000}]};
 const next=removeActual(p,'actual','delete');assert.deepEqual(balances(next,'2026-10-31'),{cash:100000,card:-5000});
 assert.throws(()=>removeActual(p,'missing','delete'));assert.throws(()=>removeActual(p,'actual','invalid'));
 p.transactions[0].kind='adjustment';p.transactions[0].entries=[{account:'cash',amount:10}];assert.throws(()=>removeActual(p,'actual','plan'));
});
