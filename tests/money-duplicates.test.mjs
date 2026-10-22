import test from 'node:test';import assert from 'node:assert/strict';
import {possibleDuplicates} from '../js/money-duplicates.mjs';
import {ensureMonthlyBaselines,saveForecastSnapshot} from '../js/money-confidence.mjs';
const plan=()=>({version:1,start:'2026-10-01',accounts:[{id:'cash',name:'Cash',type:'cash',entity:'household',opening:100000,reserve:0},{id:'card',name:'Card',type:'card',entity:'household',opening:0,reserve:0}],transactions:[],schedules:[],budgets:[]});
const expense=(overrides={})=>({id:'new',date:'2026-10-20',description:'Market',kind:'expense',category:'Food',status:'cleared',entries:[{account:'card',amount:-25000}],...overrides});
test('duplicate suggestions find pending/posted purchases, tolerate matching cents, exclude self and unrelated accounts or dates',()=>{
 const m=plan();m.transactions=[expense({id:'old',status:'pending'})];assert.equal(possibleDuplicates(m,expense()).length,1);assert.equal(possibleDuplicates(m,expense({id:'old'})).length,0);
 assert.equal(possibleDuplicates(m,expense({description:'Other shop'})).length,1);
 assert.equal(possibleDuplicates(m,expense({date:'2026-10-23',description:'Market purchase',entries:[{account:'card',amount:-25003}]})).length,1);
 assert.equal(possibleDuplicates(m,expense({date:'2026-10-24'})).length,0);
 assert.equal(possibleDuplicates(m,expense({entries:[{account:'cash',amount:-25000}]})).length,0);
 assert.equal(possibleDuplicates(m,expense({entries:[{account:'card',amount:-25006}]})).length,0);
 assert.equal(m.transactions.length,1);
});
test('same-account expected bills can match variable amounts, while matched, skipped, stopped and paused events do not warn',()=>{
 const m=plan();m.schedules=[{id:'bill',name:'Electric',category:'Utilities',frequency:'monthly',anchor:m.start,day:22,account:'cash',amount:-10000}];const c=expense({description:'Electric bill',entries:[{account:'cash',amount:-12725}]});
 const matches=possibleDuplicates(m,c);assert.equal(matches.length,1);assert.equal(matches[0].expected,true);assert.equal(matches[0].transaction.scheduleKey,'bill:2026-10-22');
 assert.equal(possibleDuplicates(m,{...c,scheduleKey:'bill:2026-10-22'}).length,0);
 for(const change of [{skipped:['2026-10-22']},{enabled:false},{stoppedFrom:'2026-10-01'}]){m.schedules[0]={...m.schedules[0],...change};assert.equal(possibleDuplicates(m,c).length,0);}
});
test('card payments remain distinct from purchases, refunds and opposite-direction transfers',()=>{
 const m=plan(),payment={id:'p',date:'2026-10-20',description:'Card payment',kind:'transfer',status:'cleared',entries:[{account:'cash',amount:-25000},{account:'card',amount:25000}]};m.transactions=[payment];assert.equal(possibleDuplicates(m,expense()).length,0);assert.equal(possibleDuplicates(m,{...payment,id:'p2'}).length,1);assert.equal(possibleDuplicates(m,{...payment,id:'p2',entries:[{account:'card',amount:-25000},{account:'cash',amount:25000}]}).length,0);assert.equal(possibleDuplicates(m,{...expense(),kind:'income',entries:[{account:'card',amount:25000}]}).length,0);
});
test('automatic baselines capture represented owners once, preserve manual baselines and never fabricate past or future months',()=>{
 let m=plan();m.accounts.push({id:'shop',name:'Shop',type:'cash',entity:'business',opening:20000,reserve:0});m=saveForecastSnapshot(m,'2026-11','household','2026-10-01');const original=JSON.stringify(m);
 const next=ensureMonthlyBaselines(m,'2026-10-22');assert.equal(JSON.stringify(m),original);assert.equal(next.forecastSnapshots.length,3);assert.equal(next.forecastSnapshots.filter(s=>s.source==='automatic').length,2);assert.deepEqual(next.transactions,m.transactions);assert.deepEqual(next.accounts,m.accounts);assert.ok(next.forecastSnapshots.filter(s=>s.source==='automatic').every(s=>s.asOf==='2026-10-22'));assert.equal(ensureMonthlyBaselines(next,'2026-10-31'),next);
 const november=ensureMonthlyBaselines(next,'2026-11-01');assert.equal(november.forecastSnapshots.length,4);assert.deepEqual(november.forecastSnapshots.find(s=>s.month==='2026-11'&&s.entity==='household'),m.forecastSnapshots[0]);assert.ok(!november.forecastSnapshots.some(s=>s.month==='2026-09'||s.month==='2026-12'));
 assert.equal(ensureMonthlyBaselines(m,'2026-09-30'),m);
 const january=ensureMonthlyBaselines(november,'2027-01-02');assert.ok(january.forecastSnapshots.some(s=>s.month==='2027-01'&&s.asOf==='2027-01-02'));assert.ok(!january.forecastSnapshots.some(s=>s.month==='2026-12'));
});

test('expected full-card payment warnings use the real projected amount rather than a schedule placeholder',()=>{
 const m=plan();m.accounts[1].opening=-25000;m.accounts[1].credit={purchaseApr:0,mode:'full',scheduleId:'pay',dueDay:22,paymentAmount:0};m.schedules=[{id:'pay',name:'Full card payment',account:'cash',to:'card',amount:-1,frequency:'monthly',anchor:m.start,day:22}];
 const candidate={id:'manual',kind:'transfer',date:'2026-10-21',description:'Online transfer',entries:[{account:'cash',amount:-25000},{account:'card',amount:25000}]};
 const found=possibleDuplicates(m,candidate);assert.equal(found.length,1);assert.equal(found[0].transaction.entries[0].amount,-25000);assert.equal(found[0].expected,true);
 assert.equal(possibleDuplicates(m,{...candidate,entries:[{account:'cash',amount:-1},{account:'card',amount:1}]}).length,0);
});
