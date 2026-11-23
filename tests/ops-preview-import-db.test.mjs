import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),I=require('../js/ops-preview/import-model.js'),{fixture,row,owner,sourceOwner,baseline}=require('./helpers/ops-import-fixture.js');
test('private import staging is lossless, repeatable, isolated and cannot operate the business',{skip:!process.env.OPS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.OPS_PGLITE_MODULE)),db=new PGlite();const other='33333333-3333-4333-8333-333333333333';
 const stage=async(bundle,rows=bundle.rows)=>(await db.query('select public.ops_preview_import_stage($1,$2) result',[bundle.manifest_text,JSON.stringify(rows)])).rows[0].result;
 const load=async key=>(await db.query('select public.ops_preview_import_load($1) result',[key])).rows[0].result;
 const totals=async()=>(await db.query("select (select count(*) from ops_migration.batches) as batches,(select count(*) from ops_migration.records) as records,(select count(*) from ops_migration.batch_rows) as members")).rows[0];
 const canonical=async()=>{await db.exec('RESET ROLE');try{return (await db.query(`select jsonb_agg(x order by name) as proof from (${I.tables.map(n=>`select '${n}' as name,count(*) as count,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) as hash from public.${n} t`).join(' union all ')}) x`)).rows[0].proof;}finally{await db.exec('SET ROLE authenticated');}};
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
  await db.exec(`INSERT INTO auth.users VALUES('${owner}'),('${other}');SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);await db.query('select ops_preview_initialize()');
  await db.exec(`SET request.jwt.claim.sub='${other}'`);await db.query('select ops_preview_initialize()');await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  const before=await canonical(),{bundle,snapshot,target}=await fixture(3),verified=await I.verify(bundle);let first;
  await t.test('chunks are atomic and same request replay adds zero versions or memberships',async()=>{
   first=await stage(bundle,bundle.rows.slice(0,2));assert.equal(first.added_versions,2);assert.equal(first.staged,2);assert.equal(first.expected,3);
   const retry=await stage(bundle,bundle.rows.slice(0,2));assert.equal(retry.added_versions,0);assert.equal(retry.added_memberships,0);
   const complete=await stage(bundle,bundle.rows.slice(2));assert.equal(complete.staged,3);assert.equal(complete.batch_key,verified.batch_key);
   assert.deepEqual(await totals(),{batches:1,records:3,members:3});
   assert.deepEqual(await canonical(),before);
  });
  await t.test('same source captured again reuses records while changed source retains both versions',async()=>{
   const same=await I.prepare({...snapshot,captured_at:'2026-11-23T12:01:00Z'},target,baseline);
   assert.equal((await stage(same)).added_versions,0);assert.equal((await totals()).records,3);
   const changed=structuredClone(snapshot);changed.captured_at='2026-11-23T12:02:00Z';const d=JSON.parse(changed.rows[0].row_text);d.amount=12;changed.rows[0]=await row('financial_entries',d);
   const next=await I.prepare(changed,target,baseline);assert.equal((await stage(next)).added_versions,1);
   const current=await load(first.batch_key);assert.equal(current.rows.find(r=>r.source_pk.id===d.id).source_versions,2);
   const source=await db.query('select source_text from ops_migration.records where source_pk=$1 order by created_at',[JSON.stringify({id:d.id})]);assert.equal(source.rows.length,2);assert.equal(JSON.parse(source.rows[0].source_text).amount,10);assert.equal(JSON.parse(source.rows[1].source_text).amount,12);
   assert.deepEqual(await canonical(),before);
  });
  await t.test('original decimal precision, unicode, owner and source text survive storage verbatim',async()=>{
   const raw=`{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","user_id":"${sourceOwner}","amount":1.2300,"title":"OliPoly – café 🧵"}`;
   const one={table:'financial_entries',pk_text:'{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',row_text:raw,source_hash:await I.hash(raw)};
   const s={...snapshot,rows:[one],tables:I.tables.map(name=>({name,count:name==='financial_entries'?1:0}))};const b=await I.prepare(s,target,baseline);await stage(b);
   const saved=(await db.query('select source_text,source_record->>\'user_id\' as original_owner from ops_migration.records where source_hash=$1',[one.source_hash])).rows[0];assert.equal(saved.source_text,raw);assert.equal(saved.original_owner,sourceOwner);
  });
  await t.test('bad chunk rolls back all of its writes; malformed manifest and checksum cannot be staged',async()=>{
   const b=structuredClone(bundle),m=JSON.parse(b.manifest_text);m.captured_at='2026-11-23T12:03:00Z';b.manifest_text=I.stable(m);const corrupt=structuredClone(b.rows);corrupt[1].row_text+=' ';
   const counts=await totals();await assert.rejects(stage(b,corrupt),/checksum/);assert.deepEqual(await totals(),counts);
   for(const mutation of [x=>x.scope='promote',x=>x.source_project=I.TARGET,x=>x.target_owner=other,x=>x.tables=[],x=>x.records.push(x.records[0])]){const bad=JSON.parse(bundle.manifest_text);mutation(bad);await assert.rejects(stage({...bundle,manifest_text:JSON.stringify(bad)}));}
  });
  await t.test('unsupported/private tables, different source owner and wrong primary-key columns are rejected',async()=>{
   const counts=await totals();
   for(const table of ['money_accounts','auth.users','orders;delete from orders']){const b=structuredClone(bundle),m=JSON.parse(b.manifest_text);m.records[0].table=table;b.manifest_text=I.stable(m);b.rows[0].table=table;await assert.rejects(stage(b));}
   const b=structuredClone(bundle),m=JSON.parse(b.manifest_text),data=JSON.parse(b.rows[0].row_text);data.user_id=other;b.rows[0]=await row('financial_entries',data);m.records.find(r=>r.pk_text===b.rows[0].pk_text).source_hash=b.rows[0].source_hash;b.manifest_text=I.stable(m);await assert.rejects(stage(b),/Different source owner/);
   const wrong=structuredClone(bundle),manifest=JSON.parse(wrong.manifest_text);wrong.rows[0].pk_text=JSON.stringify({amount:10});manifest.records[0].pk_text=wrong.rows[0].pk_text;wrong.manifest_text=I.stable(manifest);await assert.rejects(stage(wrong),/primary key/);
   assert.deepEqual(await totals(),counts);assert.deepEqual(await canonical(),before);
  });
  await t.test('RLS, grants and read endpoints expose only the signed-in owner and omit raw customer/tokens',async()=>{
   const read=await load(first.batch_key);assert.doesNotMatch(JSON.stringify(read),/private-customer@example/);assert.equal(read.rows.length,3);
   await assert.rejects(db.query("update ops_migration.records set source_text='{}'"),/permission denied/);await assert.rejects(db.query('delete from ops_migration.records'),/permission denied/);
   await db.exec(`SET request.jwt.claim.sub='${other}'`);assert.equal(await load(first.batch_key),null);assert.deepEqual((await db.query('select ops_preview_import_list() result')).rows[0].result,[]);assert.equal((await db.query('select count(*) as n from ops_migration.records')).rows[0].n,0);await assert.rejects(stage(bundle),/Wrong staging/);
   await db.exec('RESET ROLE; SET ROLE anon;');await assert.rejects(db.query('select ops_preview_import_list()'),/permission denied/);await assert.rejects(db.query('select * from ops_migration.records'),/permission denied/);
   await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);assert.deepEqual(await canonical(),before);
  });
 }finally{await db.close();}
});
