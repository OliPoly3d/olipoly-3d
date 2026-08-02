-- Align the deployed eight-argument correction authority with the live Finance ledger.
-- This migration changes no table schema and adds no conceptual taxable-sales column.
begin;

create or replace function public.correct_financial_entry(
  p_original_entry_id uuid,
  p_corrected_record jsonb,
  p_changed_fields text[],
  p_reason text,
  p_expected_effective_posted_at timestamptz,
  p_tax_override_enabled boolean,
  p_tax_override_reason text,
  p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  -- Canonical live mapping: amount is the income taxable/pre-tax ledger amount;
  -- sales_county, sales_tax_rate, sales_tax_collected and tax_exempt_sale are
  -- stored directly. Friendly taxable/destination aliases are not row fields.
  v_actor uuid:=auth.uid(); v_root public.financial_entries%rowtype; v_effective public.financial_entries%rowtype;
  v_effective_version timestamptz;
  v_receipt public.finance_correction_receipts%rowtype; v_group uuid:=gen_random_uuid(); v_now timestamptz:=statement_timestamp();
  v_current jsonb; v_proposed jsonb; v_corrected jsonb; v_changed jsonb:='{}'::jsonb; v_key text; v_kind text;
  v_type text; v_date date; v_amount numeric; v_income_amount numeric; v_rate numeric; v_calculated_tax numeric; v_tax numeric;
  v_effective_amount numeric; v_effective_rate numeric;
  v_shipping_charged numeric; v_shipping_cost numeric; v_material numeric; v_packaging numeric; v_labor numeric; v_other numeric;
  v_business numeric; v_miles numeric; v_mileage_rate numeric; v_reversal public.financial_entries%rowtype; v_replacement public.financial_entries%rowtype; v_metadata public.financial_entries%rowtype;
  v_financial_keys constant text[]:=array['type','amount','original_amount','shipping_charged','sales_tax_rate','sales_tax_collected','tax_exempt_sale','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost','business_use_percent','miles_driven','mileage_rate'];
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  if p_original_entry_id is null or jsonb_typeof(p_corrected_record)<>'object' then raise exception 'Original entry and complete corrected record are required' using errcode='22023'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 or length(p_reason)>500 then raise exception 'Reason for correction is required' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_correlation_id,'')),'') is null or length(p_correlation_id)>200 then raise exception 'Correction command identity is required' using errcode='22023'; end if;
  if p_expected_effective_posted_at is null then raise exception 'Expected effective timestamp is required' using errcode='22004'; end if;
  if coalesce(cardinality(p_changed_fields),0)=0 then raise exception 'At least one changed field is required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext('full-finance-correction:'||p_correlation_id));
  select * into v_receipt from public.finance_correction_receipts where command_identity=p_correlation_id;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.original_entry_id is distinct from p_original_entry_id then raise exception 'Correction identity belongs to another command' using errcode='23505'; end if;
    return jsonb_build_object('idempotent',true,'correction_kind',v_receipt.correction_kind,'correction_group_id',v_receipt.correction_group_id,'metadata_entry_id',v_receipt.metadata_entry_id,'reversal_entry_id',v_receipt.reversal_entry_id,'replacement_entry_id',v_receipt.replacement_entry_id,'effective_entry_id',v_receipt.effective_entry_id,'effective_record',v_receipt.effective_record);
  end if;

  select * into v_root from public.financial_entries where id=p_original_entry_id and user_id=v_actor for update;
  if not found then raise exception 'Original Finance entry not found for this operator' using errcode='42501'; end if;
  if not coalesce(v_root.finance_command_owned,false) or v_root.correction_of_entry_id is not null or v_root.reversal_of_entry_id is not null or v_root.replacement_for_entry_id is not null then raise exception 'Correction root must be an original authoritative posting' using errcode='22023'; end if;

  select f.* into v_effective from public.finance_correction_receipts r join public.financial_entries f on f.id=r.replacement_entry_id
   where r.owner_id=v_actor and r.original_entry_id=v_root.id and r.replacement_entry_id is not null order by r.created_at desc limit 1 for update of f;
  if not found then v_effective:=v_root; end if;
  select coalesce(max(created_at),coalesce(v_effective.posted_at,v_effective.created_at)) into v_effective_version from public.finance_correction_receipts where owner_id=v_actor and original_entry_id=v_root.id;
  if v_effective_version is distinct from p_expected_effective_posted_at then raise exception 'Effective Finance entry changed; refresh before correcting' using errcode='40001'; end if;
  v_effective_amount:=coalesce(v_effective.amount,(v_effective.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,taxable_subtotal}')::numeric,(v_effective.accepted_commercial_snapshot->>'taxable_subtotal')::numeric,0);
  v_effective_rate:=case when coalesce(v_effective.sales_tax_rate,0)=0 and coalesce(v_effective.sales_tax_collected,0)>0 then coalesce((v_effective.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,tax_rate}')::numeric,(v_effective.accepted_commercial_snapshot->>'sales_tax_rate')::numeric,0) else coalesce(v_effective.sales_tax_rate,0) end;

  v_type:=lower(btrim(coalesce(p_corrected_record->>'type','')));
  if v_type not in ('income','expense') then raise exception 'Entry type must be income or expense' using errcode='22023'; end if;
  begin v_date:=(p_corrected_record->>'entry_date')::date; exception when others then raise exception 'Correction date is invalid' using errcode='22007'; end;
  v_amount:=case when jsonb_typeof(p_corrected_record->'amount')='number' then public.finance_adjustment_value(p_corrected_record,'amount') else v_effective_amount end;
  v_income_amount:=case when v_type='income' then v_amount else 0 end;
  v_rate:=case when jsonb_typeof(p_corrected_record->'sales_tax_rate')='number' then public.finance_adjustment_value(p_corrected_record,'sales_tax_rate') else v_effective_rate end;
  v_shipping_charged:=case when jsonb_typeof(p_corrected_record->'shipping_charged')='number' then public.finance_adjustment_value(p_corrected_record,'shipping_charged') else coalesce(v_effective.shipping_charged,0) end;
  v_shipping_cost:=case when jsonb_typeof(p_corrected_record->'shipping_cost')='number' then public.finance_adjustment_value(p_corrected_record,'shipping_cost') else coalesce(v_effective.shipping_cost,0) end;
  v_material:=case when jsonb_typeof(p_corrected_record->'material_cost')='number' then public.finance_adjustment_value(p_corrected_record,'material_cost') else coalesce(v_effective.material_cost,0) end;
  v_packaging:=case when jsonb_typeof(p_corrected_record->'packaging_cost')='number' then public.finance_adjustment_value(p_corrected_record,'packaging_cost') else coalesce(v_effective.packaging_cost,0) end;
  v_labor:=case when jsonb_typeof(p_corrected_record->'labor_cost')='number' then public.finance_adjustment_value(p_corrected_record,'labor_cost') else coalesce(v_effective.labor_cost,0) end;
  v_other:=case when jsonb_typeof(p_corrected_record->'other_direct_cost')='number' then public.finance_adjustment_value(p_corrected_record,'other_direct_cost') else coalesce(v_effective.other_direct_cost,0) end;
  v_business:=case when jsonb_typeof(p_corrected_record->'business_use_percent')='number' then public.finance_adjustment_value(p_corrected_record,'business_use_percent') else coalesce(v_effective.business_use_percent,100) end;
  v_miles:=case when jsonb_typeof(p_corrected_record->'miles_driven')='number' then public.finance_adjustment_value(p_corrected_record,'miles_driven') else coalesce(v_effective.miles_driven,0) end;
  v_mileage_rate:=case when jsonb_typeof(p_corrected_record->'mileage_rate')='number' then public.finance_adjustment_value(p_corrected_record,'mileage_rate') else coalesce(v_effective.mileage_rate,0) end;
  if v_amount<0 or v_income_amount<0 or v_rate<0 or v_rate>20 or v_shipping_charged<0 or v_shipping_cost<0 or v_material<0 or v_packaging<0 or v_labor<0 or v_other<0 or v_business<0 or v_business>100 or v_miles<0 or v_mileage_rate<0 then raise exception 'Corrected monetary values are invalid' using errcode='22023'; end if;
  if nullif(btrim(p_corrected_record->>'title'),'') is null or nullif(btrim(p_corrected_record->>'category'),'') is null then raise exception 'Title and category are required' using errcode='22023'; end if;
  if v_type='expense' and (v_income_amount<>0 or v_shipping_charged<>0 or v_rate<>0 or coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false)) then raise exception 'Expense correction contains income-only fields' using errcode='22023'; end if;
  if v_type='income' and (p_changed_fields && array['sales_county','amount','original_amount','sales_tax_rate','sales_tax_collected','tax_exempt_sale']::text[]) and not coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) and v_income_amount>0 and not public.is_ohio_county(p_corrected_record->>'sales_county') then raise exception 'Select the destination county used for sales-tax reporting' using errcode='22023'; end if;
  v_calculated_tax:=case when v_type='expense' or coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) then 0 else round(v_income_amount*v_rate/100,2) end;
  if coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) and (v_rate<>0 or nullif(btrim(coalesce(p_corrected_record->>'tax_exempt_reason','')),'') is null) then raise exception 'Tax exemption metadata is contradictory' using errcode='22023'; end if;
  if coalesce(p_tax_override_enabled,false) then
    if nullif(btrim(coalesce(p_tax_override_reason,'')),'') is null then raise exception 'Tax override explanation is required' using errcode='22023'; end if;
    v_tax:=public.finance_adjustment_value(p_corrected_record,'sales_tax_collected');
  elsif p_changed_fields && array['amount','original_amount','sales_tax_rate','tax_exempt_sale']::text[] then
    v_tax:=v_calculated_tax;
  else
    -- Metadata-only corrections preserve the posted tax exactly.
    v_tax:=coalesce(v_effective.sales_tax_collected,0);
  end if;

  v_corrected:=jsonb_build_object('type',v_type,'entry_date',v_date,'category',p_corrected_record->>'category','tax_category',coalesce(p_corrected_record->>'tax_category','auto'),'title',p_corrected_record->>'title','notes',coalesce(p_corrected_record->>'notes',''),'vendor_name',coalesce(p_corrected_record->>'vendor_name',''),'payment_method',coalesce(p_corrected_record->>'payment_method',''),'receipt_link',coalesce(p_corrected_record->>'receipt_link',''),'business_use_percent',v_business,'amount',case when v_type='income' then v_income_amount else v_amount end,'original_amount',case when jsonb_typeof(p_corrected_record->'original_amount')='number' then public.finance_adjustment_value(p_corrected_record,'original_amount') else coalesce(v_effective.original_amount,v_amount) end,'sales_county',case when v_type='income' then coalesce(p_corrected_record->>'sales_county','') else '' end,'sales_tax_rate',case when v_type='income' then v_rate else 0 end,'sales_tax_collected',case when v_type='income' then v_tax else 0 end,'tax_exempt_sale',v_type='income' and coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false),'shipping_charged',case when v_type='income' then v_shipping_charged else 0 end,'shipping_cost',v_shipping_cost,'material_cost',case when v_type='income' then v_material else 0 end,'packaging_cost',case when v_type='income' then v_packaging else 0 end,'labor_cost',case when v_type='income' then v_labor else 0 end,'other_direct_cost',case when v_type='income' then v_other else 0 end,'miles_driven',case when v_type='expense' then v_miles else 0 end,'mileage_rate',case when v_type='expense' then v_mileage_rate else 0 end,'trip_purpose',case when v_type='expense' then coalesce(p_corrected_record->>'trip_purpose','') else '' end,'trip_from',case when v_type='expense' then coalesce(p_corrected_record->>'trip_from','') else '' end,'trip_to',case when v_type='expense' then coalesce(p_corrected_record->>'trip_to','') else '' end,'round_trip',v_type='expense' and coalesce((p_corrected_record->>'round_trip')::boolean,false),'tax_exempt_reason',coalesce(p_corrected_record->>'tax_exempt_reason',''),'exemption_certificate_on_file',coalesce((p_corrected_record->>'exemption_certificate_on_file')::boolean,false),'calculated_sales_tax',v_calculated_tax,'tax_override_enabled',coalesce(p_tax_override_enabled,false),'tax_override_reason',coalesce(p_tax_override_reason,''));
  if not coalesce(p_tax_override_enabled,false) then v_corrected:=v_corrected-'tax_override_enabled'-'tax_override_reason'; end if;
  if not coalesce(p_tax_override_enabled,false) and v_income_amount=v_effective_amount and v_rate=v_effective_rate and coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false)=coalesce(v_effective.tax_exempt_sale,false) then v_corrected:=v_corrected-'calculated_sales_tax'; end if;
  v_current:=to_jsonb(v_effective)||jsonb_build_object('sales_tax_rate',v_effective_rate,'amount',v_effective_amount,'original_amount',case when v_effective.type='income' then v_effective_amount else coalesce(v_effective.original_amount,v_effective.amount) end)||coalesce((select effective_record from public.finance_correction_receipts where owner_id=v_actor and original_entry_id=v_root.id order by created_at desc limit 1),'{}'::jsonb);
  v_proposed:=p_corrected_record;
  for v_key in select jsonb_object_keys(v_proposed) loop if v_current->v_key is distinct from v_proposed->v_key then v_changed:=v_changed||jsonb_build_object(v_key,jsonb_build_object('old',v_current->v_key,'new',v_proposed->v_key)); end if; end loop;
  if v_changed='{}'::jsonb then raise exception 'Corrected record does not change any field' using errcode='22023'; end if;
  v_kind:=case when exists(select 1 from jsonb_object_keys(v_changed) k where k=any(v_financial_keys)) then 'reversal_replacement' else 'metadata_only' end;

  if v_kind='metadata_only' then
    v_corrected:=v_current||v_proposed;
    if not coalesce(p_tax_override_enabled,false) then v_corrected:=v_corrected-'tax_override_enabled'-'tax_override_reason'; end if;
    insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,sales_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,posted_by,posted_at,correction_reason,correction_group_id,correction_kind,accepted_commercial_snapshot)
    values(v_actor,v_effective.type,v_date,p_corrected_record->>'category',p_corrected_record->>'tax_category',p_corrected_record->>'title','Metadata-only correction: '||p_reason,0,0,100,0,0,false,'no',0,p_corrected_record->>'sales_county',0,0,0,0,0,v_root.order_id,v_root.order_number,p_correlation_id,'correct_entry_metadata',true,v_root.id,v_actor,v_now,p_reason,v_group,v_kind,coalesce(v_root.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object('correction_root_entry_id',v_root.id,'effective_entry_id',v_effective.id,'correction_group_id',v_group,'corrected_record',v_corrected,'changed_fields',v_changed,'corrected_by',v_actor,'corrected_at',v_now)) returning * into v_metadata;
  else
    insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,sales_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,reversal_of_entry_id,posted_by,posted_at,correction_reason,correction_group_id,correction_kind,accepted_commercial_snapshot)
    values(v_actor,v_effective.type,v_date,v_effective.category,v_effective.tax_category,'Reversal - '||coalesce(v_effective.title,v_effective.id::text),'Full reversal for correction: '||p_reason,-coalesce(v_effective.amount,0),-coalesce(v_effective.original_amount,v_effective.amount,0),coalesce(v_effective.business_use_percent,100),-coalesce(v_effective.shipping_charged,0),-coalesce(v_effective.sales_tax_collected,0),coalesce(v_effective.tax_exempt_sale,false),'no',coalesce(v_effective.sales_tax_rate,0),v_effective.sales_county,-coalesce(v_effective.shipping_cost,0),-coalesce(v_effective.material_cost,0),-coalesce(v_effective.packaging_cost,0),-coalesce(v_effective.labor_cost,0),-coalesce(v_effective.other_direct_cost,0),v_root.order_id,v_root.order_number,p_correlation_id||':reversal','correct_entry_reversal',true,v_root.id,v_effective.id,v_actor,v_now,p_reason,v_group,v_kind,jsonb_build_object('correction_root_entry_id',v_root.id,'correction_group_id',v_group,'changed_fields',v_changed,'corrected_by',v_actor,'corrected_at',v_now)) returning * into v_reversal;
    insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,vendor_name,payment_method,receipt_link,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,sales_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,miles_driven,mileage_rate,trip_purpose,trip_from,trip_to,round_trip,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,replacement_for_entry_id,posted_by,posted_at,correction_reason,correction_group_id,correction_kind,accepted_commercial_snapshot)
    values(v_actor,v_type,v_date,v_corrected->>'category',v_corrected->>'tax_category',v_corrected->>'title',v_corrected->>'notes',v_amount,(v_corrected->>'original_amount')::numeric,v_corrected->>'vendor_name',v_corrected->>'payment_method',v_corrected->>'receipt_link',v_business,case when v_type='income' then v_shipping_charged else 0 end,case when v_type='income' then v_tax else 0 end,coalesce((v_corrected->>'tax_exempt_sale')::boolean,false),'no',case when v_type='income' then v_rate else 0 end,v_corrected->>'sales_county',v_shipping_cost,case when v_type='income' then v_material else 0 end,case when v_type='income' then v_packaging else 0 end,case when v_type='income' then v_labor else 0 end,case when v_type='income' then v_other else 0 end,case when v_type='expense' then v_miles else 0 end,case when v_type='expense' then v_mileage_rate else 0 end,v_corrected->>'trip_purpose',v_corrected->>'trip_from',v_corrected->>'trip_to',coalesce((v_corrected->>'round_trip')::boolean,false),v_root.order_id,v_root.order_number,p_correlation_id||':replacement','correct_entry_replacement',true,v_root.id,v_effective.id,v_actor,v_now,p_reason,v_group,v_kind,coalesce(v_root.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object('correction_root_entry_id',v_root.id,'correction_group_id',v_group,'reversal_entry_id',v_reversal.id,'corrected_record',v_corrected,'changed_fields',v_changed,'tax_override_enabled',coalesce(p_tax_override_enabled,false),'tax_override_reason',coalesce(p_tax_override_reason,''),'calculated_sales_tax',v_calculated_tax,'corrected_by',v_actor,'corrected_at',v_now)) returning * into v_replacement;
  end if;
  insert into public.finance_correction_receipts(command_identity,owner_id,original_entry_id,effective_entry_id,correction_group_id,correction_kind,metadata_entry_id,reversal_entry_id,replacement_entry_id,reason,changed_fields,effective_record,created_at)
  values(p_correlation_id,v_actor,v_root.id,coalesce(v_replacement.id,v_effective.id),v_group,v_kind,v_metadata.id,v_reversal.id,v_replacement.id,p_reason,v_changed,v_corrected,v_now) returning * into v_receipt;
  return jsonb_build_object('idempotent',false,'correction_kind',v_kind,'correction_group_id',v_group,'metadata_entry_id',v_metadata.id,'reversal_entry_id',v_reversal.id,'replacement_entry_id',v_replacement.id,'effective_entry_id',v_receipt.effective_entry_id,'changed_fields',v_changed,'effective_record',v_corrected);
end $$;

-- Preserve the established narrow execution grants after CREATE OR REPLACE.
revoke all on function public.correct_financial_entry(uuid,jsonb,text[],text,timestamptz,boolean,text,text) from public, anon;
grant execute on function public.correct_financial_entry(uuid,jsonb,text[],text,timestamptz,boolean,text,text) to authenticated, service_role;
comment on function public.correct_financial_entry(uuid,jsonb,text[],text,timestamptz,boolean,text,text) is
  'Append-only Finance correction mapped to canonical amount, sales_county, sales_tax_rate, sales_tax_collected, tax_exempt_sale, tax_category and tax_included columns.';

notify pgrst, 'reload schema';
commit;
