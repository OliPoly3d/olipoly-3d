import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../js/tax-rate.js');
const C=require('../js/ops-preview/finance-corrections.js');
const Reports=require('../js/ops-preview/finance-reports.js');
const migration='20261123135110_ops_test_finance_corrections.sql';
test('Finance correction migration preserves originals, authority, audit history and effective report totals',{skip:!process.env.OPS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.OPS_PGLITE_MODULE)),db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const source={type:'expense',entry_date:'2026-11-23',category:'Material',tax_category:'materials',title:'Fictional purchase',amount:10,original_amount:40,business_use_percent:25};
 const rows=async()=> (await db.query('select public.get_effective_financial_entries() entry')).rows.map(row=>row.entry);
 const get=async id=>(await rows()).find(row=>row.id===id);
 const create=async values=>(await db.query('select public.create_manual_financial_entry($1) result',[JSON.stringify({...source,...values})])).rows[0].result.entry_id;
 const proposed=(entry,values)=>C.prepare(entry,{...values,reason:'Correct fictional source record'},new Set(Object.keys(values))).params;
 const correct=async(params,command=crypto.randomUUID())=>(await db.query('select public.correct_financial_entry($1,$2,$3,$4,$5,$6,$7,$8) result',[params.p_original_entry_id,JSON.stringify(params.p_corrected_record),params.p_changed_fields,params.p_reason,params.p_expected_effective_posted_at,params.p_tax_override_enabled,params.p_tax_override_reason,command])).rows[0].result;
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
   GRANT USAGE ON SCHEMA auth TO anon,authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`);
  const folder=new URL('../supabase/ops-preview/migrations/',import.meta.url);
  for(const file of fs.readdirSync(folder).filter(file=>file.endsWith('.sql') && !file.includes('history')).sort()) {
   await db.exec(fs.readFileSync(new URL(file,folder),'utf8').replaceAll('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;','').replaceAll('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',''));
  }
  await db.exec(`INSERT INTO auth.users VALUES('${owner}'),('${other}');SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  const id=await create({});let metadata,financial;
  await t.test('manual detail correction adds history while keeping source immutable',async()=>{
   metadata=await correct(proposed(await get(id),{notes:'Receipt reviewed'}));
   assert.equal(metadata.correction_kind,'metadata_only');
   assert.equal((await get(id)).notes,'Receipt reviewed');assert.equal((await get(id)).correction_history.length,1);
   assert.equal((await db.query('select notes from financial_entries where id=$1',[id])).rows[0].notes,'');
   await assert.rejects(db.query('update financial_entries set notes=$1 where id=$2',['Bypass',id]),/immutable/);
   await assert.rejects(db.query('delete from financial_entries where id=$1',[id]),/immutable/);
   await assert.rejects(db.query('select update_manual_financial_entry($1,$2)',[id,JSON.stringify({...source,notes:'Bypass'})]),/immutable/);
  });
  await t.test('financial correction preserves originals and appears once in reports; stale version rejected',async()=>{
   const stale=await get(id),params=proposed(stale,{original_amount:80}),command=crypto.randomUUID();
   financial=await correct(params,command);assert.equal(financial.correction_kind,'reversal_replacement');
   assert.equal((await correct(params,command)).idempotent,true);
   const effective=await get(id);assert.equal(effective.amount,20);assert.equal(effective.correction_history.length,2);
   assert.equal((await db.query('select amount from financial_entries where id=$1',[id])).rows[0].amount,'10.00');
   assert.equal(Reports.summarize(await rows(),2026,'all',[]).total.expenses,20);
   assert.equal((await rows()).length,1);
   await assert.rejects(correct(proposed(stale,{notes:'Stale edit'})),/changed; refresh/);
  });
  await t.test('correction chaining retains metadata and technical rows cannot become roots',async()=>{
   await correct(proposed(await get(id),{title:'Corrected description'}));
   const effective=await get(id);assert.equal(effective.amount,20);assert.equal(effective.notes,'Receipt reviewed');assert.equal(effective.correction_history.length,3);
   const params=proposed(effective,{notes:'Invalid technical root'});
   for(const root of [metadata.metadata_entry_id,financial.reversal_entry_id,financial.replacement_entry_id]) await assert.rejects(correct({...params,p_original_entry_id:root}),/original authoritative/);
  });
  await t.test('mileage financial correction preserves four decimal rate and uses corrected business share',async()=>{
   const mileage=await create({category:'Vehicle / Delivery Mileage',amount:7.25,original_amount:7.25,business_use_percent:100,miles_driven:10,mileage_rate:.725,trip_purpose:'Supply run'});
   await correct(proposed(await get(mileage),{miles_driven:20}));
   assert.equal((await get(mileage)).mileage_rate,.725);assert.equal((await get(mileage)).amount,14.5);
   await correct(proposed(await get(mileage),{mileage_rate:.6751}));
   assert.equal((await get(mileage)).mileage_rate,.6751);assert.equal((await get(mileage)).amount,13.5);
  });
  let sale;
  await t.test('posted sale details preserve actual tax; monetary correction recalculates and actual-tax override is audited',async()=>{
   // Seed an authoritative posting, without invoking customer/order transitions.
   await db.exec('RESET ROLE');
   sale=(await db.query(`insert into financial_entries(user_id,type,entry_date,category,title,amount,original_amount,sales_tax_collected,sales_tax_rate,sales_county,shipping_charged,finance_command_owned,posted_at,posted_by,accepted_commercial_snapshot) values($1,'income','2026-11-23','Sales','Posted sale',100,100,7.01,7,'Geauga',5,true,now(),$1,'{"accepted_commercial_breakdown":{"shipping_in_taxable_subtotal":true}}') returning id`,[owner])).rows[0].id;
   await db.exec('SET ROLE authenticated');
   await correct(proposed(await get(sale),{sales_county:'Portage'}));assert.equal((await get(sale)).sales_tax_collected,7.01);
   const allocation=Reports.summarize(await rows(),2026,'all',[]);assert.equal(allocation.counties.length,1);assert.equal(allocation.counties[0].name,'Portage');assert.equal(allocation.counties[0].taxCollected,7.01);
   await correct(proposed(await get(sale),{amount:110}));assert.equal((await get(sale)).sales_tax_collected,8.05);
   await correct(proposed(await get(sale),{sales_tax_rate:7.25}));assert.equal((await get(sale)).sales_tax_collected,8.34);
   await correct(proposed(await get(sale),{overrideEnabled:true,overrideAmount:8,overrideReason:'Amount on actual customer receipt'}));
   assert.equal((await get(sale)).sales_tax_collected,8);assert.equal((await get(sale)).tax_override_reason,'Amount on actual customer receipt');
   assert.equal((await get(sale)).correction_history.at(-1).changed_fields.tax_override_reason.new,'Amount on actual customer receipt');
   const summary=Reports.summarize(await rows(),2026,'all',[]);assert.equal(summary.total.taxCollected,8);assert.equal(summary.total.revenue,115);
  });
  await t.test('another owner, anonymous callers and stale command ownership cannot alter the record',async()=>{
   const params=proposed(await get(id),{notes:'Unauthorized'});
   await db.exec(`SET request.jwt.claim.sub='${other}'`);assert.equal((await rows()).length,0);
   await assert.rejects(correct(params),/not found for this operator/);
   await db.exec("SET request.jwt.claim.sub=''");await assert.rejects(correct(params),/Authenticated/);
   await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  });
  await t.test('migration changes only two existing functions, with no destructive data operations',()=>{
   const sql=fs.readFileSync(new URL(migration,folder),'utf8');assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,2);
   assert.doesNotMatch(sql,/\b(DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.)\b/i);
  });
 } finally {await db.close();}
});
