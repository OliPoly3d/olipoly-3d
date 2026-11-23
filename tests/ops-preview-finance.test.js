const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/ops-preview/finance-model.js');
const C = require('../js/ops-preview/cloud.js');
const fs = require('node:fs');
const path = require('node:path');
const values = {entry_date:'2026-11-22',category:'Material',title:'Filament purchase',original_amount:'40',business_use_percent:'25',receipt_link:'https://drive.google.com/example'};

test('expense keeps full cost and business portion, including zero percent', () => {
  assert.equal(M.expense(values).original_amount,40);
  assert.equal(M.expense(values).amount,10);
  assert.equal(M.expense({...values,business_use_percent:'0'}).amount,0);
  assert.equal(M.expense({...values,business_use_percent:'100'}).amount,40);
});
test('mileage preserves four decimal rate and total miles without doubling a round trip', () => {
  const result = M.expense({...values,category:'Vehicle / Delivery Mileage',miles_driven:'12.5',mileage_rate:'.725',trip_purpose:'Post office',round_trip:'yes'});
  assert.equal(result.original_amount,9.06);
  assert.equal(result.amount,9.06);
  assert.equal(result.mileage_rate,.725);
  assert.equal(result.miles_driven,12.5);
  assert.equal(result.round_trip,true);
});
test('invalid values and unsafe receipt links cannot be submitted', () => {
  for (const change of [{original_amount:'NaN'},{original_amount:'-1'},{business_use_percent:'101'},{entry_date:'2026-02-30'},{receipt_link:'javascript:alert(1)'},{category:'toString'}]) {
    assert.throws(() => M.expense({...values,...change}));
  }
  assert.throws(() => M.expense({...values,category:'Vehicle / Delivery Mileage',miles_driven:5,mileage_rate:.7,trip_purpose:''}));
});
test('CSV quotes references and guards formula injection without changing numeric negatives', () => {
  const csv = M.csv([{title:'=HYPERLINK("bad")',notes:'text, with commas',amount:-2}]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"text, with commas"'));
  assert.ok(csv.includes('"-2"'));
});
test('Finance reads the effective ledger and never retries an ambiguous expense save', async () => {
  const saved = new Map(), calls = [];
  const config = {projectRef:C.TEST_REF,url:`https://${C.TEST_REF}.supabase.co`,publishableKey:'sb_publishable_fixture'};
  const storage = {getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  const client = C.create(config,{storage,fetch:async (url,options) => {
    calls.push({url,body:JSON.parse(options.body)});
    if (url.includes('/auth/')) return {ok:true,json:async()=>({access_token:'fiction',refresh_token:'fiction',expires_at:Date.now()/1000+3600,user:{id:'test-owner'}})};
    if (url.endsWith('/get_effective_financial_entries')) return {ok:true,json:async()=>[{id:'entry-1',amount:40}]};
    throw new Error('Response lost after commit');
  }});
  await client.auth('fiction@example.test','fictional');
  assert.equal((await client.financeLoad())[0].id,'entry-1');
  await assert.rejects(client.financeCreate(M.expense(values)),/Connection interrupted/);
  assert.equal(client.financePending(),true);
  await assert.rejects(client.financeCreate(M.expense(values)),/Review the previous/);
  assert.equal(calls.filter(call=>call.url.endsWith('/create_manual_financial_entry')).length,1);
  client.financeReviewed();
  assert.equal(client.financePending(),false);
});

test('Finance form saves a purchase and mileage through its normal submit controls', {skip: !process.env.OPS_JSDOM_MODULE}, async () => {
  const {JSDOM} = require(process.env.OPS_JSDOM_MODULE);
  const root = path.resolve(__dirname,'..');
  const dom = new JSDOM(fs.readFileSync(path.join(root,'ops-finance-preview.html'),'utf8'),{url:'https://erp-test.example/ops-finance-preview.html?database=test',runScripts:'outside-only'});
  const w = dom.window, rows = [], calls = [];
  w.eval(fs.readFileSync(path.join(root,'js/order-line-items.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance-model.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance-reports.js'),'utf8'));
  w.OliPolyOpsCloud = {create:()=>({signedIn:()=>true,financePending:()=>false,
    load:async()=>({orders:[]}),
    financeLoad:async()=>rows,financeCreate:async entry=>{calls.push(entry);rows.push({...entry,id:'entry-'+calls.length});return {entry_id:'entry-'+calls.length};}})};
  w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance.js'),'utf8'));
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  await flush();
  const form = w.document.getElementById('expense-form');
  form.elements.title.value = 'A purchased box';
  form.elements.original_amount.value = '40';
  form.elements.business_use_percent.value = '25';
  form.dispatchEvent(new w.Event('input',{bubbles:true}));
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].amount,10);
  assert.match(w.document.getElementById('finance-rows').textContent,/A purchased box/);
  form.elements.category.value = 'Vehicle / Delivery Mileage';
  form.elements.category.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(form.elements.original_amount.disabled,true);
  assert.equal(form.elements.miles_driven.disabled,false);
  form.elements.title.value = 'Supply pickup';
  form.elements.trip_purpose.value = 'Supply pickup';
  form.elements.miles_driven.value = '12.5';
  form.elements.mileage_rate.value = '.725';
  form.elements.round_trip.checked = true;
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,2);
  assert.equal(calls[1].amount,9.06);
  assert.equal(calls[1].mileage_rate,.725);
  assert.match(w.document.getElementById('finance-rows').textContent,/Supply pickup/);
  dom.window.close();
});

test('Finance loads more than the API page limit without omitting older entries', async () => {
  const pages = [];
  const data = new Map();
  const client = C.create({projectRef:C.TEST_REF,url:`https://${C.TEST_REF}.supabase.co`,publishableKey:'sb_publishable_fixture'}, {
    storage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},
    fetch:async (url,request) => {
      if (url.includes('/auth/')) return {ok:true,json:async()=>({access_token:'fiction',expires_at:Date.now()/1000+3600,user:{id:'test-owner'}})};
      pages.push(request.headers.Range);
      const offset = Number(request.headers.Range.split('-')[0]);
      return {ok:true,json:async()=>Array.from({length:offset ? 1 : 500},(_,i)=>({id:'entry-'+(offset+i),amount:1}))};
    }
  });
  await client.auth('fiction@example.test','fictional');
  const rows = await client.financeLoad();
  assert.equal(rows.length,501);
  assert.equal(rows[500].id,'entry-500');
  assert.deepEqual(pages,['0-499','500-999']);
});
