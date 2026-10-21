// Run with MONEY_JSDOM_MODULE pointing to jsdom@26.1.0/lib/api.js outside the repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {setupDashboard} from '../js/money-dashboard.mjs';

const dependency = process.env.MONEY_JSDOM_MODULE;
test('dashboard tabs, targets, bills, pending spending and privacy clearing', {skip: !dependency}, async () => {
  const {JSDOM} = await import(pathToFileURL(dependency).href);
  const dom = new JSDOM(fs.readFileSync(new URL('../money.html', import.meta.url), 'utf8'), {url:'https://example.test/money.html'});
  const saved = Object.fromEntries(['window','document','Node','FormData'].map(k=>[k,globalThis[k]]));
  for(const k of Object.keys(saved))globalThis[k]=dom.window[k];
  try {
    const m={version:1,start:'2026-10-16',accounts:[{id:'cash',name:'Cash',entity:'household',type:'cash',opening:0,reserve:0}],budgets:[{id:'food',name:'Groceries',entity:'household',monthly:{'2026-10':31000,'2026-11':50000}}],transactions:[{id:'purchase',kind:'expense',date:'2026-10-20',status:'pending',category:'Groceries',entries:[{account:'cash',amount:-1000}]}],schedules:[{id:'bill',name:'Electric',account:'cash',amount:-10000,frequency:'monthly',anchor:'2026-10-01',day:28}],unscheduledBills:[{name:'Phone',entity:'household',reason:'Amount unknown'}]};
    let target,recorded;
    const dashboard=setupDashboard({getModel:()=>m,today:()=> '2026-10-21',saveTarget:async(...args)=>target=args,record:t=>recorded=t,action:fn=>fn()});
    dashboard.render();
    assert.match(document.getElementById('buckets').textContent,/\$150.00 left/);
    assert.match(document.getElementById('buckets').textContent,/\$10.00 pending included/);
    assert.equal(document.getElementById('budgetTrend').children.length,6);
    document.getElementById('tab-bills').click();
    assert.equal(document.getElementById('view-budget').hidden,true);
    assert.equal(document.getElementById('view-bills').hidden,false);
    assert.match(document.getElementById('unknownBills').textContent,/Phone/);
    document.querySelector('#billList button').click();
    assert.equal(recorded.scheduleKey,'bill:2026-10-28');
    assert.equal(document.getElementById('view-activity').hidden,false);
    document.querySelector('#buckets button').click();
    assert.equal(document.getElementById('budgetForm').closest('details').open,true);
    const f=document.getElementById('budgetForm'); f.elements.amount.value='175.00';
    f.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await Promise.resolve();assert.deepEqual(target,['food','2026-10','175.00']);
    document.getElementById('nextMonth').click();
    assert.equal(document.getElementById('budgetMonth').value,'2026-11');
    assert.match(document.getElementById('buckets').textContent,/\$500.00 left/);
    dashboard.clear();
    for(const id of ['buckets','budgetMetrics','billList','budgetTrend','outsideSpending','unknownBills']) assert.equal(document.getElementById(id).children.length,0);
  } finally {
    dom.window.close();for(const [k,v] of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
  }
});

test('full page loads, saves a purchase once and clears private views on sign-out', {skip: !dependency}, async () => {
  const {JSDOM} = await import(pathToFileURL(dependency).href);
  const dom = new JSDOM(fs.readFileSync(new URL('../money.html', import.meta.url), 'utf8'), {url:'https://example.test/money.html'});
  const keys=['window','document','Node','FormData','fetch'];
  const original=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  for(const k of ['window','document','Node','FormData'])globalThis[k]=dom.window[k];
  let session={user:{id:'test-owner'}},revision=0;
  let model={version:1,start:'2026-10-16',accounts:[{id:'cash',name:'Cash',entity:'household',type:'cash',opening:100000,reserve:0}],transactions:[],schedules:[],budgets:[{id:'food',name:'Groceries',entity:'household',monthly:{'2026-10':31000}}]};
  dom.window.OliPolyAuth={SUPABASE_URL:'https://example.test',recover:async()=>session,authHeaders:()=>({}),logout:()=>{session=null;}};
  globalThis.fetch=async(url,options={})=>{
    let body;
    if(options.method==='PATCH'){const change=JSON.parse(options.body);model=change.body;revision=change.revision;body=[{body:model,revision}];}
    else body=url.includes('money_access')?[{user_id:'test-owner'}]:[{body:model,revision}];
    return {ok:true,json:async()=>body};
  };
  try {
    await import('../js/money-app.mjs?dom-test');
    assert.equal(document.getElementById('app').hidden,false);
    document.getElementById('budgetMonth').value='2026-10';
    document.getElementById('budgetMonth').dispatchEvent(new dom.window.Event('change'));
    await new Promise(resolve=>setTimeout(resolve,0));
    document.getElementById('addExpense').click();
    const form=document.getElementById('transactionForm');
    for(const [key,value] of Object.entries({date:'2026-10-20',description:'Market',kind:'expense',account:'cash',amount:'25.00',category:'Groceries',status:'pending'}))form.elements[key].value=value;
    form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(model.transactions.length,1);
    assert.equal(revision,1);
    assert.match(document.getElementById('message').textContent,/Saved/);
    assert.match(document.getElementById('buckets').textContent,/\$135.00 left/);
    assert.match(document.getElementById('accounts').textContent,/\$975.00/);
    document.getElementById('logout').click();
    assert.equal(document.getElementById('app').hidden,true);
    assert.equal(document.getElementById('buckets').children.length,0);
    assert.equal(document.getElementById('accounts').children.length,0);
    assert.equal(document.getElementById('budgetRing').hasAttribute('aria-label'),false);
  } finally {
    dom.window.close();for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
  }
});
