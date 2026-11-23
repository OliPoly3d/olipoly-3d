-- Approved target required: OliPoly ERP Test llscjdyiiatmuqhilube ONLY.
-- Quarantine storage, not promotion. No canonical business-table mutations.
BEGIN;
CREATE SCHEMA ops_migration;
REVOKE ALL ON SCHEMA ops_migration FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA ops_migration TO authenticated;
CREATE TABLE ops_migration.batches(
 user_id uuid NOT NULL REFERENCES auth.users(id),batch_key text NOT NULL CHECK(batch_key~'^[a-f0-9]{64}$'),
 manifest_text text NOT NULL,manifest jsonb GENERATED ALWAYS AS(manifest_text::jsonb) STORED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(user_id,batch_key)
);
CREATE TABLE ops_migration.records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),
 source_project text NOT NULL CHECK(source_project='alffoktlwhpfothieude'),source_table text NOT NULL,
 source_pk jsonb NOT NULL CHECK(jsonb_typeof(source_pk)='object' AND length(source_pk::text)<=1000),
 source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),source_text text NOT NULL,
 source_record jsonb GENERATED ALWAYS AS(source_text::jsonb) STORED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,source_project,source_table,source_pk,source_hash),UNIQUE(user_id,id)
);
CREATE TABLE ops_migration.batch_rows(
 user_id uuid NOT NULL,batch_key text NOT NULL,record_id uuid NOT NULL,
 PRIMARY KEY(user_id,batch_key,record_id),
 FOREIGN KEY(user_id,batch_key) REFERENCES ops_migration.batches(user_id,batch_key),
 FOREIGN KEY(user_id,record_id) REFERENCES ops_migration.records(user_id,id)
);
ALTER TABLE ops_migration.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_migration.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_migration.batch_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ops_migration FROM PUBLIC,anon,authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA ops_migration TO authenticated;
CREATE POLICY owner_read ON ops_migration.batches FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY owner_read ON ops_migration.records FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY owner_read ON ops_migration.batch_rows FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE FUNCTION public.ops_preview_import_stage(p_manifest_text text,p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); m jsonb; b text; saved_manifest text; d jsonb; r jsonb; record jsonb; pk jsonb;
 rid uuid; source_owner uuid; count_added integer:=0; members_added integer:=0; affected integer; k text; pk_keys text[];
 allowed text[]:=ARRAY['active_projects','asset_links','asset_records','campaign_order_conversion_snapshots','campaign_products','campaign_submission_items','campaign_submissions','campaigns','catalog_parts','customers','document_counters','finance_correction_receipts','financial_entries','finished_goods_inventory','hub_notes','hub_reminders','inventory_settings','inventory_spool_pool','inventory_transactions','non_filament_materials','order_payment_command_receipts','order_pricing_revisions','order_tracking_public','orders','parts_catalog','printer_pm','product_recipes','production_attempt_consumption_receipts','production_job_roll_usage','production_jobs','production_linkage_audit','production_material_reservations','project_events','quote_accepted_commercial_snapshots','quotes','raw_material_inventory','reusable_spool_pool','workflow_command_receipts'];
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT FROM public.ops_preview_workspaces WHERE user_id=actor) THEN RAISE EXCEPTION 'Sign in and initialize the test workspace first' USING ERRCODE='42501'; END IF;
 IF p_manifest_text IS NULL OR octet_length(p_manifest_text)>4000000 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>25 OR octet_length(p_rows::text)>600000 THEN RAISE EXCEPTION 'Invalid staging manifest or chunk size'; END IF;
 m:=p_manifest_text::jsonb;
 IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR m->'version' IS DISTINCT FROM '1'::jsonb OR m->>'source_project' IS DISTINCT FROM 'alffoktlwhpfothieude' OR m->>'target_project' IS DISTINCT FROM 'llscjdyiiatmuqhilube' OR m->>'scope' IS DISTINCT FROM 'quarantine_only' OR m->>'target_owner' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'Wrong staging source, target, owner or scope' USING ERRCODE='42501'; END IF;
 source_owner:=(m->>'source_owner')::uuid;
 IF source_owner IS NULL OR nullif(m->>'captured_at','') IS NULL THEN RAISE EXCEPTION 'Source owner and capture date required'; END IF;
 PERFORM (m->>'captured_at')::timestamptz;
 IF jsonb_typeof(m->'baseline') IS DISTINCT FROM 'object' OR jsonb_typeof(m#>'{baseline,years}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Captured baseline must be an object with yearly summaries'; END IF;
 IF jsonb_typeof(m->'owner_exceptions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Explicit ownership exception list required'; END IF;
 IF jsonb_typeof(m->'records') IS DISTINCT FROM 'array' OR jsonb_typeof(m->'tables') IS DISTINCT FROM 'array' OR jsonb_typeof(m->'record_count') IS DISTINCT FROM 'number' OR (m->>'record_count')::numeric NOT BETWEEN 0 AND 20000 OR (m->>'record_count')::numeric<>jsonb_array_length(m->'records') THEN RAISE EXCEPTION 'Invalid manifest record counts'; END IF;
 IF jsonb_array_length(m->'tables')<>cardinality(allowed) OR (SELECT count(DISTINCT value->>'name') FROM jsonb_array_elements(m->'tables'))<>cardinality(allowed) OR EXISTS(SELECT FROM jsonb_array_elements(m->'tables') t WHERE coalesce(t->>'name','')<>ALL(allowed) OR jsonb_typeof(t->'count') IS DISTINCT FROM 'number' OR (t->>'count')::numeric<0 OR (t->>'count')::numeric<>(SELECT count(*) FROM jsonb_array_elements(m->'records') x WHERE x->>'table'=t->>'name')) THEN RAISE EXCEPTION 'Complete supported table counts are required'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(m->'records') LOOP
  IF coalesce(d->>'table','')<>ALL(allowed) OR jsonb_typeof(d->'pk_text') IS DISTINCT FROM 'string' OR length(d->>'pk_text')>1000 OR jsonb_typeof((d->>'pk_text')::jsonb) IS DISTINCT FROM 'object' OR (d->>'pk_text')::jsonb='{}'::jsonb OR coalesce(d->>'source_hash','')!~'^[a-f0-9]{64}$' OR coalesce(d->>'disposition','') NOT IN ('review','inventory_deferred','historical_only','stage_only') OR jsonb_typeof(d->'flags') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'reference_labels') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid source record descriptor'; END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements((d->'flags')||(d->'reference_labels')) v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>4000) THEN RAISE EXCEPTION 'Invalid review labels'; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM jsonb_array_elements(m->'records') x GROUP BY x->>'table',(x->>'pk_text')::jsonb HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate source key in manifest'; END IF;
 b:=encode(sha256(convert_to(p_manifest_text,'UTF8')),'hex');
 INSERT INTO ops_migration.batches(user_id,batch_key,manifest_text) VALUES(actor,b,p_manifest_text) ON CONFLICT DO NOTHING;
 SELECT manifest_text INTO STRICT saved_manifest FROM ops_migration.batches WHERE user_id=actor AND batch_key=b FOR UPDATE;
 IF saved_manifest IS DISTINCT FROM p_manifest_text THEN RAISE EXCEPTION 'Batch identity collision'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(r->'row_text') IS DISTINCT FROM 'string' OR octet_length(r->>'row_text')>1000000 THEN RAISE EXCEPTION 'Invalid source row'; END IF;
  SELECT x INTO d FROM jsonb_array_elements(m->'records') x WHERE x->>'table'=r->>'table' AND x->>'pk_text'=r->>'pk_text' AND x->>'source_hash'=r->>'source_hash';
  IF NOT FOUND OR encode(sha256(convert_to(r->>'row_text','UTF8')),'hex') IS DISTINCT FROM r->>'source_hash' THEN RAISE EXCEPTION 'Source row does not match manifest/checksum'; END IF;
  record:=(r->>'row_text')::jsonb;pk:=(r->>'pk_text')::jsonb;
  IF jsonb_typeof(record) IS DISTINCT FROM 'object' OR EXISTS(SELECT FROM jsonb_each(pk) x WHERE x.value='null'::jsonb OR record->x.key IS DISTINCT FROM x.value) THEN RAISE EXCEPTION 'Primary key does not match source record'; END IF;
  SELECT array_agg(a.attname::text) INTO pk_keys FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) z(attnum) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=z.attnum WHERE i.indisprimary AND n.nspname='public' AND c.relname=r->>'table';
  IF pk_keys IS NULL OR (SELECT count(*) FROM jsonb_object_keys(pk))<>cardinality(pk_keys) OR EXISTS(SELECT FROM jsonb_object_keys(pk) x WHERE x<>ALL(pk_keys)) THEN RAISE EXCEPTION 'Source key differs from the supported table primary key'; END IF;
  FOREACH k IN ARRAY ARRAY['user_id','owner_id'] LOOP
   IF record->>k IS NOT NULL AND record->>k<>source_owner::text THEN RAISE EXCEPTION 'Different source owner in record' USING ERRCODE='42501'; END IF;
  END LOOP;
  rid:=NULL;
  INSERT INTO ops_migration.records(user_id,source_project,source_table,source_pk,source_hash,source_text) VALUES(actor,m->>'source_project',r->>'table',pk,r->>'source_hash',r->>'row_text') ON CONFLICT(user_id,source_project,source_table,source_pk,source_hash) DO NOTHING RETURNING id INTO rid;
  IF rid IS NOT NULL THEN count_added:=count_added+1; ELSE SELECT id INTO STRICT rid FROM ops_migration.records WHERE user_id=actor AND source_project=m->>'source_project' AND source_table=r->>'table' AND source_pk=pk AND source_hash=r->>'source_hash'; END IF;
  INSERT INTO ops_migration.batch_rows(user_id,batch_key,record_id) VALUES(actor,b,rid) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;members_added:=members_added+affected;
 END LOOP;
 RETURN jsonb_build_object('batch_key',b,'added_versions',count_added,'added_memberships',members_added,'expected',jsonb_array_length(m->'records'),'staged',(SELECT count(*) FROM ops_migration.batch_rows WHERE user_id=actor AND batch_key=b),'scope','quarantine_only');
END $$;
REVOKE ALL ON FUNCTION public.ops_preview_import_stage(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_import_stage(text,jsonb) TO authenticated;

CREATE FUNCTION public.ops_preview_import_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]') FROM (
  SELECT b.batch_key,b.created_at,b.manifest->>'captured_at' as captured_at,b.manifest->>'source_project' as source_project,(b.manifest->>'record_count')::integer as expected,count(r.record_id) as staged
  FROM ops_migration.batches b LEFT JOIN ops_migration.batch_rows r USING(user_id,batch_key) WHERE b.user_id=auth.uid() GROUP BY b.user_id,b.batch_key
 ) x
$$;
CREATE FUNCTION public.ops_preview_import_load(p_batch_key text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('batch_key',b.batch_key,'manifest',b.manifest-'records','created_at',b.created_at,'rows',coalesce((
  SELECT jsonb_agg(jsonb_build_object('record_id',r.id,'table',r.source_table,'source_pk',r.source_pk,'source_hash',r.source_hash,'source_versions',(SELECT count(*) FROM ops_migration.records v WHERE v.user_id=r.user_id AND v.source_project=r.source_project AND v.source_table=r.source_table AND v.source_pk=r.source_pk),'plan',d) ORDER BY r.source_table,r.source_pk::text)
  FROM ops_migration.batch_rows br JOIN ops_migration.records r ON r.user_id=br.user_id AND r.id=br.record_id
  JOIN LATERAL (SELECT value AS d FROM jsonb_array_elements(b.manifest->'records') WHERE value->>'table'=r.source_table AND (value->>'pk_text')::jsonb=r.source_pk AND value->>'source_hash'=r.source_hash) x ON true
  WHERE br.user_id=b.user_id AND br.batch_key=b.batch_key),'[]'))
 FROM ops_migration.batches b WHERE b.user_id=auth.uid() AND b.batch_key=p_batch_key
$$;
REVOKE ALL ON FUNCTION public.ops_preview_import_list() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops_preview_import_load(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_import_list(),public.ops_preview_import_load(text) TO authenticated;
COMMIT;
