begin;

-- The accepted quote remains immutable. Each owner-approved change is a new
-- commercial revision, committed atomically with Orders and its public projection.
create table public.order_pricing_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id uuid not null references public.orders(id),
  revision integer not null check (revision > 0),
  command_id text not null unique,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  totals jsonb not null,
  amount_received numeric not null check (amount_received >= 0),
  created_at timestamptz not null default statement_timestamp(),
  unique(order_id, revision)
);
alter table public.order_pricing_revisions enable row level security;
create policy order_pricing_revisions_owner_read on public.order_pricing_revisions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.order_pricing_revisions from public, anon, authenticated;
grant select on public.order_pricing_revisions to authenticated;
create trigger order_pricing_revisions_immutable before update or delete on public.order_pricing_revisions
  for each row execute function public.prevent_quote_accepted_snapshot_mutation();

-- Internal selectors: one current commercial snapshot is consumed by invoices
-- and both Finance posting triggers. No browser can call these helpers directly.
create or replace function public.current_order_commercial_totals(p_order_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    (select r.totals from public.order_pricing_revisions r where r.order_id=o.id and r.user_id=o.user_id order by r.revision desc limit 1),
    (select case when s.snapshot->>'invoice_totals_schema_version'='1' then s.snapshot->'invoice_totals'
      when not(s.snapshot ? 'invoice_totals_schema_version') then coalesce(s.snapshot#>'{offer,quote_data,customer_totals}',s.snapshot#>'{offer,customer_totals}') end
     from public.quote_accepted_commercial_snapshots s where s.user_id=o.user_id and (s.order_number=o.order_number or s.quote_number=o.source_quote_number)
     order by (s.order_number=o.order_number) desc limit 1))
  from public.orders o where o.id=p_order_id and o.user_id=auth.uid();
$$;
create or replace function public.current_order_amount_received(p_order_id uuid)
returns numeric language sql stable security definer set search_path=public,pg_temp as $$
  select greatest(coalesce((select r.amount_received from public.order_pricing_revisions r
    where r.order_id=o.id and r.user_id=o.user_id order by r.revision desc limit 1),0),
    case when o.payment_status='paid' then o.order_total
      when o.payment_status='deposit_paid' then greatest(0,o.order_total-o.balance_amount)
      else 0 end)
  from public.orders o where o.id=p_order_id and o.user_id=auth.uid();
$$;
revoke all on function public.current_order_commercial_totals(uuid),public.current_order_amount_received(uuid) from public,anon,authenticated;

create or replace function public.revise_order_pricing(
  p_order_id uuid, p_expected_updated_at timestamptz, p_command_id text, p_reason text, p_totals jsonb
) returns setof public.orders language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_prior public.order_pricing_revisions%rowtype;
  v_item jsonb; v_key text; v_qty integer:=0; v_subtotal numeric:=0; v_received numeric; v_total numeric;
  v_rate numeric; v_revision integer; v_now timestamptz:=statement_timestamp();
begin
  if v_actor is null then raise exception 'Authenticated order owner is required' using errcode='42501'; end if;
  if p_expected_updated_at is null or nullif(btrim(p_command_id),'') is null or length(p_command_id)>200
    or nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'Order version, command identity, and reason are required' using errcode='22023'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  select * into v_prior from public.order_pricing_revisions where command_id=p_command_id;
  if found then
    if v_prior.user_id<>v_actor or v_prior.order_id<>p_order_id or v_prior.totals is distinct from p_totals or v_prior.reason is distinct from btrim(p_reason) then
      raise exception 'Pricing command identity already used with different changes' using errcode='22023'; end if;
    return next v_order; return;
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed; refresh before revising pricing' using errcode='40001'; end if;
  if lower(coalesce(v_order.status,'')) in ('closed','fulfilled','cancelled','canceled','void') or coalesce(v_order.finance_pushed,false)
    or exists(select 1 from public.financial_entries where order_id=v_order.id and finance_command='post_order_income') then
    raise exception 'Closed or Finance-posted orders require a Finance correction' using errcode='55000'; end if;
  if v_order.payment_status='refunded' then raise exception 'Review refunded payments before revising this order' using errcode='55000'; end if;
  if jsonb_typeof(p_totals) is distinct from 'object' or jsonb_typeof(p_totals->'line_items') is distinct from 'array' then
    raise exception 'Itemized pricing snapshot is required' using errcode='22023'; end if;
  if jsonb_array_length(p_totals->'line_items') not between 1 and 100 then raise exception 'Use between 1 and 100 items' using errcode='22023'; end if;
  foreach v_key in array array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total','piece_price','shipping','shipping_charged','rounding_adjustment'] loop
    if jsonb_typeof(p_totals->v_key) is distinct from 'number' or (p_totals->>v_key) !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Invalid pricing field: %',v_key using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(p_totals->'shipping_deferred') is distinct from 'boolean'
    or p_totals->>'shipping_in_taxable_subtotal' is distinct from 'true' then
    raise exception 'Shipping treatment is required' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_totals->'line_items') loop
    if nullif(btrim(v_item->>'id'),'') is null or nullif(btrim(v_item->>'description'),'') is null or length(v_item->>'description')>500 then
      raise exception 'Every item needs an identity and description' using errcode='22023'; end if;
    foreach v_key in array array['quantity','unit_price','line_total'] loop
      if jsonb_typeof(v_item->v_key) is distinct from 'number' or (v_item->>v_key) !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception 'Invalid item field: %',v_key using errcode='22023'; end if;
    end loop;
    if (v_item->>'quantity')::numeric<1 or (v_item->>'quantity')::numeric<>trunc((v_item->>'quantity')::numeric)
      or round((v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,2)<>(v_item->>'line_total')::numeric then
      raise exception 'Item quantities and amounts do not reconcile' using errcode='22023'; end if;
    v_qty:=v_qty+(v_item->>'quantity')::integer;
    v_subtotal:=v_subtotal+(v_item->>'line_total')::numeric;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_totals->'line_items'))<>jsonb_array_length(p_totals->'line_items') then
    raise exception 'Item identities must be unique' using errcode='22023'; end if;
  v_rate:=case when coalesce(v_order.tax_exempt,false) then 0 else coalesce(v_order.sales_tax_rate,(public.current_order_commercial_totals(v_order.id)->>'tax_rate')::numeric) end;
  if v_rate is null or v_rate<0 or v_rate>20 or v_rate<>(p_totals->>'tax_rate')::numeric then
    raise exception 'Use the saved order tax rate; refresh after saving tax metadata' using errcode='22023'; end if;
  if coalesce(v_order.tax_exempt,false) and nullif(btrim(v_order.tax_exempt_reason),'') is null then
    raise exception 'Save the exemption reason before revising pricing' using errcode='22023'; end if;
  v_total:=(p_totals->>'final_total')::numeric;
  if v_qty<>(p_totals->>'quantity')::numeric or v_subtotal<>(p_totals->>'subtotal')::numeric
    or (p_totals->>'discount')::numeric>v_subtotal
    or round(v_subtotal-(p_totals->>'discount')::numeric+(p_totals->>'shipping')::numeric,2)<>(p_totals->>'taxable_subtotal')::numeric
    or round((p_totals->>'taxable_subtotal')::numeric*v_rate/100,2)<>(p_totals->>'tax')::numeric
    or (p_totals->>'taxable_subtotal')::numeric+(p_totals->>'tax')::numeric<>v_total
    or (p_totals->>'shipping')::numeric<>(p_totals->>'shipping_charged')::numeric
    or ((p_totals->>'shipping_deferred')::boolean and (p_totals->>'shipping')::numeric<>0)
    or (p_totals->>'rounding_adjustment')::numeric<>0 or (p_totals->>'deposit')::numeric<>0 or (p_totals->>'balance')::numeric<>v_total then
    raise exception 'Pricing totals do not reconcile' using errcode='22023'; end if;
  v_received:=public.current_order_amount_received(v_order.id);
  select coalesce(max(revision),0)+1 into v_revision from public.order_pricing_revisions where order_id=v_order.id;
  insert into public.order_pricing_revisions(user_id,order_id,revision,command_id,reason,totals,amount_received)
    values(v_actor,v_order.id,v_revision,p_command_id,btrim(p_reason),p_totals,v_received);
  update public.orders set quantity=v_qty,order_total=v_total,taxable_subtotal=(p_totals->>'taxable_subtotal')::numeric,
    sales_tax_rate=v_rate,sales_tax_amount=(p_totals->>'tax')::numeric,
    balance_amount=greatest(0,v_total-v_received),
    payment_status=case when v_received>=v_total then 'paid' when v_received>0 then 'deposit_paid' when payment_status='deposit_due' then 'deposit_due' else 'unpaid' end,
    paid_date=case when v_received>=v_total then paid_date else null end,updated_at=v_now
    where id=v_order.id returning * into v_order;
  update public.order_tracking_public set order_total=v_order.order_total,payment_status=v_order.payment_status,
    paid_date=v_order.paid_date,updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection missing; pricing revision was not saved' using errcode='40001'; end if;
  return next v_order;
end $$;
revoke all on function public.revise_order_pricing(uuid,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.revise_order_pricing(uuid,timestamptz,text,text,jsonb) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_order_invoice_snapshot_base(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_revision public.order_pricing_revisions%rowtype;
  v_totals jsonb;
  v_version integer;
  v_source text;
  v_status text;
  v_final numeric;
  v_order_total numeric;
  v_balance numeric;
  v_amount_paid numeric;
  v_complete boolean := false;
  v_numeric_pattern constant text := '^-?[0-9]+([.][0-9]+)?$';
begin
  if v_actor is null then raise exception 'Authenticated owner is required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;

  select s.snapshot into v_snapshot
    from public.quote_accepted_commercial_snapshots s
   where s.user_id=v_actor and (s.order_number=v_order.order_number or s.quote_number=v_order.source_quote_number)
   order by (s.order_number=v_order.order_number) desc limit 1;

  select * into v_revision from public.order_pricing_revisions
    where order_id=v_order.id and user_id=v_actor order by revision desc limit 1;
  if found then
    v_totals:=v_revision.totals; v_version:=1; v_source:='order_pricing_revision';
  elsif v_snapshot is null then
    v_status := 'missing_snapshot'; v_source := 'order_aggregates';
  elsif v_snapshot ? 'invoice_totals_schema_version' then
    if (v_snapshot->>'invoice_totals_schema_version') !~ '^[0-9]+$' or (v_snapshot->>'invoice_totals_schema_version')::integer <> 1 then
      v_status := 'unsupported_snapshot'; v_source := 'versioned_accepted_snapshot';
    else
      v_version := 1; v_totals := v_snapshot->'invoice_totals'; v_source := 'versioned_accepted_snapshot';
    end if;
  else
    v_totals := coalesce(v_snapshot #> '{offer,quote_data,customer_totals}', v_snapshot #> '{offer,customer_totals}');
    v_source := 'legacy_offer_quote_data_customer_totals';
  end if;

  if v_status is null then
    v_complete := jsonb_typeof(v_totals)='object' and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total'];
    if not v_complete then
      v_status := case when jsonb_typeof(v_totals)='object' then 'aggregate_only' else 'malformed_snapshot' end;
    elsif (v_totals->>'final_total') !~ v_numeric_pattern then
      v_status := 'malformed_snapshot';
    else
      v_final := round((v_totals->>'final_total')::numeric,2);
      v_order_total := case when v_order.order_total is null then null else round(v_order.order_total::numeric,2) end;
      v_status := case when v_order_total is null or v_final <> v_order_total then 'totals_mismatch' else 'verified' end;
    end if;
  end if;

  v_balance := v_order.balance_amount;
  v_amount_paid := public.current_order_amount_received(v_order.id);

  return jsonb_build_object(
    'pricing_revision',case when v_revision.id is null then null else jsonb_build_object('number',v_revision.revision,'reason',v_revision.reason,'created_at',v_revision.created_at) end,
    'shipping_deferred',coalesce((v_totals->>'shipping_deferred')::boolean,false),
    'credit_amount',greatest(0,v_amount_paid-v_order.order_total),
    'reconciliation_status',v_status,'breakdown_source',v_source,'invoice_totals_schema_version',v_version,
    'identity',jsonb_strip_nulls(jsonb_build_object(
      'order_id',v_order.id,'order_number',v_order.order_number,'invoice_number',v_order.invoice_number,
      'quote_number',v_order.source_quote_number,'customer_name',v_order.customer_name,'customer_email',v_order.customer_email,
      'company_name',v_order.shipping_company,'billing_address',v_order.billing_address,'shipping_address',v_order.shipping_address,
      'project_title',v_order.order_title,'fulfillment_method',v_order.fulfillment,'issue_date',v_order.invoice_date,
      'due_date',v_order.invoice_due_date,'tax_exempt',v_order.tax_exempt,'tracking_number',v_order.tracking_number)),
    'accepted_commercial_breakdown',case when v_complete then v_totals else null end,
    'current_payment_state',jsonb_build_object(
      'order_total',v_order.order_total,'deposit_amount',v_order.deposit_amount,'balance_amount',v_order.balance_amount,
      'payment_status',v_order.payment_status,'paid_date',v_order.paid_date,'invoice_number',v_order.invoice_number,
      'amount_paid',v_amount_paid,'amount_paid_source',case when v_amount_paid is null then null else 'derived_from_order_total_and_balance' end),
    'component_breakdown_available',v_status='verified'
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.apply_invoice_authority_to_finance_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_snapshot jsonb;
  v_totals jsonb;
  v_final numeric;
  v_order_total numeric;
  v_shipping_charged numeric;
  v_shipping_explicit numeric;
  v_shipping_source text;
  v_complete boolean := false;
  v_numeric_pattern constant text := '^[0-9]+([.][0-9]+)?$';
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;

  select o.order_total into v_order_total from public.orders o where o.id=new.order_id and o.user_id=new.user_id;
  v_totals:=public.current_order_commercial_totals(new.order_id);
  if v_totals->>'shipping_deferred'='true' then
    raise exception 'FINANCE_SHIPPING_PENDING: finalize the customer shipping charge before posting' using errcode='22023';
  end if;

  v_complete := jsonb_typeof(v_totals)='object'
    and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total']
    and (v_totals->>'final_total') ~ v_numeric_pattern;
  if v_complete then v_final := round((v_totals->>'final_total')::numeric,2); end if;

  if (v_complete and v_order_total is not null and v_final=round(v_order_total::numeric,2)) is not true then
    raise exception 'FINANCE_INVOICE_TOTALS_UNRESOLVED: authoritative invoice totals are unavailable or do not match the Order'
      using errcode='22023';
  end if;

  -- Shipping revenue priority is entirely server-side and snapshot-owned:
  --   1. invoice_totals.shipping_charged (new explicit contract),
  --   2. invoice_totals.shipping (older explicit line),
  --   3. zero only for the verified legacy customer_totals contract. Its required
  --      final_total is the documented subtotal plus tax and has no separate
  --      shipping component. Shipping production cost remains part of pricing and
  --      is never treated as customer shipping revenue or shipping_cost here.
  if v_totals ? 'shipping_charged' then
    if jsonb_typeof(v_totals->'shipping_charged') <> 'number'
       or (v_totals->>'shipping_charged') !~ v_numeric_pattern then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping_charged is malformed or negative'
        using errcode='22023';
    end if;
    v_shipping_charged := (v_totals->>'shipping_charged')::numeric;
    v_shipping_source := 'invoice_totals.shipping_charged';
  end if;

  if v_totals ? 'shipping' then
    if jsonb_typeof(v_totals->'shipping') <> 'number'
       or (v_totals->>'shipping') !~ v_numeric_pattern then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping is malformed or negative'
        using errcode='22023';
    end if;
    v_shipping_explicit := (v_totals->>'shipping')::numeric;
    if v_shipping_charged is not null and v_shipping_charged is distinct from v_shipping_explicit then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping values contradict each other'
        using errcode='22023';
    end if;
    if v_shipping_charged is null then
      v_shipping_charged := v_shipping_explicit;
      v_shipping_source := 'invoice_totals.shipping';
    end if;
  end if;

  if v_shipping_charged is null then
    v_shipping_charged := 0;
    v_shipping_source := 'verified_legacy_totals_no_shipping_component';
  end if;

  new.sales_tax_collected := (v_totals->>'tax')::numeric;
  new.shipping_charged := v_shipping_charged;
  new.invoice_breakdown_status := 'verified';
  new.accepted_commercial_snapshot := coalesce(new.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object(
    'reconciliation_status','verified',
    'breakdown_source','current_order_commercial_snapshot',
    'accepted_commercial_breakdown',v_totals,
    'shipping_charged',v_shipping_charged,
    'shipping_charged_source',v_shipping_source);
  return new;
end $function$
;

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
  if not coalesce(v_order.tax_exempt,false) and round(v_taxable*v_rate/100,2) is distinct from round(v_tax,2) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: taxable subtotal, rate, and collected tax do not reconcile' using errcode='22023'; end if;
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

-- The public contract exposes only customer-safe totals. Q-numbers resolve
-- through the saved source relation, never by guessing an OP-number.
drop function public.public_order_tracking_lookup(text);
create function public.public_order_tracking_lookup(tracking_identifier text)
returns table(order_number text,order_title text,status text,payment_status text,order_total numeric,
 deposit_amount numeric,balance_amount numeric,public_status_text text,public_next_step text,
 shipping_or_pickup_note text,tracking_number text,payment_link text,payment_link_stripe text,
 payment_link_paypal text,payment_link_venmo text,paid_date date,po_number text,invoice_number text,invoice_terms text,
 shipping_charged numeric,shipping_deferred boolean,credit_amount numeric)
language sql stable security definer set search_path=public,pg_temp as $$
  with matches as (
    select o.*,count(*) over() match_count from public.orders o
    where case
      when upper(trim(tracking_identifier)) ~ '^OP-[0-9]{1,6}$' then o.order_number='OP-'||lpad(substring(upper(trim(tracking_identifier)) from 4),6,'0')
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
$$;
revoke all on function public.public_order_tracking_lookup(text) from public;
grant execute on function public.public_order_tracking_lookup(text) to anon,authenticated,service_role;
-- Preserve shipping tax treatment in subsequent append-only Finance corrections.
CREATE OR REPLACE FUNCTION public.correct_financial_entry(p_original_entry_id uuid, p_corrected_record jsonb, p_changed_fields text[], p_reason text, p_expected_effective_posted_at timestamp with time zone, p_tax_override_enabled boolean, p_tax_override_reason text, p_correlation_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_amount:=case when jsonb_typeof(p_corrected_record->'amount')='number' then public.finance_adjustment_value(p_corrected_record,'amount'::text) else v_effective_amount end;
  v_income_amount:=case when v_type='income' then v_amount else 0 end;
  v_rate:=case when jsonb_typeof(p_corrected_record->'sales_tax_rate')='number' then public.finance_adjustment_value(p_corrected_record,'sales_tax_rate'::text) else v_effective_rate end;
  v_shipping_charged:=case when jsonb_typeof(p_corrected_record->'shipping_charged')='number' then public.finance_adjustment_value(p_corrected_record,'shipping_charged'::text) else coalesce(v_effective.shipping_charged,0) end;
  v_shipping_cost:=case when jsonb_typeof(p_corrected_record->'shipping_cost')='number' then public.finance_adjustment_value(p_corrected_record,'shipping_cost'::text) else coalesce(v_effective.shipping_cost,0) end;
  v_material:=case when jsonb_typeof(p_corrected_record->'material_cost')='number' then public.finance_adjustment_value(p_corrected_record,'material_cost'::text) else coalesce(v_effective.material_cost,0) end;
  v_packaging:=case when jsonb_typeof(p_corrected_record->'packaging_cost')='number' then public.finance_adjustment_value(p_corrected_record,'packaging_cost'::text) else coalesce(v_effective.packaging_cost,0) end;
  v_labor:=case when jsonb_typeof(p_corrected_record->'labor_cost')='number' then public.finance_adjustment_value(p_corrected_record,'labor_cost'::text) else coalesce(v_effective.labor_cost,0) end;
  v_other:=case when jsonb_typeof(p_corrected_record->'other_direct_cost')='number' then public.finance_adjustment_value(p_corrected_record,'other_direct_cost'::text) else coalesce(v_effective.other_direct_cost,0) end;
  v_business:=case when jsonb_typeof(p_corrected_record->'business_use_percent')='number' then public.finance_adjustment_value(p_corrected_record,'business_use_percent'::text) else coalesce(v_effective.business_use_percent,100) end;
  v_miles:=case when jsonb_typeof(p_corrected_record->'miles_driven')='number' then public.finance_adjustment_value(p_corrected_record,'miles_driven'::text) else coalesce(v_effective.miles_driven,0) end;
  v_mileage_rate:=case when jsonb_typeof(p_corrected_record->'mileage_rate')='number' then public.finance_adjustment_value(p_corrected_record,'mileage_rate'::text) else coalesce(v_effective.mileage_rate,0) end;
  if v_amount<0 or v_income_amount<0 or v_rate<0 or v_rate>20 or v_shipping_charged<0 or v_shipping_cost<0 or v_material<0 or v_packaging<0 or v_labor<0 or v_other<0 or v_business<0 or v_business>100 or v_miles<0 or v_mileage_rate<0 then raise exception 'Corrected monetary values are invalid' using errcode='22023'; end if;
  if nullif(btrim(p_corrected_record->>'title'),'') is null or nullif(btrim(p_corrected_record->>'category'),'') is null then raise exception 'Title and category are required' using errcode='22023'; end if;
  if v_type='expense' and (v_income_amount<>0 or v_shipping_charged<>0 or v_rate<>0 or coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false)) then raise exception 'Expense correction contains income-only fields' using errcode='22023'; end if;
  if v_type='income' and (p_changed_fields && array['sales_county','amount','original_amount','sales_tax_rate','sales_tax_collected','tax_exempt_sale']::text[]) and not coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) and v_income_amount>0 and not public.is_ohio_county(p_corrected_record->>'sales_county') then raise exception 'Select the destination county used for sales-tax reporting' using errcode='22023'; end if;
  v_calculated_tax:=case when v_type='expense' or coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) then 0 else round((v_income_amount+case when v_root.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,shipping_in_taxable_subtotal}'='true' then v_shipping_charged else 0 end)*v_rate/100,2) end;
  if coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) and (v_rate<>0 or nullif(btrim(coalesce(p_corrected_record->>'tax_exempt_reason','')),'') is null) then raise exception 'Tax exemption metadata is contradictory' using errcode='22023'; end if;
  if coalesce(p_tax_override_enabled,false) then
    if nullif(btrim(coalesce(p_tax_override_reason,'')),'') is null then raise exception 'Tax override explanation is required' using errcode='22023'; end if;
    v_tax:=public.finance_adjustment_value(p_corrected_record,'sales_tax_collected'::text);
  elsif p_changed_fields && array['amount','original_amount','sales_tax_rate','tax_exempt_sale']::text[]
    or (v_root.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,shipping_in_taxable_subtotal}'='true' and 'shipping_charged'=any(p_changed_fields)) then
    v_tax:=v_calculated_tax;
  else
    -- Metadata-only corrections preserve the posted tax exactly.
    v_tax:=coalesce(v_effective.sales_tax_collected,0);
  end if;

  v_corrected:=jsonb_build_object('type',v_type,'entry_date',v_date,'category',p_corrected_record->>'category','tax_category',coalesce(p_corrected_record->>'tax_category','auto'),'title',p_corrected_record->>'title','notes',coalesce(p_corrected_record->>'notes',''),'vendor_name',coalesce(p_corrected_record->>'vendor_name',''),'payment_method',coalesce(p_corrected_record->>'payment_method',''),'receipt_link',coalesce(p_corrected_record->>'receipt_link',''),'business_use_percent',v_business,'amount',case when v_type='income' then v_income_amount else v_amount end,'original_amount',case when jsonb_typeof(p_corrected_record->'original_amount')='number' then public.finance_adjustment_value(p_corrected_record,'original_amount'::text) else coalesce(v_effective.original_amount,v_amount) end,'sales_county',case when v_type='income' then coalesce(p_corrected_record->>'sales_county','') else '' end,'sales_tax_rate',case when v_type='income' then v_rate else 0 end,'sales_tax_collected',case when v_type='income' then v_tax else 0 end,'tax_exempt_sale',v_type='income' and coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false),'shipping_charged',case when v_type='income' then v_shipping_charged else 0 end,'shipping_cost',v_shipping_cost,'material_cost',case when v_type='income' then v_material else 0 end,'packaging_cost',case when v_type='income' then v_packaging else 0 end,'labor_cost',case when v_type='income' then v_labor else 0 end,'other_direct_cost',case when v_type='income' then v_other else 0 end,'miles_driven',case when v_type='expense' then v_miles else 0 end,'mileage_rate',case when v_type='expense' then v_mileage_rate else 0 end,'trip_purpose',case when v_type='expense' then coalesce(p_corrected_record->>'trip_purpose','') else '' end,'trip_from',case when v_type='expense' then coalesce(p_corrected_record->>'trip_from','') else '' end,'trip_to',case when v_type='expense' then coalesce(p_corrected_record->>'trip_to','') else '' end,'round_trip',v_type='expense' and coalesce((p_corrected_record->>'round_trip')::boolean,false),'tax_exempt_reason',coalesce(p_corrected_record->>'tax_exempt_reason',''),'exemption_certificate_on_file',coalesce((p_corrected_record->>'exemption_certificate_on_file')::boolean,false),'calculated_sales_tax',v_calculated_tax,'tax_override_enabled',coalesce(p_tax_override_enabled,false),'tax_override_reason',coalesce(p_tax_override_reason,''));
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
end $function$

;
revoke all on function public.correct_financial_entry(uuid,jsonb,text[],text,timestamptz,boolean,text,text) from public,anon;
grant execute on function public.correct_financial_entry(uuid,jsonb,text[],text,timestamptz,boolean,text,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
