import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('../js/tax-rate.js');require('../js/order-line-items.js');require('../js/quote-pricing.js');
const M=require('../js/ops-preview/model.js');
const migrations=new URL('../supabase/ops-preview/migrations/',import.meta.url);
const migration='20261107041010_ops_test_inventory_management.sql';
test('shared inventory preserves multiple rolls, production costs, spool counts and owner audit history',{skip:!process.env.OPS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.OPS_PGLITE_MODULE)); const db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 let state,inventory,last;
 const rollData=(extra={})=>({material_type:'PETG',color_name:'Black',brand:'Bambu',roll_label:'Refill A',location:'Shelf',starting_grams:1000,remaining_grams:1000,cost_per_spool:30,reorder_threshold_grams:250,roll_type:'refill',reusable_spool:true,...extra});
 const run=async(action,rev=state.revision,id=crypto.randomUUID())=>{
  last=[JSON.stringify(action),rev,id];
  const result=(await db.query('select public.ops_preview_inventory_commit($1,$2,$3) result',last)).rows[0].result;
  state=result.workspace; inventory=result.inventory; return result;
 };
 const change=async action=>{
  const next=M.command(state,state.orders[0].id,action);
  state=(await db.query('select public.ops_preview_commit($1,$2,$3,$4,$5) result',[state.orders[0].id,JSON.stringify(action),JSON.stringify(next.orders[0]),state.revision,crypto.randomUUID()])).rows[0].result;
 };
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
   GRANT USAGE ON SCHEMA auth TO anon,authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`);
  for(const file of ['20261104125424_ops_test_business_baseline.sql','20261104130021_ops_test_connected_workspace.sql','20261105003419_ops_test_permanent_project_numbers.sql','20261107023919_ops_test_approved_production_preparation.sql',migration]){
   let sql=fs.readFileSync(new URL(file,migrations),'utf8').replaceAll('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;','').replaceAll('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;','');
   await db.exec(sql);
  }
  await db.exec(`INSERT INTO auth.users VALUES('${owner}'),('${other}');SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  state=(await db.query('select public.ops_preview_initialize() result')).rows[0].result;
  await t.test('new refills aggregate with legacy stock and keep unique physical identities',async()=>{
   await run({type:'save_roll',data:rollData(),reason:'Receive test refill'});
   assert.equal(state.inventory.find(s=>s.key==='PETG / Black').grams,3000);
   assert.equal(inventory.rolls.length,4); assert.equal(inventory.pool,null);
   assert.equal(inventory.rolls.filter(r=>r.material_type==='PETG').length,2);
   assert.equal(inventory.events[0].reason,'Receive test refill');
   const receipt=await db.query('select public.ops_preview_inventory_commit($1,$2,$3) result',last);
   assert.equal(receipt.rows[0].result.workspace.revision,state.revision);
   assert.equal(receipt.rows[0].result.inventory.rolls.length,4);
  });
  await t.test('stale or malformed commands cannot alter balances or duplicate history',async()=>{
   await assert.rejects(run({type:'save_roll',data:rollData(),reason:'Stale'},state.revision-1),/changed on another device/);
   await assert.rejects(run({type:'save_roll',data:rollData({remaining_grams:-1,roll_label:'Invalid negative roll'}),reason:'Invalid'}),/nonnegative/);
   await assert.rejects(run({type:'save_roll',data:rollData(),reason:''}),/reason/);
   assert.equal((await db.query('select count(*)::int n from ops_preview_inventory_events')).rows[0].n,1);
  });
  const refill=()=>inventory.rolls.find(r=>r.roll_label==='Refill A');
  await t.test('mounting consumes one free spool, unmounting releases it exactly once',async()=>{
   await assert.rejects(run({type:'mount_roll',id:refill().id,reason:'Mount without spool'}),/empty spool/);
   await run({type:'spool_count',data:{available_empty:2,retired:1},reason:'Physical count'});
   await run({type:'mount_roll',id:refill().id,reason:'Mount refill'});
   assert.equal(inventory.pool.available_empty,1);assert.equal(refill().is_mounted,true);
   await assert.rejects(run({type:'mount_roll',id:refill().id,reason:'Double mount'}),/unmounted/);
   await run({type:'unmount_roll',id:refill().id,data:{confirm:true},reason:'Filament removed and spool free'});
   assert.equal(inventory.pool.available_empty,2);assert.equal(refill().is_mounted,false);
   await assert.rejects(run({type:'unmount_roll',id:refill().id,data:{confirm:true},reason:'Double unmount'}),/Unmount/);
  });
  await t.test('weigh-ins store tare and gross measurements with audited net gram changes',async()=>{
   await run({type:'mount_roll',id:refill().id,reason:'Remount for weigh-in'});
   await run({type:'adjust_roll',id:refill().id,data:{mode:'weigh',gross_grams:700,tare_grams:200},reason:'Periodic weigh-in'});
   assert.equal(refill().remaining_grams,500); assert.equal(refill().tare_grams,200); assert.equal(refill().last_gross_grams,700);
   assert.equal(state.inventory.find(s=>s.key==='PETG / Black').grams,2500);
   assert.equal(inventory.events[0].before_data.remaining_grams,1000);
   assert.equal(inventory.events[0].after_data.remaining_grams,500);
   await assert.rejects(run({type:'adjust_roll',id:refill().id,data:{mode:'weigh',gross_grams:100,tare_grams:200},reason:'Bad weigh-in'}),/tare/);
  });
  await t.test('production reserves across rolls and protects physical stock corrections',async()=>{
   const draft=M.copy(state.orders[0]);draft.items[0].materials[0].grams_each=1100;
   state=(await db.query('select public.ops_preview_commit($1,$2,$3,$4,$5) result',[draft.id,JSON.stringify({type:'save'}),JSON.stringify(draft),state.revision,crypto.randomUUID()])).rows[0].result;
   await change({type:'approve',method:'Verbal agreement recorded'}); await change({type:'release'});
   assert.equal(M.reserved(state,'PETG / Black'),2200);
   assert.equal((await db.query("select count(*)::int n from production_material_reservations where status='active'")).rows[0].n,4);
   await assert.rejects(run({type:'adjust_roll',id:refill().id,data:{mode:'set',quantity:0},reason:'Cannot remove reserved stock'}),/reservations/);
   await assert.rejects(run({type:'unmount_roll',id:refill().id,data:{confirm:true},reason:'Reserved roll'}),/unreserved/);
  });
  await t.test('actual consumption spans rolls once and retains weighted actual material cost',async()=>{
   await change({type:'start',itemId:'blocks',quantity:2,printer:'P1S'});
   const attempt=state.orders[0].runs.at(-1);
   await change({type:'inspect',runId:attempt.id,accepted:2,rejected:0,hours:4,usage:[{key:'PETG / Black',grams:2200},{key:'PLA / White',grams:20}],notes:'Two physical rolls'});
   assert.equal(state.inventory.find(s=>s.key==='PETG / Black').grams,300);
   const saved=state.orders[0].runs.at(-1);assert.equal(saved.usage.length,2);
   assert.ok(Math.abs(saved.usage.find(u=>u.key==='PETG / Black').unitCost-(2000*0.023+200*0.03)/2200)<0.00001);
   assert.equal((await db.query("select count(*)::int n from inventory_transactions where transaction_type='production_attempt_consumption'")).rows[0].n,3);
  });
  await t.test('an owner can choose actual physical rolls and finish the normal payment and tax flow',async()=>{
   await change({type:'start',itemId:'tags',quantity:3,printer:'P2S'});
   const attempt=state.orders[0].runs.at(-1);
   const wrong=inventory.rolls.find(r=>r.material_type==='PETG').id;
   const actual=inventory.rolls.find(r=>r.material_type==='PLA'&&r.color_name==='Black').id;
   await assert.rejects(change({type:'inspect',runId:attempt.id,accepted:3,rejected:0,hours:1.5,usage:[{key:'PLA / Black',grams:45,rolls:[{raw_material_roll_id:wrong,grams_used:45}]}]}),/Mount sufficient/);
   assert.equal(Number((await db.query("select remaining_grams from raw_material_inventory where id=$1",[actual])).rows[0].remaining_grams),1500);
   await change({type:'inspect',runId:attempt.id,accepted:3,rejected:0,hours:1.5,usage:[{key:'PLA / Black',grams:45,rolls:[{raw_material_roll_id:actual,grams_used:45}]}]});
   assert.equal(state.orders[0].runs.at(-1).usage[0].rolls[0].raw_material_roll_id,actual);
   await change({type:'pickup'});
   await change({type:'pay',amount:110,fee:1,method:'Stripe',reference:'Fictional payment'});
   assert.equal(M.balance(state.orders[0]),0);assert.ok(state.orders[0].database.financeEntryId);
   const finance=(await db.query("select amount,sales_tax_collected from financial_entries where type='income'")).rows[0];
   assert.equal(Number(finance.amount),102.8);assert.equal(Number(finance.sales_tax_collected),7.2);
  });
  let supplyId;
  await t.test('supplies retain measurement units and record consumption and audits',async()=>{
   await run({type:'save_supply',data:{item_name:'Protective wrap',unit_type:'sq.ft.',category:'Packaging',quantity_on_hand:10,cost_per_unit:0.5,reorder_threshold:3,exclude_warning:false},reason:'Opening count'});
   supplyId=inventory.supplies[0].id;
   await run({type:'adjust_supply',id:supplyId,data:{mode:'consume',quantity:2.5},reason:'Package OP test order'});
   assert.equal(inventory.supplies[0].quantity_on_hand,7.5);
   await assert.rejects(run({type:'adjust_supply',id:supplyId,data:{mode:'consume',quantity:8},reason:'Too much'}),/exceeds stock/);
   await run({type:'adjust_supply',id:supplyId,data:{mode:'set',quantity:7},reason:'Physical audit'});
   assert.equal(inventory.events[0].before_data.quantity_on_hand,7.5);
   assert.equal(inventory.supplies[0].unit_type,'sq.ft.');
  });
  await t.test('custom dropdowns persist and protected history cannot be edited',async()=>{
   await run({type:'options',data:{materials:['PLA Basic','PLA Matte','PLA Silk'],brands:['Bambu'],colors:['Black'],units:['each','sq.ft.']},reason:'Update choices'});
   assert.deepEqual(inventory.options.materials,['PLA Basic','PLA Matte','PLA Silk']);
   await assert.rejects(db.exec('delete from ops_preview_inventory_events'),/permission denied/);
   await db.exec(`SET request.jwt.claim.sub='${other}'`);
   const otherInventory=(await db.query('select public.ops_preview_inventory_load() result')).rows[0].result;
   assert.equal(otherInventory.rolls.length,0);assert.equal(otherInventory.events.length,0);
   await db.exec('select public.ops_preview_initialize()');
   state=(await db.query('select public.ops_preview_load() result')).rows[0].result;
   await assert.rejects(run({type:'adjust_supply',id:supplyId,data:{mode:'set',quantity:99},reason:'Wrong owner'}),/no rows/);
   await db.exec("SET request.jwt.claim.sub='';RESET ROLE;SET ROLE anon");
   await assert.rejects(db.exec('select public.ops_preview_inventory_load()'),/permission denied/);
  });
 }finally{await db.close();}
});
