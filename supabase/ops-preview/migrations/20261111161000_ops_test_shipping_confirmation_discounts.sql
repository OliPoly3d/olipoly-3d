-- ERP Test only. Requires fulfillment adjustments.
BEGIN;

CREATE OR REPLACE FUNCTION ops_preview_private.record_shipping_label(
 p_action jsonb, p_orders jsonb, p_order_number text
) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid:=auth.uid();
 label jsonb:='{}'::jsonb;
 field record;
 value text;
 measure numeric;
 postage numeric;
 purchase_date date;
 receipt_url text;
 finance_id uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 FOR field IN SELECT * FROM (VALUES ('destination',500),('carrier',40),('service',80),
  ('provider',60),('tracking',60),('purchaseRef',100)) AS fields(name,max_length)
 LOOP
  value:=btrim(p_action->>field.name);
  IF nullif(value,'') IS NULL OR length(value)>field.max_length THEN
   RAISE EXCEPTION 'Complete the shipping address, carrier, service, tracking and purchase details';
  END IF;
  IF field.name IN ('service','provider','tracking','purchaseRef') AND lower(value)='n/a' THEN value:=NULL; END IF;
  label:=label||jsonb_build_object(field.name,value);
 END LOOP;
 IF label->>'tracking' !~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,59}$' THEN
  RAISE EXCEPTION 'Enter a valid tracking number';
 END IF;

 FOR value IN SELECT unnest(ARRAY['weightOz','lengthIn','widthIn','heightIn']) LOOP
  measure:=round(nullif(p_action->>value,'')::numeric,2);
  IF measure IS NULL AND p_action->>'packageNotApplicable'='yes' THEN
   label:=label||jsonb_build_object(value,NULL); CONTINUE;
  END IF;
  IF measure IS NULL OR NOT (measure>0 AND measure<=10000) THEN
   RAISE EXCEPTION 'Enter positive packed weight and dimensions';
  END IF;
  label:=label||jsonb_build_object(value,measure);
 END LOOP;
 postage:=round((p_action->>'postage')::numeric,2);
 IF postage IS NULL OR NOT (postage>=0 AND postage<=100000) THEN
  RAISE EXCEPTION 'Enter the actual postage from the label receipt';
 END IF;
 IF p_action->>'noPurchase'='yes' THEN
  IF postage<>0 THEN RAISE EXCEPTION 'Enter $0 postage if there was no label purchase'; END IF;
 ELSE
  IF coalesce(p_action->>'purchaseDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
   RAISE EXCEPTION 'Enter the label purchase date';
  END IF;
  purchase_date:=(p_action->>'purchaseDate')::date;
  IF purchase_date>current_date THEN RAISE EXCEPTION 'The label purchase date cannot be in the future'; END IF;
 END IF;
 receipt_url:=nullif(btrim(p_action->>'receiptUrl'),'');
 IF receipt_url IS NOT NULL AND (length(receipt_url)>1000 OR receipt_url !~* '^https://[^[:space:]/]+(/[^[:space:]]*)?$') THEN
  RAISE EXCEPTION 'Enter an HTTPS receipt link';
 END IF;
 finance_id:=nullif(btrim(p_action->>'financeEntryId'),'')::uuid;

 -- The caller holds the owner's workspace row lock. Check purchase evidence
 -- and any reused expense across that owner's orders before posting.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_orders) o
  WHERE (coalesce(lower(o#>>'{shipment,provider}'),'')=coalesce(lower(label->>'provider'),'')
     AND lower(o#>>'{shipment,purchaseRef}')=lower(label->>'purchaseRef'))
     OR (lower(o#>>'{shipment,carrier}')=lower(label->>'carrier')
     AND regexp_replace(lower(o#>>'{shipment,tracking}'),'[^a-z0-9]','','g')
        =regexp_replace(lower(label->>'tracking'),'[^a-z0-9]','','g'))
     OR o#>>'{shipment,financeEntryId}'=finance_id::text
 ) THEN RAISE EXCEPTION 'This label purchase, tracking number or Finance expense is already recorded'; END IF;

 IF finance_id IS NOT NULL THEN
  PERFORM 1 FROM public.financial_entries e
  WHERE e.id=finance_id AND e.user_id=actor AND e.type='expense'
   AND (e.tax_category='shipping_out' OR e.category='Shipping')
   AND e.entry_date=purchase_date AND e.amount=postage
   AND e.correction_kind IS DISTINCT FROM 'reversal'
   AND (e.order_number IS NULL OR e.order_number=p_order_number)
   AND NOT EXISTS (SELECT 1 FROM public.financial_entries c WHERE c.user_id=actor AND c.reversal_of_entry_id=e.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a current shipping expense with the same purchase date and amount'; END IF;
 ELSIF postage>0 THEN
  finance_id:=(public.create_manual_financial_entry(jsonb_build_object(
   'type','expense','entry_date',purchase_date,'category','Shipping','tax_category','shipping_out',
   'title','Postage - '||p_order_number,'notes','External label '||coalesce(label->>'purchaseRef','reference unavailable'),
   'amount',postage,'original_amount',postage,'vendor_name',label->>'provider','receipt_link',receipt_url
  ))->>'entry_id')::uuid;
 END IF;
 RETURN label||jsonb_build_object('purchaseDate',purchase_date,'postage',postage,
  'receiptUrl',receipt_url,'financeEntryId',finance_id,'recordedAt',now());
END $$;

REVOKE ALL ON FUNCTION ops_preview_private.record_shipping_label(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ops_preview_commit(p_sample_id text,p_action jsonb,p_order jsonb,p_expected_revision bigint,p_command_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid:=auth.uid(); workspace public.ops_preview_workspaces%rowtype; receipt public.ops_preview_receipts%rowtype;
 link public.ops_preview_links%rowtype; job public.production_jobs%rowtype; customer_order public.orders%rowtype;
 previous jsonb; proposed jsonb:=p_order; request jsonb; kind text:=p_action->>'type'; quote_ref text;
 total_qty numeric; total_hours numeric; total_grams numeric; snapshot jsonb; commercial jsonb; result jsonb;
 run jsonb; old_run jsonb; item jsonb; usage jsonb; roll_lines jsonb; captured jsonb; still_needed boolean; running boolean;
 qty_good numeric; qty_bad numeric; actual_hours numeric; consumed numeric; cost_total numeric; material_keys text[];
 plan jsonb; method text; address text; county text; approval_note text; charge numeric; rate numeric; pricing_changed boolean; draft jsonb; discount_mode text; discount_value numeric; discount_reason text; extra_discount numeric; base_items numeric; base_total numeric; target numeric;
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
   WHEN 'production_plan' THEN ARRAY['status','productionPlan','productionPrepHours','productionRemainingHours']
   WHEN 'release' THEN ARRAY['status','released']
   WHEN 'start' THEN ARRAY['status','runs']
   WHEN 'inspect' THEN ARRAY['status','runs']
   WHEN 'fulfillment_plan' THEN ARRAY['fulfillmentPlan','shippingDraft']
   WHEN 'deliver' THEN ARRAY['status','fulfilled','fulfilledAt']
   WHEN 'pickup' THEN ARRAY['status','fulfilled','fulfilledAt']
   WHEN 'save_shipping_label' THEN ARRAY['shipment','fulfillmentPlan','shippingDraft']
   WHEN 'ship' THEN ARRAY['status','fulfilled','fulfilledAt','shipment']
   WHEN 'pay' THEN ARRAY['status','payments']
   WHEN 'actuals' THEN ARRAY['status','actualLabor','otherCosts'] ELSE ARRAY[]::text[] END;
  IF proposed-allowed_fields IS DISTINCT FROM previous-allowed_fields THEN RAISE EXCEPTION 'Command attempted to change unrelated fields'; END IF;
 END IF;
 IF previous->'snapshot' IS NOT NULL AND previous->'snapshot'<>'null' THEN
  IF (proposed->'snapshot') IS DISTINCT FROM (previous->'snapshot') OR (proposed->'items') IS DISTINCT FROM (previous->'items') OR (proposed->'designFee') IS DISTINCT FROM (previous->'designFee') THEN RAISE EXCEPTION 'Accepted price and items require a pricing revision'; END IF;
 END IF;
 IF kind IN ('new','save') THEN
  IF proposed ?| ARRAY['shipment','fulfillmentPlan','shippingDraft'] THEN RAISE EXCEPTION 'Record shipping from Fulfillment'; END IF;
  IF kind='new' AND previous IS NOT NULL THEN RAISE EXCEPTION 'Sample identity already exists'; END IF;
  IF kind='save' AND previous IS NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF previous ? 'snapshot' THEN RAISE EXCEPTION 'Accepted scope is locked'; END IF;
  IF proposed ?| ARRAY['productionPlan','productionPrepHours','productionRemainingHours'] THEN RAISE EXCEPTION 'Prepare production after approval'; END IF;
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
   PERFORM public.save_production_quote(job.id,job.updated_at,p_command_id||':quote',jsonb_build_object('quote_number',job.quote_number,'customer_name',proposed->>'customer','quote_title',proposed->>'title','quote_total',snapshot->'total','quote_status','pending','tax_exempt',proposed->'taxExempt','tax_exempt_reason',CASE WHEN (proposed->>'taxExempt')::boolean THEN 'Fictional test exemption scenario' ELSE NULL END,'quote_data',jsonb_build_object('fields',jsonb_build_object('qty',total_qty,'depositAmount',0,'fulfillment','pickup','taxCounty',proposed->'county','taxAddress',proposed->'taxAddress'),'customer_totals',commercial)));
   SELECT id INTO link.quote_id FROM public.quotes WHERE production_job_id=job.id AND user_id=actor;
   UPDATE public.quotes SET public_token=coalesce(public_token,gen_random_uuid()::text) WHERE id=link.quote_id AND user_id=actor RETURNING public_token INTO quote_ref;
   PERFORM public.respond_to_quote_public(quote_ref,job.quote_number,'accepted',proposed->>'approval');
   SELECT * INTO STRICT customer_order FROM public.orders WHERE source_quote_number=job.quote_number AND user_id=actor;
   link.order_id:=customer_order.id;
   UPDATE public.orders SET invoice_number='I-'||regexp_replace(job.quote_number,'^(Q|OP)-',''),invoice_terms=proposed->>'terms',invoice_date=current_date,tax_exempt=coalesce((proposed->>'taxExempt')::boolean,false),tax_exempt_reason=CASE WHEN (proposed->>'taxExempt')::boolean THEN 'Fictional test exemption scenario' ELSE NULL END WHERE id=customer_order.id;
  ELSIF kind='production_plan' THEN
   IF previous->'snapshot' IS NULL OR previous->'snapshot'='null' OR coalesce((previous->>'released')::boolean,false)
      OR jsonb_array_length(previous->'runs')<>0 THEN RAISE EXCEPTION 'Prepare approved work before release'; END IF;
   IF jsonb_typeof(proposed->'productionPrepHours') IS DISTINCT FROM 'number' OR jsonb_typeof(proposed->'productionRemainingHours') IS DISTINCT FROM 'number'
    OR coalesce((proposed->>'productionPrepHours')::numeric,-1)<0 OR coalesce((proposed->>'productionRemainingHours')::numeric,-1)<0 THEN RAISE EXCEPTION 'Enter nonnegative preparation and remaining labor hours'; END IF;
   IF jsonb_typeof(proposed->'productionPlan') IS DISTINCT FROM 'array'
      OR jsonb_array_length(proposed->'productionPlan')<>jsonb_array_length(previous->'items') THEN RAISE EXCEPTION 'Prepare every approved item'; END IF;
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(proposed->'productionPlan') WITH ORDINALITY p(item,n)
     JOIN jsonb_array_elements(previous->'items') WITH ORDINALITY approved(item,n) USING(n)
     WHERE p.item-ARRAY['materials','hours_each'] IS DISTINCT FROM approved.item-ARRAY['materials','hours_each']
       OR jsonb_typeof(p.item->'hours_each') IS DISTINCT FROM 'number'
       OR coalesce((p.item->>'hours_each')::numeric,0)<=0
       OR jsonb_typeof(p.item->'materials') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p.item->'materials')=0
   ) THEN RAISE EXCEPTION 'Only material and print-time estimates can change'; END IF;
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(proposed->'productionPlan') i
     CROSS JOIN LATERAL jsonb_array_elements(i->'materials') m
     WHERE jsonb_typeof(m->'grams_each') IS DISTINCT FROM 'number'
       OR coalesce((m->>'grams_each')::numeric,-1)<0
       OR NOT EXISTS(SELECT FROM public.ops_preview_rolls r WHERE r.user_id=actor AND r.material_key=(m->>'material')||' / '||(m->>'color'))
   ) OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(proposed->'productionPlan') i
     WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(i->'materials') m WHERE (m->>'grams_each')::numeric>0)
   ) THEN RAISE EXCEPTION 'Enter valid filament consumption for every item'; END IF;
   SELECT sum((i->>'quantity')::numeric),sum((i->>'quantity')::numeric*(i->>'hours_each')::numeric),
     sum((i->>'quantity')::numeric*(SELECT sum((m->>'grams_each')::numeric) FROM jsonb_array_elements(i->'materials') m))
     INTO total_qty,total_hours,total_grams FROM jsonb_array_elements(proposed->'productionPlan') i;
   UPDATE public.production_jobs SET estimated_hours_per_unit=total_hours/total_qty,estimated_grams_per_unit=total_grams/total_qty
     WHERE id=job.id AND user_id=actor RETURNING * INTO job;
  ELSIF kind='release' THEN
   IF previous->'snapshot' IS NULL OR (previous->>'released')::boolean THEN RAISE EXCEPTION 'Release approved work once'; END IF;
   IF EXISTS(SELECT FROM jsonb_array_elements(coalesce(proposed->'productionPlan',proposed->'items')) i WHERE coalesce((i->>'hours_each')::numeric,0)<=0 OR NOT EXISTS(SELECT FROM jsonb_array_elements(i->'materials') m WHERE (m->>'grams_each')::numeric>0)) THEN RAISE EXCEPTION 'Complete production preparation before release'; END IF;
   IF proposed->>'released'<>'true' OR EXISTS(SELECT 1 FROM jsonb_each_text(ops_preview_private.requirements(proposed)) req LEFT JOIN ops_preview_private.stock() s ON s.material_key=req.key WHERE s.material_key IS NULL OR req.value::numeric>s.grams-s.reserved) THEN RAISE EXCEPTION 'Not enough unreserved test stock'; END IF;
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
   SELECT i INTO STRICT item FROM jsonb_array_elements(coalesce(previous->'productionPlan',previous->'items')) i WHERE i->>'id'=run->>'itemId';
   SELECT coalesce(sum(CASE WHEN r->>'status'='inspected' THEN (r->>'accepted')::numeric ELSE (r->>'quantity')::numeric END),0) INTO qty_good FROM jsonb_array_elements(previous->'runs') r WHERE r->>'itemId'=item->>'id';
   IF (run->>'quantity')::numeric+qty_good>(item->>'quantity')::numeric THEN RAISE EXCEPTION 'Run exceeds outstanding quantity'; END IF;
   IF EXISTS(WITH needed AS (SELECT (m->>'material')||' / '||(m->>'color') AS key,sum((m->>'grams_each')::numeric*(r->>'quantity')::numeric) grams FROM jsonb_array_elements(proposed->'runs') r JOIN LATERAL jsonb_array_elements(coalesce(proposed->'productionPlan',proposed->'items')) i ON i->>'id'=r->>'itemId' CROSS JOIN LATERAL jsonb_array_elements(i->'materials') m WHERE r->>'status'='printing' GROUP BY 1) SELECT 1 FROM needed n LEFT JOIN ops_preview_private.stock() s ON s.material_key=n.key WHERE n.grams>coalesce(s.grams-s.reserved,0)+coalesce((SELECT sum(a.reserved_grams) FROM public.production_material_reservations a JOIN public.ops_preview_rolls m ON m.raw_material_id=a.raw_material_roll_id AND m.user_id=actor WHERE a.user_id=actor AND a.production_job_id=job.id AND a.status='active' AND m.material_key=n.key),0)) THEN RAISE EXCEPTION 'Active runs exceed available stock'; END IF;
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
   SELECT i INTO STRICT item FROM jsonb_array_elements(coalesce(previous->'productionPlan',previous->'items')) i WHERE i->>'id'=old_run->>'itemId';
   SELECT array_agg(DISTINCT (m->>'material')||' / '||(m->>'color')) INTO material_keys FROM jsonb_array_elements(item->'materials') m;
   usage:=run->'usage';
   IF jsonb_array_length(usage)<>cardinality(material_keys) OR EXISTS(SELECT 1 FROM jsonb_array_elements(usage) u WHERE NOT (u->>'key'=ANY(material_keys))) OR EXISTS(SELECT 1 FROM jsonb_array_elements(usage) u GROUP BY u->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Record each run material once'; END IF;
   SELECT coalesce(sum((u->>'grams')::numeric),0) INTO consumed FROM jsonb_array_elements(usage) u;
   IF consumed=0 AND qty_good>0 THEN RAISE EXCEPTION 'Accepted printed pieces require recorded material'; END IF;
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(proposed->'productionPlan',proposed->'items')) i WHERE (i->>'quantity')::numeric>coalesce((SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'itemId'=i->>'id' AND r->>'status'='inspected'),0)),EXISTS(SELECT 1 FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'status'='printing') INTO still_needed,running;
   captured:=jsonb_build_object('id',run->>'id','captured_at',now(),'actual_machine',run->>'printer','actual_quantity',qty_good,'actual_print_hours',actual_hours,'actual_grams_used',consumed,'scrap_grams',0,'ops_preview_rejected',qty_bad);
   PERFORM public.production_workflow_command(job.order_number,'complete_print',job.updated_at,jsonb_build_object('actual_machine',run->>'printer','actual_quantity',qty_good,'actual_print_hours',actual_hours,'actual_grams_used',consumed,'scrap_grams',0,'production_attempt',captured),p_command_id||':complete');
   SELECT * INTO job FROM public.production_jobs WHERE id=job.id;
   IF consumed>0 THEN
    roll_lines:=ops_preview_private.ensure_actual_reservation(job.id,usage,p_command_id||':actual-reserve');
    SELECT jsonb_agg(u||jsonb_build_object('unitCost',round(coalesce((SELECT sum((l->>'grams_used')::numeric*r.cost_per_gram)/nullif((u->>'grams')::numeric,0) FROM jsonb_array_elements(roll_lines) l JOIN public.raw_material_inventory r ON r.id=(l->>'raw_material_roll_id')::uuid JOIN public.ops_preview_rolls m ON m.raw_material_id=r.id AND m.user_id=actor WHERE m.material_key=u->>'key'),0),12))) INTO usage FROM jsonb_array_elements(usage) u;
    PERFORM public.consume_production_attempt(job.id,run->>'id',p_command_id||':consume',job.updated_at,roll_lines,CASE WHEN still_needed THEN 'needs_reprint' ELSE 'pass_qc' END);
   ELSE
    SELECT jsonb_agg(u||jsonb_build_object('unitCost',0)) INTO usage FROM jsonb_array_elements(usage) u;
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
  ELSIF kind IN ('fulfillment_plan','save_shipping_label','ship') THEN
   IF link.order_id IS NULL OR NOT coalesce((previous->>'released')::boolean,false)
      OR coalesce((previous->>'fulfilled')::boolean,false)
      OR customer_order.status IS DISTINCT FROM 'ready_for_fulfillment'
      OR job.production_status IS DISTINCT FROM 'ready_for_fulfillment'
      OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(previous->'productionPlan',previous->'items')) i
       WHERE (i->>'quantity')::numeric>coalesce((
        SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(previous->'runs') r
        WHERE r->>'itemId'=i->>'id' AND r->>'status'='inspected'),0)
      ) THEN RAISE EXCEPTION 'Pass QC on all pieces before confirming fulfillment'; END IF;
   IF kind='save_shipping_label' AND p_action->>'confirmDetails' IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Confirm the shipment details before publishing';
   END IF;
   IF kind='fulfillment_plan' OR (kind='save_shipping_label' AND previous ? 'shippingDraft') THEN
    IF previous ? 'shipment' THEN RAISE EXCEPTION 'Fulfillment is locked after label purchase'; END IF;
    IF kind='fulfillment_plan' THEN
     draft:=p_action;
     plan:=coalesce(proposed#>'{shippingDraft,totals}',proposed#>'{fulfillmentPlan,totals}');
    ELSE
      draft:=previous->'shippingDraft';
     plan:=draft->'totals';
     draft:=draft||jsonb_build_object('customerFee',plan->'customerShipping','taxRate',plan->'taxRate');
    END IF;
    method:=draft->>'method';
    address:=nullif(btrim(draft->>'address'),'');
    county:=nullif(btrim(draft->>'county'),'');
    approval_note:=btrim(coalesce(draft->>'approval',''));
    charge:=(draft->>'customerFee')::numeric;
    rate:=(draft->>'taxRate')::numeric;
    discount_mode:=coalesce(nullif(draft->>'discountMode',''),'none');
    discount_value:=CASE WHEN discount_mode IN ('fixed','percent') THEN (draft->>'discountValue')::numeric ELSE 0 END;
    discount_reason:=btrim(coalesce(draft->>'discountReason',''));
    IF method IS NULL OR method NOT IN ('pickup','shipping','delivery') OR address IS NULL OR length(address)>500
       OR county IS NULL OR NOT public.is_ohio_county(county)
       OR length(approval_note)>500 OR charge IS NULL OR NOT (charge BETWEEN 0 AND 100000)
       OR charge<>round(charge,2) OR rate IS NULL OR NOT (rate BETWEEN 0 AND 20) OR rate<>round(rate,2)
       OR (method='pickup' AND charge<>0) THEN
     RAISE EXCEPTION 'Enter a valid fulfillment method, Ohio address, county, tax rate and charge';
    END IF;
    IF method='delivery' AND charge>0 AND p_action->>'confirmDelivery' IS DISTINCT FROM 'yes' THEN
     RAISE EXCEPTION 'Confirm the local delivery address and customer charge before publishing';
    END IF;
    IF coalesce(customer_order.tax_exempt,false) THEN rate:=0; END IF;
    snapshot:=previous->'snapshot';
    base_items:=(snapshot->>'preDiscount')::numeric-(snapshot->>'discount')::numeric;
    extra_discount:=(plan->>'discount')::numeric-(snapshot->>'discount')::numeric;
    IF discount_mode NOT IN ('none','fixed','percent','round_down')
       OR discount_value IS NULL OR NOT (discount_value BETWEEN 0 AND 100000)
       OR (discount_mode='percent' AND discount_value>100)
       OR length(discount_reason)>500 OR extra_discount IS NULL OR NOT (extra_discount BETWEEN 0 AND base_items)
       OR (discount_mode='none' AND extra_discount<>0)
       OR (discount_mode='fixed' AND extra_discount<>round(discount_value,2))
       OR (discount_mode='percent' AND extra_discount<>round(base_items*discount_value/100,2)) THEN
     RAISE EXCEPTION 'Enter a valid discount on the accepted item price';
    END IF;
    IF discount_mode='round_down' THEN
     base_total:=base_items+charge+round((base_items+charge)*rate/100,2);
     target:=floor(base_total);
     IF (base_items-extra_discount+charge)+round((base_items-extra_discount+charge)*rate/100,2)<>target
        OR (extra_discount>0 AND (base_items-extra_discount+charge+.01)+round((base_items-extra_discount+charge+.01)*rate/100,2)<=target) THEN
      RAISE EXCEPTION 'Discount must round down to the nearest whole-dollar total';
     END IF;
    END IF;
    commercial:=public.current_order_commercial_totals(customer_order.id);
    pricing_changed:=lower(county) IS DISTINCT FROM lower(coalesce(customer_order.destination_county,previous->>'county'))
      OR rate IS DISTINCT FROM coalesce(customer_order.sales_tax_rate,(snapshot->>'taxRate')::numeric)
      OR charge IS DISTINCT FROM coalesce((commercial->>'shipping_charged')::numeric,0)
      OR (plan->>'discount')::numeric IS DISTINCT FROM coalesce((commercial->>'discount')::numeric,0);
    IF pricing_changed THEN
     IF approval_note='' THEN RAISE EXCEPTION 'Record customer approval for the adjustment'; END IF;
     IF coalesce(customer_order.finance_pushed,false) OR customer_order.payment_status IN ('paid','deposit_paid','refunded')
        OR jsonb_array_length(previous->'payments')>0 THEN
      RAISE EXCEPTION 'Recorded payments require the Finance correction workflow';
     END IF;
     IF plan->'lineItems' IS DISTINCT FROM snapshot->'lineItems'
        OR (plan->>'customerShipping')::numeric IS DISTINCT FROM charge
        OR (plan->>'taxRate')::numeric IS DISTINCT FROM rate
        OR (plan->>'beforeTax')::numeric IS DISTINCT FROM base_items-extra_discount+charge
        OR (plan->>'tax')::numeric IS DISTINCT FROM round((base_items-extra_discount+charge)*rate/100,2)
        OR (plan->>'total')::numeric IS DISTINCT FROM base_items-extra_discount+charge+round((base_items-extra_discount+charge)*rate/100,2) THEN
      RAISE EXCEPTION 'Revised totals must preserve the accepted items and use the confirmed charge and tax rate';
     END IF;
    ELSE
     plan:=coalesce(previous#>'{fulfillmentPlan,totals}',snapshot);
    END IF;
    draft:=jsonb_build_object('method',method,'address',address,'county',county,'approval',approval_note,
     'discountMode',discount_mode,'discountValue',discount_value,'discountReason',discount_reason,'totals',plan);
    IF method='shipping' AND kind='fulfillment_plan' THEN
     proposed:=previous||jsonb_build_object('shippingDraft',draft);
    ELSE
     IF pricing_changed THEN
      UPDATE public.orders SET destination_county=county, sales_tax_rate=rate
       WHERE id=link.order_id AND user_id=actor RETURNING * INTO customer_order;
      commercial:=jsonb_build_object('quantity',plan->'quantity','piece_price',plan->'piecePrice',
       'subtotal',plan->'preDiscount','discount',plan->'discount','taxable_subtotal',plan->'beforeTax',
       'tax_rate',rate,'tax',plan->'tax','deposit',0,'balance',plan->'total','final_total',plan->'total',
       'shipping_charged',charge,'shipping',charge,'shipping_in_taxable_subtotal',true,'shipping_deferred',false,
       'line_items',plan->'lineItems','tax_included',false,'rounding_adjustment',0,'destination_county',county,
       'fulfillment',method,'tax_address',address,'original_quote_total',snapshot->'total',
       'fulfillment_discount',extra_discount,'fulfillment_discount_mode',discount_mode,'fulfillment_discount_reason',discount_reason);
      SELECT * INTO STRICT customer_order FROM public.revise_order_pricing(customer_order.id,
       customer_order.updated_at,p_command_id||':fulfillment-price',approval_note,commercial);
     END IF;
     proposed:=(previous-'shippingDraft')||jsonb_build_object('fulfillmentPlan',draft||jsonb_build_object('confirmedAt',now()));
     UPDATE public.orders SET fulfillment=method, shipping_address=CASE WHEN method<>'pickup' THEN address ELSE NULL END
      WHERE id=link.order_id AND user_id=actor;
    END IF;
   ELSE
    proposed:=previous;
   END IF;
   IF kind='save_shipping_label' THEN
    IF previous ? 'shipment' THEN RAISE EXCEPTION 'A label is already recorded for this order'; END IF;
    IF proposed ? 'fulfillmentPlan' AND (proposed#>>'{fulfillmentPlan,method}' IS DISTINCT FROM 'shipping'
       OR proposed#>>'{fulfillmentPlan,address}' IS DISTINCT FROM btrim(p_action->>'destination')) THEN
     RAISE EXCEPTION 'The label must match the confirmed shipping method and address';
    END IF;
    proposed:=jsonb_set(proposed,'{shipment}',ops_preview_private.record_shipping_label(
     p_action,workspace.state->'orders',customer_order.order_number));
    UPDATE public.orders SET fulfillment='shipping' WHERE id=link.order_id AND user_id=actor;
   ELSIF kind='ship' THEN
    IF NOT (previous ? 'shipment') THEN RAISE EXCEPTION 'Record the purchased label first'; END IF;
    IF p_action->>'confirmHandoff' IS DISTINCT FROM 'yes' THEN
     RAISE EXCEPTION 'Confirm that the carrier has the package';
    END IF;
    proposed:=jsonb_set(previous,'{shipment,handoffAt}',to_jsonb(now()))
      ||jsonb_build_object('fulfilled',true,'fulfilledAt',now(),'status',
        CASE WHEN customer_order.payment_status='paid' THEN 'closed' ELSE 'ready_for_fulfillment' END);
    UPDATE public.orders SET tracking_number=previous#>>'{shipment,tracking}',
     shipping_or_pickup_note='Handed to '||(previous#>>'{shipment,carrier}')||'.',
     invoice_date=coalesce(invoice_date,current_date) WHERE id=link.order_id AND user_id=actor;
   END IF;
  ELSIF kind IN ('pickup','deliver') THEN
   IF previous ? 'shippingDraft' THEN RAISE EXCEPTION 'Confirm shipment details or change the fulfillment method first'; END IF;
   IF (kind='deliver' AND previous#>>'{fulfillmentPlan,method}' IS DISTINCT FROM 'delivery')
      OR (kind='pickup' AND previous ? 'fulfillmentPlan' AND previous#>>'{fulfillmentPlan,method}' IS DISTINCT FROM 'pickup') THEN
    RAISE EXCEPTION 'Record handoff using the confirmed fulfillment method';
   END IF;
   IF previous ? 'shipment' THEN RAISE EXCEPTION 'This order has a shipping label. Record carrier handoff in Fulfillment'; END IF;
   IF NOT coalesce((previous->>'released')::boolean,false) OR proposed->>'fulfilled'<>'true' OR (previous->>'fulfilled')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(proposed->'productionPlan',proposed->'items')) i WHERE (i->>'quantity')::numeric>coalesce((SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'itemId'=i->>'id' AND r->>'status'='inspected'),0)) THEN RAISE EXCEPTION 'Inspect all pieces before pickup'; END IF;
   UPDATE public.orders SET shipping_or_pickup_note=CASE WHEN kind='deliver' THEN 'Local delivery confirmed' ELSE 'Pickup confirmed' END,invoice_date=coalesce(invoice_date,current_date) WHERE id=link.order_id AND user_id=actor;
   UPDATE public.order_tracking_public SET shipping_or_pickup_note=CASE WHEN kind='deliver' THEN 'Local delivery confirmed' ELSE 'Pickup confirmed' END WHERE order_number=customer_order.order_number AND user_id=actor;
  ELSIF kind='pay' THEN
   IF previous ? 'shippingDraft' THEN RAISE EXCEPTION 'Confirm shipment details before recording payment'; END IF;
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
   PERFORM public.fulfillment_workflow_command(customer_order.order_number,'close_order',customer_order.updated_at,jsonb_build_object('fulfillment_method',customer_order.fulfillment,
    'fulfillment_confirmed_at',coalesce((proposed->>'fulfilledAt')::timestamptz,now())),p_command_id||':close');
  END IF;
  SELECT * INTO STRICT customer_order FROM public.orders WHERE id=link.order_id AND user_id=actor;
  IF kind IN ('inspect','fulfillment_plan','save_shipping_label','pickup','deliver','ship','pay')
     AND (customer_order.status='ready_for_fulfillment' OR coalesce((proposed->>'fulfilled')::boolean,false)) THEN
   method:=CASE WHEN proposed ? 'shipment' THEN 'shipping' WHEN proposed ? 'shippingDraft' THEN 'pending' ELSE
    coalesce(proposed#>>'{fulfillmentPlan,method}',CASE WHEN (proposed->>'fulfilled')::boolean THEN 'pickup' ELSE 'pending' END) END;
   UPDATE public.order_tracking_public SET public_status_text=
     CASE WHEN (proposed->>'fulfilled')::boolean THEN
      CASE method WHEN 'shipping' THEN 'Shipped' WHEN 'delivery' THEN 'Delivered' ELSE 'Picked up' END
     ELSE CASE method WHEN 'shipping' THEN 'Ready to ship' WHEN 'delivery' THEN 'Ready for local delivery'
      WHEN 'pickup' THEN 'Ready for pickup' ELSE 'Ready · fulfillment to be arranged' END END,
     public_next_step=CASE WHEN (proposed->>'fulfilled')::boolean THEN
      CASE WHEN method='shipping' THEN 'Follow the tracking number for delivery updates.' ELSE 'Fulfillment complete.' END
      ELSE CASE method WHEN 'shipping' THEN 'Awaiting carrier handoff.' WHEN 'delivery' THEN 'OliPoly will arrange drop-off.'
       WHEN 'pickup' THEN 'OliPoly will confirm pickup arrangements.' ELSE 'OliPoly will confirm fulfillment arrangements.' END END,
     tracking_number=customer_order.tracking_number,shipping_or_pickup_note=customer_order.shipping_or_pickup_note
   WHERE order_number=customer_order.order_number AND user_id=actor;
   IF NOT FOUND THEN RAISE EXCEPTION 'Tracking record is missing'; END IF;
  ELSIF proposed#>>'{shipment,handoffAt}' IS NOT NULL THEN
   UPDATE public.order_tracking_public SET public_status_text='Shipped',
    public_next_step='Follow the tracking number for delivery updates.',
    tracking_number=customer_order.tracking_number,shipping_or_pickup_note=customer_order.shipping_or_pickup_note
   WHERE order_number=customer_order.order_number AND user_id=actor;
   IF NOT FOUND THEN RAISE EXCEPTION 'Tracking record is missing'; END IF;
  END IF;
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

COMMIT;
