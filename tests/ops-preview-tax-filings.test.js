const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('../js/ops-preview/tax-filings-model.js'),Cloud=require('../js/ops-preview/cloud.js');
const sale={id:'sale',type:'income',entry_date:'2026-06-01',amount:100,shipping_charged:0,sales_tax_collected:7,sales_tax_rate:7,sales_county:'Portage'};
const range={start:'2026-01-01',end:'2026-06-30'};
const values={kind:'return',return_type:'original',filed_on:'2026-07-23',due_on:'2026-07-23',reported_tax:7,discount:0,charges:0,credits:0,review_note:'',confirmation:'UST-TEST',document_link:'',confirmed:true,reason:'Record test return'};
const context=()=>({...range,...T.summarize([], [sale],range.start,range.end),entries:[sale]});
test('semiannual and monthly periods suggest editable weekend-adjusted dates without extrapolating holidays',()=>{
 assert.deepEqual(T.period(2026,'H2'),{start:'2026-07-01',end:'2026-12-31',due:'2027-01-25'});
 assert.deepEqual(T.period(2026,'2'),{start:'2026-02-01',end:'2026-02-28',due:'2026-03-23'});
 assert.deepEqual(T.defaultPeriod('2026-11-23'),{year:2026,selection:'H1'});
 assert.deepEqual(T.defaultPeriod('2026-01-03'),{year:2025,selection:'H2'});
 assert.throws(()=>T.period(2026,'13'));assert.throws(()=>T.period(10000,'H1'));
});
test('filing preparation requires external confirmation and explains actual differences without changing source tax',()=>{
 const p=T.prepare(values,context());assert.equal(p.p_payload.reported_tax,7);assert.equal(p.p_expected_source.length,1);
 for(const change of [{confirmed:false},{reported_tax:8},{discount:.05},{reported_tax:NaN},{document_link:'javascript:alert(1)'},{filed_on:'2026-02-30'},{reported_tax:.001},{reason:''}])assert.throws(()=>T.prepare({...values,...change},context()));
 assert.equal(T.prepare({...values,reported_tax:8,review_note:'Portal adjustment'},context()).p_payload.reported_tax,8);
 assert.equal(sale.sales_tax_collected,7);
});
test('saved return sources stay frozen, correction/reallocation drift is detected and JSON key order is immaterial',()=>{
 const event={id:'return',event_no:1,period_start:range.start,period_end:range.end,kind:'return',payload:T.prepare(values,context()).p_payload,source:T.source([sale],range.start,range.end)};
 const reordered={...sale,accepted_commercial_snapshot:{a:1,b:{z:2,y:3}}};
 const other={...sale,accepted_commercial_snapshot:{b:{y:3,z:2},a:1}};
 assert.equal(T.fingerprint([reordered],range.start,range.end),T.fingerprint([other],range.start,range.end));
 let report=T.summarize([event],[sale],range.start,range.end);assert.equal(report.changed,false);
 report=T.summarize([event],[{...sale,sales_county:'Summit'}],range.start,range.end);assert.equal(report.changed,true);assert.equal(report.frozen.counties[0].name,'Portage');
 assert.equal(report.balance,7);assert.equal(report.overdue,true);
});
test('payments, refunds, voids and amendments reconcile in cents without entering business expenses',()=>{
 const filed={id:'return',event_no:1,period_start:range.start,period_end:range.end,kind:'return',payload:T.prepare(values,context()).p_payload,source:[sale]};
 const event=(id,event_no,kind,payload)=>({id,event_no,period_start:range.start,period_end:range.end,kind,payload});
 const rows=[filed,event('p1',2,'payment',{amount:4}),event('p2',3,'payment',{amount:3}),event('refund',4,'refund',{amount:1}),event('void',5,'void_payment',{target_id:'refund'})];
 const r=T.summarize(rows,[sale],range.start,range.end);assert.equal(r.paid,7);assert.equal(r.balance,0);assert.match(r.status,/paid/);assert.equal(r.current.total.expenses,0);
 const amended=event('amend',6,'return',{...filed.payload,reported_tax:6});amended.source=[sale];
 assert.equal(T.summarize([...rows,amended],[sale],range.start,range.end).balance,-1);
});
test('tax command retries the identical persisted identity after response loss; rejected commands clear safely',async()=>{
 const store=new Map(),calls=[];let lose=true,reject=false;
 const client=Cloud.create({projectRef:Cloud.TEST_REF,url:`https://${Cloud.TEST_REF}.supabase.co`,publishableKey:'sb_publishable_test'},{storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch:async(url,req)=>{
  if(url.includes('/auth/'))return{ok:true,json:async()=>({access_token:'test',expires_at:Date.now()/1000+3600,user:{id:'owner'}})};
  calls.push({url,body:req.body});if(lose)throw Error('Lost after commit');
  if(reject)return{ok:false,status:400,json:async()=>({message:'Server rejected save',code:'22023'})};
  return{ok:true,json:async()=>({id:'saved'})};
 }});
 await client.auth('fiction@example.test','fiction');await assert.rejects(client.taxSave(T.prepare(values,context())),/interrupted/);assert.ok(client.taxPending());
 await assert.rejects(client.taxSave(T.prepare(values,context())),/pending/);await assert.rejects(client.financeCreate({}),/pending tax/);
 lose=false;await client.taxRetry();assert.deepEqual(calls[0],calls[1]);assert.equal(client.taxPending(),null);
 reject=true;await assert.rejects(client.taxSave(T.prepare(values,context())),/rejected/);assert.equal(client.taxPending(),null);
});

test('integrated Finance filing screen saves, displays source drift, retries, exports and preserves unsaved expenses',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
 const {JSDOM}=require(process.env.OPS_JSDOM_MODULE),rootPath=path.resolve(__dirname,'..');
 const dom=new JSDOM(fs.readFileSync(path.join(rootPath,'ops-finance-preview.html'),'utf8'),{url:'https://erp.example/ops-finance-preview.html',runScripts:'outside-only'}),w=dom.window;
 const entries=[{...sale}],events=[],saved=[],downloads=[];let pending=null,lose=false,denyRead=false;
 w.Blob=class{constructor(parts){this.text=parts.join('');}};w.URL.createObjectURL=b=>{downloads.push(b.text);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 for(const file of ['js/order-line-items.js','js/ops-preview/finance-model.js','js/ops-preview/finance-reports.js','js/ops-preview/tax-filings-model.js','js/ops-preview/tax-filings.js'])w.eval(fs.readFileSync(path.join(rootPath,file),'utf8'));
 const append=p=>{const event={id:`event-${events.length+1}`,event_no:events.length+1,kind:p.p_kind,payload:p.p_payload,source:p.p_expected_source,period_start:p.p_start,period_end:p.p_end,created_at:'2026-11-23T12:00:00Z'};events.push(event);return event;};
 const client={signedIn:()=>true,financePending:()=>false,load:async()=>({orders:[]}),financeLoad:async()=>entries,
  taxLoad:async()=>{if(denyRead)throw Error('History read failed');return events;},taxPending:()=>pending,
  taxSave:async p=>{saved.push(p);if(lose){pending=p;throw Error('Connection interrupted');}return append(p);},taxRetry:async()=>{const p=pending;pending=null;return append(p);}};
 w.OliPolyOpsCloud={create:()=>client};w.eval(fs.readFileSync(path.join(rootPath,'js/ops-preview/finance.js'),'utf8'));
 const flush=()=>new Promise(r=>setImmediate(r));await flush();
 w.document.querySelector('#tax-filings details').open=true;
 const expense=w.document.getElementById('expense-form');expense.elements.title.value='Unsaved expense stays';
 const year=w.document.querySelector('[name="tax_year"]');year.value='2026';w.document.querySelector('[name="tax_period"]').value='H1';w.document.querySelector('[data-tax-action="preset"]').click();
 let form=w.document.getElementById('tax-history-form');
 for(const [key,val] of Object.entries(values)){if(form.elements[key]){if(key==='confirmed')form.elements[key].checked=true;else form.elements[key].value=val;}}
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();await flush();
 assert.equal(saved.length,1);assert.equal(events.length,1);assert.match(w.document.getElementById('tax-filings').textContent,/Filed · payment outstanding/);
 assert.equal(expense.elements.title.value,'Unsaved expense stays');
 form=w.document.getElementById('tax-history-form');assert.equal(form.querySelector('button[type="submit"]').disabled,false);
 entries[0].sales_county='Summit';w.document.querySelector('[data-tax-action="reload"]').click();await flush();await flush();
 assert.match(w.document.getElementById('tax-filings').textContent,/Finance records changed after this return snapshot/);
 assert.match(w.document.getElementById('tax-filings').textContent,/Portage/);
 form=w.document.getElementById('tax-history-form');form.elements.kind.value='payment';form.elements.kind.dispatchEvent(new w.Event('change',{bubbles:true}));
 form=w.document.getElementById('tax-history-form');form.elements.amount.value='7';form.elements.confirmation.value='ACH-TEST';form.elements.reason.value='Actual payment';form.elements.confirmed.checked=true;lose=true;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();assert.ok(pending);assert.ok(w.document.querySelector('[data-tax-action="retry"]'));
 w.document.querySelector('[data-tax-action="retry"]').click();await flush();await flush();assert.equal(events.length,2);assert.match(w.document.getElementById('tax-filings').textContent,/Filed · paid/);
 w.document.querySelector('[data-tax-action="export"]').click();w.document.querySelector('[data-tax-action="source"]').click();assert.equal(downloads.length,2);assert.match(downloads[0],/UST-TEST/);assert.match(downloads[1],/Portage/);assert.doesNotMatch(downloads[1],/Summit/);
 denyRead=true;w.document.querySelector('[data-tax-action="reload"]').click();await flush();await flush();assert.match(w.document.getElementById('tax-filings').textContent,/History read failed/);assert.equal(w.document.getElementById('tax-history-form'),null);
 dom.window.close();
});
