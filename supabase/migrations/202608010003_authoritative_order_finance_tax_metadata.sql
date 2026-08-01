-- Carry authoritative destination/rate metadata from accepted Quote -> Order -> invoice -> Finance,
-- and provide append-only tax-metadata corrections. No historical row is rewritten.
begin;

alter table public.orders
  add column if not exists destination_county text,
  add column if not exists sales_tax_rate numeric,
  add column if not exists taxable_subtotal numeric,
  add column if not exists sales_tax_amount numeric;
alter table public.financial_entries add column if not exists taxable_sales numeric;

create or replace function public.is_ohio_county(p_county text) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select btrim(coalesce(p_county,'')) = any(array['Adams','Allen','Ashland','Ashtabula','Athens','Auglaize','Belmont','Brown','Butler','Carroll','Champaign','Clark','Clermont','Clinton','Columbiana','Coshocton','Crawford','Cuyahoga','Darke','Defiance','Delaware','Erie','Fairfield','Fayette','Franklin','Fulton','Gallia','Geauga','Greene','Guernsey','Hamilton','Hancock','Hardin','Harrison','Henry','Highland','Hocking','Holmes','Huron','Jackson','Jefferson','Knox','Lake','Lawrence','Licking','Logan','Lorain','Lucas','Madison','Mahoning','Marion','Medina','Meigs','Mercer','Miami','Monroe','Montgomery','Morgan','Morrow','Muskingum','Noble','Ottawa','Paulding','Perry','Pickaway','Pike','Portage','Preble','Putnam','Richland','Ross','Sandusky','Scioto','Seneca','Shelby','Stark','Summit','Trumbull','Tuscarawas','Union','Van Wert','Vinton','Warren','Washington','Wayne','Williams','Wood','Wyandot']);
$$;

alter table public.orders drop constraint if exists orders_sales_tax_rate_valid;
alter table public.orders add constraint orders_sales_tax_rate_valid check(sales_tax_rate is null or (sales_tax_rate>=0 and sales_tax_rate<=20 and sales_tax_rate::text not in ('NaN','Infinity','-Infinity'))) not valid;
alter table public.orders drop constraint if exists orders_taxable_subtotal_valid;
alter table public.orders add constraint orders_taxable_subtotal_valid check(taxable_subtotal is null or taxable_subtotal>=0) not valid;

create or replace function public.capture_accepted_order_tax_metadata() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_snapshot jsonb; v_totals jsonb; v_county text; v_rate numeric; v_taxable numeric; v_tax numeric;
begin
  if nullif(btrim(coalesce(new.source_quote_number,'')),'') is null then return new; end if;
  select snapshot into v_snapshot from public.quote_accepted_commercial_snapshots
   where user_id=new.user_id and (order_number=new.order_number or quote_number=new.source_quote_number)
   order by (order_number=new.order_number) desc limit 1;
  v_totals:=coalesce(v_snapshot->'invoice_totals',v_snapshot#>'{offer,quote_data,customer_totals}',v_snapshot#>'{offer,customer_totals}');
  if jsonb_typeof(v_totals)<>'object' then return new; end if;
  v_county:=nullif(btrim(coalesce(v_totals->>'destination_county',v_snapshot#>>'{offer,fields,taxCounty}',v_snapshot#>>'{offer,quote_data,fields,taxCounty}')),'');
  if v_totals ? 'tax_rate' then v_rate:=(v_totals->>'tax_rate')::numeric; end if;
  if v_totals ? 'taxable_subtotal' then v_taxable:=(v_totals->>'taxable_subtotal')::numeric; end if;
  if v_totals ? 'tax' then v_tax:=(v_totals->>'tax')::numeric; end if;
  if v_rate<0 or v_rate>20 or v_taxable<0 or v_tax<0 then raise exception 'Accepted tax metadata is invalid' using errcode='22023'; end if;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'Accepted destination county is invalid' using errcode='22023'; end if;
  if coalesce(v_tax,0)>0 and v_county is null then raise exception 'Accepted taxable Order requires an explicit destination county' using errcode='22023'; end if;
  new.destination_county:=coalesce(new.destination_county,v_county);
  new.sales_tax_rate:=coalesce(new.sales_tax_rate,v_rate);
  new.taxable_subtotal:=coalesce(new.taxable_subtotal,v_taxable);
  new.sales_tax_amount:=coalesce(new.sales_tax_amount,v_tax);
  return new;
end $$;
drop trigger if exists accepted_order_tax_metadata on public.orders;
create trigger accepted_order_tax_metadata before insert on public.orders for each row execute function public.capture_accepted_order_tax_metadata();

-- Keep the existing verified totals function as the private base and enrich its read contract.
do $$ begin
  if to_regprocedure('public.get_order_invoice_snapshot_base(uuid)') is null then
    execute 'alter function public.get_order_invoice_snapshot(uuid) rename to get_order_invoice_snapshot_base';
  end if;
end $$;
revoke all on function public.get_order_invoice_snapshot_base(uuid) from public,anon,authenticated;
grant execute on function public.get_order_invoice_snapshot_base(uuid) to service_role;
create or replace function public.get_order_invoice_snapshot(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_result jsonb;
begin
  if v_actor is null then raise exception 'Authenticated owner is required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  v_result:=public.get_order_invoice_snapshot_base(p_order_id);
  return jsonb_set(v_result,'{identity}',coalesce(v_result->'identity','{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'destination_county',v_order.destination_county,'tax_exempt_reason',v_order.tax_exempt_reason,'exemption_certificate_on_file',v_order.exemption_certificate_on_file)),true)
    || jsonb_build_object('tax_metadata',jsonb_build_object('destination_county',v_order.destination_county,
      'tax_rate',coalesce(v_result#>'{accepted_commercial_breakdown,tax_rate}',to_jsonb(v_order.sales_tax_rate)),
      'taxable_subtotal',coalesce(v_result#>'{accepted_commercial_breakdown,taxable_subtotal}',to_jsonb(v_order.taxable_subtotal)),
      'tax_amount',coalesce(v_result#>'{accepted_commercial_breakdown,tax}',to_jsonb(v_order.sales_tax_amount)),
      'tax_exempt',coalesce(v_order.tax_exempt,false),'tax_exempt_reason',v_order.tax_exempt_reason));
end $$;
revoke all on function public.get_order_invoice_snapshot(uuid) from public,anon;
grant execute on function public.get_order_invoice_snapshot(uuid) to authenticated,service_role;

create or replace function public.apply_order_tax_metadata_to_finance_post() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype; v_snapshot jsonb; v_totals jsonb; v_rate numeric; v_taxable numeric; v_tax numeric; v_county text;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id and user_id=new.user_id;
  select snapshot into v_snapshot from public.quote_accepted_commercial_snapshots where user_id=new.user_id and (order_number=new.order_number or quote_number=v_order.source_quote_number) order by (order_number=new.order_number) desc limit 1;
  v_totals:=coalesce(v_snapshot->'invoice_totals',v_snapshot#>'{offer,quote_data,customer_totals}',v_snapshot#>'{offer,customer_totals}');
  if jsonb_typeof(v_totals)<>'object' then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: authoritative invoice totals are unavailable' using errcode='22023'; end if;
  v_rate:=coalesce((v_totals->>'tax_rate')::numeric,v_order.sales_tax_rate);
  v_taxable:=coalesce((v_totals->>'taxable_subtotal')::numeric,v_order.taxable_subtotal);
  v_tax:=coalesce((v_totals->>'tax')::numeric,v_order.sales_tax_amount);
  v_county:=coalesce(nullif(v_order.destination_county,''),nullif(v_totals->>'destination_county',''));
  if v_rate is null or v_rate<0 or v_rate>20 or v_taxable is null or v_taxable<0 or v_tax is null or v_tax<0 then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: authoritative taxable subtotal, rate, or tax is invalid' using errcode='22023'; end if;
  if coalesce(v_order.tax_exempt,false) and (v_rate<>0 or v_tax<>0) then raise exception 'FINANCE_TAX_METADATA_CONTRADICTORY: exempt Order has nonzero rate or tax' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and v_tax>0 and v_rate=0 then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: taxable Order has tax but no rate' using errcode='22023'; end if;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: destination county is invalid' using errcode='22023'; end if;
  new.destination_county:=v_county; new.sales_tax_rate:=v_rate; new.taxable_sales:=v_taxable; new.sales_tax_collected:=v_tax; new.tax_exempt_sale:=coalesce(v_order.tax_exempt,false);
  new.accepted_commercial_snapshot:=coalesce(new.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object('destination_county',v_county,'sales_tax_rate',v_rate,'taxable_subtotal',v_taxable,'sales_tax_collected',v_tax,'tax_exempt',coalesce(v_order.tax_exempt,false),'tax_exempt_reason',v_order.tax_exempt_reason,'exemption_certificate_on_file',v_order.exemption_certificate_on_file,'tax_metadata_status',case when v_county is null and v_tax>0 then 'legacy_missing_county_requires_correction' else 'verified' end);
  return new;
end $$;
drop trigger if exists zz_financial_entries_order_tax_metadata on public.financial_entries;
create trigger zz_financial_entries_order_tax_metadata before insert on public.financial_entries for each row execute function public.apply_order_tax_metadata_to_finance_post();

create index if not exists financial_entries_tax_metadata_corrections on public.financial_entries(user_id,correction_of_entry_id,posted_at desc) where finance_command='correct_tax_metadata';
create or replace function public.append_finance_tax_metadata_correction(p_original_entry_id uuid,p_destination_county text,p_sales_tax_rate numeric,p_tax_exempt boolean,p_tax_exempt_reason text,p_exemption_certificate_on_file boolean,p_correction_date date,p_reason text,p_correlation_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_original public.financial_entries%rowtype; v_existing public.financial_entries%rowtype; v_taxable numeric; v_tax numeric; v_delta numeric;
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  if p_original_entry_id is null or p_correction_date is null or length(btrim(coalesce(p_reason,'')))<3 or nullif(btrim(coalesce(p_correlation_id,'')),'') is null then raise exception 'Correction entry, date, reason, and identity are required' using errcode='22023'; end if;
  if not coalesce(p_tax_exempt,false) and not public.is_ohio_county(p_destination_county) then raise exception 'Select the destination county used for sales-tax reporting' using errcode='22023'; end if;
  if p_sales_tax_rate is null or p_sales_tax_rate<0 or p_sales_tax_rate>20 or p_sales_tax_rate::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter the authoritative sales-tax rate' using errcode='22023'; end if;
  if coalesce(p_tax_exempt,false) and (p_sales_tax_rate<>0 or nullif(btrim(coalesce(p_tax_exempt_reason,'')),'') is null) then raise exception 'Tax metadata conflicts with exemption status' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('finance-tax-correction:'||p_correlation_id));
  select * into v_existing from public.financial_entries where finance_command_id=p_correlation_id;
  if found then
    if v_existing.user_id is distinct from v_actor or v_existing.correction_of_entry_id is distinct from p_original_entry_id or v_existing.finance_command is distinct from 'correct_tax_metadata' then raise exception 'Correction identity belongs to another command' using errcode='23505'; end if;
    return jsonb_build_object('idempotent',true,'entry_id',v_existing.id,'original_entry_id',p_original_entry_id,'entry',to_jsonb(v_existing));
  end if;
  select * into v_original from public.financial_entries where id=p_original_entry_id and user_id=v_actor for update;
  if not found then raise exception 'Finance entry not found for this operator' using errcode='42501'; end if;
  if not coalesce(v_original.finance_command_owned,false) or v_original.correction_of_entry_id is not null or v_original.reversal_of_entry_id is not null then raise exception 'Only an original authoritative posting can receive tax metadata correction' using errcode='22023'; end if;
  v_taxable:=coalesce(v_original.taxable_sales,(v_original.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,taxable_subtotal}')::numeric,(v_original.accepted_commercial_snapshot->>'taxable_subtotal')::numeric);
  if v_taxable is null or v_taxable<0 then raise exception 'Authoritative taxable subtotal is unavailable' using errcode='22023'; end if;
  v_tax:=case when coalesce(p_tax_exempt,false) then 0 else round(v_taxable*p_sales_tax_rate/100,2) end;
  v_delta:=v_tax-coalesce(v_original.sales_tax_collected,0);
  insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,business_use_percent,taxable_sales,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,destination_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,posted_by,posted_at,correction_reason,accepted_commercial_snapshot)
  values(v_actor,v_original.type,p_correction_date,coalesce(v_original.category,'Sale'),v_original.tax_category,'Tax metadata correction - '||coalesce(v_original.title,p_original_entry_id::text),'Append-only tax metadata correction for '||p_original_entry_id||': '||p_reason,0,0,100,0,0,v_delta,coalesce(p_tax_exempt,false),'no',p_sales_tax_rate,nullif(btrim(p_destination_county),''),0,0,0,0,0,v_original.order_id,v_original.order_number,p_correlation_id,'correct_tax_metadata',true,p_original_entry_id,v_actor,statement_timestamp(),p_reason,coalesce(v_original.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object('tax_metadata_correction',true,'original_entry_id',p_original_entry_id,'destination_county',nullif(btrim(p_destination_county),''),'sales_tax_rate',p_sales_tax_rate,'taxable_subtotal',v_taxable,'calculated_tax',v_tax,'tax_delta',v_delta,'tax_exempt',coalesce(p_tax_exempt,false),'tax_exempt_reason',p_tax_exempt_reason,'exemption_certificate_on_file',coalesce(p_exemption_certificate_on_file,false),'actor',v_actor,'recorded_at',statement_timestamp(),'correlation_id',p_correlation_id)) returning * into v_existing;
  return jsonb_build_object('idempotent',false,'entry_id',v_existing.id,'original_entry_id',p_original_entry_id,'calculated_tax',v_tax,'tax_delta',v_delta,'entry',to_jsonb(v_existing));
end $$;

revoke all on function public.is_ohio_county(text),public.capture_accepted_order_tax_metadata(),public.apply_order_tax_metadata_to_finance_post() from public,anon,authenticated;
grant execute on function public.is_ohio_county(text),public.capture_accepted_order_tax_metadata(),public.apply_order_tax_metadata_to_finance_post() to service_role;
revoke all on function public.append_finance_tax_metadata_correction(uuid,text,numeric,boolean,text,boolean,date,text,text) from public,anon;
grant execute on function public.append_finance_tax_metadata_correction(uuid,text,numeric,boolean,text,boolean,date,text,text) to authenticated,service_role;
grant update(destination_county,sales_tax_rate,taxable_subtotal,sales_tax_amount) on public.orders to authenticated;

commit;

-- Read-only candidate report; run after deployment. It never changes a row.
-- select f.id,f.order_number,f.entry_date,coalesce(f.taxable_sales,(f.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,taxable_subtotal}')::numeric) taxable_sales,
--        f.sales_tax_collected,f.sales_tax_rate,f.destination_county,
--        case when f.accepted_commercial_snapshot#>'{accepted_commercial_breakdown,tax_rate}' is not null then 'invoice_snapshot' when o.sales_tax_rate is not null then 'canonical_order' else 'unavailable' end authoritative_source_availability,
--        case when f.tax_exempt_sale and coalesce(f.sales_tax_collected,0)>0 then 'contradictory_exemption'
--             when coalesce(f.sales_tax_collected,0)>0 and coalesce(f.sales_tax_rate,0)=0 then 'rate_correction_required'
--             when coalesce(f.taxable_sales,0)>0 and nullif(f.destination_county,'') is null then 'county_correction_required'
--             when coalesce(f.sales_tax_rate,0)>0 and coalesce(f.taxable_sales,0)=0 then 'taxable_subtotal_review_required'
--             when nullif(f.destination_county,'') is not null and f.sales_tax_rate is null then 'rate_correction_required' end suggested_correction_status
-- from public.financial_entries f left join public.orders o on o.id=f.order_id
-- where f.finance_command_owned and f.correction_of_entry_id is null and (coalesce(f.sales_tax_collected,0)>0 and coalesce(f.sales_tax_rate,0)=0 or coalesce(f.taxable_sales,0)>0 and nullif(f.destination_county,'') is null or f.tax_exempt_sale and coalesce(f.sales_tax_collected,0)>0 or coalesce(f.sales_tax_rate,0)>0 and coalesce(f.taxable_sales,0)=0 or nullif(f.destination_county,'') is not null and f.sales_tax_rate is null);
