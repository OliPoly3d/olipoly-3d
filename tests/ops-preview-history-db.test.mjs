import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('legacy history lookup is exact, read-only, and scoped to the owner', { skip: !process.env.OPS_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.OPS_PGLITE_MODULE));
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
    `);
    await db.exec(readFileSync(new URL(
      '../supabase/ops-preview/migrations/20261105134128_ops_test_owner_history_lookup.sql', import.meta.url
    ), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    await db.query(`
      INSERT INTO ops_history.records VALUES
      ($1,'issued','External quote','Issued',NULL,ARRAY['Quote PDF'],ARRAY[]::text[]),
      ($1,'older','Order','Closed / paid','OP-900002',ARRAY['Note-based Finance match'],ARRAY['Settlement unverified']),
      ($1,'orphan','Accepted snapshot','Accepted',NULL,ARRAY[]::text[],ARRAY['Missing order row']),
      ($1,'draft','Order','Draft','OP-900004',ARRAY[]::text[],ARRAY['Conversion flag set']),
      ($1,'zero','Order','Closed / paid','OP-900005',ARRAY['Zero-dollar history'],ARRAY['Invoice copy missing']),
      ($2,'other','Order','Closed','OP-900006',ARRAY[]::text[],ARRAY[]::text[])
    `, [owner, other]);
    await db.query(`
      INSERT INTO ops_history.references (owner_id,source_key,literal_reference) VALUES
      ($1,'issued','Q-900001'),($1,'older','Q-900002'),($1,'older','OP-900002'),
      ($1,'older','INV-900002'),($1,'older','001234'),($1,'orphan','OP-900003'),
      ($1,'draft','OP-900004'),($1,'zero','001234'),($1,'zero','INV-900005'),($2,'other','Q-900001')
    `, [owner, other]);

    const lookup = async ref => (await db.query('SELECT * FROM public.ops_preview_history_lookup($1)', [ref])).rows;
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec('SET ROLE authenticated');
    const [quote] = await lookup(' q-900001 ');
    assert.equal(quote.matched_reference, 'Q-900001');
    assert.equal(quote.related_order, null);
    for (const invalid of ['OP-900001','Q-90000%','1234',' ','A'.repeat(129)]) assert.deepEqual(await lookup(invalid), []);
    for (const ref of ['Q-900002','OP-900002','INV-900002']) assert.equal((await lookup(ref))[0].source_key,'older');
    assert.deepEqual((await lookup('001234')).map(row => row.source_key), ['older','zero']);
    assert.deepEqual((await lookup('INV-900002'))[0].open_issues, ['Settlement unverified']);
    assert.equal((await lookup('OP-900003'))[0].related_order, null);
    assert.equal((await lookup('OP-900004'))[0].archived_status, 'Draft');
    assert.deepEqual((await lookup('INV-900005'))[0].evidence, ['Zero-dollar history']);
    await assert.rejects(db.exec("DELETE FROM ops_history.records WHERE source_key = 'issued'"), /permission denied/);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await lookup('Q-900001'))[0].source_key, 'other');
    assert.deepEqual(await lookup('001234'), []);
    assert.equal((await db.query('SELECT count(*)::int n FROM ops_history.records')).rows[0].n, 1);
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    assert.deepEqual(await lookup('Q-900001'), []);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(lookup('Q-900001'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM ops_history.records'), /permission denied/);
  } finally {
    await db.close();
  }
});
