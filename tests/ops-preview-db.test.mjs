import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require('../js/tax-rate.js'); require('../js/order-line-items.js'); require('../js/quote-pricing.js');
const M = require('../js/ops-preview/model.js');

// Optional local Postgres engine; never contacts a remote database.
// Install @electric-sql/pglite@0.5.15 outside the repo and point OPS_PGLITE_MODULE
// to its dist/index.js. The documented dedicated check must run before approval.
test('connected workspace: actual Postgres workflow and isolation rehearsal', {skip: !process.env.OPS_PGLITE_MODULE}, async t => {
  const {PGlite} = await import(pathToFileURL(process.env.OPS_PGLITE_MODULE));
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  let state, lastParams;
  const id = 'sample-mixed-order';
  const sql = file => fs.readFileSync(path.join(root,'supabase/ops-preview/migrations',file),'utf8');
  async function commit(params) {
    return (await db.query('select public.ops_preview_commit($1,$2::jsonb,$3::jsonb,$4,$5) as state', params)).rows[0].state;
  }
  async function internalQuery(sql) {
    await db.exec('RESET ROLE');
    try { return await db.query(sql); } finally { await db.exec('SET ROLE authenticated'); }
  }
  function params(action, next = M.command(state,id,action)) {
    return [id,JSON.stringify(action),JSON.stringify(next.orders.find(o=>o.id===id)),state.revision,crypto.randomUUID()];
  }
  async function action(type, fields={}) {
    lastParams = params({type,...fields});
    state = await commit(lastParams);
    return state.orders[0];
  }
  async function inspect(run, accepted, rejected, extra=0, zero=false) {
    const item = state.orders[0].items.find(i=>i.id===run.itemId);
    return action('inspect',{runId:run.id,accepted,rejected,hours:zero?0.5:run.plannedHours,
      usage:item.materials.map((m,n)=>({key:M.materialKey(m),grams:zero?0:m.grams_each*run.quantity+(n===0?extra:0)})),notes:'Fictional QC'});
  }
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`);
    // These UUID extensions are Supabase built-ins; PGlite already provides gen_random_uuid.
    await db.exec(sql('20261104125424_ops_test_business_baseline.sql').replaceAll('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;','').replaceAll('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',''));
    await db.exec(sql('20261104130021_ops_test_connected_workspace.sql'));
    await db.exec(`INSERT INTO auth.users VALUES('${owner}'),('${other}'); SET request.jwt.claim.sub='${owner}'; SET ROLE authenticated;`);
    await t.test('initialize is idempotent and creates only fictional stock and a draft', async () => {
      state = (await db.query('select public.ops_preview_initialize() as state')).rows[0].state;
      assert.equal(state.orders[0].reference,'Q-000001');
      assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.raw_material_inventory')).rows[0].n,3);
      assert.equal((await db.query('select public.ops_preview_initialize() as state')).rows[0].state.revision,state.revision);
    });
    await t.test('intake and shared quote revisions persist without creating an order or reserving stock', async () => {
      let draft=M.copy(state.orders[0]); draft.quoteStage='request';
      draft.intake={source:'Email / PO',summary:'Fictional request with two kinds of parts',contact:'fixture@example.test',neededBy:'2026-11-20'};
      state=await commit([id,JSON.stringify({type:'save'}),JSON.stringify(draft),state.revision,crypto.randomUUID()]);
      for(const command of [{type:'prepare_quote'},{type:'send_quote',via:'Email'},{type:'revise_quote',reason:'Clarified scope; price unchanged'},{type:'send_quote',via:'Email'}]) {
        const next=M.quoteCommand(state,id,command);
        state=await commit([id,JSON.stringify({type:'save'}),JSON.stringify(next.orders[0]),state.revision,crypto.randomUUID()]);
      }
      state=(await db.query('select public.ops_preview_load() state')).rows[0].state;
      assert.equal(M.stage(state.orders[0]),'awaiting');
      assert.equal(state.orders[0].quoteHistory.length,2);
      assert.equal(state.orders[0].quoteOffer.totals.total,110);
      assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.production_material_reservations')).rows[0].n,0);
    });
    await t.test('quote acceptance freezes the canonical invoice and creates one order', async () => {
      await action('approve',{method:'Verbal agreement recorded'});
      assert.equal(state.orders[0].reference,'OP-000001');
      assert.equal((await internalQuery('select count(*)::int n from public.quote_accepted_commercial_snapshots')).rows[0].n,1);
      await action('release');
      assert.equal(M.reserved(state,'PETG / Black'),160);
    });
    await t.test('stale commands and edits hidden in an unrelated command are rejected atomically', async () => {
      const p = params({type:'start',itemId:'blocks',quantity:2,printer:'P1S'});
      const stale=[...p];stale[3]--;
      await assert.rejects(commit(stale),/changed on another device/);
      const tampered=JSON.parse(p[2]);tampered.items[0].quantity=100;
      await assert.rejects(commit([p[0],p[1],JSON.stringify(tampered),p[3],p[4]]),/unrelated fields|pricing revision/);
      assert.equal((await db.query('select public.ops_preview_load() state')).rows[0].state.revision,state.revision);
    });
    await t.test('zero-consumption failure is retained without a stock deduction', async () => {
      await action('start',{itemId:'blocks',quantity:2,printer:'P1S'});
      await inspect(state.orders[0].runs.at(-1),0,2,0,true);
      assert.equal(state.inventory.find(i=>i.key==='PETG / Black').grams,2000);
      assert.equal(state.orders[0].status,'ready_to_print');
    });
    await t.test('parallel printers, failed parts, overage and reprint consume exactly once', async () => {
      await action('start',{itemId:'blocks',quantity:2,printer:'P1S'});
      const blockRun=state.orders[0].runs.at(-1);
      await action('start',{itemId:'tags',quantity:3,printer:'P2S'});
      const tagRun=state.orders[0].runs.at(-1);
      await inspect(blockRun,1,1,5);
      assert.equal(state.orders[0].status,'printing');
      const replay=lastParams, revision=state.revision;
      state=await commit(replay);
      assert.equal(state.revision,revision);
      assert.equal(state.inventory.find(i=>i.key==='PETG / Black').grams,1835);
      await action('start',{itemId:'blocks',quantity:1,printer:'P1S'});
      await inspect(state.orders[0].runs.at(-1),1,0);
      await inspect(tagRun,3,0);
      assert.equal(state.orders[0].status,'ready_for_fulfillment');
      assert.equal(state.inventory.find(i=>i.key==='PETG / Black').grams,1755);
      const rows=(await db.query('select remaining_grams,current_grams,reserved_grams from public.raw_material_inventory')).rows;
      assert.ok(rows.every(r=>Number(r.remaining_grams)===Number(r.current_grams)&&Number(r.reserved_grams)===0));
      assert.equal((await internalQuery('select count(*)::int n from public.production_attempt_consumption_receipts')).rows[0].n,3);
    });
    await t.test('one payment posts net sales, tax and separate fee once; actuals do not mutate posted finance', async () => {
      await action('pickup');
      await action('pay',{amount:110,fee:3.49,method:'Stripe',reference:'fictional-reference'});
      const replay=lastParams;
      state=await commit(replay);
      const rows=(await db.query('select type,amount,sales_tax_collected from public.financial_entries order by type')).rows;
      assert.equal(rows.length,2);
      assert.equal(Number(rows[0].amount),3.49);
      assert.equal(Number(rows[1].amount),102.80);
      assert.equal(Number(rows[1].sales_tax_collected),7.20);
      await action('actuals',{hours:0.5,otherCosts:0});
      assert.equal(state.orders[0].status,'closed');
      assert.equal(M.balance(state.orders[0]),0);
      const invoice=(await db.query('select public.get_order_invoice_snapshot($1) as invoice',[state.orders[0].database.orderId])).rows[0].invoice;
      assert.equal(invoice.reconciliation_status,'verified');
      assert.deepEqual((await db.query('select type,amount,sales_tax_collected from public.financial_entries order by type')).rows,rows);
    });
    await t.test('a second owner cannot read or replay the first owner workspace', async () => {
      await db.exec(`SET request.jwt.claim.sub='${other}';`);
      assert.equal((await db.query('select count(*)::int n from public.ops_preview_workspaces')).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n,0);
      await db.query('select public.ops_preview_initialize()');
      await assert.rejects(commit(lastParams),/identity already used/);
    });
    await t.test('eight-cent all-in sale retains one cent tax through Finance', async () => {
      state=(await db.query('select public.ops_preview_load() state')).rows[0].state;
      const draft=M.copy(state.orders[0]);draft.items=[{...draft.items[0],quantity:1,unit_price:0.08}];draft.designFee=0;
      state=await commit([id,JSON.stringify({type:'save'}),JSON.stringify(draft),state.revision,crypto.randomUUID()]);
      await action('approve',{method:'Email / text'});
      await action('pay',{amount:0.08,fee:0,method:'Cash',reference:''});
      const row=(await db.query('select amount,sales_tax_collected from public.financial_entries')).rows[0];
      assert.equal(Number(row.amount),0.07);assert.equal(Number(row.sales_tax_collected),0.01);
    });
    await t.test('anonymous tracking exposes milestones, with no private workspace access', async () => {
      await db.exec("RESET ROLE; SET request.jwt.claim.sub=''; SET ROLE anon;");
      await assert.rejects(db.query('select public.ops_preview_load()'),/permission denied/);
      await assert.rejects(db.query('select * from public.ops_preview_workspaces'),/permission denied/);
      const record=(await db.query("select * from public.public_order_tracking_lookup('OP-000001')")).rows[0];
      assert.equal(record.status,'closed');assert.equal(Number(record.balance_amount),0);
      assert.equal(record.shipping_or_pickup_note,'Sample pickup confirmed');
      assert.equal(record.user_id,undefined);assert.equal(record.internal_notes,undefined);
    });
  } finally { await db.close(); }
});
