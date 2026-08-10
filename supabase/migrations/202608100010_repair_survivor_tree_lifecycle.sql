-- Repair the Survivor Tree linked lifecycle and close the acceptance-time atomicity gap.
-- Manual deployment required. The guarded data repair aborts unless every approved identity/state assertion still holds.
begin;

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
  v_customer_phone text;
  v_production_count integer;
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
  -- Quote contact metadata is authoritative in quote_data.fields; legacy production drafts are fallback-only.
  v_customer_phone := nullif(btrim(coalesce(
    v_quote.quote_data #>> '{fields,customerPhone}',
    v_quote.quote_data #>> '{fields,customer_phone}',
    v_quote.quote_data #>> '{production_draft,customer_phone}',
    v_quote.quote_data #>> '{production_draft,phone}',
    ''
  )), '');
  if lower(coalesce(v_customer_phone,'')) in ('n/a','na','none','not available','not provided','unknown','-','—') then
    v_customer_phone := null;
  end if;
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
      'customer', jsonb_build_object('name', v_quote.customer_name, 'email', v_quote.customer_email, 'phone', v_customer_phone),
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
    values (v_quote.user_id, v_order_number, v_quote.quote_number, 'quote', true, v_now, 'ready_to_print', v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment, v_quote.customer_name, v_quote.customer_email, v_customer_phone, v_order_title, v_now, v_now)
    on conflict (source_quote_number) where nullif(btrim(source_quote_number),'') is not null do nothing;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then raise exception 'Order creation failed for accepted quote %', v_quote.quote_number using errcode = '40001'; end if;
  end if;

  update public.quotes
     set customer_response = 'accepted', customer_response_message = coalesce(customer_response_message, p_message), quote_status = 'converted_to_order', converted_to_order = true, converted_order_number = v_order.order_number, accepted_date = coalesce(accepted_date, v_now), accepted_at = coalesce(accepted_at, v_now), accepted_commercial_snapshot_id = coalesce(accepted_commercial_snapshot_id, v_snapshot_id), accepted_commercial_snapshot = coalesce(accepted_commercial_snapshot, (select snapshot from public.quote_accepted_commercial_snapshots where id = v_snapshot_id)), updated_at = v_now
   where id = v_quote.id;

  update public.production_jobs
     set production_status = 'ready_to_print',
         order_number = v_order.order_number,
         quote_number = coalesce(quote_number, v_quote.quote_number),
         job_payload = coalesce(job_payload, '{}'::jsonb) || jsonb_build_object(
           'quote_number', v_quote.quote_number,
           'order_number', v_order.order_number,
           'order_id', v_order.id,
           'production_status', 'ready_to_print',
           'updated_at', v_now
         ),
         updated_at = v_now
   where user_id = v_quote.user_id
     and (id = v_quote.production_job_id or (v_quote.production_job_id is null and quote_number = v_quote.quote_number))
     and coalesce(production_status,'') in ('estimate','waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer')
     and coalesce((job_payload->>'actual_usage_captured')::boolean, false) is false;
  get diagnostics v_production_count = row_count;
  if v_quote.production_job_id is not null and v_production_count <> 1 then
    raise exception 'Accepted Quote Production handoff affected % rows for %', v_production_count, v_quote.quote_number using errcode = '40001';
  end if;

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


revoke execute on function public.respond_to_quote_public(text,text,text,text) from public;
grant execute on function public.respond_to_quote_public(text,text,text,text) to anon, authenticated, service_role;

comment on function public.respond_to_quote_public(text,text,text,text) is
  'Atomic public Quote response and idempotent accepted Order creation; optional phone is normalized from locked Quote JSON metadata.';


alter table public.production_linkage_audit drop constraint if exists production_linkage_audit_event_type_check;
alter table public.production_linkage_audit add constraint production_linkage_audit_event_type_check check(event_type in (
  'production_quote_linked','production_order_linked','legacy_linkage_repaired','legacy_standalone_approved','linked_lifecycle_repaired'
));

create or replace function public.repair_production_quote_order_linkage(p_production_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_now timestamptz:=now(); v_job public.production_jobs%rowtype;
  v_quote public.quotes%rowtype; v_order public.orders%rowtype; v_count integer;
  v_quote_number text; v_changed text[]:='{}'; v_from text;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update;
  if not found then raise exception 'Production job not found or access denied' using errcode='42501'; end if;
  if v_job.production_source_type='legacy_standalone' then raise exception 'Standalone approval conflicts with linked repair' using errcode='23514'; end if;
  v_quote_number:=coalesce(v_job.quote_number,nullif(btrim(v_job.job_payload->>'quote_number'),''));
  if v_quote_number is null or (v_job.quote_number is not null and nullif(btrim(v_job.job_payload->>'quote_number'),'') is not null and v_job.quote_number is distinct from nullif(btrim(v_job.job_payload->>'quote_number'),'')) then raise exception 'Unique Quote provenance is required' using errcode='23514'; end if;
  select count(*) into v_count from public.quotes where quote_number=v_quote_number;
  if v_count<>1 then raise exception 'Expected exactly one Quote; found %',v_count using errcode='23514'; end if;
  select * into v_quote from public.quotes where quote_number=v_quote_number for update;
  if v_quote.user_id is distinct from v_actor then raise exception 'Quote owner mismatch' using errcode='42501'; end if;
  if v_quote.production_job_id is not null and v_quote.production_job_id is distinct from v_job.id then raise exception 'Quote has conflicting Production provenance' using errcode='23514'; end if;
  if coalesce(v_quote.customer_response,'')<>'accepted' or v_quote.converted_to_order is not true or v_quote.accepted_at is null then raise exception 'Quote is not authoritatively accepted' using errcode='23514'; end if;
  select count(*) into v_count from public.orders where source_quote_number=v_quote_number;
  if v_count<>1 then raise exception 'Expected exactly one Order candidate; found %',v_count using errcode='23514'; end if;
  select * into v_order from public.orders where source_quote_number=v_quote_number for update;
  if v_order.user_id is distinct from v_actor or v_order.created_from_quote is not true or v_order.source_type is distinct from 'quote' or v_quote.converted_order_number is distinct from v_order.order_number then raise exception 'Order lacks exact same-owner accepted Quote provenance' using errcode='23514'; end if;
  if v_job.order_number is not null and v_job.order_number is distinct from v_order.order_number then raise exception 'Production has conflicting Order identity' using errcode='23514'; end if;
  if nullif(btrim(v_job.job_payload->>'order_number'),'') is not null and nullif(btrim(v_job.job_payload->>'order_number'),'') is distinct from v_order.order_number then raise exception 'Payload has conflicting Order identity' using errcode='23514'; end if;
  if nullif(btrim(v_job.job_payload->>'order_id'),'') is not null and nullif(btrim(v_job.job_payload->>'order_id'),'') is distinct from v_order.id::text then raise exception 'Payload has conflicting Order ID' using errcode='23514'; end if;
  if v_order.status<>'ready_to_print' or v_job.production_status not in ('estimate','ready_to_print') then raise exception 'Repair requires stale Estimate Production and canonical Ready to Print Order, or an already repaired pair' using errcode='23514'; end if;
  v_from:=v_job.production_status;
  if v_job.production_status='estimate' then v_changed:=array_append(v_changed,'production_status'); end if;
  if v_job.order_number is null then v_changed:=array_append(v_changed,'order_number'); end if;
  if v_job.production_source_type is distinct from 'legacy_repaired' then v_changed:=array_append(v_changed,'production_source_type'); end if;
  if v_quote.production_job_id is null then v_changed:=array_append(v_changed,'quotes.production_job_id'); end if;
  if cardinality(v_changed)>0 then
    update public.quotes set production_job_id=v_job.id where id=v_quote.id and production_job_id is null;
    update public.production_jobs set production_status='ready_to_print',quote_number=v_quote_number,order_number=v_order.order_number,production_source_type='legacy_repaired',
      job_payload=coalesce(job_payload,'{}')||jsonb_build_object('quote_number',v_quote_number,'order_number',v_order.order_number,'order_id',v_order.id,'production_status','ready_to_print','updated_at',v_now),updated_at=v_now
      where id=v_job.id returning * into v_job;
    insert into public.production_linkage_audit(user_id,production_job_id,quote_id,order_id,command_identity,event_type,from_status,to_status,evidence)
      values(v_actor,v_job.id,v_quote.id,v_order.id,'linked-lifecycle-repair:'||v_job.id||':'||v_order.id,'linked_lifecycle_repaired',v_from,'ready_to_print',jsonb_build_object('quote_number',v_quote_number,'order_number',v_order.order_number,'changed_fields',to_jsonb(v_changed))) on conflict(command_identity) do nothing;
  end if;
  return jsonb_build_object('outcome',case when cardinality(v_changed)=0 then 'already_coherent' else 'repaired' end,'changed_fields',to_jsonb(v_changed),'production_job',to_jsonb(v_job),'order_id',v_order.id,'order_status',v_order.status,'idempotent',cardinality(v_changed)=0);
end $$;

revoke all on function public.repair_production_quote_order_linkage(uuid) from public,anon;
grant execute on function public.repair_production_quote_order_linkage(uuid) to authenticated,service_role;

-- Exact, fail-closed Survivor Tree repair. No pricing, customer, Finance, Inventory,
-- numbering, Quote identity, or Order identity fields are written.
do $$
declare v_job public.production_jobs%rowtype; v_quote public.quotes%rowtype; v_order public.orders%rowtype; v_count integer; v_now timestamptz:=now();
begin
 select * into strict v_job from public.production_jobs where id='27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid for update;
 if v_job.production_status<>'estimate' or v_job.quote_number is distinct from 'Q-000007' or nullif(btrim(v_job.job_payload->>'quote_number'),'') is distinct from 'Q-000007' or v_job.order_number is distinct from 'OP-000188' then raise exception 'Survivor Production identity/status changed; repair aborted' using errcode='23514'; end if;
 select count(*) into v_count from public.quotes where quote_number='Q-000007'; if v_count<>1 then raise exception 'Q-000007 is not unique; repair aborted' using errcode='23514'; end if;
 select * into strict v_quote from public.quotes where quote_number='Q-000007' for update;
 select count(*) into v_count from public.orders where source_quote_number='Q-000007'; if v_count<>1 then raise exception 'Q-000007 Order relationship is not unique; repair aborted' using errcode='23514'; end if;
 select * into strict v_order from public.orders where source_quote_number='Q-000007' for update;
 if v_order.id is distinct from 'db361c40-b958-42cf-86e5-94238d252499'::uuid or v_order.order_number is distinct from 'OP-000188' or v_order.status<>'ready_to_print' or v_order.user_id is distinct from v_job.user_id or v_quote.user_id is distinct from v_job.user_id or v_quote.customer_response<>'accepted' or v_quote.converted_to_order is not true or v_quote.converted_order_number is distinct from 'OP-000188' then raise exception 'Survivor Quote/Order provenance or lifecycle changed; repair aborted' using errcode='23514'; end if;
 update public.production_jobs set production_status='ready_to_print',production_source_type='legacy_repaired',job_payload=coalesce(job_payload,'{}')||jsonb_build_object('production_status','ready_to_print','updated_at',v_now),updated_at=v_now where id=v_job.id;
 insert into public.production_linkage_audit(user_id,production_job_id,quote_id,order_id,command_identity,event_type,from_status,to_status,evidence) values(v_job.user_id,v_job.id,v_quote.id,v_order.id,'survivor-tree-lifecycle-repair-v1','linked_lifecycle_repaired','estimate','ready_to_print',jsonb_build_object('quote_number','Q-000007','order_number','OP-000188','changed_fields',jsonb_build_array('production_status','job_payload.production_status','job_payload.updated_at','updated_at'))) on conflict(command_identity) do nothing;
end $$;

create or replace function public.cancel_production_job(p_production_job_id uuid,p_expected_updated_at timestamptz,p_reason text,p_command_identity text)
returns public.production_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_actor uuid:=auth.uid(); v_now timestamptz:=now(); v_job public.production_jobs%rowtype; v_order public.orders%rowtype; v_receipt public.workflow_command_receipts%rowtype;
 v_reason text:=nullif(btrim(coalesce(p_reason,'')),''); v_key text:=nullif(btrim(coalesce(p_command_identity,'')),''); v_from text; v_to text; v_linked boolean:=false;
begin
 perform set_config('lock_timeout','2000ms',true);
 if v_actor is null then raise exception 'Authentication is required for Production cancellation' using errcode='28000'; end if;
 if p_production_job_id is null or p_expected_updated_at is null or v_key is null or v_reason is null then raise exception 'Production job, expected version, cancellation reason, and command identity are required' using errcode='22004'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended(v_key,0)) then raise exception 'Production cancellation is already in progress' using errcode='55P03'; end if;
 select * into v_receipt from public.workflow_command_receipts where command_identity=v_key;
 if found then
   if v_receipt.owner_id<>v_actor or v_receipt.production_job_id<>p_production_job_id or v_receipt.command<>'cancel' then raise exception 'Command identity is already used for another workflow command' using errcode='23505'; end if;
   select * into v_job from jsonb_populate_record(null::public.production_jobs,v_receipt.result_snapshot); return v_job;
 end if;
 select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor;
 if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
 v_linked:=v_job.order_number is not null;
 begin
   if v_linked then
     select * into v_order from public.orders where order_number=v_job.order_number and user_id=v_actor for update nowait;
     if not found then raise exception 'Linked Order not found for authenticated owner' using errcode='23514'; end if;
   end if;
   select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
 exception when lock_not_available then raise exception 'Production cancellation is contended; refresh before retrying' using errcode='55P03'; end;
 if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='PT409',detail='appCode=40001 conflictScope=production_row'; end if;
 if v_linked then
   if v_order.source_quote_number is distinct from v_job.quote_number or v_order.user_id is distinct from v_job.user_id or nullif(v_job.job_payload->>'order_number','') is distinct from v_order.order_number or nullif(v_job.job_payload->>'order_id','') is distinct from v_order.id::text then raise exception 'Linked Production and Order provenance is inconsistent' using errcode='23514'; end if;
   if v_job.production_status is distinct from v_order.status then raise exception 'Linked Production and Order lifecycle is inconsistent' using errcode='23514'; end if;
 end if;
 v_from:=v_job.production_status;
 if v_from in ('void','canceled') then return v_job; end if;
 if v_from in ('closed','completed','archived','failed_scrap') then raise exception 'Historical Production cannot be canceled' using errcode='23514'; end if;
 v_to:=case when not v_linked and v_from in ('estimate','waiting_customer','quote_sent','quote_declined') then 'void' else 'canceled' end;
 update public.raw_material_inventory r set reserved_grams=greatest(coalesce(r.reserved_grams,0)-a.reserved_grams,0),updated_at=v_now from public.production_material_reservations a where a.user_id=v_actor and a.production_job_id=v_job.id and a.status='active' and a.raw_material_roll_id=r.id and r.user_id=v_actor;
 update public.production_material_reservations set status='released',release_command_id=v_key,released_at=v_now,updated_at=v_now where user_id=v_actor and production_job_id=v_job.id and status='active';
 update public.production_jobs set production_status=v_to,close_note='[Canceled] '||v_reason,estimated_finish_at=null,job_payload=coalesce(job_payload,'{}')||jsonb_build_object('production_status',v_to,'cancellation_reason',v_reason,'canceled_at',v_now,'updated_at',v_now),updated_at=v_now where id=v_job.id and user_id=v_actor returning * into v_job;
 if v_linked then
   update public.orders set status='canceled',updated_at=v_now where id=v_order.id and user_id=v_actor;
   if not found then raise exception 'Linked Order cancellation affected no rows' using errcode='40001'; end if;
   update public.order_tracking_public set status='canceled',public_status_text=public.workflow_public_status_text('canceled'),public_next_step=public.workflow_public_next_step('canceled'),updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
   if not found then raise exception 'Linked Order tracking cancellation affected no rows' using errcode='40001'; end if;
 end if;
 insert into public.workflow_command_receipts(command_identity,owner_id,production_job_id,command,from_state,to_state,resulting_updated_at,result_snapshot,created_at) values(v_key,v_actor,v_job.id,'cancel',v_from,v_to,v_job.updated_at,to_jsonb(v_job),v_now);
 return v_job;
end $$;
revoke all on function public.cancel_production_job(uuid,timestamptz,text,text) from public,anon;
grant execute on function public.cancel_production_job(uuid,timestamptz,text,text) to authenticated,service_role;
comment on function public.cancel_production_job(uuid,timestamptz,text,text) is 'Strict owner-scoped cancellation of coherent Production/Order lifecycle plus active reservations; consumed history is preserved.';

notify pgrst,'reload schema';
commit;
