const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const migration = 'supabase/migrations/20260930013455_fix_production_qc_order_status_sync.sql';

// Execute real RPC definitions, rather than matching SQL source strings.
function definition(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const tail = source.slice(start);
  const body = tail.match(/\bas\s+(\$[a-z_]*\$)/i);
  assert.ok(body);
  const end = tail.indexOf(body[1], body.index + body[0].length) + body[1].length;
  return tail.slice(0, end) + ';';
}

test('Production QC keeps linked Order and tracker status atomic', {skip: !process.env.PGLITE_MODULE}, async t => {
  const {PGlite} = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/production-status-sync-fixture.sql', 'utf8'));
  const workflow = 'supabase/migrations/202608040001_production_workflow_nonretry_stale_conflict.sql';
  for (const name of ['production_workflow_command','workflow_public_status_text','workflow_public_next_step']) {
    await db.exec(definition(workflow, name));
  }
  await db.exec(definition('supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql', 'fulfillment_workflow_command'));
  const owner = randomUUID(), other = randomUUID();
  const authenticate = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await authenticate(owner);
  const scalar = async (sql, params=[]) => (await db.query(sql, params)).rows[0];
  const job = async x => (await scalar('select to_jsonb(p) row from production_jobs p where id=$1', [x.job])).row;
  const order = async x => (await scalar('select to_jsonb(o) row from orders o where id=$1', [x.order])).row;
  async function seed({source=null, status='qc', standalone=false, excluded=true, tracker=true, number=`OP-TEST-${randomUUID()}`, quote=`Q-TEST-${randomUUID()}`}={}) {
    const x = {job:randomUUID(), order:randomUUID(), number, quote, attempt:randomUUID(), roll:randomUUID()};
    if (!standalone) {
      await db.query("insert into orders values($1,$2,$3,$4,$5,now(),48.21,48.21,'unpaid',false)", [x.order,owner,x.number,x.quote,status]);
      if (tracker) await db.query('insert into order_tracking_public(user_id,order_number,status,updated_at) values($1,$2,$3,now())', [owner,x.number,status]);
    }
    const attempt = {id:x.attempt, captured_at:'2026-09-29T14:00:00Z', good_grams:50};
    await db.query('insert into production_jobs(id,user_id,order_number,quote_number,production_source_type,production_status,updated_at,job_payload,exclude_inventory_reduction) values($1,$2,$3,$4,$5,$6,now(),$7,$8)',
      [x.job,owner,standalone?null:x.number,standalone?null:x.quote,source,status,JSON.stringify({production_attempts:[attempt],last_completed_attempt:attempt}),excluded]);
    if (!excluded) {
      await db.query('insert into raw_material_inventory values($1,$2,100,60,now())', [x.roll,owner]);
      await db.query("insert into production_material_reservations(id,user_id,production_job_id,raw_material_roll_id,status,reserved_grams) values($1,$2,$3,$4,'active',60)", [randomUUID(),owner,x.job,x.roll]);
    }
    return x;
  }
  async function consume(x, {command='pass_qc', key=randomUUID(), version}={}) {
    version ??= (await job(x)).updated_at;
    return (await scalar('select consume_production_attempt($1,$2,$3,$4,$5,$6) result',
      [x.job,x.attempt,key,version,JSON.stringify([{raw_material_roll_id:x.roll,grams_used:50}]),command])).result;
  }
  async function synced(x, status) {
    assert.equal((await job(x)).production_status, status);
    const o = await order(x);
    assert.equal(o.status, status);
    assert.equal((await scalar('select status from order_tracking_public where order_number=$1', [x.number])).status, status);
    assert.deepEqual([o.order_total,o.balance_amount,o.payment_status,o.finance_pushed], [48.21,48.21,'unpaid',false]);
  }

  let broken;
  await t.test('reproduces the original NULL classification bug', async () => {
    await db.exec(definition('supabase/migrations/202608100007_legacy_production_lifecycle_compatibility.sql', 'consume_production_attempt'));
    const x = broken = await seed({number:'OP-000198',quote:'Q-000016'});
    const result = await consume(x);
    assert.equal(result.production_job.production_status, 'ready_for_fulfillment');
    assert.equal(result.order_status, 'qc');
    assert.equal((await order(x)).status, 'qc');
  });
  await db.exec(fs.readFileSync(migration, 'utf8'));

  await t.test('targeted repair preserves pricing, Production evidence and consumption receipt, and is repeatable', async () => {
    const beforeJob = await job(broken);
    const receipt = async () => (await scalar('select to_jsonb(r) row from production_attempt_consumption_receipts r where production_job_id=$1', [broken.job])).row;
    const beforeReceipt = await receipt();
    const repair = fs.readFileSync('supabase/repairs/20260930_reconcile_op_000198_qc.sql', 'utf8');
    await db.exec(repair); await synced(broken, 'ready_for_fulfillment');
    assert.deepEqual(await job(broken), beforeJob);
    assert.deepEqual(await receipt(), beforeReceipt);
    await db.exec(repair); await synced(broken, 'ready_for_fulfillment');
    assert.equal((await scalar('select count(*) n from project_events where order_number=$1', [broken.number])).n, 1);
    assert.equal((await scalar('select count(*) n from inventory_transactions where production_job_id=$1', [broken.job])).n, 0);
  });

  await t.test('NULL and repaired linked jobs synchronize QC with and without Inventory', async () => {
    for (const source of [null,'legacy_repaired']) for (const excluded of [true,false]) {
      const x = await seed({source,excluded});
      const key = randomUUID();
      const result = await consume(x, {key});
      assert.equal(result.record_class, 'MODERN_LINKED');
      assert.equal(result.order_status, 'ready_for_fulfillment');
      await synced(x, 'ready_for_fulfillment');
      const retry = await consume(x, {key});
      assert.equal(retry.idempotent, true);
      assert.equal((await scalar('select count(*) n from project_events where order_number=$1 and event_type=\'order.qc_passed\'', [x.number])).n, 1);
      assert.equal((await scalar('select count(*) n from inventory_transactions where production_job_id=$1', [x.job])).n, excluded?0:1);
      if (!excluded) assert.equal(Number((await scalar('select remaining_grams from raw_material_inventory where id=$1', [x.roll])).remaining_grams), 50);
    }
  });
  await t.test('full Printing → QC → Ready → Closed flow synchronizes every stage', async () => {
    const x = await seed({status:'ready_to_print'});
    async function advance(command, payload={}) {
      const j = await job(x);
      await db.query('select production_workflow_command($1::text,$2,$3,$4,$5,null)', [x.number,command,j.updated_at,JSON.stringify(payload),randomUUID()]);
    }
    await advance('start_print'); await synced(x, 'printing');
    await advance('complete_print', {actual_machine:'Test printer',actual_quantity:1,actual_grams_used:50,actual_print_hours:1,production_attempt:{id:x.attempt,good_grams:50}});
    await synced(x, 'qc');
    await consume(x); await synced(x, 'ready_for_fulfillment');
    const o = await order(x), key = randomUUID();
    const close = () => db.query('select fulfillment_workflow_command($1,$2,$3,$4,$5,null)', [x.number,'close_order',o.updated_at,JSON.stringify({fulfillment_confirmed_at:'2026-09-29T15:00:00Z',fulfillment_method:'pickup'}),key]);
    await close(); await synced(x, 'closed');
    await close(); await synced(x, 'closed');
  });
  await t.test('Needs Reprint synchronizes all three records', async () => {
    const x = await seed(); await consume(x, {command:'needs_reprint'}); await synced(x, 'ready_to_print');
  });
  await t.test('explicit standalone jobs still pass QC without creating an Order', async () => {
    const x = await seed({source:'legacy_standalone',standalone:true});
    const result = await consume(x);
    assert.equal(result.record_class, 'LEGACY_STANDALONE');
    assert.equal(result.order_status, null);
    assert.equal((await job(x)).production_status, 'ready_for_fulfillment');
    assert.equal((await scalar('select count(*) n from orders where id=$1', [x.order])).n, 0);
  });
  await t.test('missing tracker rolls back Inventory, Production, receipts and events', async () => {
    const x = await seed({tracker:false,excluded:false});
    await assert.rejects(consume(x), /Tracking projection/);
    assert.equal((await job(x)).production_status, 'qc');
    assert.equal((await order(x)).status, 'qc');
    assert.equal(Number((await scalar('select remaining_grams from raw_material_inventory where id=$1', [x.roll])).remaining_grams), 100);
    for (const table of ['inventory_transactions','production_attempt_consumption_receipts']) {
      assert.equal((await scalar(`select count(*) n from ${table} where production_job_id=$1`, [x.job])).n, 0);
    }
  });
  await t.test('owner, stale version, linked Order state and provenance checks remain enforced', async () => {
    const x = await seed();
    await authenticate(other); await assert.rejects(consume(x), /not found for authenticated owner/); await authenticate(owner);
    await assert.rejects(consume(x, {version:'2000-01-01T00:00:00Z'}), /changed after the page loaded/);
    await db.query("update orders set status='printing' where id=$1", [x.order]);
    await assert.rejects(consume(x), /QC command requires qc/);
    await db.query("update orders set status='qc',source_quote_number='Q-WRONG' where id=$1", [x.order]);
    await assert.rejects(consume(x), /provenance mismatch/);
    const unlinked = await seed({standalone:true});
    await assert.rejects(consume(unlinked), /Accepted linked Order not found/);
    assert.equal((await scalar("select has_function_privilege('anon','public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text)','execute') allowed")).allowed, false);
  });
});
