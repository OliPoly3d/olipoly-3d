import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../js/ops-preview/business-settings-model.js');require('../js/tax-rate.js');require('../js/order-line-items.js');require('../js/quote-pricing.js');const M=require('../js/ops-preview/model.js');
test('shared business settings are durable, audited, owner-isolated and revision-safe',{skip:!process.env.OPS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.OPS_PGLITE_MODULE)),db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';let state,initial;const command=crypto.randomUUID();
 const save=async(settings,revision,reason='Review business defaults',id=crypto.randomUUID())=>(await db.query('select public.ops_preview_settings_commit($1,$2,$3,$4) state',[JSON.stringify(settings),revision,id,reason])).rows[0].state;
 const count=async()=>(await db.query("select count(*)::int n from ops_preview_receipts where request->>'type'='business_settings'")).rows[0].n;
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
  initial=(await db.query('select public.ops_preview_initialize() state')).rows[0].state;
  await t.test('save changes settings/history and revision while retaining orders, stock and Finance',async()=>{
   state=await save(S.defaults,initial.revision,'Initial shared defaults',command);assert.deepEqual(state.settings,S.defaults);assert.deepEqual(state.orders,initial.orders);assert.deepEqual(state.inventory,initial.inventory);assert.equal(state.revision,initial.revision+1);assert.equal(state.settingsHistory.length,1);assert.equal((await db.query('select count(*)::int n from financial_entries')).rows[0].n,0);assert.equal(await count(),1);
  });
  await t.test('exact command replay does not duplicate history or undo newer defaults',async()=>{
   const newer=await save({...S.defaults,laborRate:50},state.revision);state=await save(S.defaults,initial.revision,'Initial shared defaults',command);assert.equal(state.revision,newer.revision);assert.equal(state.settings.laborRate,50);assert.equal(state.settingsHistory.length,2);await assert.rejects(save({...S.defaults,laborRate:60},initial.revision,'Initial shared defaults',command),/identity already used/);
  });
  await t.test('stale and malformed requests are rejected without partial changes',async()=>{
   await assert.rejects(save(S.defaults,initial.revision),/another device/);
   for(const change of [{targetMargin:100},{mileageMode:'custom',mileageRate:0},{officeSqft:100,homeSqft:0},{planningRate:-1},{homeSqft:'2000'},{headquarters:''},{extra:true},{mileageRate:.12345}])await assert.rejects(save({...S.defaults,...change},state.revision));assert.equal((await db.query('select public.ops_preview_load() state')).rows[0].state.revision,state.revision);
  });
  await t.test('recent history is bounded while every immutable receipt remains',async()=>{
   for(let n=0;n<22;n++)state=await save({...S.defaults,laborRate:60+n},state.revision);assert.equal(state.settingsHistory.length,20);assert.equal(await count(),24);const receipt=(await db.query('select request from ops_preview_receipts where command_id=$1',[command])).rows[0].request;assert.deepEqual(receipt.before,{});assert.deepEqual(receipt.settings,S.defaults);await assert.rejects(db.query('delete from ops_preview_receipts where command_id=$1',[command]),/permission denied/);
  });
  await t.test('other devices read saved defaults; other owners have isolated settings',async()=>{
   assert.equal((await db.query('select public.ops_preview_load() state')).rows[0].state.settings.laborRate,81);await db.exec(`SET request.jwt.claim.sub='${other}'`);const otherState=(await db.query('select public.ops_preview_initialize() state')).rows[0].state;assert.equal(otherState.settings,undefined);assert.equal((await db.query('select count(*)::int n from ops_preview_workspaces')).rows[0].n,1);await assert.rejects(save(S.defaults,otherState.revision,'Initial shared defaults',command),/identity already used/);assert.equal((await save({...S.defaults,laborRate:20},otherState.revision)).settings.laborRate,20);await db.exec(`SET request.jwt.claim.sub='${owner}'`);assert.equal((await db.query('select public.ops_preview_load() state')).rows[0].state.settings.laborRate,81);
  });
  await t.test('new-request command persists its captured rates after shared settings change',async()=>{
   const order=M.newRequest(state.settings);order.customer='Fictional settings customer';order.title='Settings persistence rehearsal';state=(await db.query('select public.ops_preview_commit($1,$2,$3,$4,$5) state',[order.id,JSON.stringify({type:'new'}),JSON.stringify(order),state.revision,crypto.randomUUID()])).rows[0].state;const saved=state.orders.find(o=>o.id===order.id);assert.equal(saved.laborRate,81);assert.equal(saved.costRates.P1S,.53);state=await save({...S.defaults,laborRate:40,p1sRate:9},state.revision);assert.deepEqual(state.orders.find(o=>o.id===order.id).costRates,saved.costRates);assert.equal(state.orders.find(o=>o.id===order.id).laborRate,81);
  });
  await t.test('anonymous invocation and direct workspace writes remain denied',async()=>{
   await assert.rejects(db.query("update ops_preview_workspaces set state='{}' where user_id=$1",[owner]),/permission denied/);await db.exec("SET request.jwt.claim.sub=''");await assert.rejects(save(S.defaults,state.revision),/Sign in/);await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(save(S.defaults,state.revision),/permission denied/);
  });
 }finally{await db.close();}
});
