-- Establish the Orders-side contact contract required by Quote and campaign conversion.
-- customer_phone is optional metadata; no value is invented and no format is imposed.
-- Manual deployment required. This migration has not been applied by repository tooling.

begin;

alter table public.orders
  add column if not exists customer_phone text;

comment on column public.orders.customer_phone is
  'Optional customer contact phone copied from an authoritative accepted Quote or campaign submission; placeholders normalize to NULL.';

create or replace function public.normalize_order_customer_phone()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.customer_phone := nullif(btrim(new.customer_phone), '');
  if lower(coalesce(new.customer_phone, '')) in
     ('n/a', 'na', 'none', 'not available', 'not provided', 'unknown', '-', '—') then
    new.customer_phone := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_normalize_customer_phone on public.orders;
create trigger orders_normalize_customer_phone
before insert or update of customer_phone on public.orders
for each row execute function public.normalize_order_customer_phone();

-- Keep Orders Admin on its existing owner-only RLS path while allowing this
-- newly introduced nullable column through the established column-level grant.
grant update(customer_phone) on public.orders to authenticated;
revoke all on function public.normalize_order_customer_phone() from public, anon, authenticated;
grant execute on function public.normalize_order_customer_phone() to service_role;

-- Fail deployment before PostgREST reload if the authoritative Quote conversion
-- INSERT has drifted from the live Orders relation. This list exactly mirrors the
-- explicit INSERT in respond_to_quote_public.
do $$
declare
  v_required_order_columns constant text[] := array[
    'user_id', 'order_number', 'source_quote_number', 'source_type',
    'created_from_quote', 'accepted_date', 'status', 'quantity', 'order_total',
    'deposit_amount', 'balance_amount', 'payment_status', 'fulfillment',
    'customer_name', 'customer_email', 'customer_phone', 'order_title',
    'created_at', 'updated_at'
  ];
  v_missing text[];
begin
  select array_agg(required_column order by required_column)
    into v_missing
    from unnest(v_required_order_columns) as required_column
   where not exists (
     select 1
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = required_column
   );

  if cardinality(coalesce(v_missing, array[]::text[])) > 0 then
    raise exception 'Quote conversion Orders schema mismatch: missing columns %', v_missing
      using errcode = '42703';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
