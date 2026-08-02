-- Repair the live Orders tax-metadata contract. The earlier tax metadata migration
-- referenced the retired Finance destination_county column in the same transaction;
-- Finance now canonically stores the taxable destination in sales_county. A failure
-- in that transaction therefore also rolled back the Orders columns.
begin;

alter table public.orders
  add column if not exists destination_county text,
  add column if not exists sales_tax_rate numeric,
  add column if not exists taxable_subtotal numeric,
  add column if not exists sales_tax_amount numeric;

comment on column public.orders.destination_county is
  'Nullable legacy-safe destination county used for Ohio sales-tax reporting; never inferred from free-text addresses.';
comment on column public.orders.sales_tax_rate is
  'Authoritative accepted sales-tax percentage, including an explicit zero rate.';
comment on column public.orders.taxable_subtotal is
  'Authoritative pre-tax subtotal from the accepted commercial snapshot.';
comment on column public.orders.sales_tax_amount is
  'Authoritative sales tax collected from the accepted commercial snapshot.';

alter table public.orders drop constraint if exists orders_destination_county_valid;
alter table public.orders add constraint orders_destination_county_valid
  check (destination_county is null or public.is_ohio_county(destination_county)) not valid;
alter table public.orders drop constraint if exists orders_sales_tax_rate_valid;
alter table public.orders add constraint orders_sales_tax_rate_valid
  check (sales_tax_rate is null or (sales_tax_rate >= 0 and sales_tax_rate <= 20 and sales_tax_rate::text not in ('NaN','Infinity','-Infinity'))) not valid;
alter table public.orders drop constraint if exists orders_taxable_subtotal_valid;
alter table public.orders add constraint orders_taxable_subtotal_valid
  check (taxable_subtotal is null or taxable_subtotal >= 0) not valid;
alter table public.orders drop constraint if exists orders_sales_tax_amount_valid;
alter table public.orders add constraint orders_sales_tax_amount_valid
  check (sales_tax_amount is null or sales_tax_amount >= 0) not valid;

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
  v_rate:=case when v_totals ? 'tax_rate' then (v_totals->>'tax_rate')::numeric end;
  v_taxable:=case when v_totals ? 'taxable_subtotal' then (v_totals->>'taxable_subtotal')::numeric end;
  v_tax:=case when v_totals ? 'tax' then (v_totals->>'tax')::numeric end;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'Accepted destination county is invalid' using errcode='22023'; end if;
  new.destination_county:=coalesce(new.destination_county,v_county);
  new.sales_tax_rate:=coalesce(new.sales_tax_rate,v_rate);
  new.taxable_subtotal:=coalesce(new.taxable_subtotal,v_taxable);
  new.sales_tax_amount:=coalesce(new.sales_tax_amount,v_tax);
  return new;
end $$;
drop trigger if exists accepted_order_tax_metadata on public.orders;
create trigger accepted_order_tax_metadata before insert on public.orders for each row execute function public.capture_accepted_order_tax_metadata();

-- Preserve the existing invoice authority as the private base, then add the
-- persisted Orders tax metadata without recalculating customer totals.
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
  return v_result || jsonb_build_object('tax_metadata',jsonb_build_object(
    'destination_county',v_order.destination_county,
    'sales_tax_rate',coalesce(v_result#>'{accepted_commercial_breakdown,tax_rate}',to_jsonb(v_order.sales_tax_rate)),
    'taxable_subtotal',coalesce(v_result#>'{accepted_commercial_breakdown,taxable_subtotal}',to_jsonb(v_order.taxable_subtotal)),
    'sales_tax_collected',coalesce(v_result#>'{accepted_commercial_breakdown,tax}',to_jsonb(v_order.sales_tax_amount)),
    'tax_exempt',coalesce(v_order.tax_exempt,false),
    'tax_exempt_reason',v_order.tax_exempt_reason,
    'exemption_certificate_on_file',coalesce(v_order.exemption_certificate_on_file,false)));
end $$;
revoke all on function public.get_order_invoice_snapshot(uuid) from public,anon;
grant execute on function public.get_order_invoice_snapshot(uuid) to authenticated,service_role;

-- Runs after invoice reconciliation and maps only server-owned Orders/snapshot
-- values to the live Finance schema. Browser payload county/rate values are ignored.
create or replace function public.apply_order_tax_metadata_to_finance_post() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype; v_snapshot jsonb; v_totals jsonb; v_rate numeric; v_taxable numeric; v_tax numeric; v_county text;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id and user_id=new.user_id;
  select snapshot into v_snapshot from public.quote_accepted_commercial_snapshots
   where user_id=new.user_id and (order_number=new.order_number or quote_number=v_order.source_quote_number)
   order by (order_number=new.order_number) desc limit 1;
  v_totals:=coalesce(v_snapshot->'invoice_totals',v_snapshot#>'{offer,quote_data,customer_totals}',v_snapshot#>'{offer,customer_totals}');
  if jsonb_typeof(v_totals)<>'object' then raise exception 'FINANCE_INVOICE_TOTALS_UNRESOLVED: authoritative invoice totals are unavailable' using errcode='22023'; end if;
  v_rate:=coalesce((v_totals->>'tax_rate')::numeric,v_order.sales_tax_rate);
  v_taxable:=coalesce((v_totals->>'taxable_subtotal')::numeric,v_order.taxable_subtotal);
  v_tax:=coalesce((v_totals->>'tax')::numeric,v_order.sales_tax_amount);
  v_county:=nullif(btrim(v_order.destination_county),'');
  if v_rate is null or v_rate<0 or v_rate>20 or v_taxable is null or v_taxable<0 or v_tax is null or v_tax<0 then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: authoritative taxable subtotal, rate, or tax is invalid' using errcode='22023'; end if;
  if coalesce(v_order.tax_exempt,false) and (v_rate<>0 or v_tax<>0 or nullif(btrim(coalesce(v_order.tax_exempt_reason,'')),'') is null) then raise exception 'FINANCE_TAX_METADATA_CONTRADICTORY: tax exemption metadata is incomplete or contradictory' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and v_tax>0 and v_county is null then raise exception 'FINANCE_TAX_COUNTY_REQUIRED: Select the destination county before posting this taxable order to Finance' using errcode='22023'; end if;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: destination county is invalid' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and round(v_taxable*v_rate/100,2) is distinct from round(v_tax,2) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: taxable subtotal, rate, and collected tax do not reconcile' using errcode='22023'; end if;
  new.sales_county:=v_county;
  new.sales_tax_rate:=v_rate;
  new.sales_tax_collected:=v_tax;
  new.tax_exempt_sale:=coalesce(v_order.tax_exempt,false);
  new.amount:=v_taxable;
  new.original_amount:=v_taxable;
  new.accepted_commercial_snapshot:=coalesce(new.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object(
    'destination_county',v_county,'sales_county',v_county,'sales_tax_rate',v_rate,
    'taxable_subtotal',v_taxable,'sales_tax_collected',v_tax,
    'tax_exempt',coalesce(v_order.tax_exempt,false),'tax_exempt_reason',v_order.tax_exempt_reason,
    'exemption_certificate_on_file',coalesce(v_order.exemption_certificate_on_file,false),'tax_metadata_status','verified');
  return new;
end $$;
drop trigger if exists zz_financial_entries_order_tax_metadata on public.financial_entries;
create trigger zz_financial_entries_order_tax_metadata before insert on public.financial_entries for each row execute function public.apply_order_tax_metadata_to_finance_post();

comment on function public.apply_order_tax_metadata_to_finance_post() is
  'Maps Orders.destination_county to live Finance financial_entries.sales_county and rejects unresolved taxable postings.';
revoke all on function public.capture_accepted_order_tax_metadata(),public.apply_order_tax_metadata_to_finance_post() from public,anon,authenticated;
grant execute on function public.capture_accepted_order_tax_metadata(),public.apply_order_tax_metadata_to_finance_post() to service_role;
grant update(destination_county,sales_tax_rate,taxable_subtotal,sales_tax_amount) on public.orders to authenticated;

commit;
