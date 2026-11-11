-- REVIEW REQUIRED. Target only OliPoly ERP Test (llscjdyiiatmuqhilube).
BEGIN;
-- Preserve existing mappings while allowing any number of physical rolls per color.
ALTER TABLE public.ops_preview_rolls DROP CONSTRAINT ops_preview_rolls_pkey;
ALTER TABLE public.ops_preview_rolls ADD PRIMARY KEY(user_id,raw_material_id);
CREATE INDEX ops_preview_rolls_material_idx ON public.ops_preview_rolls(user_id,material_key);
INSERT INTO public.ops_preview_rolls(user_id,material_key,raw_material_id)
 SELECT r.user_id,r.material_type||' / '||r.color_name,r.id FROM public.raw_material_inventory r
 JOIN public.ops_preview_workspaces w ON w.user_id=r.user_id
 WHERE nullif(btrim(r.material_type),'') IS NOT NULL AND nullif(btrim(r.color_name),'') IS NOT NULL
 ON CONFLICT(user_id,raw_material_id) DO NOTHING;
ALTER TABLE public.raw_material_inventory ADD COLUMN tare_grams numeric;
ALTER TABLE public.raw_material_inventory ADD COLUMN last_gross_grams numeric;
ALTER TABLE public.raw_material_inventory ADD COLUMN last_weighed_at timestamptz;
CREATE TABLE public.ops_preview_inventory_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 command_id text NOT NULL UNIQUE, kind text NOT NULL, item_id text, reason text NOT NULL,
 before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ops_preview_inventory_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.ops_preview_inventory_events FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
REVOKE ALL ON public.ops_preview_inventory_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ops_preview_inventory_events TO authenticated;

CREATE FUNCTION ops_preview_private.stock() RETURNS TABLE(material_key text,grams numeric,reserved numeric,cost numeric,database_id uuid)
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT m.material_key,sum(r.remaining_grams),sum(coalesce(r.reserved_grams,0)),
 coalesce(sum(r.remaining_grams*r.cost_per_gram)/nullif(sum(r.remaining_grams),0),max(r.cost_per_gram)),
 (array_agg(r.id ORDER BY r.created_at,r.id))[1]
 FROM public.ops_preview_rolls m JOIN public.raw_material_inventory r ON r.id=m.raw_material_id AND r.user_id=m.user_id
 WHERE m.user_id=auth.uid() AND coalesce(r.active,true) AND r.status<>'retired' GROUP BY m.material_key
$$;
CREATE OR REPLACE FUNCTION public.ops_preview_load() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); workspace public.ops_preview_workspaces%rowtype; inventory jsonb; orders jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT workspace FROM public.ops_preview_workspaces WHERE user_id=actor;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',material_key,'grams',grams,'cost',cost,'reserved',reserved,'databaseId',database_id) ORDER BY material_key),'[]') INTO inventory FROM ops_preview_private.stock();
 SELECT coalesce(jsonb_agg(o||jsonb_build_object('reservedMaterials',coalesce((
 SELECT jsonb_object_agg(t.material_key,t.grams) FROM (
 SELECT m.material_key,sum(a.reserved_grams) grams FROM public.ops_preview_links l
 JOIN public.production_material_reservations a ON a.production_job_id=l.production_job_id AND a.user_id=l.user_id AND a.status='active'
 JOIN public.ops_preview_rolls m ON m.raw_material_id=a.raw_material_roll_id AND m.user_id=l.user_id
 WHERE l.user_id=actor AND l.sample_id=o->>'id' GROUP BY m.material_key) t),'{}'::jsonb)) ORDER BY ordinal),'[]') INTO orders
 FROM jsonb_array_elements(workspace.state->'orders') WITH ORDINALITY x(o,ordinal);
 RETURN workspace.state||jsonb_build_object('inventory',inventory,'orders',orders,'revision',workspace.revision,'databaseMode',true);
END $$;

CREATE FUNCTION public.ops_preview_inventory_load() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
 'rolls',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.material_type,r.color_name,r.created_at,r.id) FROM public.raw_material_inventory r WHERE r.user_id=actor),'[]'::jsonb),
 'supplies',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.item_name,s.id) FROM public.non_filament_materials s WHERE s.user_id=actor),'[]'::jsonb),
 'pool',(SELECT to_jsonb(p) FROM public.inventory_spool_pool p WHERE p.user_id=actor),
 'options',coalesce((SELECT setting_value FROM public.inventory_settings WHERE user_id=actor AND setting_key='ops_preview_inventory_options'),'{}'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC,e.id) FROM (SELECT * FROM public.ops_preview_inventory_events WHERE user_id=actor ORDER BY created_at DESC,id LIMIT 100) e),'[]'::jsonb),
 'revision',(SELECT revision FROM public.ops_preview_workspaces WHERE user_id=actor)) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION ops_preview_private.inventory_number(data jsonb,key text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE value numeric;
BEGIN
 IF jsonb_typeof(data->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Enter a numeric %',key; END IF;
 value:=(data->>key)::numeric;
 IF value<0 OR value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION '% must be finite and nonnegative',key; END IF;
 RETURN value;
END $$;

CREATE FUNCTION public.ops_preview_inventory_commit(p_action jsonb,p_expected_revision bigint,p_command_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid:=auth.uid(); workspace public.ops_preview_workspaces%rowtype; receipt public.ops_preview_receipts%rowtype;
 kind text:=p_action->>'type'; data jsonb:=p_action->'data'; request jsonb; before_row jsonb; after_row jsonb;
 reason text:=btrim(p_action->>'reason'); item_id text:=p_action->>'id'; roll public.raw_material_inventory%rowtype;
 supply public.non_filament_materials%rowtype; pool public.inventory_spool_pool%rowtype;
 amount numeric; initial numeric; cost numeric; delta numeric:=0; old_key text; new_key text; choice text; entry jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to the test project' USING ERRCODE='42501'; END IF;
 IF nullif(p_command_id,'') IS NULL OR length(p_command_id)>200 THEN RAISE EXCEPTION 'Command identity required'; END IF;
 IF nullif(reason,'') IS NULL OR length(reason)>2000 THEN RAISE EXCEPTION 'Enter a reason for this inventory change'; END IF;
 SELECT * INTO STRICT workspace FROM public.ops_preview_workspaces WHERE user_id=actor FOR UPDATE;
 request:=jsonb_build_object('inventory',p_action,'revision',p_expected_revision);
 SELECT * INTO receipt FROM public.ops_preview_receipts WHERE command_id=p_command_id;
 IF FOUND THEN
  IF receipt.user_id IS DISTINCT FROM actor OR receipt.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Command identity already used' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('workspace',public.ops_preview_load(),'inventory',public.ops_preview_inventory_load());
 END IF;
 IF workspace.revision<>p_expected_revision THEN RAISE EXCEPTION 'Workspace changed on another device. Reload before saving.' USING ERRCODE='40001'; END IF;
 -- All stock, reusable-spool and audit changes commit together under the workspace lock.
 IF kind IN ('save_roll','adjust_roll','mount_roll','unmount_roll') THEN
  IF item_id IS NOT NULL THEN
   SELECT * INTO STRICT roll FROM public.raw_material_inventory WHERE id=item_id::uuid AND user_id=actor FOR UPDATE;
   before_row:=to_jsonb(roll); old_key:=roll.material_type||' / '||roll.color_name;
  ELSIF kind<>'save_roll' THEN RAISE EXCEPTION 'Choose a roll'; END IF;
  IF kind='save_roll' THEN
   IF nullif(btrim(data->>'material_type'),'') IS NULL OR nullif(btrim(data->>'color_name'),'') IS NULL OR nullif(btrim(data->>'roll_label'),'') IS NULL THEN RAISE EXCEPTION 'Material, color and roll label are required'; END IF;
   IF data->>'material_type' LIKE '% / %' OR data->>'color_name' LIKE '% / %' THEN RAISE EXCEPTION 'Material and color cannot contain the separator /'; END IF;
   IF length(data::text)>16000 THEN RAISE EXCEPTION 'Roll details are too long'; END IF;
   initial:=ops_preview_private.inventory_number(data,'starting_grams'); cost:=ops_preview_private.inventory_number(data,'cost_per_spool');
   PERFORM ops_preview_private.inventory_number(data,'reorder_threshold_grams');
   IF initial<=0 THEN RAISE EXCEPTION 'Initial net grams must be positive'; END IF;
   IF data->>'roll_type' NOT IN ('spool','refill') OR jsonb_typeof(data->'reusable_spool') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose spool or refill and its reusable spool setting'; END IF;
   IF EXISTS(SELECT FROM public.raw_material_inventory r WHERE r.user_id=actor AND lower(r.roll_label)=lower(btrim(data->>'roll_label')) AND r.id IS DISTINCT FROM roll.id) THEN RAISE EXCEPTION 'Use a unique roll label'; END IF;
   new_key:=btrim(data->>'material_type')||' / '||btrim(data->>'color_name');
   IF roll.id IS NOT NULL AND new_key<>old_key AND EXISTS(
    SELECT FROM jsonb_array_elements(workspace.state->'orders') o CROSS JOIN LATERAL jsonb_array_elements(coalesce(o->'productionPlan',o->'items')) i
    CROSS JOIN LATERAL jsonb_array_elements(i->'materials') m WHERE NOT coalesce((o->>'fulfilled')::boolean,false) AND (m->>'material')||' / '||(m->>'color')=old_key
   ) THEN RAISE EXCEPTION 'This material is referenced by open work. Add a new roll or resolve that work before renaming its material or color.'; END IF;
   IF roll.id IS NULL THEN
    amount:=ops_preview_private.inventory_number(data,'remaining_grams');
    IF amount>initial THEN RAISE EXCEPTION 'Remaining grams exceed initial net grams'; END IF;
    INSERT INTO public.raw_material_inventory(user_id,material_type,color_name,color,brand,roll_label,spool_label,location,starting_grams,remaining_grams,current_grams,cost_per_spool,spool_cost,reorder_threshold_grams,roll_type,is_mounted,reusable_spool)
    VALUES(actor,btrim(data->>'material_type'),btrim(data->>'color_name'),btrim(data->>'color_name'),btrim(data->>'brand'),btrim(data->>'roll_label'),btrim(data->>'roll_label'),data->>'location',initial,amount,amount,cost,cost,(data->>'reorder_threshold_grams')::numeric,data->>'roll_type',data->>'roll_type'='spool',(data->>'reusable_spool')::boolean) RETURNING * INTO roll;
    item_id:=roll.id::text; delta:=amount;
   ELSE
    IF initial<roll.remaining_grams THEN RAISE EXCEPTION 'Initial net grams cannot be below remaining grams'; END IF;
    IF data->>'roll_type' IS DISTINCT FROM roll.roll_type OR (data->>'reusable_spool')::boolean IS DISTINCT FROM roll.reusable_spool THEN RAISE EXCEPTION 'Use mount or unmount to change a roll physical spool state'; END IF;
    UPDATE public.raw_material_inventory SET material_type=btrim(data->>'material_type'),color_name=btrim(data->>'color_name'),color=btrim(data->>'color_name'),brand=btrim(data->>'brand'),roll_label=btrim(data->>'roll_label'),spool_label=btrim(data->>'roll_label'),location=data->>'location',starting_grams=initial,cost_per_spool=cost,spool_cost=cost,reorder_threshold_grams=(data->>'reorder_threshold_grams')::numeric,updated_at=now() WHERE id=roll.id RETURNING * INTO roll;
   END IF;
   INSERT INTO public.ops_preview_rolls VALUES(actor,new_key,roll.id) ON CONFLICT(user_id,raw_material_id) DO UPDATE SET material_key=excluded.material_key;
   UPDATE public.raw_material_inventory SET supplier=data->>'supplier',reorder_url=data->>'reorder_url',reorder_link=data->>'reorder_url',notes=data->>'notes' WHERE id=roll.id RETURNING * INTO roll;
  ELSIF kind='adjust_roll' THEN
   IF data->>'mode'='weigh' THEN
    amount:=ops_preview_private.inventory_number(data,'gross_grams')-ops_preview_private.inventory_number(data,'tare_grams');
    IF NOT roll.is_mounted OR amount<0 THEN RAISE EXCEPTION 'Weigh a mounted spool with gross weight at least its tare'; END IF;
   ELSIF data->>'mode'='set' THEN amount:=ops_preview_private.inventory_number(data,'quantity');
   ELSE RAISE EXCEPTION 'Choose net quantity or spool weigh-in'; END IF;
   IF amount<coalesce(roll.reserved_grams,0) OR amount>roll.starting_grams THEN RAISE EXCEPTION 'Net grams must cover reservations and not exceed initial net quantity'; END IF;
   delta:=amount-roll.remaining_grams;
   UPDATE public.raw_material_inventory SET remaining_grams=amount,current_grams=amount,
    tare_grams=CASE WHEN data->>'mode'='weigh' THEN (data->>'tare_grams')::numeric ELSE tare_grams END,
    last_gross_grams=CASE WHEN data->>'mode'='weigh' THEN (data->>'gross_grams')::numeric ELSE last_gross_grams END,
    last_weighed_at=CASE WHEN data->>'mode'='weigh' THEN now() ELSE last_weighed_at END,updated_at=now()
    WHERE id=roll.id RETURNING * INTO roll;
  ELSE
   INSERT INTO public.inventory_spool_pool(user_id,available_empty,retired) VALUES(actor,0,0) ON CONFLICT DO NOTHING;
   SELECT * INTO STRICT pool FROM public.inventory_spool_pool WHERE user_id=actor FOR UPDATE;
   before_row:=before_row||jsonb_build_object('pool',to_jsonb(pool));
   IF kind='mount_roll' THEN
    IF roll.is_mounted OR roll.remaining_grams<=0 OR coalesce(pool.available_empty,0)<1 THEN RAISE EXCEPTION 'Choose an unmounted refill and record at least one empty spool'; END IF;
    UPDATE public.inventory_spool_pool SET available_empty=available_empty-1,updated_at=now() WHERE user_id=actor;
    UPDATE public.raw_material_inventory SET is_mounted=true,reusable_spool=true,updated_at=now() WHERE id=roll.id RETURNING * INTO roll;
   ELSE
    IF NOT roll.is_mounted OR NOT roll.reusable_spool OR coalesce(roll.reserved_grams,0)>0 THEN RAISE EXCEPTION 'Unmount an unreserved reusable spool'; END IF;
    IF NOT coalesce((data->>'confirm')::boolean,false) THEN RAISE EXCEPTION 'Confirm the filament is physically removed and the spool is free'; END IF;
    UPDATE public.inventory_spool_pool SET available_empty=coalesce(available_empty,0)+1,updated_at=now() WHERE user_id=actor;
    UPDATE public.raw_material_inventory SET is_mounted=false,roll_type='refill',updated_at=now() WHERE id=roll.id RETURNING * INTO roll;
   END IF;
  END IF;
  after_row:=to_jsonb(roll);
  IF kind IN ('mount_roll','unmount_roll') THEN
   after_row:=after_row||jsonb_build_object('pool',(SELECT to_jsonb(p) FROM public.inventory_spool_pool p WHERE user_id=actor));
   INSERT INTO public.inventory_settings VALUES(actor,'spool_pool',after_row->'pool',now()) ON CONFLICT(user_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=now();
  END IF;
 ELSIF kind IN ('save_supply','adjust_supply') THEN
  IF item_id IS NOT NULL THEN SELECT * INTO STRICT supply FROM public.non_filament_materials WHERE id=item_id AND user_id=actor FOR UPDATE; before_row:=to_jsonb(supply);
  ELSIF kind<>'save_supply' THEN RAISE EXCEPTION 'Choose a supply'; END IF;
  IF kind='save_supply' THEN
   IF nullif(btrim(data->>'item_name'),'') IS NULL OR nullif(btrim(data->>'unit_type'),'') IS NULL OR length(data::text)>16000 THEN RAISE EXCEPTION 'Supply name and unit are required'; END IF;
   cost:=ops_preview_private.inventory_number(data,'cost_per_unit'); PERFORM ops_preview_private.inventory_number(data,'reorder_threshold');
   IF supply.id IS NULL THEN
    amount:=ops_preview_private.inventory_number(data,'quantity_on_hand'); item_id:=gen_random_uuid()::text; delta:=amount;
    INSERT INTO public.non_filament_materials(id,user_id,item_name,unit_type,quantity_on_hand,cost_per_unit,reorder_threshold)
     VALUES(item_id,actor,btrim(data->>'item_name'),btrim(data->>'unit_type'),amount,cost,(data->>'reorder_threshold')::numeric) RETURNING * INTO supply;
   END IF;
   IF data->>'unit_type'<>supply.unit_type AND supply.quantity_on_hand<>0 THEN RAISE EXCEPTION 'Set quantity to zero before changing measurement units'; END IF;
   UPDATE public.non_filament_materials SET item_name=btrim(data->>'item_name'),category=data->>'category',unit_type=btrim(data->>'unit_type'),cost_per_unit=cost,reorder_threshold=(data->>'reorder_threshold')::numeric,reorder_policy=CASE WHEN coalesce((data->>'exclude_warning')::boolean,false) THEN CASE WHEN coalesce(supply.reorder_policy,'auto')<>'auto' THEN supply.reorder_policy ELSE 'never' END ELSE 'auto' END,supplier=data->>'supplier',reorder_link=data->>'reorder_link',notes=data->>'notes',updated_at=now() WHERE id=item_id RETURNING * INTO supply;
  ELSE
   amount:=ops_preview_private.inventory_number(data,'quantity');
   IF data->>'mode'='consume' THEN amount:=supply.quantity_on_hand-amount;
   ELSIF data->>'mode'='receive' THEN amount:=supply.quantity_on_hand+amount;
   ELSIF data->>'mode' IS DISTINCT FROM 'set' THEN RAISE EXCEPTION 'Choose counted quantity or consumption'; END IF;
   IF amount<0 THEN RAISE EXCEPTION 'Supply consumption exceeds stock'; END IF;
   delta:=amount-supply.quantity_on_hand;
   UPDATE public.non_filament_materials SET quantity_on_hand=amount,updated_at=now() WHERE id=item_id RETURNING * INTO supply;
  END IF;
  after_row:=to_jsonb(supply);
 ELSIF kind='spool_count' THEN
  PERFORM ops_preview_private.inventory_number(data,'available_empty'); PERFORM ops_preview_private.inventory_number(data,'retired');
  IF trunc((data->>'available_empty')::numeric)<>(data->>'available_empty')::numeric OR trunc((data->>'retired')::numeric)<>(data->>'retired')::numeric THEN RAISE EXCEPTION 'Spool counts must be whole numbers'; END IF;
  SELECT to_jsonb(p) INTO before_row FROM public.inventory_spool_pool p WHERE user_id=actor FOR UPDATE;
  INSERT INTO public.inventory_spool_pool(user_id,available_empty,retired,notes,updated_at) VALUES(actor,(data->>'available_empty')::numeric,(data->>'retired')::numeric,data->>'notes',now())
   ON CONFLICT(user_id) DO UPDATE SET available_empty=excluded.available_empty,retired=excluded.retired,notes=excluded.notes,updated_at=now();
  SELECT to_jsonb(p) INTO after_row FROM public.inventory_spool_pool p WHERE user_id=actor;
  INSERT INTO public.inventory_settings VALUES(actor,'spool_pool',after_row,now()) ON CONFLICT(user_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=now();
 ELSIF kind='options' THEN
  IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR length(data::text)>16000 THEN RAISE EXCEPTION 'Invalid dropdown choices'; END IF;
  FOREACH choice IN ARRAY ARRAY['materials','brands','colors','units'] LOOP
   IF jsonb_typeof(data->choice) IS DISTINCT FROM 'array' OR jsonb_array_length(data->choice)>150 THEN RAISE EXCEPTION 'Use up to 150 choices per list'; END IF;
   FOR entry IN SELECT * FROM jsonb_array_elements(data->choice) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'string' OR length(btrim(entry#>>'{}')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choices must be names from 1 to 100 characters'; END IF;
   END LOOP;
  END LOOP;
  SELECT setting_value INTO before_row FROM public.inventory_settings WHERE user_id=actor AND setting_key='ops_preview_inventory_options';
  INSERT INTO public.inventory_settings VALUES(actor,'ops_preview_inventory_options',data,now()) ON CONFLICT(user_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=now(); after_row:=data;
 ELSE RAISE EXCEPTION 'Unsupported inventory change'; END IF;
 INSERT INTO public.ops_preview_inventory_events(user_id,command_id,kind,item_id,reason,before_data,after_data) VALUES(actor,p_command_id,kind,item_id,reason,before_row,after_row);
 IF delta<>0 THEN
  INSERT INTO public.inventory_transactions(user_id,transaction_type,raw_material_id,inventory_kind,quantity_delta,unit,unit_cost,total_cost,note,metadata)
  VALUES(actor,'raw_adjustment',roll.id,CASE WHEN roll.id IS NOT NULL THEN 'raw' ELSE 'supply' END,delta,CASE WHEN roll.id IS NOT NULL THEN 'g' ELSE supply.unit_type END,coalesce(roll.cost_per_gram,supply.cost_per_unit,0),delta*coalesce(roll.cost_per_gram,supply.cost_per_unit,0),reason,jsonb_build_object('source','ops_preview_inventory','command_id',p_command_id,'item_id',item_id,'before',before_row,'after',after_row));
 END IF;
 UPDATE public.ops_preview_workspaces SET revision=revision+1,updated_at=now() WHERE user_id=actor RETURNING * INTO workspace;
 INSERT INTO public.ops_preview_receipts VALUES(p_command_id,actor,request,workspace.revision,now());
 RETURN jsonb_build_object('workspace',public.ops_preview_load(),'inventory',public.ops_preview_inventory_load());
END $$;

CREATE OR REPLACE FUNCTION ops_preview_private.reserve_remaining(job_id uuid,o jsonb,command_id text) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); job public.production_jobs%rowtype; req record; roll record; needed numeric; take numeric; lines jsonb:='[]';
BEGIN
 SELECT * INTO STRICT job FROM public.production_jobs WHERE id=job_id AND user_id=actor;
 FOR req IN SELECT * FROM jsonb_each_text(ops_preview_private.requirements(o)) ORDER BY key LOOP
  needed:=req.value::numeric;
  FOR roll IN SELECT r.* FROM public.ops_preview_rolls m JOIN public.raw_material_inventory r ON r.id=m.raw_material_id AND r.user_id=actor
   WHERE m.user_id=actor AND m.material_key=req.key AND coalesce(r.active,true) AND r.status<>'retired'
   ORDER BY r.is_mounted DESC,r.created_at,r.id FOR UPDATE OF r LOOP
   take:=least(needed,greatest(0,roll.remaining_grams-coalesce(roll.reserved_grams,0)));
   IF take>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('raw_material_roll_id',roll.id,'grams_reserved',take)); needed:=needed-take; END IF;
   EXIT WHEN needed<=0;
  END LOOP;
 END LOOP;
 IF jsonb_array_length(lines)>0 THEN PERFORM public.reserve_production_material(job_id,job.updated_at,command_id,lines); END IF;
END $$;
CREATE OR REPLACE FUNCTION ops_preview_private.ensure_actual_reservation(job_id uuid,usage jsonb,command_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); u jsonb; roll record; reservation public.production_material_reservations%rowtype; needed numeric; take numeric; extra numeric; allocation jsonb; explicit_rolls boolean; lines jsonb:='[]'; order_ref text;
BEGIN
 SELECT order_number INTO STRICT order_ref FROM public.production_jobs WHERE id=job_id AND user_id=actor;
 FOR u IN SELECT * FROM jsonb_array_elements(usage) ORDER BY value->>'key' LOOP
  needed:=ops_preview_private.inventory_number(u,'grams');
  IF needed=0 THEN CONTINUE; END IF;
  explicit_rolls:=u ? 'rolls';
  IF explicit_rolls THEN
   IF jsonb_typeof(u->'rolls') IS DISTINCT FROM 'array' OR jsonb_array_length(u->'rolls')=0 THEN RAISE EXCEPTION 'Choose actual roll usage'; END IF;
   FOR allocation IN SELECT * FROM jsonb_array_elements(u->'rolls') LOOP
    IF nullif(allocation->>'raw_material_roll_id','') IS NULL OR ops_preview_private.inventory_number(allocation,'grams_used')<=0 THEN RAISE EXCEPTION 'Actual roll usage requires positive grams and a roll'; END IF;
   END LOOP;
   IF EXISTS(SELECT FROM jsonb_array_elements(u->'rolls') a GROUP BY a->>'raw_material_roll_id' HAVING count(*)>1)
    OR abs((SELECT sum((a->>'grams_used')::numeric) FROM jsonb_array_elements(u->'rolls') a)-needed)>0.000001 THEN RAISE EXCEPTION 'Actual roll grams must match material consumption without duplicates'; END IF;
  END IF;
  FOR roll IN SELECT r.*,coalesce(a.reserved_grams,0) job_reserved FROM public.ops_preview_rolls m
   JOIN public.raw_material_inventory r ON r.id=m.raw_material_id AND r.user_id=actor
   LEFT JOIN public.production_material_reservations a ON a.user_id=actor AND a.production_job_id=job_id AND a.raw_material_roll_id=r.id AND a.status='active'
   WHERE m.user_id=actor AND m.material_key=u->>'key' AND r.is_mounted AND coalesce(r.active,true) AND r.status<>'retired'
    AND (NOT explicit_rolls OR r.id::text IN (SELECT a->>'raw_material_roll_id' FROM jsonb_array_elements(u->'rolls') a))
   ORDER BY coalesce(a.reserved_grams,0) DESC,r.created_at,r.id FOR UPDATE OF r LOOP
   IF explicit_rolls THEN
    SELECT (a->>'grams_used')::numeric INTO take FROM jsonb_array_elements(u->'rolls') a WHERE a->>'raw_material_roll_id'=roll.id::text;
    IF take>greatest(0,roll.remaining_grams-coalesce(roll.reserved_grams,0)+roll.job_reserved) THEN RAISE EXCEPTION 'Actual usage exceeds available grams on the selected roll'; END IF;
   ELSE take:=least(needed,greatest(0,roll.remaining_grams-coalesce(roll.reserved_grams,0)+roll.job_reserved)); END IF;
   IF take<=0 THEN CONTINUE; END IF;
   SELECT * INTO reservation FROM public.production_material_reservations WHERE user_id=actor AND production_job_id=job_id AND raw_material_roll_id=roll.id AND status='active' FOR UPDATE;
   extra:=greatest(0,take-coalesce(reservation.reserved_grams,0));
   IF reservation.id IS NULL THEN
    INSERT INTO public.production_material_reservations(user_id,production_job_id,order_number,raw_material_roll_id,reserved_grams,status,reservation_command_id) VALUES(actor,job_id,order_ref,roll.id,take,'active',command_id||':'||roll.id);
   ELSIF extra>0 THEN UPDATE public.production_material_reservations SET reserved_grams=reserved_grams+extra WHERE id=reservation.id; END IF;
   UPDATE public.raw_material_inventory SET reserved_grams=coalesce(reserved_grams,0)+extra WHERE id=roll.id;
   lines:=lines||jsonb_build_array(jsonb_build_object('raw_material_roll_id',roll.id,'grams_used',take)); needed:=needed-take;
   EXIT WHEN needed<=0;
  END LOOP;
  IF needed>0 THEN RAISE EXCEPTION 'Mount sufficient unreserved % filament before recording usage',u->>'key'; END IF;
 END LOOP;
 RETURN lines;
END $$;

-- Replace only the queries that assumed one roll per material. Preserve the
-- accepted-order, payment, tax, production and command-receipt behavior.
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
   WHEN 'production_plan' THEN ARRAY['status','productionPlan','productionPrepHours','productionRemainingHours']
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
   PERFORM public.save_production_quote(job.id,job.updated_at,p_command_id||':quote',jsonb_build_object('quote_number',job.quote_number,'customer_name',proposed->>'customer','quote_title',proposed->>'title','quote_total',snapshot->'total','quote_status','pending','tax_exempt',proposed->'taxExempt','tax_exempt_reason',CASE WHEN (proposed->>'taxExempt')::boolean THEN 'Fictional test exemption scenario' ELSE NULL END,'quote_data',jsonb_build_object('fields',jsonb_build_object('qty',total_qty,'depositAmount',0,'fulfillment','pickup','taxCounty',proposed->'county'),'customer_totals',commercial)));
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
  ELSIF kind='pickup' THEN
   IF NOT coalesce((previous->>'released')::boolean,false) OR proposed->>'fulfilled'<>'true' OR (previous->>'fulfilled')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(proposed->'productionPlan',proposed->'items')) i WHERE (i->>'quantity')::numeric>coalesce((SELECT sum((r->>'accepted')::numeric) FROM jsonb_array_elements(proposed->'runs') r WHERE r->>'itemId'=i->>'id' AND r->>'status'='inspected'),0)) THEN RAISE EXCEPTION 'Inspect all pieces before pickup'; END IF;
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

REVOKE ALL ON FUNCTION public.ops_preview_inventory_load(),public.ops_preview_inventory_commit(jsonb,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_inventory_load(),public.ops_preview_inventory_commit(jsonb,bigint,text) TO authenticated;
COMMIT;
