-- REVIEW TARGET: OliPoly ERP Test (llscjdyiiatmuqhilube) ONLY. Not applied.
-- No existing Q/OP reference or relationship is renamed.
-- Live requires a separate inventory of historic references and cutover approval.
BEGIN;
LOCK TABLE public.ops_preview_workspaces, public.production_jobs, public.quotes, public.orders IN ACCESS EXCLUSIVE MODE;
CREATE TABLE ops_preview_private.project_number_reservations (
 number bigint PRIMARY KEY CHECK (number > 0),
 origin text NOT NULL,
 allocated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops_preview_private.project_number_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops_preview_private.project_number_reservations FROM PUBLIC, anon, authenticated;
WITH references_used(ref) AS (
 SELECT quote_number FROM public.production_jobs UNION ALL SELECT order_number FROM public.production_jobs
 UNION ALL SELECT quote_number FROM public.quotes UNION ALL SELECT converted_order_number FROM public.quotes
 UNION ALL SELECT source_quote_number FROM public.orders UNION ALL SELECT order_number FROM public.orders
 UNION ALL SELECT quote_number FROM public.project_events UNION ALL SELECT order_number FROM public.project_events
 UNION ALL SELECT quote_number FROM public.quote_accepted_commercial_snapshots UNION ALL SELECT order_number FROM public.quote_accepted_commercial_snapshots
 UNION ALL SELECT order_number FROM public.order_tracking_public
 UNION ALL SELECT quote_ref FROM public.inventory_transactions UNION ALL SELECT order_ref FROM public.inventory_transactions
), numbers AS (
 SELECT substring(upper(trim(ref)) from '^(?:Q|OP)-([0-9]{1,19})$')::bigint n FROM references_used
)
INSERT INTO ops_preview_private.project_number_reservations(number,origin)
SELECT DISTINCT n,'legacy-reservation' FROM numbers WHERE n>0 ON CONFLICT DO NOTHING;
DO $seed$
DECLARE high_water bigint; old_value bigint; was_called boolean;
BEGIN
 SELECT last_value,is_called INTO old_value,was_called FROM public.olipoly_order_number_seq;
 SELECT greatest(coalesce(max(number),0),
   coalesce((SELECT max(value) FROM public.document_counters WHERE key IN ('quote','order','quote_invoice')),0),
   CASE WHEN was_called THEN old_value ELSE old_value-1 END)
 INTO high_water FROM ops_preview_private.project_number_reservations;
 PERFORM setval('public.olipoly_order_number_seq',greatest(high_water,1),high_water>0);
END $seed$;
REVOKE ALL ON SEQUENCE public.olipoly_order_number_seq FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.allocate_order_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
DECLARE candidate bigint;
BEGIN
 LOOP
  candidate:=nextval('public.olipoly_order_number_seq'::regclass);
  INSERT INTO ops_preview_private.project_number_reservations(number,origin)
  VALUES(candidate,'project-allocation') ON CONFLICT DO NOTHING;
  IF FOUND THEN
   RETURN 'OP-'||lpad(candidate::text,greatest(7,length(candidate::text)),'0');
  END IF;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.allocate_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_order_number() TO service_role;

CREATE OR REPLACE FUNCTION public.respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_tracking_owner uuid;
  v_quote_accepted_order_number text;
  v_order_created_order_number text;
  v_response text := lower(btrim(coalesce(p_response,'')));
  v_order_number text;
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_snapshot_id uuid;
  v_existing_snapshot public.quote_accepted_commercial_snapshots%rowtype;
  v_correlation text := gen_random_uuid()::text;
  v_quote_accepted_event_id uuid := gen_random_uuid();
  v_quantity integer;
  v_raw_quantity numeric;
  v_order_total numeric;
  v_deposit_amount numeric;
  v_balance_amount numeric;
  v_payment_status text;
  v_order_title text;
  v_raw_fulfillment text;
  v_fulfillment text;
  v_customer_phone text;
begin
  if v_response in ('accept','approved','approve') then v_response := 'accepted'; end if;
  if v_response in ('declined','decline','rejected','reject','change_requested','change-requested','changes','request_changes','requested_changes') then v_response := 'change_requested'; end if;
  if v_response not in ('accepted','change_requested') then raise exception 'Invalid quote response' using errcode = '22023'; end if;

  select * into v_quote
    from public.quotes
   where quote_number = p_quote_number
     and public_token = p_public_token
   for update;
  if not found then raise exception 'Quote response link is invalid or expired' using errcode = 'P0002'; end if;

  if v_quote.quote_number !~ '^(Q-[0-9]{6}|OP-[0-9]{7,19})$' then
    raise exception 'Invalid Quote number format for acceptance: %', v_quote.quote_number using errcode = '22023';
  end if;

  if coalesce(v_quote.customer_response,'') = 'accepted' or v_quote.converted_to_order is true then
    if v_response <> 'accepted' then
      raise exception 'Accepted quotes cannot be changed through the public response RPC' using errcode = '25006';
    end if;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then select * into v_order from public.orders where order_number = v_quote.converted_order_number and user_id = v_quote.user_id for update; end if;
    if v_order.id is null then
      raise exception 'Accepted Quote is missing its Order evidence for %', v_quote.quote_number using errcode = '23514';
    end if;
    if v_order.user_id is distinct from v_quote.user_id or nullif(v_order.source_quote_number,'') is distinct from v_quote.quote_number then
      raise exception 'Accepted Quote Order evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    select * into v_existing_snapshot from public.quote_accepted_commercial_snapshots where quote_number = v_quote.quote_number;
    if v_existing_snapshot.id is null
       or v_existing_snapshot.user_id is distinct from v_quote.user_id
       or v_existing_snapshot.quote_number is distinct from v_quote.quote_number
       or v_existing_snapshot.order_number is distinct from v_order.order_number then
      raise exception 'Accepted Quote snapshot evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    select user_id into v_tracking_owner from public.order_tracking_public where order_number = v_order.order_number for update;
    if not found or v_tracking_owner is distinct from v_quote.user_id then
      raise exception 'Accepted Quote tracking evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    select order_number into v_quote_accepted_order_number from public.project_events where user_id = v_quote.user_id and quote_number = v_quote.quote_number and event_type = 'quote.accepted';
    select order_number into v_order_created_order_number from public.project_events where user_id = v_quote.user_id and quote_number = v_quote.quote_number and event_type = 'order.created';
    if v_quote_accepted_order_number is distinct from v_order.order_number
       or v_order_created_order_number is distinct from v_order.order_number then
      raise exception 'Accepted Quote event evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    return jsonb_build_object('response','accepted','status','accepted','order_number',v_order.order_number);
  end if;

  if v_response = 'change_requested' then
    update public.quotes
       set customer_response = 'change_requested', customer_response_message = p_message, quote_status = 'change_requested', updated_at = v_now
     where id = v_quote.id and coalesce(customer_response,'') <> 'change_requested';
    insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
    values(gen_random_uuid(),v_quote.user_id,v_quote.quote_number,null,'quote.change_requested',jsonb_build_object('quote_number',v_quote.quote_number,'message',p_message),v_now,v_now,'quote',v_quote.quote_number,'public_customer',null,v_correlation,null,1,jsonb_build_object('response','change_requested'))
    on conflict (user_id, quote_number, event_type) where event_type = 'quote.change_requested' do nothing;
    return jsonb_build_object('response','change_requested','status','recorded');
  end if;

  select * into v_order
    from public.orders
   where source_quote_number = v_quote.quote_number
   for update;
  if found and v_order.user_id is distinct from v_quote.user_id then
    raise exception 'Quote Order ownership collision for %', v_quote.quote_number using errcode = '23505';
  end if;

  v_raw_quantity := coalesce(nullif(v_quote.quote_data #>> '{fields,qty}','')::numeric, 1);
  if v_raw_quantity::text in ('NaN', 'Infinity', '-Infinity') or v_raw_quantity <= 0 or v_raw_quantity <> trunc(v_raw_quantity) then
    raise exception 'Quote quantity must be a positive whole number for %', v_quote.quote_number using errcode = '22023';
  end if;
  v_quantity := v_raw_quantity::integer;

  v_order_total := v_quote.quote_total;
  -- Blueprint v1 permits an intentional exact zero-dollar accepted Quote for approved no-charge/warranty work; NULL, negative, or non-finite totals are invalid.
  if v_order_total is null or v_order_total::text in ('NaN', 'Infinity', '-Infinity') or v_order_total < 0 then
    raise exception 'Quote total must be a finite nonnegative amount for %', v_quote.quote_number using errcode = '22023';
  end if;

  v_deposit_amount := coalesce(nullif(v_quote.quote_data #>> '{fields,depositAmount}','')::numeric, 0);
  if v_deposit_amount::text in ('NaN', 'Infinity', '-Infinity') or v_deposit_amount < 0 or v_deposit_amount > v_order_total then
    raise exception 'Quote deposit must be nonnegative and cannot exceed total for %', v_quote.quote_number using errcode = '22023';
  end if;
  v_balance_amount := v_order_total - v_deposit_amount;
  v_payment_status := case when v_deposit_amount > 0 then 'deposit_due' else 'unpaid' end;
  v_order_title := coalesce(nullif(btrim(v_quote.quote_title),''), nullif(btrim(v_quote.customer_name),''), 'Accepted Quote');
  -- Quote contact metadata is authoritative in quote_data.fields; legacy production drafts are fallback-only.
  v_customer_phone := nullif(btrim(coalesce(
    v_quote.quote_data #>> '{fields,customerPhone}',
    v_quote.quote_data #>> '{fields,customer_phone}',
    v_quote.quote_data #>> '{production_draft,customer_phone}',
    v_quote.quote_data #>> '{production_draft,phone}',
    ''
  )), '');
  if lower(coalesce(v_customer_phone,'')) in ('n/a','na','none','not available','not provided','unknown','-','—') then
    v_customer_phone := null;
  end if;
  v_raw_fulfillment := lower(btrim(coalesce(nullif(v_quote.quote_data #>> '{fields,fulfillment}',''), nullif(v_quote.quote_data #>> '{fields,deliveryMethod}',''), '')));
  v_fulfillment := case
    when v_raw_fulfillment in ('','pickup','pick up','pick-up','customer pickup','local pickup','in-store pickup') then 'pickup'
    when v_raw_fulfillment in ('delivery','deliver','local delivery','dropoff','drop-off','drop off') then 'delivery'
    when v_raw_fulfillment in ('shipping','ship','shipped','shipment','mail','mailing','usps','ups','fedex') then 'shipping'
    else 'pickup'
  end;

  if v_order.id is null then
    v_order_number := case when v_quote.quote_number like 'OP-%' then v_quote.quote_number else public.allocate_order_number() end;
  else
    v_order_number := v_order.order_number;
  end if;

  select id into v_snapshot_id from public.quote_accepted_commercial_snapshots where quote_number = v_quote.quote_number;
  if not found then
    v_snapshot := jsonb_build_object(
      'quote_number', v_quote.quote_number,
      'order_number', v_order_number,
      'accepted_at', v_now,
      'customer', jsonb_build_object('name', v_quote.customer_name, 'email', v_quote.customer_email, 'phone', v_customer_phone),
      'offer', coalesce(v_quote.quote_data,'{}'::jsonb),
      'totals', jsonb_build_object('order_total', v_order_total, 'deposit_amount', v_deposit_amount, 'balance_amount', v_balance_amount, 'quantity', v_quantity),
      'terms', jsonb_build_object('message', p_message, 'fulfillment', v_fulfillment, 'raw_fulfillment', v_raw_fulfillment, 'payment_status', v_payment_status)
    );
    insert into public.quote_accepted_commercial_snapshots(user_id, quote_number, order_number, accepted_at, snapshot)
    values (v_quote.user_id, v_quote.quote_number, v_order_number, v_now, v_snapshot)
    returning id into v_snapshot_id;
  end if;

  if v_order.id is null then
    insert into public.orders(user_id, order_number, source_quote_number, source_type, created_from_quote, accepted_date, status, quantity, order_total, deposit_amount, balance_amount, payment_status, fulfillment, customer_name, customer_email, customer_phone, order_title, created_at, updated_at)
    values (v_quote.user_id, v_order_number, v_quote.quote_number, 'quote', true, v_now, 'ready_to_print', v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment, v_quote.customer_name, v_quote.customer_email, v_customer_phone, v_order_title, v_now, v_now)
    on conflict (source_quote_number) where nullif(btrim(source_quote_number),'') is not null do nothing;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then raise exception 'Order creation failed for accepted quote %', v_quote.quote_number using errcode = '40001'; end if;
  end if;

  update public.quotes
     set customer_response = 'accepted', customer_response_message = coalesce(customer_response_message, p_message), quote_status = 'converted_to_order', converted_to_order = true, converted_order_number = v_order.order_number, accepted_date = coalesce(accepted_date, v_now), accepted_at = coalesce(accepted_at, v_now), accepted_commercial_snapshot_id = coalesce(accepted_commercial_snapshot_id, v_snapshot_id), accepted_commercial_snapshot = coalesce(accepted_commercial_snapshot, (select snapshot from public.quote_accepted_commercial_snapshots where id = v_snapshot_id)), updated_at = v_now
   where id = v_quote.id;

  update public.production_jobs
     set production_status = 'ready_to_print', order_number = v_order.order_number, quote_number = coalesce(quote_number, v_quote.quote_number), updated_at = v_now
   where user_id = v_quote.user_id
     and quote_number = v_quote.quote_number
     and coalesce(production_status,'') in ('waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer')
     and coalesce(production_status,'') not in ('printing','qc','ready_for_fulfillment','closed','canceled')
     and coalesce((job_payload->>'actual_usage_captured')::boolean, false) is false;

  select user_id into v_tracking_owner from public.order_tracking_public where order_number = v_order.order_number for update;
  if found and v_tracking_owner is distinct from v_quote.user_id then
    raise exception 'Tracking ownership collision for %', v_order.order_number using errcode = '23505';
  end if;
  insert into public.order_tracking_public(user_id, order_number, order_title, order_total, payment_status, status, public_status_text, public_next_step, updated_at)
  values(v_quote.user_id, v_order.order_number, v_order_title, v_order_total, v_payment_status, 'ready_to_print', 'Your order is approved and ready for production.', 'Printing will begin when the assigned machine is available.', v_now)
  on conflict (order_number) do nothing;

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(v_quote_accepted_event_id,v_quote.user_id,v_quote.quote_number,v_order.order_number,'quote.accepted',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',v_order.order_number),v_now,v_now,'quote',v_quote.quote_number,'public_customer',null,v_correlation,null,1,jsonb_build_object('response','accepted'))
  on conflict (user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created') do nothing;
  select event_id into v_quote_accepted_event_id from public.project_events where user_id = v_quote.user_id and quote_number = v_quote.quote_number and event_type = 'quote.accepted';
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_quote.user_id,v_quote.quote_number,v_order.order_number,'order.created',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',v_order.order_number),v_now,v_now,'order',v_order.order_number,'public_customer',null,v_correlation,v_quote_accepted_event_id::text,1,jsonb_build_object('source_quote_number',v_quote.quote_number))
  on conflict (user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created') do nothing;

  return jsonb_build_object('response','accepted','status','accepted','order_number',v_order.order_number);
exception when others then
  raise; -- PostgreSQL rolls back every required acceptance write in this function transaction.
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_preview_commit(p_sample_id text,p_action jsonb,p_order jsonb,p_expected_revision bigint,p_command_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid:=auth.uid(); workspace public.ops_preview_workspaces%rowtype; receipt public.ops_preview_receipts%rowtype;
 link public.ops_preview_links%rowtype; job public.production_jobs%rowtype; customer_order public.orders%rowtype;
 previous jsonb; proposed jsonb:=p_order; request jsonb; kind text:=p_action->>'type'; quote_ref text;
 total_qty numeric; total_hours numeric; total_grams numeric; snapshot jsonb; commercial jsonb; result jsonb;
 run jsonb; old_run jsonb; item jsonb; usage jsonb; roll_lines jsonb; captured jsonb; still_needed boolean; running boolean;
 qty_good numeric; qty_bad numeric; actual_hours numeric; consumed numeric; cost_total numeric; material_keys text[];
 payment jsonb; fee_entry jsonb; income jsonb; current_finance uuid; invoice_ref text; machine text; db_info jsonb; allowed_fields text[];
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 IF nullif(p_command_id,'') IS NULL OR length(p_command_id)>200 THEN RAISE EXCEPTION 'Command identity required'; END IF;
 request:=jsonb_build_object('sample',p_sample_id,'action',p_action,'order',p_order,'revision',p_expected_revision);
 SELECT * INTO STRICT workspace FROM public.ops_preview_workspaces WHERE user_id=actor FOR UPDATE;
 SELECT * INTO receipt FROM public.ops_preview_receipts WHERE command_id=p_command_id;
 IF FOUND THEN
  IF receipt.user_id IS DISTINCT FROM actor OR receipt.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Command identity already used' USING ERRCODE='23505'; END IF;
  RETURN public.ops_preview_load();
 END IF;
 IF workspace.revision<>p_expected_revision THEN RAISE EXCEPTION 'Workspace changed on another device. Reload before saving.' USING ERRCODE='40001'; END IF;
 IF proposed->>'id' IS DISTINCT FROM p_sample_id THEN RAISE EXCEPTION 'Sample identity mismatch'; END IF;
 SELECT o INTO previous FROM jsonb_array_elements(workspace.state->'orders') o WHERE o->>'id'=p_sample_id;
 SELECT * INTO link FROM public.ops_preview_links WHERE user_id=actor AND sample_id=p_sample_id;
 IF link.production_job_id IS NOT NULL THEN
  SELECT * INTO STRICT job FROM public.production_jobs WHERE id=link.production_job_id AND user_id=actor FOR UPDATE;
  IF job.updated_at IS DISTINCT FROM link.canonical_updated_at THEN RAISE EXCEPTION 'Linked production record changed outside this workspace. Reconcile before saving.' USING ERRCODE='40001'; END IF;
 END IF;
 IF link.order_id IS NOT NULL THEN
  SELECT * INTO STRICT customer_order FROM public.orders WHERE id=link.order_id AND user_id=actor FOR UPDATE;
  IF customer_order.updated_at IS DISTINCT FROM link.canonical_order_updated_at THEN RAISE EXCEPTION 'Linked order changed outside this workspace. Reconcile before saving.' USING ERRCODE='40001'; END IF;
 END IF;
 -- Do not let a run/payment command silently edit unrelated workspace fields.
 proposed:=proposed-'reservedMaterials'; previous:=previous-'reservedMaterials';
 IF kind NOT IN ('new','save') AND previous IS NOT NULL THEN
  allowed_fields:=CASE kind
   WHEN 'approve' THEN ARRAY['status','snapshot','approval','approvedAt','estimateBaseline']
   WHEN 'release' THEN ARRAY['status','released']
   WHEN 'start' THEN ARRAY['status','runs']
   WHEN 'inspect' THEN ARRAY['status','runs']
   WHEN 'pickup' THEN ARRAY['status','fulfilled','fulfilledAt']
   WHEN 'pay' THEN ARRAY['status','payments']
   WHEN 'actuals' THEN ARRAY['status','actualLabor','otherCosts'] ELSE ARRAY[]::text[] END;
  IF proposed-allowed_fields IS DISTINCT FROM previous-allowed_fields THEN RAISE EXCEPTION 'Command attempted to change unrelated fields'; END IF;
 END IF;
 IF previous->'snapshot' IS NOT NULL AND previous->'snapshot'<>'null' THEN
  IF (proposed->'snapshot') IS DISTINCT FROM (previous->'snapshot') OR (proposed->'items') IS DISTINCT FROM (previous->'items') OR (proposed->'designFee') IS DISTINCT FROM (previous->'designFee') THEN RAISE EXCEPTION 'Accepted price and items require a pricing revision'; END IF;
 END IF;
 IF kind IN ('new','save') THEN
  IF kind='new' AND previous IS NOT NULL THEN RAISE EXCEPTION 'Sample identity already exists'; END IF;
  IF kind='save' AND previous IS NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF previous ? 'snapshot' THEN RAISE EXCEPTION 'Accepted scope is locked'; END IF;
  IF kind='save' AND (nullif(btrim(proposed->>'customer'),'') IS NULL OR nullif(btrim(proposed->>'title'),'') IS NULL) THEN RAISE EXCEPTION 'Customer and project are required'; END IF;
  IF jsonb_array_length(proposed->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Use one to 100 items'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'items') i WHERE nullif(i->>'id','') IS NULL OR nullif(btrim(i->>'description'),'') IS NULL OR (i->>'quantity')::numeric<=0 OR trunc((i->>'quantity')::numeric)<>(i->>'quantity')::numeric OR (i->>'quantity')::text IN ('NaN','Infinity','-Infinity') OR (i->>'unit_price')::numeric<0 OR (i->>'unit_price')::text IN ('NaN','Infinity','-Infinity') OR (i->>'hours_each')::numeric<0 OR (i->>'hours_each')::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Invalid item estimate'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'items') i GROUP BY i->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Item identities must be unique'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'items') i CROSS JOIN LATERAL jsonb_array_elements(i->'materials') m WHERE (m->>'grams_each')::numeric<0 OR m->>'grams_each' IN ('NaN','Infinity','-Infinity') OR NOT EXISTS(SELECT 1 FROM public.ops_preview_rolls r WHERE r.user_id=actor AND r.material_key=(m->>'material')||' / '||(m->>'color'))) THEN RAISE EXCEPTION 'Invalid material estimate'; END IF;
  SELECT sum((i->>'quantity')::numeric),sum((i->>'quantity')::numeric*(i->>'hours_each')::numeric),sum((i->>'quantity')::numeric*coalesce((SELECT sum((m->>'grams_each')::numeric) FROM jsonb_array_elements(i->'materials') m),0)) INTO total_qty,total_hours,total_grams FROM jsonb_array_elements(proposed->'items') i;
  IF total_qty<=0 OR total_hours<0 OR total_grams<0 OR total_qty::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid manufacturing estimate'; END IF;
  proposed:=proposed-'snapshot'-'database'||jsonb_build_object('released',false,'fulfilled',false,'payments','[]'::jsonb,'runs','[]'::jsonb,'status','draft');
  IF job.id IS NULL THEN
   quote_ref:=public.allocate_order_number();
   INSERT INTO public.production_jobs(user_id,job_title,customer_name,quantity_planned,quantity,estimated_hours_per_unit,estimated_grams_per_unit,production_status,quote_number,job_payload)
   VALUES(actor,proposed->>'title',proposed->>'customer',total_qty,total_qty,total_hours/total_qty,total_grams/total_qty,'estimate',quote_ref,jsonb_build_object('quote_number',quote_ref,'ops_preview',proposed)) RETURNING * INTO job;
   INSERT INTO public.ops_preview_links(user_id,sample_id,production_job_id,canonical_updated_at) VALUES(actor,p_sample_id,job.id,job.updated_at) RETURNING * INTO link;
  ELSE
   UPDATE public.production_jobs SET job_title=proposed->>'title',customer_name=proposed->>'customer',quantity_planned=total_qty,quantity=total_qty,estimated_hours_per_unit=total_hours/total_qty,estimated_grams_per_unit=total_grams/total_qty,job_payload=job_payload||jsonb_build_object('ops_preview',proposed) WHERE id=job.id RETURNING * INTO job;
  END IF;
 ELSE
  IF previous IS NULL OR job.id IS NULL THEN RAISE EXCEPTION 'Sample draft not found'; END IF;
  IF kind='approve' THEN
   IF previous ? 'snapshot' OR nullif(proposed->>'customer','') IS NULL OR nullif(proposed->>'approval','') IS NULL THEN RAISE EXCEPTION 'Record customer and approval once'; END IF;
   IF jsonb_array_length(previous->'runs')<>0 OR jsonb_array_length(previous->'payments')<>0 THEN RAISE EXCEPTION 'Approve a clean draft'; END IF;
   snapshot:=proposed->'snapshot';
   IF jsonb_typeof(snapshot)<>'object' OR (snapshot->>'total')::numeric<0 OR (snapshot->>'taxRate')::numeric NOT BETWEEN 0 AND 20 THEN RAISE EXCEPTION 'Invalid pricing snapshot'; END IF;
   IF round((snapshot->>'beforeTax')::numeric+(snapshot->>'tax')::numeric+coalesce((snapshot->>'roundingAdjustment')::numeric,0),2)<>(snapshot->>'total')::numeric THEN RAISE EXCEPTION 'Price breakdown does not reconcile'; END IF;
   SELECT sum((i->>'quantity')::numeric) INTO total_qty FROM jsonb_array_elements(previous->'items') i;
   commercial:=jsonb_build_object('quantity',total_qty,'piece_price',(snapshot->>'beforeTax')::numeric/total_qty,'subtotal',snapshot->'preDiscount','discount',snapshot->'discount','taxable_subtotal',snapshot->'beforeTax','tax_rate',snapshot->'taxRate','tax',snapshot->'tax','deposit',0,'balance',snapshot->'total','final_total',snapshot->'total','shipping_charged',0,'shipping',0,'shipping_in_taxable_subtotal',true,'shipping_deferred',false,'line_items',snapshot->'lineItems','gross_line_items',snapshot->'grossLineItems','tax_included',proposed->'taxIncluded','rounding_adjustment',snapshot->'roundingAdjustment','destination_county',proposed->'county');
   PERFORM public.save_production_quote(job.id,job.updated_at,p_command_id||':quote',jsonb_build_object('quote_number',job.quote_number,'customer_name',proposed->>'customer','quote_title',proposed->>'title','quote_total',snapshot->'total','quote_status','pending','tax_exempt',proposed->'taxExempt','tax_exempt_reason',CASE WHEN (proposed->>'taxExempt')::boolean THEN 'Fictional test exemption scenario' ELSE NULL END,'quote_data',jsonb_build_object('fields',jsonb_build_object('qty',total_qty,'depositAmount',0,'fulfillment','pickup','taxCounty',proposed->'county'),'customer_totals',commercial)));
   SELECT id INTO link.quote_id FROM public.quotes WHERE production_job_id=job.id AND user_id=actor;
   UPDATE public.quotes SET public_token=coalesce(public_token,gen_random_uuid()::text) WHERE id=link.quote_id AND user_id=actor RETURNING public_token INTO quote_ref;
   PERFORM public.respond_to_quote_public(quote_ref,job.quote_number,'accepted',proposed->>'approval');
   SELECT * INTO STRICT customer_order FROM public.orders WHERE source_quote_number=job.quote_number AND user_id=actor;
   link.order_id:=customer_order.id;
   UPDATE public.orders SET invoice_number='I-'||regexp_replace(job.quote_number,'^(Q|OP)-',''),invoice_terms=proposed->>'terms',invoice_date=current_date,tax_exempt=coalesce((proposed->>'taxExempt')::boolean,false),tax_exempt_reason=CASE WHEN (proposed->>'taxExempt')::boolean THEN 'Fictional test exemption scenario' ELSE NULL END WHERE id=customer_order.id;
  ELSIF kind='release' THEN
   IF previous->'snapshot' IS NULL OR (previous->>'released')::boolean THEN RAISE EXCEPTION 'Release approved work once'; END IF;
   IF proposed->>'released'<>'true' OR EXISTS(SELECT 1 FROM jsonb_each_text(ops_preview_private.requirements(proposed)) req LEFT JOIN public.ops_preview_rolls m ON m.user_id=actor AND m.material_key=req.key LEFT JOIN public.raw_material_inventory r ON r.id=m.raw_material_id WHERE r.id IS NULL OR (req.value)::numeric>r.remaining_grams-coalesce(r.reserved_grams,0)) THEN RAISE EXCEPTION 'Not enough unreserved test stock'; END IF;
   PERFORM ops_preview_private.reserve_remaining(job.id,proposed,p_command_id||':reserve');
  ELSIF kind='start' THEN
   IF NOT (previous->>'released')::boolean THEN RAISE EXCEPTION 'Release work first'; END IF;
   IF jsonb_array_length(proposed->'runs')<>jsonb_array_length(previous->'runs')+1 THEN RAISE EXCEPTION 'Start one run at a time'; END IF;
   IF (proposed->'runs')-(jsonb_array_length(proposed->'runs')-1) IS DISTINCT FROM previous->'runs' THEN RAISE EXCEPTION 'Existing runs are immutable'; END IF;
   run:=(proposed->'runs')->-1;
   IF run->>'status'<>'printing' OR nullif(run->>'id','') IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(previous->'runs') r WHERE r->>'id'=run->>'id') OR (run->>'quantity')::numeric<>trunc((run->>'quantity')::numeric) OR run->>'quantity' IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid run'; END IF;
   run:=(proposed->'runs')->-1; machine:=run->>'printer';
   IF machine NOT IN ('P1S','P2S') OR (run->>'quantity')::numeric<=0 THEN RAISE EXCEPTION 'Invalid printer or quantity'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(workspace.state->'orders') o CROSS JOIN LATERAL jsonb_array_elements(o->'runs') r WHERE r->>'printer'=machine AND r->>'status'='printing') THEN RAISE EXCEPTION 'Printer already has an active run'; END IF;
   SELECT i INTO STRICT item FROM jsonb_array_elements(previous->'items') i WHERE i->>'id'=run->>'itemId';
   SELECT coalesce(sum(CASE WHEN r->>'status'='inspected' THEN (r->>'accepted')::numeric ELSE (r->>'quantity')::numeric END),0) INTO qty_good FROM jsonb_array_elements(previous->'runs') r WHERE r->>'itemId'=item->>'id';
   IF (run->>'quantity')::numeric+qty_good>(item->>'quantity')::numeric THEN RAISE EXCEPTION 'Run exceeds outstanding quantity'; END IF;
   IF EXISTS(WITH needed AS (SELECT (m->>'material')||' / '||(m->>'color') AS key,sum((m->>'grams_each')::numeric*(r->>'quantity')::numeric) grams FROM jsonb_array_elements(proposed->'runs') r JOIN LATERAL jsonb_array_elements(proposed->'items') i ON i->>'id'=r->>'itemId' CROSS JOIN LATERAL jsonb_array_elements(i->'materials') m WHERE r->>'status'='printing' GROUP BY 1) SELECT 1 FROM needed n JOIN public.ops_preview_rolls m ON m.user_id=actor AND m.material_key=n.key JOIN public.raw_material_inventory r ON r.id=m.raw_material_id WHERE n.grams>r.remaining_grams-coalesce(r.reserved_grams,0)+coalesce((SELECT a.reserved_grams FROM public.production_material_reservations a WHERE a.production_job_id=job.id AND a.raw_material_roll_id=r.id AND a.status='active'),0)) THEN RAISE EXCEPTION 'Active runs exceed available stock'; END IF;
   IF job.production_status='ready_to_print' THEN PERFORM public.production_workflow_command(job.order_number,'start_print',job.updated_at,'{}',p_command_id||':start'); END IF;
  ELSIF kind='inspect' THEN
   SELECT r INTO STRICT old_run FROM jsonb_array_elements(previous->'runs') r WHERE r->>'id'=p_action->>'runId';
   SELECT r INTO STRICT run FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'id'=p_action->>'runId';
   IF jsonb_array_length(proposed->'runs')<>jsonb_array_length(previous->'runs') OR (run-ARRAY['status','accepted','rejected','hours','usage','notes']) IS DISTINCT FROM (old_run-'status') THEN RAISE EXCEPTION 'Run identity and setup are immutable'; END IF;
   IF (SELECT jsonb_agg(r ORDER BY n) FROM jsonb_array_elements(proposed->'runs') WITH ORDINALITY x(r,n) WHERE r->>'id'<>run->>'id') IS DISTINCT FROM (SELECT jsonb_agg(r ORDER BY n) FROM jsonb_array_elements(previous->'runs') WITH ORDINALITY x(r,n) WHERE r->>'id'<>run->>'id') THEN RAISE EXCEPTION 'Other runs are immutable'; END IF;
   IF old_run->>'status'<>'printing' OR run->>'status'<>'inspected' THEN RAISE EXCEPTION 'Inspect an active run once'; END IF;
   qty_good:=(run->>'accepted')::numeric; qty_bad:=(run->>'rejected')::numeric; actual_hours:=(run->>'hours')::numeric;
   IF qty_good<>trunc(qty_good) OR qty_bad<>trunc(qty_bad) OR qty_good::text IN ('NaN','Infinity','-Infinity') OR qty_bad::text IN ('NaN','Infinity','-Infinity') OR actual_hours::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid actual quantities'; END IF;
   IF qty_good<0 OR qty_bad<0 OR qty_good+qty_bad<>(old_run->>'quantity')::numeric OR actual_hours<0 THEN RAISE EXCEPTION 'Inspection counts do not reconcile'; END IF;
   SELECT i INTO STRICT item FROM jsonb_array_elements(previous->'items') i WHERE i->>'id'=old_run->>'itemId';
   SELECT array_agg(DISTINCT (m->>'material')||' / '||(m->>'color')) INTO material_keys FROM jsonb_array_elements(item->'materials') m;
   usage:=run->'usage';
   IF jsonb_array_length(usage)<>cardinality(material_keys) OR EXISTS(SELECT 1 FROM jsonb_array_elements(usage) u WHERE NOT (u->>'key'=ANY(material_keys))) OR EXISTS(SELECT 1 FROM jsonb_array_elements(usage) u GROUP BY u->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Record each run material once'; END IF;
   SELECT coalesce(sum((u->>'grams')::numeric),0) INTO consumed FROM jsonb_array_elements(usage) u;
   IF consumed=0 AND qty_good>0 THEN RAISE EXCEPTION 'Accepted printed pieces require recorded material'; END IF;
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'items') i WHERE (i->>'quantity')::numeric>coalesce((SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'itemId'=i->>'id' AND r->>'status'='inspected'),0)),EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'status'='printing') INTO still_needed,running;
   SELECT jsonb_agg(u||jsonb_build_object('unitCost',r.cost_per_gram)) INTO usage FROM jsonb_array_elements(usage) u JOIN public.ops_preview_rolls m ON m.user_id=actor AND m.material_key=u->>'key' JOIN public.raw_material_inventory r ON r.id=m.raw_material_id;
   captured:=jsonb_build_object('id',run->>'id','captured_at',now(),'actual_machine',run->>'printer','actual_quantity',qty_good,'actual_print_hours',actual_hours,'actual_grams_used',consumed,'scrap_grams',0,'ops_preview_rejected',qty_bad);
   PERFORM public.production_workflow_command(job.order_number,'complete_print',job.updated_at,jsonb_build_object('actual_machine',run->>'printer','actual_quantity',qty_good,'actual_print_hours',actual_hours,'actual_grams_used',consumed,'scrap_grams',0,'production_attempt',captured),p_command_id||':complete');
   SELECT * INTO job FROM public.production_jobs WHERE id=job.id;
   IF consumed>0 THEN
    roll_lines:=ops_preview_private.ensure_actual_reservation(job.id,usage,p_command_id||':actual-reserve');
    PERFORM public.consume_production_attempt(job.id,run->>'id',p_command_id||':consume',job.updated_at,roll_lines,CASE WHEN still_needed THEN 'needs_reprint' ELSE 'pass_qc' END);
   ELSE
    PERFORM public.production_workflow_command(job.order_number,'needs_reprint',job.updated_at,'{}',p_command_id||':zero-reprint');
   END IF;
   UPDATE public.raw_material_inventory r SET current_grams=r.remaining_grams FROM public.ops_preview_rolls m WHERE m.user_id=actor AND m.raw_material_id=r.id;
   SELECT * INTO job FROM public.production_jobs WHERE id=job.id;
   PERFORM public.release_production_material_reservation(job.id,job.updated_at,p_command_id||':release-unused','Reconcile remaining sample quantities');
   IF still_needed THEN
    PERFORM ops_preview_private.reserve_remaining(job.id,proposed,p_command_id||':reserve-next');
    IF running THEN
     SELECT * INTO job FROM public.production_jobs WHERE id=job.id;
     PERFORM public.production_workflow_command(job.order_number,'start_print',job.updated_at,'{}',p_command_id||':continue');
    END IF;
   END IF;
   SELECT jsonb_agg(CASE WHEN r->>'id'=run->>'id' THEN r||jsonb_build_object('usage',usage) ELSE r END ORDER BY n) INTO result FROM jsonb_array_elements(proposed->'runs') WITH ORDINALITY x(r,n);
   proposed:=jsonb_set(proposed,'{runs}',result);
  ELSIF kind='pickup' THEN
   IF NOT coalesce((previous->>'released')::boolean,false) OR proposed->>'fulfilled'<>'true' OR (previous->>'fulfilled')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'items') i WHERE (i->>'quantity')::numeric>coalesce((SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'itemId'=i->>'id' AND r->>'status'='inspected'),0)) THEN RAISE EXCEPTION 'Inspect all pieces before pickup'; END IF;
   UPDATE public.orders SET shipping_or_pickup_note='Sample pickup confirmed',invoice_date=coalesce(invoice_date,current_date) WHERE id=link.order_id AND user_id=actor;
   UPDATE public.order_tracking_public SET shipping_or_pickup_note='Sample pickup confirmed' WHERE order_number=customer_order.order_number AND user_id=actor;
  ELSIF kind='pay' THEN
   IF jsonb_array_length(previous->'payments')>0 OR jsonb_array_length(proposed->'payments')<>1 THEN RAISE EXCEPTION 'This connected pilot records one combined payment'; END IF;
   payment:=(proposed->'payments')->0;
   SELECT * INTO STRICT customer_order FROM public.orders WHERE id=link.order_id AND user_id=actor FOR UPDATE;
   IF (payment->>'amount')::numeric<>customer_order.balance_amount OR (payment->>'fee')::numeric<0 OR (payment->>'fee')::numeric>(payment->>'amount')::numeric OR payment->>'method' NOT IN ('Cash','Check','ACH','Stripe','PayPal','Venmo') THEN RAISE EXCEPTION 'Payment must match the combined balance and valid fee'; END IF;
   PERFORM public.mark_order_paid(customer_order.id,customer_order.updated_at,p_command_id||':paid');
   SELECT * INTO customer_order FROM public.orders WHERE id=link.order_id;
   income:=public.post_order_finance_income(customer_order.id,customer_order.order_number,customer_order.updated_at,p_command_id||':finance');
   current_finance:=(income->>'entry_id')::uuid;
   IF (payment->>'fee')::numeric>0 THEN
    fee_entry:=public.create_manual_financial_entry(jsonb_build_object('type','expense','amount',payment->'fee','original_amount',payment->'fee','entry_date',current_date,'category','Payment fees','tax_category','bank_fees','title','Sample payment fee - '||customer_order.order_number,'notes','Payment reference '||coalesce(payment->>'reference',''),'payment_method',payment->>'method'));
   END IF;
  ELSIF kind='actuals' THEN
   IF proposed->>'actualLabor' IN ('NaN','Infinity','-Infinity') OR proposed->>'otherCosts' IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid actual costs'; END IF;
   IF (proposed->>'actualLabor')::numeric<0 OR (proposed->>'otherCosts')::numeric<0 THEN RAISE EXCEPTION 'Actual costs must be nonnegative'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported workspace action';
  END IF;
 END IF;
 SELECT * INTO STRICT job FROM public.production_jobs WHERE id=job.id;
 IF link.order_id IS NOT NULL THEN
  SELECT * INTO STRICT customer_order FROM public.orders WHERE id=link.order_id;
  IF (proposed->>'fulfilled')::boolean AND customer_order.payment_status='paid' AND customer_order.status='ready_for_fulfillment' THEN
   PERFORM public.fulfillment_workflow_command(customer_order.order_number,'close_order',customer_order.updated_at,jsonb_build_object('fulfillment_method','pickup','fulfillment_confirmed_at',now()),p_command_id||':close');
  END IF;
  SELECT * INTO STRICT customer_order FROM public.orders WHERE id=link.order_id AND user_id=actor;
 END IF;
 db_info:=jsonb_build_object('productionJobId',job.id,'orderId',link.order_id,'quoteNumber',job.quote_number,'orderNumber',customer_order.order_number,'financeEntryId',coalesce(current_finance,(previous#>>'{database,financeEntryId}')::uuid));
 proposed:=proposed||jsonb_build_object('database',db_info,'reference',coalesce(customer_order.order_number,job.quote_number));
 UPDATE public.production_jobs SET quantity_completed=coalesce((SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'status'='inspected'),0),job_payload=job_payload||jsonb_build_object('ops_preview',proposed) WHERE id=job.id RETURNING * INTO job;
 UPDATE public.ops_preview_links SET quote_id=link.quote_id,order_id=link.order_id,canonical_updated_at=job.updated_at,canonical_order_updated_at=customer_order.updated_at WHERE user_id=actor AND sample_id=p_sample_id;
 SELECT coalesce(jsonb_agg(CASE WHEN o->>'id'=p_sample_id THEN proposed ELSE o END ORDER BY n),'[]') INTO result FROM jsonb_array_elements(workspace.state->'orders') WITH ORDINALITY x(o,n);
 IF previous IS NULL THEN result:=result||jsonb_build_array(proposed); END IF;
 UPDATE public.ops_preview_workspaces SET state=jsonb_set(state,'{orders}',result),revision=revision+1,updated_at=now() WHERE user_id=actor RETURNING revision INTO workspace.revision;
 INSERT INTO public.ops_preview_receipts(command_id,user_id,request,resulting_revision) VALUES(p_command_id,actor,request,workspace.revision);
 RETURN public.ops_preview_load();
END $$;

CREATE OR REPLACE FUNCTION public.public_order_tracking_lookup(tracking_identifier text)
 RETURNS TABLE(order_number text, order_title text, status text, payment_status text, order_total numeric, deposit_amount numeric, balance_amount numeric, public_status_text text, public_next_step text, shipping_or_pickup_note text, tracking_number text, payment_link text, payment_link_stripe text, payment_link_paypal text, payment_link_venmo text, paid_date date, po_number text, invoice_number text, invoice_terms text, shipping_charged numeric, shipping_deferred boolean, credit_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with matches as (
    select o.*,count(*) over() match_count from public.orders o
    where case
      when upper(trim(tracking_identifier)) ~ '^OP-[0-9]{1,19}$' then regexp_replace(o.order_number,'^OP-0*','')=regexp_replace(upper(trim(tracking_identifier)),'^OP-0*','')
      when upper(trim(tracking_identifier)) ~ '^Q-[0-9]{1,6}$' then regexp_replace(o.source_quote_number,'^Q-0*','')=regexp_replace(upper(trim(tracking_identifier)),'^Q-0*','')
      else false end
  )
  select o.order_number::text,otp.order_title::text,otp.status::text,o.payment_status::text,o.order_total::numeric,
    o.deposit_amount::numeric,o.balance_amount::numeric,otp.public_status_text::text,otp.public_next_step::text,
    otp.shipping_or_pickup_note::text,otp.tracking_number::text,otp.payment_link::text,otp.payment_link_stripe::text,
    otp.payment_link_paypal::text,otp.payment_link_venmo::text,o.paid_date::date,otp.po_number::text,o.invoice_number::text,otp.invoice_terms::text,
    coalesce((t.totals->>'shipping_charged')::numeric,(t.totals->>'shipping')::numeric,0),
    coalesce((t.totals->>'shipping_deferred')::boolean,false),greatest(0,coalesce(r.amount_received,0)-o.order_total)
  from matches o join public.order_tracking_public otp on otp.order_number=o.order_number and otp.user_id=o.user_id
  left join lateral (select totals,amount_received from public.order_pricing_revisions where order_id=o.id and user_id=o.user_id order by revision desc limit 1) r on true
  left join lateral (select coalesce(snapshot->'invoice_totals',snapshot#>'{offer,quote_data,customer_totals}',snapshot#>'{offer,customer_totals}') totals
    from public.quote_accepted_commercial_snapshots where user_id=o.user_id and order_number=o.order_number limit 1) s on true
  cross join lateral (select coalesce(r.totals,s.totals) totals) t
  where o.match_count=1 limit 1;
$function$
;
COMMIT;
