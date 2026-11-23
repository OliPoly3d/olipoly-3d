import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('private history evidence requires an owner-linked Storage object', {skip: !process.env.OPS_PGLITE_MODULE}, async () => {
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
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated, anon;
      GRANT SELECT ON storage.objects TO authenticated, anon;
    `);
    for (const name of ['20261105134128_ops_test_owner_history_lookup.sql','20261105185617_ops_test_owner_history_evidence.sql']) {
      await db.exec(readFileSync(new URL('../supabase/ops-preview/migrations/' + name, import.meta.url),'utf8'));
    }
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    await db.query(`
      INSERT INTO ops_history.records(owner_id,source_key,record_type,archived_status) VALUES
      ($1,'quote','External quote','Issued'),($2,'quote','Other quote','Issued');
    `, [owner, other]);
    await db.query(`
      INSERT INTO ops_history.references(owner_id,source_key,literal_reference) VALUES
      ($1,'quote','Q-900001'),($2,'quote','Q-900001');
    `, [owner, other]);
    const {rows: [file, missing]} = await db.query(`
      INSERT INTO ops_history.documents(owner_id,source_key,file_name) VALUES
      ($1,'quote','Q-900001.pdf'),($1,'quote','Missing PDF fixture')
      RETURNING object_name
    `,[owner]);
    await db.query(`
      INSERT INTO storage.objects VALUES
      ('ops-history-pdfs',$1),('ops-history-pdfs',$2),('unrelated',$1)
    `,[file.object_name, owner + '/unlinked.pdf']);
    const {rows: [bucket]} = await db.query("SELECT * FROM storage.buckets WHERE id = 'ops-history-pdfs'");
    assert.equal(bucket.public,false);
    assert.deepEqual(bucket.allowed_mime_types,['application/pdf']);

    const lookup = () => db.query("SELECT * FROM public.ops_preview_history_with_documents(' q-900001 ')");
    const objects = () => db.query('SELECT name FROM storage.objects');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec('SET ROLE authenticated');
    const {rows: [record]} = await lookup();
    assert.equal(record.related_order, null);
    assert.deepEqual(record.documents.map(d=>d.object_name).sort(), [file.object_name, missing.object_name].sort());
    assert.deepEqual((await objects()).rows,[{name:file.object_name}]);
    await assert.rejects(db.exec("DELETE FROM ops_history.documents WHERE source_key='quote'"),/permission denied/);

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [other]);
    const {rows: [otherRecord]} = await lookup();
    assert.equal(otherRecord.record_type, 'Other quote');
    assert.deepEqual(otherRecord.documents, []);
    assert.deepEqual((await objects()).rows, []);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(lookup(),/permission denied/);
    assert.deepEqual((await objects()).rows, []);
  } finally {
    await db.close();
  }
});
