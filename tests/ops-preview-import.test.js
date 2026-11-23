const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const I=require('../js/ops-preview/import-model.js');
const {row,fixture,owner,sourceOwner,baseline}=require('./helpers/ops-import-fixture.js');

test('offline preparation retains exact source bytes, owners and legacy references, with target collision flags',async()=>{
 const {bundle}=await fixture();const m=await I.verify(bundle);
 assert.equal(m.record_count,2);assert.equal(m.scope,'quarantine_only');
 assert.equal(JSON.parse(bundle.rows[0].row_text).user_id,sourceOwner);
 assert.equal(m.records[0].disposition,'review');assert.match(m.records[0].flags.join(' '),/OP-000008/);
 assert.equal(m.baseline.years[0].total.revenue,10);assert.equal(m.batch_key,await I.hash(bundle.manifest_text));
});
test('tampered rows, duplicate identities, incomplete counts and wrong environments are rejected',async()=>{
 const {snapshot,target,bundle}=await fixture();
 await assert.rejects(I.prepare({...snapshot,source_project:I.TARGET},target,baseline));
 await assert.rejects(I.prepare({...snapshot,tables:[]},target,baseline));
 await assert.rejects(I.prepare({...snapshot,rows:[snapshot.rows[0],snapshot.rows[0]]},target,baseline),/Duplicate/);
 const bad=structuredClone(bundle);bad.rows[0].row_text+=' ';await assert.rejects(I.verify(bad),/checksum/);
 const other=structuredClone(snapshot);other.rows[0]=await row('financial_entries',{id:'other',user_id:owner});await assert.rejects(I.prepare(other,target,baseline),/different source owner/);
 const evil=structuredClone(bundle),m=JSON.parse(evil.manifest_text);m.records[0].disposition='promote';evil.manifest_text=JSON.stringify(m);await assert.rejects(I.verify(evil),/Manifest/);
});
test('inventory is deferred and old test-like rows are retained for review rather than deleted',async()=>{
 const inventory=await row('raw_material_inventory',{id:'roll',user_id:sourceOwner,remaining_grams:123});
 assert.equal(I.classify(inventory).disposition,'inventory_deferred');
 const job=await row('production_jobs',{id:'job',job_title:'E2E test',production_status:'closed'});assert.equal(I.classify(job).disposition,'review');
 const archived=await row('orders',{id:'order',status:'closed',order_number:'OP-198'});assert.match(I.classify(archived,{archiveKeys:['legacy:orders:order']}).flags.join(' '),/archive summary/);
});
test('bounded chunks preserve every record, support zero-row batches, and reject oversized data without truncation',async()=>{
 const {bundle}=await fixture(51);const chunks=I.chunks(bundle.rows);assert.deepEqual(chunks.map(c=>c.length),[25,25,1]);
 assert.equal(chunks.flat().length,51);assert.deepEqual(I.chunks([]),[]);assert.throws(()=>I.chunks(bundle.rows,10),/exceeds/);
});
test('cloud transport permits only private staging RPCs and retries the same immutable chunk',async()=>{
 const Cloud=require('../js/ops-preview/cloud.js'),store=new Map(),calls=[];let lose=true;
 const cloud=Cloud.create({projectRef:Cloud.TEST_REF,url:`https://${Cloud.TEST_REF}.supabase.co`,publishableKey:'sb_publishable_fixture'},{storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch:async(url,request)=>{
  if(url.includes('/auth/'))return{ok:true,json:async()=>({access_token:'fixture',expires_at:Date.now()/1000+3600,user:{id:owner}})};
  calls.push({url,body:request.body});if(lose)throw Error('Lost response');return{ok:true,json:async()=>({batch_key:'same'})};
 }});
 await cloud.auth('fiction@example.test','fiction');const {bundle}=await fixture();await assert.rejects(cloud.importStage(bundle.manifest_text,bundle.rows),/interrupted/);lose=false;await cloud.importStage(bundle.manifest_text,bundle.rows);
 assert.deepEqual(calls[0],calls[1]);assert.match(calls[0].url,/ops_preview_import_stage$/);
 assert.equal([...store.keys()].filter(k=>!k.endsWith('.session')).length,0);
});
test('offline CLI does not overwrite source evidence or an earlier differing bundle',async()=>{
 const {execFileSync}=require('node:child_process'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-import-')),{snapshot,target}=await fixture();
 try{
  snapshot.finance_effective=snapshot.rows.map(r=>JSON.parse(r.row_text));const source=path.join(dir,'source.json'),index=path.join(dir,'target.json'),output=path.join(dir,'bundle.json'),script=path.resolve(__dirname,'../scripts/prepare-legacy-staging.mjs');
  fs.writeFileSync(source,JSON.stringify(snapshot));fs.writeFileSync(index,JSON.stringify(target));const original=fs.readFileSync(source,'utf8');
  const run=out=>execFileSync(process.execPath,[script,'--source',source,'--target',index,'--output',out],{stdio:'pipe'});
  assert.throws(()=>run(source),/must not replace/);assert.equal(fs.readFileSync(source,'utf8'),original);
  run(output);const saved=fs.readFileSync(output,'utf8');run(output);assert.equal(fs.readFileSync(output,'utf8'),saved);
  target.references=[];fs.writeFileSync(index,JSON.stringify(target));assert.throws(()=>run(output),/different content/);assert.equal(fs.readFileSync(output,'utf8'),saved);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('review screen resumes an interrupted upload, persists through the server, filters, and exposes no promotion action',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
 const {JSDOM}=require(process.env.OPS_JSDOM_MODULE),root=path.resolve(__dirname,'..'),{bundle}=await fixture(26),manifest=await I.verify(bundle);
 const staged=new Map();let calls=0,lost=false;
 const client={signedIn:()=>true,importList:async()=>staged.size?[{batch_key:manifest.batch_key,source_project:I.SOURCE,captured_at:manifest.captured_at,staged:staged.size,expected:26}]:[],
  importStage:async(text,rows)=>{calls++;rows.forEach(r=>staged.set(r.pk_text,r));if(calls===2&&!lost){lost=true;throw Error('Connection interrupted');}return{staged:staged.size};},
  importLoad:async()=>({batch_key:manifest.batch_key,manifest,rows:[...staged.values()].map((r,i)=>({record_id:'stage-'+i,table:r.table,source_pk:JSON.parse(r.pk_text),source_versions:i===0?2:1,plan:manifest.records.find(d=>d.pk_text===r.pk_text)}))})};
 const create=async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'ops-import-preview.html'),'utf8'),{url:'https://erp.example/ops-import-preview.html',runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
  for(const f of ['js/order-line-items.js','js/ops-preview/import-model.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
  w.OliPolyOpsCloud={create:()=>client};w.eval(fs.readFileSync(path.join(root,'js/ops-preview/import.js'),'utf8'));await new Promise(r=>setImmediate(r));return dom;
 };
 const dom=await create(),w=dom.window;
 const until=async condition=>{const deadline=Date.now()+5000;while(!condition()){if(Date.now()>deadline)throw Error('Timed out waiting for review controls');await new Promise(r=>setTimeout(r,10));}};
 const input=w.document.getElementById('import-file');Object.defineProperty(input,'files',{value:[{size:1000,text:async()=>JSON.stringify(bundle)}]});
 input.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>w.document.getElementById('import-file-preview').textContent.includes('26 original'));
 w.document.getElementById('import-confirm').checked=true;w.document.getElementById('import-confirm').dispatchEvent(new w.Event('change'));
 w.document.getElementById('import-stage').click();await until(()=>w.document.getElementById('import-message').textContent.includes('retained'));
 assert.equal(staged.size,26);assert.match(w.document.getElementById('import-message').textContent,/retained/);
 w.document.getElementById('import-stage').click();await until(()=>w.document.getElementById('import-message').textContent.includes('Capture staged'));
 assert.equal(staged.size,26);assert.match(w.document.getElementById('import-message').textContent,/Capture staged/);
 assert.match(w.document.getElementById('import-review').textContent,/Changed source/);
 assert.doesNotMatch(w.document.getElementById('import-review').textContent,/private-customer/);
 const search=w.document.getElementById('import-search');search.value='No match';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(w.document.getElementById('import-row-count').textContent,/0 staged/);
 assert.equal([...w.document.querySelectorAll('button')].some(b=>/promote|apply.*order|post.*sale/i.test(b.textContent)),false);
 const second=await create();assert.match(second.window.document.getElementById('import-batches').textContent,/26 \/ 26/);second.window.close();dom.window.close();
});
