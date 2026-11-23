import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),T=require('../js/ops-preview/tax-filings-model.js');
require('../js/tax-rate.js');const C=require('../js/ops-preview/finance-corrections.js');
test('tax filing history authorization, frozen source, reconciliation and append-only corrections',{skip:!process.env.OPS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.OPS_PGLITE_MODULE)),db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const range={start:'2026-01-01',end:'2026-06-30'};
 const rows=async()=>(await db.query('select public.get_effective_financial_entries() entry')).rows.map(r=>r.entry);
 const events=async()=>(await db.query('select public.ops_preview_tax_load() result')).rows[0].result;
 const context=async()=>({...range,...T.summarize(await events(),await rows(),range.start,range.end),entries:await rows()});
 const base={kind:'return',return_type:'original',filed_on:'2026-07-23',due_on:'2026-07-23',reported_tax:7,discount:.05,charges:0,credits:0,review_note:'Discount actually claimed on portal',confirmation:'UST-TEST-1',document_link:'https://drive.google.com/test-only',confirmed:true,reason:'Record fictional filed return'};
 const command=async(values,identity=crypto.randomUUID())=>{
  const p=T.prepare(values,await context());return commit(p,identity);
 };
 const commit=async(p,id=crypto.randomUUID())=>(await db.query('select public.ops_preview_tax_commit($1,$2,$3,$4,$5,$6,$7) result',[p.p_start,p.p_end,p.p_kind,JSON.stringify(p.p_payload),p.p_expected_event_id,JSON.stringify(p.p_expected_source),id])).rows[0].result;
 const payment=amount=>({kind:'payment',amount,paid_on:'2026-07-23',confirmation:'ACH-TEST',document_link:'',confirmed:true,reason:'Actual fictional remittance'});
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
   GRANT USAGE ON SCHEMA auth TO anon,authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`);
  const folder=new URL('../supabase/ops-preview/migrations/',import.meta.url);
  for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.sql')&&!f.includes('history')).sort())await db.exec(fs.readFileSync(new URL(file,folder),'utf8').replaceAll('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;','').replaceAll('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',''));
  await db.exec(`INSERT INTO auth.users VALUES('${owner}'),('${other}');SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  const create=async values=>(await db.query('select public.create_manual_financial_entry($1) result',[JSON.stringify({type:'income',entry_date:'2026-06-15',category:'Sale',tax_category:'income_sales',title:'Fictional filing sale',amount:100,original_amount:100,business_use_percent:100,shipping_charged:0,sales_tax_collected:7,sales_tax_rate:7,sales_county:'Portage',destination_county:'Portage',...values})])).rows[0].result.entry_id;
  const saleId=await create({});let filed,pay1,pay2,refund;
  await t.test('unfiled periods have no remittance; original snapshots server-owned effective income',async()=>{
   await assert.rejects(command(payment(1)),/filed return/);
   const p=T.prepare(base,await context());
   assert.deepEqual(p.p_expected_source,(await db.query('select ops_preview_tax_source($1,$2) result',[range.start,range.end])).rows[0].result);
   filed=await commit(p,'initial-return');assert.equal(filed.kind,'return');
   assert.equal(filed.source.length,1);assert.equal(filed.source[0].id,saleId);
   assert.deepEqual(await commit(p,'initial-return'),filed);
   await assert.rejects(commit({...p,p_payload:{...p.p_payload,reason:'Changed request with reused key'}},'initial-return'),/identity already used/);
   assert.equal((await events()).length,1);
   assert.equal((await context()).due,6.95);
  });
  await t.test('duplicate original and overlapping periods are rejected',async()=>{
   await assert.rejects(command(base),/already recorded/);
   const p=T.prepare({...base,discount:0,review_note:'Other test period'},await context());
   await assert.rejects(commit({...p,p_start:'2026-06-01',p_end:'2026-06-30',p_expected_event_id:null}),/overlaps/);
  });
  await t.test('partial payments settle once; refunds expose balance and cannot exceed payments',async()=>{
   pay1=await command(payment(3));assert.equal((await context()).balance,3.95);
   await assert.rejects(command(payment(3)),/already recorded/);
   const stale=T.prepare(payment(1),await context());
   pay2=await command(payment(3.95));assert.equal((await context()).balance,0);
   await assert.rejects(commit(stale),/changed; refresh/);
   refund=await command({...payment(6.5),kind:'refund'});assert.equal((await context()).paid,.45);assert.equal((await context()).balance,6.5);
   await assert.rejects(command({...payment(99),kind:'refund'}),/exceeds/);
  });
  await t.test('void is an append-only record; dependent refunds and wrong targets are protected',async()=>{
   await assert.rejects(command({kind:'void_payment',target_id:pay2.id,reason:'Would orphan refunds after removing payment'}),/dependent refunds/);
   await command({kind:'void_payment',target_id:refund.id,reason:'Refund was entered in error'});
   assert.equal((await context()).balance,0);
   await assert.rejects(command({kind:'void_payment',target_id:refund.id,reason:'Double void attempt'}),/Active payment/);
   await assert.rejects(command({kind:'void_payment',target_id:filed.id,reason:'Wrong target type'}),/Active payment/);
   await assert.rejects(command({kind:'void_return',reason:'Cannot orphan payments'}),/zero net payments/);
   assert.equal((await events()).filter(e=>e.id===refund.id).length,1);
  });
  await t.test('county correction flags drift without altering stored filed worksheet; stale snapshot cannot save',async()=>{
   const original=(await rows()).find(e=>e.id===saleId),stale=T.prepare({...base,return_type:'record_correction'},await context());
   const p=C.prepare(original,{sales_county:'Summit',reason:'Correct destination county'},new Set(['sales_county'])).params;
   await db.query('select public.correct_financial_entry($1,$2,$3,$4,$5,$6,$7,$8)',[p.p_original_entry_id,JSON.stringify(p.p_corrected_record),p.p_changed_fields,p.p_reason,p.p_expected_effective_posted_at,p.p_tax_override_enabled,p.p_tax_override_reason,crypto.randomUUID()]);
   const c=await context();assert.equal(c.changed,true);assert.equal(c.frozen.counties[0].name,'Portage');assert.equal(c.current.counties[0].name,'Summit');
   await assert.rejects(commit(stale),/Finance records changed/);
   await command({...base,return_type:'record_correction',reason:'Update ERP source after reviewing county correction'});
   assert.equal((await context()).changed,false);
   assert.equal((await events()).find(e=>e.id===filed.id).source[0].destination_county,'Portage');
  });
  await t.test('amendment replaces total liability, retains prior payments and permits overpayment display',async()=>{
   await command({...base,return_type:'amendment',reported_tax:5,discount:0,review_note:'Revised total tax per filed amendment'});
   const c=await context();assert.equal(c.due,5);assert.equal(c.paid,6.95);assert.equal(c.balance,-1.95);assert.match(c.status,/overpayment/);
   assert.equal((await rows()).length,1);assert.equal((await rows())[0].amount,100);
  });
  await t.test('RLS, RPC ownership, grants and direct-write protection isolate users',async()=>{
   await assert.rejects(db.query('update ops_preview_tax_events set payload=$1 where id=$2',['{}',filed.id]),/permission denied/);
   await assert.rejects(db.query('delete from ops_preview_tax_events where id=$1',[filed.id]),/permission denied/);
   await db.exec(`SET request.jwt.claim.sub='${other}'`);assert.deepEqual(await events(),[]);
   assert.equal((await db.query('select * from ops_preview_tax_events')).rows.length,0);
   await assert.rejects(commit({p_start:range.start,p_end:range.end,p_kind:'void_payment',p_payload:{reason:'Other user target',target_id:pay1.id},p_expected_event_id:null,p_expected_source:[]}),/Active payment/);
   await db.exec(`RESET ROLE;SET ROLE anon;`);await assert.rejects(db.query('select public.ops_preview_tax_load()'),/permission denied/);await assert.rejects(db.query('select public.ops_preview_tax_source($1,$2)',[range.start,range.end]),/permission denied/);
   await db.exec(`RESET ROLE;SET request.jwt.claim.sub='';SET ROLE authenticated;`);await assert.rejects(commit({p_start:range.start,p_end:range.end,p_kind:'void_return',p_payload:{reason:'Anonymous claim'},p_expected_event_id:null,p_expected_source:[]}),/Sign in/);
   await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  });
  await t.test('server rejects tampered amounts, dates, snapshots, links and unexplained adjustments',async()=>{
   const p=T.prepare({...base,return_type:'record_correction'},await context());
   for(const change of [{reported_tax:-1},{reported_tax:.001},{discount:100},{filed_on:'2026-02-30'},{due_on:'2025-01-01'},{document_link:'javascript:alert(1)'},{confirmed:false},{review_note:''},{unexpected:'field'}])await assert.rejects(commit({...p,p_payload:{...p.p_payload,...change}}));
   await assert.rejects(commit({...p,p_expected_source:[]}),/Finance records changed/);
  });
  await t.test('zero-sales returns and voided mistaken records retain complete history without ledger postings',async()=>{
   const start='2000-01-01',end='2000-01-31',entries=await rows();
   const c={start,end,...T.summarize([],entries,start,end),entries};
   const p=T.prepare({...base,filed_on:'2000-02-23',due_on:'2000-02-23',reported_tax:0,discount:0,review_note:'',reason:'Record zero-sales period'},c);
   const zero=await commit(p);assert.equal(zero.source.length,0);
   assert.equal(T.summarize(await events(),entries,start,end).balance,0);
   await commit({p_start:start,p_end:end,p_kind:'void_return',p_payload:{reason:'Mistaken ERP record only'},p_expected_event_id:zero.id,p_expected_source:[]});
   const result=T.summarize(await events(),entries,start,end);assert.equal(result.filed,null);assert.equal(result.rows.length,2);
   assert.equal((await rows()).length,1);
  });
 }finally{await db.close();}
});
