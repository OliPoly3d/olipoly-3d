-- ERP TEST ONLY: llscjdyiiatmuqhilube. Additive filing history; no ledger writes.
BEGIN;
CREATE TABLE public.ops_preview_tax_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end>=period_start AND extract(year FROM period_start)=extract(year FROM period_end)),
 kind text NOT NULL CHECK(kind IN ('return','payment','refund','void_payment','void_return')),
 payload jsonb NOT NULL,
 source jsonb NOT NULL DEFAULT '[]',
 command_id text NOT NULL,
 request jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,command_id)
);
CREATE INDEX ops_preview_tax_events_period ON public.ops_preview_tax_events(user_id,period_start,period_end,event_no);
ALTER TABLE public.ops_preview_tax_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_preview_tax_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.ops_preview_tax_events_event_no_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ops_preview_tax_events TO authenticated;
CREATE POLICY owner_tax_events ON public.ops_preview_tax_events FOR SELECT TO authenticated USING((SELECT auth.uid())=user_id);

CREATE FUNCTION public.ops_preview_tax_source(p_start date,p_end date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(s.record ORDER BY s.record->>'id'),'[]') FROM (
  SELECT (SELECT jsonb_object_agg(k,coalesce(e->k,'null')) FROM unnest(ARRAY['id','entry_date','type','amount','shipping_charged','sales_tax_collected','sales_county','destination_county','sales_tax_rate','tax_exempt_sale','accepted_commercial_snapshot']) k) record
  FROM public.get_effective_financial_entries() e
  WHERE e->>'type'='income' AND coalesce((e->>'report_transaction_count')::integer,1)=1
    AND e->>'entry_date'>=p_start::text AND e->>'entry_date'<=p_end::text
 ) s
$$;
REVOKE ALL ON FUNCTION public.ops_preview_tax_source(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_tax_source(date,date) TO authenticated;

CREATE FUNCTION public.ops_preview_tax_load() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(e)-'user_id'-'request' ORDER BY event_no),'[]')
 FROM public.ops_preview_tax_events e WHERE user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.ops_preview_tax_load() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_tax_load() TO authenticated;

CREATE FUNCTION public.ops_preview_tax_commit(p_start date,p_end date,p_kind text,p_payload jsonb,p_expected_event_id uuid,p_expected_source jsonb,p_command_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); last_event uuid; last_return public.ops_preview_tax_events%rowtype;
 existing public.ops_preview_tax_events%rowtype; target public.ops_preview_tax_events%rowtype;
 request_value jsonb; snapshot jsonb:='[]'; allowed text[]; k text; n numeric;
 reported numeric; discount numeric; charges numeric; credits numeric; tax numeric;
 paid numeric; event_date date; due_date date; warning boolean;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end OR extract(year FROM p_start)<>extract(year FROM p_end) OR extract(year FROM p_start) NOT BETWEEN 2000 AND 9998 THEN RAISE EXCEPTION 'Invalid filing period'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('return','payment','refund','void_payment','void_return') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR length(btrim(coalesce(p_command_id,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid filing command'; END IF;
 IF jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'reason')) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 allowed:=CASE WHEN p_kind='return' THEN ARRAY['reason','return_type','filed_on','due_on','confirmation','document_link','review_note','confirmed','reported_tax','discount','charges','credits']
  WHEN p_kind IN ('payment','refund') THEN ARRAY['reason','amount','paid_on','confirmation','document_link','confirmed']
  WHEN p_kind='void_payment' THEN ARRAY['reason','target_id'] ELSE ARRAY['reason'] END;
 IF (SELECT count(*) FROM jsonb_object_keys(p_payload))<>cardinality(allowed) OR EXISTS(SELECT FROM jsonb_object_keys(p_payload) x WHERE NOT x=ANY(allowed)) THEN RAISE EXCEPTION 'Unexpected or missing filing fields'; END IF;
 -- Serialize commands for this owner's filing history, including overlapping-period checks.
 PERFORM pg_advisory_xact_lock(hashtextextended('ops-tax:'||actor::text,0));
 request_value:=jsonb_build_object('start',p_start,'end',p_end,'kind',p_kind,'payload',p_payload,'expected',p_expected_event_id,'source',p_expected_source);
 SELECT * INTO existing FROM public.ops_preview_tax_events WHERE user_id=actor AND command_id=p_command_id;
 IF FOUND THEN
  IF existing.request IS DISTINCT FROM request_value THEN RAISE EXCEPTION 'Command identity already used for different data' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(existing)-'user_id'-'request';
 END IF;
 SELECT id INTO last_event FROM public.ops_preview_tax_events WHERE user_id=actor AND period_start=p_start AND period_end=p_end ORDER BY event_no DESC LIMIT 1;
 IF last_event IS DISTINCT FROM p_expected_event_id THEN RAISE EXCEPTION 'Filing history changed; refresh before saving' USING ERRCODE='40001'; END IF;
 SELECT * INTO last_return FROM public.ops_preview_tax_events WHERE user_id=actor AND period_start=p_start AND period_end=p_end AND kind IN ('return','void_return') ORDER BY event_no DESC LIMIT 1;
 SELECT coalesce(sum(CASE WHEN e.kind='refund' THEN -1 ELSE 1 END*(e.payload->>'amount')::numeric),0) INTO paid
 FROM public.ops_preview_tax_events e WHERE e.user_id=actor AND e.period_start=p_start AND e.period_end=p_end AND e.kind IN ('payment','refund')
 AND NOT EXISTS(SELECT FROM public.ops_preview_tax_events v WHERE v.user_id=actor AND v.kind='void_payment' AND v.payload->>'target_id'=e.id::text);

 IF p_kind IN ('return','payment','refund') THEN
  IF p_payload->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Confirm the external filing or payment'; END IF;
  IF jsonb_typeof(p_payload->'confirmation') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'confirmation')) NOT BETWEEN 3 AND 200 OR jsonb_typeof(p_payload->'document_link') IS DISTINCT FROM 'string' OR length(p_payload->>'document_link')>1000 OR (p_payload->>'document_link'<>'' AND p_payload->>'document_link'!~* '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Check confirmation and HTTPS document link'; END IF;
  BEGIN
   k:=CASE WHEN p_kind='return' THEN 'filed_on' ELSE 'paid_on' END;
   event_date:=(p_payload->>k)::date;
   IF event_date IS NULL OR event_date::text<>p_payload->>k OR event_date>(now() AT TIME ZONE 'America/New_York')::date OR event_date<p_start THEN RAISE EXCEPTION 'Invalid event date'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a valid past or current filing/payment date'; END;
 END IF;

 IF p_kind='return' THEN
  IF coalesce(p_payload->>'return_type','') NOT IN ('original','amendment','record_correction') THEN RAISE EXCEPTION 'Invalid return type'; END IF;
  IF (last_return.kind='return') IS TRUE AND p_payload->>'return_type'='original' THEN RAISE EXCEPTION 'Return already recorded; use an amendment or record correction'; END IF;
  IF (last_return.kind='return') IS NOT TRUE AND p_payload->>'return_type'<>'original' THEN RAISE EXCEPTION 'Record the original return first'; END IF;
  IF EXISTS(SELECT FROM (SELECT DISTINCT ON(period_start,period_end) period_start,period_end,kind FROM public.ops_preview_tax_events WHERE user_id=actor AND kind IN ('return','void_return') ORDER BY period_start,period_end,event_no DESC) x WHERE x.kind='return' AND x.period_start<=p_end AND x.period_end>=p_start AND (x.period_start<>p_start OR x.period_end<>p_end)) THEN RAISE EXCEPTION 'Period overlaps another filed return; review its history first'; END IF;
  BEGIN due_date:=(p_payload->>'due_on')::date;
   IF due_date IS NULL OR due_date::text<>p_payload->>'due_on' OR due_date<p_end OR event_date<p_end THEN RAISE EXCEPTION 'Invalid dates'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Check filing and due dates against period end'; END;
  FOREACH k IN ARRAY ARRAY['reported_tax','discount','charges','credits'] LOOP
   IF jsonb_typeof(p_payload->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid return amount %',k; END IF;
   n:=(p_payload->>k)::numeric;
   IF n::text IN ('NaN','Infinity','-Infinity') OR n<0 OR n>999999999 OR n<>round(n,2) THEN RAISE EXCEPTION 'Invalid return amount %',k; END IF;
  END LOOP;
  reported:=(p_payload->>'reported_tax')::numeric;discount:=(p_payload->>'discount')::numeric;charges:=(p_payload->>'charges')::numeric;credits:=(p_payload->>'credits')::numeric;
  IF reported-discount+charges-credits<0 THEN RAISE EXCEPTION 'Net return amount cannot be negative'; END IF;
  snapshot:=public.ops_preview_tax_source(p_start,p_end);
  IF snapshot IS DISTINCT FROM p_expected_source THEN RAISE EXCEPTION 'Finance records changed; refresh and review before recording this return' USING ERRCODE='40001'; END IF;
  SELECT coalesce(sum(round(coalesce((e->>'sales_tax_collected')::numeric,(e#>>'{accepted_commercial_snapshot,accepted_commercial_breakdown,tax}')::numeric,(e#>>'{accepted_commercial_snapshot,invoice_totals,tax}')::numeric,0),2)),0),
   coalesce(bool_or(coalesce(nullif(btrim(e->>'sales_county'),''),nullif(btrim(e->>'destination_county'),'')) IS NULL OR (coalesce((e->>'tax_exempt_sale')::boolean,false)=false AND coalesce((e->>'sales_tax_rate')::numeric,0)<=0) OR (e->>'sales_tax_collected' IS NULL AND e#>>'{accepted_commercial_snapshot,accepted_commercial_breakdown,tax}' IS NULL AND e#>>'{accepted_commercial_snapshot,invoice_totals,tax}' IS NULL)),false)
  INTO tax,warning FROM jsonb_array_elements(snapshot) e;
  IF jsonb_typeof(p_payload->'review_note') IS DISTINCT FROM 'string' OR length(p_payload->>'review_note')>2000 OR ((reported<>tax OR discount<>0 OR charges<>0 OR credits<>0 OR warning) AND length(btrim(p_payload->>'review_note'))<3) THEN RAISE EXCEPTION 'Explain the reconciliation, adjustments and reporting warnings'; END IF;
 ELSIF p_kind IN ('payment','refund') THEN
  IF last_return.kind IS DISTINCT FROM 'return' THEN RAISE EXCEPTION 'Record the filed return before its payment'; END IF;
  IF jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
  n:=(p_payload->>'amount')::numeric;
  IF n::text IN ('NaN','Infinity','-Infinity') OR n<=0 OR n>999999999 OR n<>round(n,2) THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
  IF EXISTS(SELECT FROM public.ops_preview_tax_events e WHERE e.user_id=actor AND e.period_start=p_start AND e.period_end=p_end AND e.kind=p_kind AND (e.payload->>'amount')::numeric=n AND e.payload->>'paid_on'=p_payload->>'paid_on' AND lower(btrim(e.payload->>'confirmation'))=lower(btrim(p_payload->>'confirmation')) AND NOT EXISTS(SELECT FROM public.ops_preview_tax_events v WHERE v.user_id=actor AND v.kind='void_payment' AND v.payload->>'target_id'=e.id::text)) THEN RAISE EXCEPTION 'Matching payment/refund reference already recorded; review history'; END IF;
  IF p_kind='refund' AND n>paid THEN RAISE EXCEPTION 'Refund exceeds recorded net payments'; END IF;
 ELSIF p_kind='void_payment' THEN
  SELECT * INTO target FROM public.ops_preview_tax_events WHERE id=(p_payload->>'target_id')::uuid AND user_id=actor AND period_start=p_start AND period_end=p_end AND kind IN ('payment','refund');
  IF NOT FOUND OR EXISTS(SELECT FROM public.ops_preview_tax_events WHERE user_id=actor AND kind='void_payment' AND payload->>'target_id'=target.id::text) THEN RAISE EXCEPTION 'Active payment/refund not found in this period'; END IF;
  IF paid-(CASE WHEN target.kind='refund' THEN -1 ELSE 1 END)*(target.payload->>'amount')::numeric<0 THEN RAISE EXCEPTION 'Correct dependent refunds before voiding this payment'; END IF;
 ELSE
  IF last_return.kind IS DISTINCT FROM 'return' OR paid<>0 THEN RAISE EXCEPTION 'Only a filed return with zero net payments can be voided'; END IF;
 END IF;
 INSERT INTO public.ops_preview_tax_events(user_id,period_start,period_end,kind,payload,source,command_id,request)
 VALUES(actor,p_start,p_end,p_kind,p_payload,snapshot,p_command_id,request_value) RETURNING * INTO existing;
 RETURN to_jsonb(existing)-'user_id'-'request';
END $$;
REVOKE ALL ON FUNCTION public.ops_preview_tax_commit(date,date,text,jsonb,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_tax_commit(date,date,text,jsonb,uuid,jsonb,text) TO authenticated;
COMMIT;
