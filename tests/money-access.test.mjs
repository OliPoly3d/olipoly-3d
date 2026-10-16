// Isolated PostgreSQL/RLS test. No production connection is used.
// Install @electric-sql/pglite@0.5.10 outside this repository and set MONEY_PGLITE_MODULE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Money database denies public/non-owner access, prevents claims, and archives owner updates',async()=>{
 const {PGlite}=await import(process.env.MONEY_PGLITE_MODULE || '@electric-sql/pglite');
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 const sql=await readFile(new URL('../supabase/migrations/20261016183209_money_foundation.sql',import.meta.url),'utf8');await db.exec(sql);
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const body={version:1,start:'2026-01-01',accounts:[],transactions:[],schedules:[]};
 await db.query('insert into auth.users values ($1),($2)',[owner,other]);
 await db.query('insert into money_access(user_id) values($1)',[owner]);
 await db.query('insert into money_plans(user_id,body) values($1,$2)',[owner,body]);
 await db.exec('set role anon');
 for(const table of ['money_access','money_plans','money_history'])await assert.rejects(db.query('select * from '+table),/permission denied/);
 await db.exec('reset role; set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 assert.equal((await db.query('select * from money_plans')).rows.length,0);
 assert.equal((await db.query('select * from money_access')).rows.length,0);
 assert.equal((await db.query('update money_plans set revision=1 returning *')).rows.length,0);
 await assert.rejects(db.query('insert into money_access(user_id) values($1)',[other]),/permission denied/);
 await assert.rejects(db.query('insert into money_plans(user_id,body) values($1,$2)',[other,body]),/permission denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 assert.equal((await db.query('select * from money_plans')).rows.length,1);
 await assert.rejects(db.query('update money_plans set user_id=$1',[other]),/permission denied/);
 await assert.rejects(db.query('update money_plans set revision=7'),/Invalid Money revision/);
 await assert.rejects(db.query('delete from money_plans'),/permission denied/);
 const update=await db.query('update money_plans set revision=1,body=$1 where revision=0 returning revision',[{...body,note:'test'}]);assert.equal(update.rows[0].revision,1);
 assert.equal((await db.query('update money_plans set revision=1 where revision=0 returning *')).rows.length,0);
 assert.equal((await db.query('select * from money_history')).rows.length,1);
 await assert.rejects(db.query('delete from money_history'),/permission denied/);
 await assert.rejects(db.query('insert into money_history(user_id,revision,body) values($1,2,$2)',[owner,body]),/permission denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select * from money_history')).rows.length,0);
 } finally {await db.close();}
});
