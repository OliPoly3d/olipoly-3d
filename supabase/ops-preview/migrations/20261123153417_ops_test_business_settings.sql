-- ERP TEST ONLY — llscjdyiiatmuqhilube. No existing-record rewrite.
BEGIN;
CREATE FUNCTION public.ops_preview_settings_commit(p_settings jsonb,p_expected_revision bigint,p_command_id text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); w public.ops_preview_workspaces%rowtype; receipt public.ops_preview_receipts%rowtype;
 request jsonb; previous jsonb; k text; n numeric; history jsonb;
 allowed text[]:=ARRAY['version','laborRate','planningRate','p1sRate','p2sRate','targetMargin','headquarters','mileageMode','mileageRate','officeSqft','homeSqft','consumerTerms','businessTerms'];
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL OR length(btrim(p_command_id)) NOT BETWEEN 1 AND 200 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Command identity and settings change reason are required'; END IF;
 IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_settings))<>cardinality(allowed) OR EXISTS(SELECT FROM jsonb_object_keys(p_settings) x WHERE NOT x=ANY(allowed)) THEN RAISE EXCEPTION 'Provide complete business settings'; END IF;
 IF p_settings->'version' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Unsupported settings version'; END IF;
 FOR k IN SELECT unnest(ARRAY['laborRate','planningRate','p1sRate','p2sRate','targetMargin','mileageRate','officeSqft','homeSqft']) LOOP
  IF jsonb_typeof(p_settings->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid numeric setting %',k; END IF;
  n:=(p_settings->>k)::numeric;
  IF n::text IN ('NaN','Infinity','-Infinity') OR n<0 OR n>(CASE WHEN k='targetMargin' THEN 99.99 WHEN k='mileageRate' THEN 100 WHEN k IN ('officeSqft','homeSqft') THEN 1000000 ELSE 100000 END)
   OR n<>round(n,CASE WHEN k='mileageRate' THEN 4 ELSE 2 END) THEN RAISE EXCEPTION 'Invalid numeric setting %',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['headquarters','consumerTerms','businessTerms'] LOOP
  IF jsonb_typeof(p_settings->k) IS DISTINCT FROM 'string' OR length(btrim(p_settings->>k)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid text setting %',k; END IF;
 END LOOP;
 IF coalesce(p_settings->>'mileageMode','') NOT IN ('irs','custom') OR (p_settings->>'mileageMode'='custom' AND (p_settings->>'mileageRate')::numeric<=0) THEN RAISE EXCEPTION 'Invalid mileage default'; END IF;
 IF ((p_settings->>'officeSqft')::numeric=0)<>((p_settings->>'homeSqft')::numeric=0) OR (p_settings->>'officeSqft')::numeric>(p_settings->>'homeSqft')::numeric THEN RAISE EXCEPTION 'Check office and home floor areas'; END IF;
 request:=jsonb_build_object('type','business_settings','settings',p_settings,'revision',p_expected_revision,'reason',p_reason);
 SELECT * INTO STRICT w FROM public.ops_preview_workspaces WHERE user_id=actor FOR UPDATE;
 SELECT * INTO receipt FROM public.ops_preview_receipts WHERE command_id=p_command_id;
 IF FOUND THEN
  IF receipt.user_id IS DISTINCT FROM actor OR receipt.request-'before' IS DISTINCT FROM request THEN RAISE EXCEPTION 'Command identity already used' USING ERRCODE='23505'; END IF;
  RETURN public.ops_preview_load();
 END IF;
 IF w.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Workspace changed on another device. Reload before saving settings.' USING ERRCODE='40001'; END IF;
 previous:=coalesce(w.state->'settings','{}');
 IF previous=p_settings THEN RAISE EXCEPTION 'No settings changed'; END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]') INTO history FROM
  (SELECT value,ordinal FROM jsonb_array_elements(jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'reason',p_reason,'before',previous,'after',p_settings,'command',p_command_id))||coalesce(w.state->'settingsHistory','[]')) WITH ORDINALITY x(value,ordinal) ORDER BY ordinal LIMIT 20) recent;
 UPDATE public.ops_preview_workspaces SET state=jsonb_set(jsonb_set(state,'{settings}',p_settings),'{settingsHistory}',history),revision=revision+1,updated_at=now() WHERE user_id=actor RETURNING revision INTO w.revision;
 INSERT INTO public.ops_preview_receipts(command_id,user_id,request,resulting_revision) VALUES(p_command_id,actor,request||jsonb_build_object('before',previous),w.revision);
 RETURN public.ops_preview_load();
END $$;
REVOKE ALL ON FUNCTION public.ops_preview_settings_commit(jsonb,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_settings_commit(jsonb,bigint,text,text) TO authenticated;
COMMIT;
