-- TEST ONLY: llscjdyiiatmuqhilube. Apply after the reviewed empty business baseline.
BEGIN;
CREATE SCHEMA ops_preview_private;
REVOKE ALL ON SCHEMA ops_preview_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.ops_preview_workspaces (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  revision bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ops_preview_links (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  sample_id text NOT NULL,
  production_job_id uuid NOT NULL REFERENCES public.production_jobs(id),
  quote_id uuid REFERENCES public.quotes(id),
  order_id uuid REFERENCES public.orders(id),
  canonical_updated_at timestamptz NOT NULL,
  canonical_order_updated_at timestamptz,
  PRIMARY KEY(user_id, sample_id)
);
CREATE TABLE public.ops_preview_rolls (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  material_key text NOT NULL,
  raw_material_id uuid NOT NULL REFERENCES public.raw_material_inventory(id),
  PRIMARY KEY(user_id, material_key)
);
CREATE TABLE public.ops_preview_receipts (
  command_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  request jsonb NOT NULL,
  resulting_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ops_preview_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_preview_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_preview_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_preview_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.ops_preview_workspaces FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
CREATE POLICY owner_read ON public.ops_preview_links FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
CREATE POLICY owner_read ON public.ops_preview_rolls FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
CREATE POLICY owner_read ON public.ops_preview_receipts FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
REVOKE ALL ON public.ops_preview_workspaces,public.ops_preview_links,public.ops_preview_rolls,public.ops_preview_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ops_preview_workspaces,public.ops_preview_links,public.ops_preview_rolls,public.ops_preview_receipts TO authenticated;
INSERT INTO public.document_counters(key,value) VALUES('quote_invoice',0) ON CONFLICT DO NOTHING;

CREATE FUNCTION public.ops_preview_load() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); workspace public.ops_preview_workspaces%rowtype; inventory jsonb; orders jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 SELECT * INTO workspace FROM public.ops_preview_workspaces WHERE user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initialize the sample workspace first' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',m.material_key,'grams',r.remaining_grams,'cost',r.cost_per_gram,'reserved',r.reserved_grams,'databaseId',r.id) ORDER BY m.material_key),'[]') INTO inventory
 FROM public.ops_preview_rolls m JOIN public.raw_material_inventory r ON r.id=m.raw_material_id AND r.user_id=m.user_id WHERE m.user_id=actor;
 SELECT coalesce(jsonb_agg(o || jsonb_build_object('reservedMaterials',coalesce((SELECT jsonb_object_agg(m.material_key,a.reserved_grams) FROM public.ops_preview_links l JOIN public.production_material_reservations a ON a.production_job_id=l.production_job_id AND a.user_id=l.user_id AND a.status='active' JOIN public.ops_preview_rolls m ON m.raw_material_id=a.raw_material_roll_id AND m.user_id=l.user_id WHERE l.user_id=actor AND l.sample_id=o->>'id'),'{}'::jsonb)) ORDER BY ordinal),'[]') INTO orders
 FROM jsonb_array_elements(workspace.state->'orders') WITH ORDINALITY AS x(o,ordinal);
 RETURN workspace.state || jsonb_build_object('inventory',inventory,'orders',orders,'revision',workspace.revision,'databaseMode',true);
END $$;

-- Determine pending quantities from inspected runs, keeping rejected pieces open.
CREATE FUNCTION ops_preview_private.requirements(o jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 WITH pending AS (
  SELECT item, greatest(0,(item->>'quantity')::numeric-coalesce((SELECT sum((run->>'accepted')::numeric) FROM jsonb_array_elements(o->'runs') run WHERE run->>'itemId'=item->>'id' AND run->>'status'='inspected'),0)) AS quantity
  FROM jsonb_array_elements(o->'items') item
 ), materials AS (
  SELECT (material->>'material')||' / '||(material->>'color') AS key,sum((material->>'grams_each')::numeric*quantity) AS grams
  FROM pending CROSS JOIN LATERAL jsonb_array_elements(item->'materials') material GROUP BY 1
 ) SELECT coalesce(jsonb_object_agg(key,grams),'{}'::jsonb) FROM materials WHERE grams>0
$$;

CREATE FUNCTION ops_preview_private.reserve_remaining(job_id uuid,o jsonb,command_id text) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); job public.production_jobs%rowtype; lines jsonb;
BEGIN
 SELECT * INTO STRICT job FROM public.production_jobs WHERE id=job_id AND user_id=actor;
 SELECT jsonb_agg(jsonb_build_object('raw_material_roll_id',r.id,'grams_reserved',least((req.value)::numeric,greatest(0,r.remaining_grams-coalesce(r.reserved_grams,0))))) INTO lines
 FROM jsonb_each_text(ops_preview_private.requirements(o)) req
 JOIN public.ops_preview_rolls m ON m.user_id=actor AND m.material_key=req.key
 JOIN public.raw_material_inventory r ON r.id=m.raw_material_id AND r.user_id=actor
 WHERE least((req.value)::numeric,greatest(0,r.remaining_grams-coalesce(r.reserved_grams,0)))>0;
 IF lines IS NOT NULL THEN PERFORM public.reserve_production_material(job_id,job.updated_at,command_id,lines); END IF;
END $$;

-- Top up only the actual run being inspected. The existing Inventory command
-- remains responsible for consumption and its immutable receipt/transactions.
CREATE FUNCTION ops_preview_private.ensure_actual_reservation(job_id uuid,usage jsonb,command_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); u jsonb; roll public.raw_material_inventory%rowtype; reservation public.production_material_reservations%rowtype; needed numeric; extra numeric; lines jsonb:='[]'; order_ref text;
BEGIN
 SELECT order_number INTO STRICT order_ref FROM public.production_jobs WHERE id=job_id AND user_id=actor;
 FOR u IN SELECT * FROM jsonb_array_elements(usage) LOOP
  needed:=(u->>'grams')::numeric;
  IF needed<0 OR needed::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid consumption'; END IF;
  IF needed=0 THEN CONTINUE; END IF;
  SELECT r.* INTO STRICT roll FROM public.ops_preview_rolls m JOIN public.raw_material_inventory r ON r.id=m.raw_material_id AND r.user_id=actor WHERE m.user_id=actor AND m.material_key=u->>'key' FOR UPDATE OF r;
  SELECT * INTO reservation FROM public.production_material_reservations WHERE user_id=actor AND production_job_id=job_id AND raw_material_roll_id=roll.id AND status='active' FOR UPDATE;
  extra:=greatest(0,needed-coalesce(reservation.reserved_grams,0));
  IF extra>roll.remaining_grams-coalesce(roll.reserved_grams,0) THEN RAISE EXCEPTION 'Actual usage exceeds unreserved test stock'; END IF;
  IF reservation.id IS NULL THEN
   INSERT INTO public.production_material_reservations(user_id,production_job_id,order_number,raw_material_roll_id,reserved_grams,status,reservation_command_id) VALUES(actor,job_id,order_ref,roll.id,needed,'active',command_id||':'||roll.id);
  ELSIF extra>0 THEN
   UPDATE public.production_material_reservations SET reserved_grams=needed WHERE id=reservation.id;
  END IF;
  UPDATE public.raw_material_inventory SET reserved_grams=coalesce(reserved_grams,0)+extra WHERE id=roll.id;
  lines:=lines||jsonb_build_array(jsonb_build_object('raw_material_roll_id',roll.id,'grams_used',needed));
 END LOOP;
 RETURN lines;
END $$;

CREATE FUNCTION public.ops_preview_commit(p_sample_id text,p_action jsonb,p_order jsonb,p_expected_revision bigint,p_command_id text) RETURNS jsonb
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
   quote_ref:='Q-'||lpad(public.next_quote_invoice_number()::text,6,'0');
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
   UPDATE public.orders SET invoice_number='I-'||substring(job.quote_number from 3),invoice_terms=proposed->>'terms',invoice_date=current_date,tax_exempt=coalesce((proposed->>'taxExempt')::boolean,false),tax_exempt_reason=CASE WHEN (proposed->>'taxExempt')::boolean THEN 'Fictional test exemption scenario' ELSE NULL END WHERE id=customer_order.id;
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

CREATE FUNCTION public.ops_preview_initialize() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); initial jsonb:='{"version":1,"revision":0,"inventory":[{"key":"PETG / Black","grams":2000,"cost":0.023},{"key":"PLA / White","grams":1000,"cost":0.023},{"key":"PLA / Black","grams":1500,"cost":0.023}],"orders":[{"id":"sample-mixed-order","reference":"SAMPLE-001","customer":"Sample customer","title":"A small custom project","preset":"individual","status":"draft","evidence":"Drawing","taxRate":7,"taxIncluded":true,"taxExempt":false,"county":"Portage","designFee":20,"laborRate":30,"estimatedLabor":0.5,"actualLabor":0,"otherCosts":0,"terms":"Payment at pickup","approval":"","released":false,"fulfilled":false,"payments":[],"runs":[],"items":[{"id":"blocks","description":"Support blocks","quantity":2,"unit_price":30,"hours_each":2,"materials":[{"material":"PETG","color":"Black","grams_each":80},{"material":"PLA","color":"White","grams_each":10}]},{"id":"tags","description":"Personalized nameplates","quantity":3,"unit_price":10,"hours_each":0.5,"materials":[{"material":"PLA","color":"Black","grams_each":15}]}]}]}'::jsonb; stock jsonb; roll_id uuid; workspace public.ops_preview_workspaces%rowtype;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ops-preview-init:'||actor,0));
 SELECT * INTO workspace FROM public.ops_preview_workspaces WHERE user_id=actor;
 IF FOUND THEN RETURN public.ops_preview_load(); END IF;
 INSERT INTO public.ops_preview_workspaces(user_id,state) VALUES(actor,initial||jsonb_build_object('orders','[]'::jsonb));
 FOR stock IN SELECT * FROM jsonb_array_elements(initial->'inventory') LOOP
  INSERT INTO public.raw_material_inventory(user_id,material_type,color_name,color,spool_label,roll_label,starting_grams,remaining_grams,current_grams,cost_per_spool)
  VALUES(actor,split_part(stock->>'key',' / ',1),split_part(stock->>'key',' / ',2),split_part(stock->>'key',' / ',2),'Fictional sample bucket','Fictional sample bucket',(stock->>'grams')::numeric,(stock->>'grams')::numeric,(stock->>'grams')::numeric,(stock->>'grams')::numeric*(stock->>'cost')::numeric) RETURNING id INTO roll_id;
  INSERT INTO public.ops_preview_rolls VALUES(actor,stock->>'key',roll_id);
 END LOOP;
 RETURN public.ops_preview_commit(initial#>>'{orders,0,id}',jsonb_build_object('type','new'),initial#>'{orders,0}',0,gen_random_uuid()::text);
END $$;
REVOKE ALL ON FUNCTION public.ops_preview_initialize(),public.ops_preview_load(),public.ops_preview_commit(text,jsonb,jsonb,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_initialize(),public.ops_preview_load(),public.ops_preview_commit(text,jsonb,jsonb,bigint,text) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops_preview_private FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.apply_order_tax_metadata_to_finance_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order public.orders%rowtype; v_snapshot jsonb; v_totals jsonb; v_rate numeric; v_taxable numeric; v_tax numeric; v_county text;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id and user_id=new.user_id;
  v_totals:=public.current_order_commercial_totals(new.order_id);
  if jsonb_typeof(v_totals) is distinct from 'object' then raise exception 'FINANCE_INVOICE_TOTALS_UNRESOLVED: authoritative invoice totals are unavailable' using errcode='22023'; end if;
  v_rate:=coalesce((v_totals->>'tax_rate')::numeric,v_order.sales_tax_rate);
  v_taxable:=coalesce((v_totals->>'taxable_subtotal')::numeric,v_order.taxable_subtotal);
  v_tax:=coalesce((v_totals->>'tax')::numeric,v_order.sales_tax_amount);
  v_county:=nullif(btrim(v_order.destination_county),'');
  if v_rate is null or v_rate<0 or v_rate>20 or v_taxable is null or v_taxable<0 or v_tax is null or v_tax<0 then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: authoritative taxable subtotal, rate, or tax is invalid' using errcode='22023'; end if;
  if coalesce(v_order.tax_exempt,false) and (v_rate<>0 or v_tax<>0 or nullif(btrim(coalesce(v_order.tax_exempt_reason,'')),'') is null) then raise exception 'FINANCE_TAX_METADATA_CONTRADICTORY: tax exemption metadata is incomplete or contradictory' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and v_tax>0 and v_county is null then raise exception 'FINANCE_TAX_COUNTY_REQUIRED: Select the destination county before posting this taxable order to Finance' using errcode='22023'; end if;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: destination county is invalid' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and (case when v_totals->>'tax_included'='true' then round(((v_totals->>'final_total')::numeric-coalesce((v_totals->>'rounding_adjustment')::numeric,0))*v_rate/(100+v_rate),2) else round(v_taxable*v_rate/100,2) end) is distinct from round(v_tax,2) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: taxable subtotal, rate, and collected tax do not reconcile' using errcode='22023'; end if;
  new.sales_county:=v_county;
  new.sales_tax_rate:=v_rate;
  new.sales_tax_collected:=v_tax;
  new.tax_exempt_sale:=coalesce(v_order.tax_exempt,false);
  -- Revenue excludes separately reported shipping; tax base includes it only
  -- when the new customer-pricing contract explicitly says so.
  new.amount:=v_taxable-case when v_totals->>'shipping_in_taxable_subtotal'='true' then coalesce((v_totals->>'shipping_charged')::numeric,0) else 0 end;
  new.original_amount:=new.amount;
  new.accepted_commercial_snapshot:=coalesce(new.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object(
    'destination_county',v_county,'sales_county',v_county,'sales_tax_rate',v_rate,
    'taxable_subtotal',v_taxable,'sales_tax_collected',v_tax,
    'tax_exempt',coalesce(v_order.tax_exempt,false),'tax_exempt_reason',v_order.tax_exempt_reason,
    'exemption_certificate_on_file',coalesce(v_order.exemption_certificate_on_file,false),'tax_metadata_status','verified');
  return new;
end $function$
;
COMMIT;
