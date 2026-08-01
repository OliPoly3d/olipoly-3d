-- Finance Pro append-only correction authority.
-- Forward-only: deploy with the matching Finance Pro frontend. This migration does not rewrite historical entries.
begin;

alter table public.financial_entries enable row level security;

-- Browser roles may read and create narrowly-columned manual entries, but may not mutate ledger rows.
revoke update, delete on table public.financial_entries from public, anon, authenticated;
revoke update(
  user_id, type, entry_date, category, tax_category, title, notes, amount, original_amount,
  vendor_name, payment_method, receipt_link, business_use_percent, miles_driven, mileage_rate,
  trip_purpose, trip_from, trip_to, round_trip, destination_county, sales_tax_collected,
  tax_exempt_sale, shipping_charged, tax_included, sales_tax_rate, shipping_cost, material_cost,
  packaging_cost, labor_cost, other_direct_cost
) on public.financial_entries from authenticated;

create or replace function public.finance_adjustment_value(p_adjustments jsonb, p_key text)
returns numeric language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare v numeric;
begin
  if not (p_adjustments ? p_key) then return 0; end if;
  if jsonb_typeof(p_adjustments -> p_key) <> 'number' then
    raise exception 'Finance adjustment % must be a JSON number', p_key using errcode='22023';
  end if;
  v := (p_adjustments ->> p_key)::numeric;
  if v::text in ('NaN','Infinity','-Infinity') or abs(v) > 999999999.99 then
    raise exception 'Finance adjustment % must be finite and within range', p_key using errcode='22003';
  end if;
  return round(v, 2);
end; $$;

create or replace function public.append_finance_entry_correction(
  p_original_entry_id uuid,
  p_correction_type text,
  p_reason text,
  p_adjustments jsonb,
  p_correction_date date,
  p_notes text,
  p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_original public.financial_entries%rowtype;
  v_entry public.financial_entries%rowtype;
  v_type text := lower(btrim(coalesce(p_correction_type,'')));
  v_amount numeric; v_shipping_charged numeric; v_tax numeric; v_shipping_cost numeric;
  v_material numeric; v_packaging numeric; v_labor numeric; v_other numeric;
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  if p_original_entry_id is null then raise exception 'Original Finance entry is required' using errcode='22004'; end if;
  if v_type not in ('correct','reverse') then raise exception 'Correction type must be correct or reverse' using errcode='22023'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Correction reason is required' using errcode='22023'; end if;
  if length(p_reason) > 500 or length(coalesce(p_notes,'')) > 500 then raise exception 'Correction reason or notes is too long' using errcode='22001'; end if;
  if nullif(btrim(coalesce(p_correlation_id,'')),'') is null or length(p_correlation_id) > 200 then raise exception 'Correction command identity is required' using errcode='22023'; end if;
  if p_correction_date is null then raise exception 'Correction date is required' using errcode='22004'; end if;
  if p_adjustments is null or jsonb_typeof(p_adjustments) <> 'object' then raise exception 'Correction adjustments must be an object' using errcode='22023'; end if;
  if exists (select 1 from jsonb_object_keys(p_adjustments) k where k not in ('amount','shipping_charged','sales_tax_collected','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost')) then
    raise exception 'Correction contains an unsupported adjustment' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('finance-correction:' || p_correlation_id));
  select * into v_entry from public.financial_entries where finance_command_id=p_correlation_id;
  if found then
    if v_entry.user_id is distinct from v_actor or v_entry.correction_of_entry_id is distinct from p_original_entry_id or v_entry.finance_command is distinct from case when v_type='reverse' then 'reverse_entry' else 'correct_entry' end then
      raise exception 'Correction command identity belongs to another command' using errcode='23505';
    end if;
    return jsonb_build_object('idempotent',true,'entry_id',v_entry.id,'original_entry_id',p_original_entry_id,'entry',to_jsonb(v_entry));
  end if;

  select * into v_original from public.financial_entries where id=p_original_entry_id and user_id=v_actor for update;
  if not found then raise exception 'Finance entry not found for this operator' using errcode='42501'; end if;
  if not coalesce(v_original.finance_command_owned,false) or v_original.finance_command_id is null then raise exception 'Only authoritative posted entries use append-only corrections' using errcode='22023'; end if;
  if v_original.correction_of_entry_id is not null or v_original.reversal_of_entry_id is not null then raise exception 'A correction entry cannot itself be corrected' using errcode='22023'; end if;
  if v_type='reverse' and exists(select 1 from public.financial_entries where user_id=v_actor and reversal_of_entry_id=p_original_entry_id) then raise exception 'Finance entry has already been reversed' using errcode='23505'; end if;

  if v_type='reverse' then
    v_amount := -coalesce(v_original.amount,0); v_shipping_charged := -coalesce(v_original.shipping_charged,0);
    v_tax := -coalesce(v_original.sales_tax_collected,0); v_shipping_cost := -coalesce(v_original.shipping_cost,0);
    v_material := -coalesce(v_original.material_cost,0); v_packaging := -coalesce(v_original.packaging_cost,0);
    v_labor := -coalesce(v_original.labor_cost,0); v_other := -coalesce(v_original.other_direct_cost,0);
  else
    v_amount := public.finance_adjustment_value(p_adjustments,'amount');
    v_shipping_charged := public.finance_adjustment_value(p_adjustments,'shipping_charged');
    v_tax := public.finance_adjustment_value(p_adjustments,'sales_tax_collected');
    v_shipping_cost := public.finance_adjustment_value(p_adjustments,'shipping_cost');
    v_material := public.finance_adjustment_value(p_adjustments,'material_cost');
    v_packaging := public.finance_adjustment_value(p_adjustments,'packaging_cost');
    v_labor := public.finance_adjustment_value(p_adjustments,'labor_cost');
    v_other := public.finance_adjustment_value(p_adjustments,'other_direct_cost');
    if v_amount=0 and v_shipping_charged=0 and v_tax=0 and v_shipping_cost=0 and v_material=0 and v_packaging=0 and v_labor=0 and v_other=0 then
      raise exception 'At least one non-zero correction adjustment is required' using errcode='22023';
    end if;
  end if;

  insert into public.financial_entries(
    user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,vendor_name,payment_method,
    business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,
    destination_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,
    finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,reversal_of_entry_id,posted_by,
    posted_at,correction_reason,accepted_commercial_snapshot
  ) values (
    v_actor,v_original.type,p_correction_date,coalesce(v_original.category,'Correction'),v_original.tax_category,
    case when v_type='reverse' then 'Reversal - ' else 'Correction - ' end || coalesce(v_original.title,p_original_entry_id::text),
    concat('Append-only Finance ',v_type,' for ',p_original_entry_id,': ',p_reason,case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else E'\n' || p_notes end),
    v_amount,v_amount,v_original.vendor_name,v_original.payment_method,coalesce(v_original.business_use_percent,100),
    v_shipping_charged,v_tax,coalesce(v_original.tax_exempt_sale,false),'no',0,v_original.destination_county,
    v_shipping_cost,v_material,v_packaging,v_labor,v_other,v_original.order_id,v_original.order_number,p_correlation_id,
    case when v_type='reverse' then 'reverse_entry' else 'correct_entry' end,true,p_original_entry_id,
    case when v_type='reverse' then p_original_entry_id else null end,v_actor,statement_timestamp(),p_reason,
    coalesce(v_original.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object('original_entry_id',p_original_entry_id,'correction_type',v_type,'adjustments',jsonb_build_object('amount',v_amount,'shipping_charged',v_shipping_charged,'sales_tax_collected',v_tax,'shipping_cost',v_shipping_cost,'material_cost',v_material,'packaging_cost',v_packaging,'labor_cost',v_labor,'other_direct_cost',v_other),'actor',v_actor,'recorded_at',statement_timestamp(),'correlation_id',p_correlation_id)
  ) returning * into v_entry;
  return jsonb_build_object('idempotent',false,'entry_id',v_entry.id,'original_entry_id',p_original_entry_id,'entry',to_jsonb(v_entry));
end; $$;

create or replace function public.update_manual_financial_entry(p_entry_id uuid,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_entry public.financial_entries%rowtype; v_amount numeric; v_original numeric;
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  if p_entry_id is null or jsonb_typeof(p_entry)<>'object' then raise exception 'Manual entry and payload are required' using errcode='22023'; end if;
  select * into v_entry from public.financial_entries where id=p_entry_id and user_id=v_actor for update;
  if not found then raise exception 'Manual Finance entry not found for this operator' using errcode='42501'; end if;
  if coalesce(v_entry.finance_command_owned,false) or v_entry.finance_command_id is not null or v_entry.order_id is not null or v_entry.correction_of_entry_id is not null or v_entry.reversal_of_entry_id is not null then
    raise exception 'This Finance entry is posted and immutable' using errcode='55000';
  end if;
  v_amount:=public.finance_adjustment_value(p_entry,'amount'); v_original:=public.finance_adjustment_value(p_entry,'original_amount');
  perform public.finance_adjustment_value(p_entry,k) from unnest(array['business_use_percent','miles_driven','mileage_rate','sales_tax_collected','shipping_charged','sales_tax_rate','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost']) k;
  if v_amount<0 or v_original<0 or nullif(btrim(p_entry->>'title'),'') is null or (p_entry->>'type') not in ('income','expense') then raise exception 'Manual entry payload is invalid' using errcode='22023'; end if;
  update public.financial_entries set
    type=p_entry->>'type',entry_date=(p_entry->>'entry_date')::date,category=p_entry->>'category',tax_category=p_entry->>'tax_category',title=p_entry->>'title',notes=coalesce(p_entry->>'notes',''),amount=v_amount,original_amount=v_original,
    vendor_name=coalesce(p_entry->>'vendor_name',''),payment_method=coalesce(p_entry->>'payment_method',''),receipt_link=coalesce(p_entry->>'receipt_link',''),business_use_percent=(p_entry->>'business_use_percent')::numeric,
    miles_driven=(p_entry->>'miles_driven')::numeric,mileage_rate=(p_entry->>'mileage_rate')::numeric,trip_purpose=coalesce(p_entry->>'trip_purpose',''),trip_from=coalesce(p_entry->>'trip_from',''),trip_to=coalesce(p_entry->>'trip_to',''),round_trip=(p_entry->>'round_trip')::boolean,
    destination_county=coalesce(p_entry->>'destination_county',''),sales_tax_collected=(p_entry->>'sales_tax_collected')::numeric,tax_exempt_sale=(p_entry->>'tax_exempt_sale')::boolean,shipping_charged=(p_entry->>'shipping_charged')::numeric,tax_included='no',sales_tax_rate=(p_entry->>'sales_tax_rate')::numeric,
    shipping_cost=(p_entry->>'shipping_cost')::numeric,material_cost=(p_entry->>'material_cost')::numeric,packaging_cost=(p_entry->>'packaging_cost')::numeric,labor_cost=(p_entry->>'labor_cost')::numeric,other_direct_cost=(p_entry->>'other_direct_cost')::numeric
  where id=p_entry_id and user_id=v_actor returning * into v_entry;
  return jsonb_build_object('entry_id',v_entry.id,'entry',to_jsonb(v_entry));
end; $$;

create or replace function public.delete_manual_financial_entry(p_entry_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_entry public.financial_entries%rowtype;
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  select * into v_entry from public.financial_entries where id=p_entry_id and user_id=v_actor for update;
  if not found then raise exception 'Manual Finance entry not found for this operator' using errcode='42501'; end if;
  if coalesce(v_entry.finance_command_owned,false) or v_entry.finance_command_id is not null or v_entry.order_id is not null or v_entry.correction_of_entry_id is not null or v_entry.reversal_of_entry_id is not null then
    raise exception 'This Finance entry is posted and immutable' using errcode='55000';
  end if;
  delete from public.financial_entries where id=p_entry_id and user_id=v_actor;
  return jsonb_build_object('deleted_entry_id',p_entry_id);
end; $$;

revoke all on function public.finance_adjustment_value(jsonb,text) from public,anon,authenticated;
revoke all on function public.append_finance_entry_correction(uuid,text,text,jsonb,date,text,text) from public,anon;
revoke all on function public.update_manual_financial_entry(uuid,jsonb) from public,anon;
revoke all on function public.delete_manual_financial_entry(uuid) from public,anon;
grant execute on function public.append_finance_entry_correction(uuid,text,text,jsonb,date,text,text) to authenticated,service_role;
grant execute on function public.update_manual_financial_entry(uuid,jsonb) to authenticated,service_role;
grant execute on function public.delete_manual_financial_entry(uuid) to authenticated,service_role;
comment on function public.append_finance_entry_correction(uuid,text,text,jsonb,date,text,text) is 'Creates an idempotent delta correction or full reversal; never updates the original posted Finance row.';
comment on table public.financial_entries is 'Finance ledger. finance_command_owned postings and their corrections are append-only; browser UPDATE and DELETE are revoked.';
commit;
