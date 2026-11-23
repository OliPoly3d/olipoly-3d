const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../js/tax-rate.js');
const C = require('../js/ops-preview/finance-corrections.js');
const Cloud = require('../js/ops-preview/cloud.js');
const expense = {id:'original',type:'expense',entry_date:'2026-11-23',category:'Material',title:'Filament',amount:10,original_amount:40,business_use_percent:25,effective_version_at:'2026-11-23T10:00:00Z'};
const income = {...expense,type:'income',category:'Sales',amount:100,original_amount:100,sales_tax_rate:7,sales_tax_collected:7.01,sales_county:'Geauga',tax_exempt_sale:false,shipping_charged:5,accepted_commercial_snapshot:{accepted_commercial_breakdown:{shipping_in_taxable_subtotal:true}}};
const prepare = (entry,values,keys=Object.keys(values)) => C.prepare(entry,{...values,reason:'Correct source record'},new Set(keys));
test('details-only correction preserves recorded tax and mileage precision',()=>{
 const result=prepare(income,{sales_county:'Portage'});
 assert.equal(result.params.p_corrected_record.sales_tax_collected,7.01);
 assert.equal(result.kind,'metadata_only');
 assert.deepEqual(result.params.p_changed_fields,['sales_county']);
 const mileage={...expense,category:'Vehicle / Delivery Mileage',miles_driven:10,mileage_rate:.725,trip_purpose:'Supplies'};
 assert.equal(prepare(mileage,{notes:'Receipt checked'}).params.p_corrected_record.mileage_rate,.725);
});
test('financial corrections recalculate expense business share, mileage and taxable shipping',()=>{
 assert.equal(prepare(expense,{original_amount:80}).params.p_corrected_record.amount,20);
 const mileage={...expense,category:'Vehicle / Delivery Mileage',miles_driven:10,mileage_rate:.725,trip_purpose:'Supplies'};
 const corrected=prepare(mileage,{miles_driven:20,mileage_rate:.6751}).params.p_corrected_record;
 assert.equal(corrected.original_amount,13.5);assert.equal(corrected.amount,3.38);assert.equal(corrected.mileage_rate,.6751);
 assert.equal(prepare(income,{amount:110}).params.p_corrected_record.sales_tax_collected,8.05);
 assert.equal(prepare(income,{shipping_charged:10}).params.p_corrected_record.sales_tax_collected,7.7);
});
test('exemption and actual-tax override require explanations; invalid, empty and no-op edits fail',()=>{
 assert.throws(()=>prepare(income,{tax_exempt_sale:true}),/exemption reason/);
 const exempt=prepare(income,{tax_exempt_sale:true,tax_exempt_reason:'Resale certificate'});
 assert.equal(exempt.params.p_corrected_record.sales_tax_collected,0);assert.equal(exempt.params.p_corrected_record.sales_tax_rate,0);
 assert.throws(()=>prepare(income,{overrideEnabled:true,overrideAmount:6}),/override/);
 const override=prepare(income,{overrideEnabled:true,overrideAmount:6,overrideReason:'Actual receipt tax'});
 assert.equal(override.params.p_tax_override_enabled,true);assert.equal(override.params.p_corrected_record.sales_tax_collected,6);
 for(const values of [{},{amount:100},{amount:-1},{entry_date:'2026-02-30'},{receipt_link:'javascript:alert(1)'},{sales_tax_rate:21}]) assert.throws(()=>prepare(income,values));
});
test('correction retry uses the same identity after response loss and blocks a second save',async()=>{
 const store=new Map(),calls=[];
 let lost=true;
 const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 const client=Cloud.create({projectRef:Cloud.TEST_REF,url:`https://${Cloud.TEST_REF}.supabase.co`,publishableKey:'sb_publishable_fixture'},{storage,fetch:async(url,request)=>{
  if(url.includes('/auth/'))return{ok:true,json:async()=>({access_token:'fiction',expires_at:Date.now()/1000+3600,user:{id:'owner'}})};
  calls.push(JSON.parse(request.body));if(lost)throw new Error('Lost response');
  return{ok:true,json:async()=>({idempotent:true})};
 }});
 await client.auth('fiction@example.test','fiction');
 await assert.rejects(client.financeCorrect(prepare(expense,{original_amount:80}).params),/interrupted/);
 assert.ok(client.financeCorrectionPending());
 await assert.rejects(client.financeCorrect({}),/pending/);await assert.rejects(client.financeCreate({}),/pending/);
 lost=false;await client.financeCorrectionRetry();
 assert.deepEqual(calls[0],calls[1]);assert.equal(client.financeCorrectionPending(),null);
});
test('correction UI previews amounts, saves once, and shows server audit history safely',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
 const {JSDOM}=require(process.env.OPS_JSDOM_MODULE),root=path.resolve(__dirname,'..');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ops-finance-preview.html'),'utf8'),{url:'https://erp-test.example/ops-finance-preview.html?database=test',runScripts:'outside-only'});
 const w=dom.window,rows=[{...expense}],calls=[];
 for(const file of ['js/tax-rate.js','js/order-line-items.js','js/ops-preview/finance-model.js','js/ops-preview/finance-reports.js','js/ops-preview/finance-corrections.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 w.OliPolyOpsCloud={create:()=>({signedIn:()=>true,financePending:()=>false,financeCorrectionPending:()=>null,financeLoad:async()=>rows,load:async()=>({orders:[]}),financeCorrect:async params=>{
  calls.push(params);rows[0]={...rows[0],...params.p_corrected_record,is_corrected:true,correction_history:[{reason:'<script>source</script>',created_at:'2026-11-23',correction_kind:'reversal_replacement',changed_fields:{amount:{old:10,new:20}}}]};
 }})};
 w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance.js'),'utf8'));const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
 w.document.querySelector('[data-action="correct"]').click();
 const form=w.document.getElementById('correction-form');form.elements.original_amount.value='80';form.elements.original_amount.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.match(w.document.getElementById('correction-review').textContent,/20/);
 form.elements.reason.value='Receipt correction';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();
 assert.equal(calls.length,1);assert.equal(calls[0].p_corrected_record.amount,20);
 assert.match(w.document.getElementById('finance-rows').textContent,/Correction history · 1/);
 assert.equal(w.document.querySelector('#finance-rows script'),null);
 assert.match(w.document.getElementById('reports-content').textContent,/\$20.00/);
 assert.equal(w.document.getElementById('finance-correction').hidden,true);dom.window.close();
});
