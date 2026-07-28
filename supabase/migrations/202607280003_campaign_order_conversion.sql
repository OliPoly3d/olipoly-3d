-- OliPoly Engine RC2.5: global Order allocation and reviewed campaign conversion.
-- Forward-only/additive. Owner review and manual deployment required; never run by browser code.

begin;

create sequence if not exists public.olipoly_order_number_seq as bigint increment by 1 minvalue 1 no cycle;

-- Migration-time initialization only. Malformed historical values are ignored and no Order is changed.
select pg_catalog.setval(
  'public.olipoly_order_number_seq'::regclass,
  coalesce((select max(substring(order_number from '^OP-([0-9]{6,})$')::bigint) from public.orders where order_number ~ '^OP-[0-9]{6,}$'), 0) + 1,
  false
);

create unique index if not exists orders_order_number_unique_idx on public.orders(order_number);

create or replace function public.allocate_order_number()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_value bigint;
begin
  v_value := nextval('public.olipoly_order_number_seq'::regclass);
  return 'OP-' || lpad(v_value::text, 6, '0');
end $$;
revoke all on function public.allocate_order_number() from public, anon, authenticated;
grant execute on function public.allocate_order_number() to service_role;
comment on function public.allocate_order_number() is 'Sole global database Order-number allocator. Internal authority only; gaps are expected and values are never reused.';

alter table public.orders
  add column if not exists source_type text check (source_type is null or source_type in ('quote','campaign','authorized_other')),
  add column if not exists campaign_id uuid references public.campaigns(id) on delete restrict,
  add column if not exists campaign_submission_id uuid references public.campaign_submissions(id) on delete restrict,
  add column if not exists campaign_public_reference text,
  add column if not exists campaign_code text,
  add column if not exists campaign_conversion_at timestamptz,
  add column if not exists campaign_converted_by uuid references auth.users(id) on delete restrict,
  add column if not exists campaign_customer_link_status text check (campaign_customer_link_status is null or campaign_customer_link_status in ('linked','unresolved_review_required')),
  add column if not exists campaign_customer_id uuid,
  add column if not exists campaign_source_snapshot jsonb;

create unique index if not exists orders_one_per_campaign_submission_idx
  on public.orders(campaign_submission_id) where campaign_submission_id is not null;

alter table public.campaign_submissions
  add column if not exists converted_order_id uuid references public.orders(id) on delete restrict,
  add column if not exists converted_order_number text,
  add column if not exists converted_by uuid references auth.users(id) on delete restrict,
  add column if not exists converted_at timestamptz;

create table if not exists public.campaign_order_conversion_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict unique,
  campaign_submission_id uuid not null references public.campaign_submissions(id) on delete restrict unique,
  schema_version text not null,
  snapshot jsonb not null,
  converted_by uuid not null references auth.users(id) on delete restrict,
  converted_at timestamptz not null default now(),
  constraint campaign_order_snapshot_required check (snapshot ?& array['source','campaign','submission','customer','fulfillment','payment_evidence','totals','items'])
);
alter table public.campaign_order_conversion_snapshots enable row level security;
create policy "Owners read campaign Order snapshots" on public.campaign_order_conversion_snapshots for select to authenticated using (auth.uid() = user_id);
revoke all on table public.campaign_order_conversion_snapshots from public, anon, authenticated;
grant select on table public.campaign_order_conversion_snapshots to authenticated;

create or replace function public.prevent_campaign_order_snapshot_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'Campaign Order conversion snapshots are immutable' using errcode='55000'; end $$;
create trigger campaign_order_snapshots_immutable before update or delete on public.campaign_order_conversion_snapshots for each row execute function public.prevent_campaign_order_snapshot_mutation();

-- Extend RC2.4's immutable envelope only for the conversion audit relationship.
create or replace function public.reject_campaign_submission_snapshot_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'campaign_submission_items' then raise exception 'Campaign submission items are immutable' using errcode='55000'; end if;
  if old.accepted_total = 0 and old.subtotal = 0 and old.updated_at = old.created_at then return new; end if;
  if (to_jsonb(new) - array['review_status','internal_review_notes','reviewed_by','reviewed_at','replay_conflict_count','replay_conflict_at','conversion_status','conversion_reference','converted_order_id','converted_order_number','converted_by','converted_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['review_status','internal_review_notes','reviewed_by','reviewed_at','replay_conflict_count','replay_conflict_at','conversion_status','conversion_reference','converted_order_id','converted_order_number','converted_by','converted_at','updated_at']) then
    raise exception 'Campaign submission sale snapshot is immutable' using errcode='55000';
  end if;
  return new;
end $$;

alter table public.campaign_submissions drop constraint if exists campaign_submission_conversion_reserved;
alter table public.campaign_submissions add constraint campaign_submission_conversion_consistent check (
  (conversion_status='not_converted' and conversion_reference is null and converted_order_id is null and converted_order_number is null and converted_by is null and converted_at is null and review_status <> 'converted')
  or
  (conversion_status='converted' and conversion_reference is not null and converted_order_id is not null and converted_order_number is not null and converted_by is not null and converted_at is not null and review_status='converted')
);

-- Future accepted Quotes share the global allocator. All financial/snapshot/workflow behavior is retained.
create or replace function public.respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if v_quote.quote_number !~ '^Q-[0-9]{6}$' then
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
  v_raw_fulfillment := lower(btrim(coalesce(nullif(v_quote.quote_data #>> '{fields,fulfillment}',''), nullif(v_quote.quote_data #>> '{fields,deliveryMethod}',''), '')));
  v_fulfillment := case
    when v_raw_fulfillment in ('','pickup','pick up','pick-up','customer pickup','local pickup','in-store pickup') then 'pickup'
    when v_raw_fulfillment in ('delivery','deliver','local delivery','dropoff','drop-off','drop off') then 'delivery'
    when v_raw_fulfillment in ('shipping','ship','shipped','shipment','mail','mailing','usps','ups','fedex') then 'shipping'
    else 'pickup'
  end;

  if v_order.id is null then
    v_order_number := public.allocate_order_number();
  else
    v_order_number := v_order.order_number;
  end if;

  select id into v_snapshot_id from public.quote_accepted_commercial_snapshots where quote_number = v_quote.quote_number;
  if not found then
    v_snapshot := jsonb_build_object(
      'quote_number', v_quote.quote_number,
      'order_number', v_order_number,
      'accepted_at', v_now,
      'customer', jsonb_build_object('name', v_quote.customer_name, 'email', v_quote.customer_email, 'phone', v_quote.customer_phone),
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
    values (v_quote.user_id, v_order_number, v_quote.quote_number, 'quote', true, v_now, 'ready_to_print', v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment, v_quote.customer_name, v_quote.customer_email, v_quote.customer_phone, v_order_title, v_now, v_now)
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
$$;

create or replace function public.convert_campaign_submission_to_order(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid(); v_submission public.campaign_submissions%rowtype; v_order public.orders%rowtype;
  v_items jsonb; v_item_count integer; v_quantity integer; v_line_total numeric(12,2); v_expected numeric(12,2);
  v_order_number text; v_now timestamptz := now(); v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_submission from public.campaign_submissions where id=p_submission_id for update;
  if not found or v_submission.user_id is distinct from v_actor then raise exception 'Submission not found or access denied' using errcode='42501'; end if;

  if v_submission.review_status='converted' or v_submission.conversion_status='converted' then
    select * into v_order from public.orders where id=v_submission.converted_order_id and campaign_submission_id=v_submission.id and user_id=v_actor;
    if not found or v_order.order_number is distinct from v_submission.converted_order_number then raise exception 'Converted submission Order evidence is inconsistent' using errcode='23514'; end if;
    return jsonb_build_object('outcome','already_converted','order_id',v_order.id,'order_number',v_order.order_number,'order_status',v_order.status);
  end if;
  if v_submission.review_status <> 'approved_for_conversion' then raise exception 'Submission is not approved for conversion' using errcode='22023'; end if;

  select jsonb_agg(jsonb_build_object(
      'line_sequence',i.line_sequence,'campaign_product_id',i.campaign_product_id,'product_public_code',i.product_public_code,
      'offer_snapshot',i.offer_snapshot,'submitted_variant',i.submitted_variant,'quantity',i.quantity,
      'personalization_requested',i.personalization_requested,'personalization_selection',i.personalization_selection,
      'authoritative_base_unit_price',i.authoritative_base_unit_price,'authoritative_personalization_unit_price',i.authoritative_personalization_unit_price,
      'authoritative_line_subtotal',i.authoritative_line_subtotal,'item_notes',i.item_notes) order by i.line_sequence),
    count(*)::integer,coalesce(sum(i.quantity),0)::integer,coalesce(sum(i.authoritative_line_subtotal),0)
    into v_items,v_item_count,v_quantity,v_line_total
    from public.campaign_submission_items i where i.campaign_submission_id=v_submission.id;
  if v_item_count < 1 or v_item_count is distinct from (select count(*)::integer from public.campaign_submission_items where campaign_submission_id=v_submission.id) then raise exception 'Invalid campaign item snapshot' using errcode='23514'; end if;
  v_expected := v_submission.subtotal + v_submission.personalization_total + coalesce(v_submission.shipping_amount,0) + coalesce(v_submission.tax_amount,0);
  if v_line_total is distinct from (v_submission.subtotal+v_submission.personalization_total)
     or v_submission.accepted_total is distinct from v_expected or v_quantity is distinct from v_submission.item_count then
    raise exception 'Invalid campaign commercial snapshot' using errcode='23514';
  end if;

  -- RC2.4's public input has no trusted Customer authority. In particular, a UUID
  -- inside customer_snapshot is untrusted public text and is never used for linkage.
  v_order_number := public.allocate_order_number();
  v_snapshot := jsonb_build_object(
    'source',jsonb_build_object('type','campaign','submission_id',v_submission.id,'public_reference',v_submission.public_reference,'source_event_key',v_submission.source_event_key),
    'campaign',v_submission.campaign_snapshot,'submission',jsonb_build_object('schema_version',v_submission.source_schema_version,'submitted_at',v_submission.submitted_at),
    'customer',v_submission.customer_snapshot,'fulfillment',jsonb_build_object('selection',v_submission.fulfillment_selection,'snapshot',v_submission.fulfillment_snapshot),
    'payment_evidence',jsonb_build_object('selection',v_submission.payment_method_selection,'state',v_submission.payment_evidence_state,'snapshot',v_submission.payment_selection_snapshot),
    'totals',jsonb_build_object('currency',v_submission.currency,'subtotal',v_submission.subtotal,'personalization_total',v_submission.personalization_total,'shipping_amount',v_submission.shipping_amount,'tax_amount',v_submission.tax_amount,'accepted_total',v_submission.accepted_total,'quantity',v_quantity),
    'items',v_items,'customer_notes',v_submission.customer_notes,'converted_at',v_now,'converted_by',v_actor);

  insert into public.orders(user_id,order_number,status,quantity,order_total,deposit_amount,balance_amount,payment_status,fulfillment,customer_name,customer_email,customer_phone,order_title,source_type,campaign_id,campaign_submission_id,campaign_public_reference,campaign_code,campaign_conversion_at,campaign_converted_by,campaign_customer_link_status,campaign_customer_id,campaign_source_snapshot,created_at,updated_at)
  values(v_actor,v_order_number,'ready_to_print',v_quantity,v_submission.accepted_total,0,v_submission.accepted_total,'unpaid',v_submission.fulfillment_selection,
    nullif(v_submission.customer_snapshot->>'name',''),nullif(v_submission.customer_snapshot->>'email',''),nullif(v_submission.customer_snapshot->>'phone',''),
    coalesce(nullif(v_submission.campaign_snapshot->>'name',''),'Campaign Order'), 'campaign',v_submission.campaign_id,v_submission.id,v_submission.public_reference,
    coalesce(v_submission.campaign_snapshot->>'campaign_code',v_submission.campaign_snapshot->>'campaign_slug'),v_now,v_actor,'unresolved_review_required',null,v_snapshot,v_now,v_now)
  returning * into v_order;

  insert into public.campaign_order_conversion_snapshots(user_id,order_id,campaign_submission_id,schema_version,snapshot,converted_by,converted_at)
  values(v_actor,v_order.id,v_submission.id,v_submission.source_schema_version,v_snapshot,v_actor,v_now);
  update public.campaign_submissions set review_status='converted',conversion_status='converted',conversion_reference=v_order.order_number,
    converted_order_id=v_order.id,converted_order_number=v_order.order_number,converted_by=v_actor,converted_at=v_now,updated_at=v_now where id=v_submission.id;
  return jsonb_build_object('outcome','converted','order_id',v_order.id,'order_number',v_order.order_number,'order_status',v_order.status);
end $$;
revoke all on function public.convert_campaign_submission_to_order(uuid) from public, anon;
grant execute on function public.convert_campaign_submission_to_order(uuid) to authenticated;
comment on function public.convert_campaign_submission_to_order(uuid) is 'Atomic owner-only reviewed campaign conversion. Creates only an unpaid Order and immutable attribution snapshot; no downstream side effects.';

-- Explicit downstream handoff for Orders which have no Quote-created job. It is
-- deliberately not called by conversion and performs no Inventory/Finance work.
create or replace function public.create_production_job_for_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype; v_job public.production_jobs%rowtype; v_now timestamptz := now();
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found or access denied' using errcode='42501'; end if;
  select * into v_job from public.production_jobs where user_id=v_actor and order_number=v_order.order_number order by updated_at desc nulls last limit 1 for update;
  if found then return jsonb_build_object('outcome','already_linked','production_job_id',v_job.id,'order_number',v_order.order_number,'production_status',v_job.production_status); end if;
  insert into public.production_jobs(id,user_id,job_title,job_type,production_status,customer_name,order_number,quantity,job_payload,updated_at)
  values(gen_random_uuid(),v_actor,coalesce(nullif(v_order.order_title,''),'Order '||v_order.order_number),'customer_custom','ready_to_print',v_order.customer_name,v_order.order_number,coalesce(v_order.quantity,1),
    jsonb_build_object('source','order_handoff','order_id',v_order.id,'order_number',v_order.order_number,'campaign_submission_id',v_order.campaign_submission_id,'created_at',v_now),v_now)
  returning * into v_job;
  return jsonb_build_object('outcome','created','production_job_id',v_job.id,'order_number',v_order.order_number,'production_status',v_job.production_status);
end $$;
revoke all on function public.create_production_job_for_order(uuid) from public, anon;
grant execute on function public.create_production_job_for_order(uuid) to authenticated;
comment on function public.create_production_job_for_order(uuid) is 'Explicit owner-only idempotent Order-to-Production handoff. Never called automatically by campaign conversion.';

commit;
