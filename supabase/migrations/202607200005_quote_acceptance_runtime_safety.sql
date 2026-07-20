-- Purpose and scope:
-- Forward-only runtime safety correction for public.respond_to_quote_public.
-- Migration 202607200004 was merged as repository evidence but was not deployed
-- and must not be deployed as written. Review found transaction,
-- payment-ownership, response-vocabulary, fulfillment, causation, and
-- tracking-idempotency defects. This migration supersedes 202607200004 for
-- deployment without editing migrations 202607200002, 202607200003, or
-- 202607200004.
--
-- This migration makes the corrected RPC definition, trigger replacement/retirement, and
-- grant enforcement one explicit transaction. It intentionally does not repair,
-- relink, reinterpret, or update historical Orders, Quotes, Production jobs,
-- snapshots, tracking rows, or events. Codex did not apply this migration or
-- any SQL to a Supabase project or production data.
--
-- Read-only preflight queries:
-- select source_quote_number, count(*) from public.orders where nullif(btrim(source_quote_number),'') is not null group by source_quote_number having count(*) > 1;
-- select quote_number, event_type, count(*) from public.project_events where event_type in ('quote.accepted','order.created','quote.change_requested') group by quote_number,event_type having count(*) > 1;
-- select tgname from pg_trigger where tgrelid = 'public.quotes'::regclass and tgname = 'quotes_advance_linked_production';
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'orders_sync_workflow_to_production'; -- review whether INSERT currently appears before deploying
-- select relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where nspname = 'public' and relname = 'quote_accepted_commercial_snapshots';
-- select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'quote_accepted_commercial_snapshots' and grantee in ('PUBLIC','public','anon','authenticated','service_role') order by grantee, privilege_type;
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_fulfillment_check';
-- select proname, prosecdef, proconfig from pg_proc join pg_namespace on pg_namespace.oid = pronamespace where nspname = 'public' and proname = 'respond_to_quote_public';
-- select grantee, privilege_type from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'respond_to_quote_public' order by grantee, privilege_type;
--
-- Post-deployment verification queries:
-- select tgname from pg_trigger where tgrelid = 'public.quotes'::regclass and tgname = 'quotes_advance_linked_production'; -- expect zero rows
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'orders_sync_workflow_to_production'; -- expect AFTER UPDATE OF status, no INSERT event, and old.status is distinct from new.status
-- select proname, prosecdef, proconfig from pg_proc join pg_namespace on pg_namespace.oid = pronamespace where nspname = 'public' and proname = 'respond_to_quote_public'; -- expect SECURITY DEFINER and search_path=public, pg_temp
-- select has_function_privilege('public','public.respond_to_quote_public(text,text,text,text)','execute') as public_can_accept; -- expect false
-- select has_function_privilege('anon','public.respond_to_quote_public(text,text,text,text)','execute') as anon_can_accept; -- expect true
-- select has_table_privilege('anon','public.quote_accepted_commercial_snapshots','select') as anon_can_read_snapshots; -- expect false
-- select has_table_privilege('authenticated','public.quote_accepted_commercial_snapshots','select') as authenticated_can_read_snapshots; -- expect false
-- select quote_number, event_type, count(*) from public.project_events where event_type in ('quote.accepted','order.created','quote.change_requested') group by quote_number,event_type having count(*) > 1; -- expect zero rows
--
-- Forward recovery guidance:
-- If any statement fails before COMMIT, PostgreSQL rolls back this entire
-- transaction and preserves the previously deployed RPC, Quote trigger/function,
-- Order workflow trigger, grants, RLS, events, snapshots, Orders, and Quotes.
-- If verification fails after COMMIT, do not edit deployed historical snapshots,
-- events, Orders, or Quotes. Disable browser promotion if needed and ship another
-- reviewed forward-only corrective migration that preserves immutable evidence.

begin;

create unique index if not exists project_events_quote_change_requested_once_idx
  on public.project_events(user_id, quote_number, event_type)
  where event_type = 'quote.change_requested';

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

  v_order_number := regexp_replace(v_quote.quote_number, '^Q-', 'OP-');

  if coalesce(v_quote.customer_response,'') = 'accepted' or v_quote.converted_to_order is true then
    if v_response <> 'accepted' then
      raise exception 'Accepted quotes cannot be changed through the public response RPC' using errcode = '25006';
    end if;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then select * into v_order from public.orders where order_number = coalesce(v_quote.converted_order_number, v_order_number) and user_id = v_quote.user_id for update; end if;
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

  select * into v_order from public.orders where order_number = v_order_number for update;
  if found and (v_order.user_id is distinct from v_quote.user_id or nullif(v_order.source_quote_number,'') is distinct from v_quote.quote_number) then
    raise exception 'Order number collision for %', v_order_number using errcode = '23505';
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
    insert into public.orders(user_id, order_number, source_quote_number, created_from_quote, accepted_date, status, quantity, order_total, deposit_amount, balance_amount, payment_status, fulfillment, customer_name, customer_email, customer_phone, order_title, created_at, updated_at)
    values (v_quote.user_id, v_order_number, v_quote.quote_number, true, v_now, 'ready_to_print', v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment, v_quote.customer_name, v_quote.customer_email, v_quote.customer_phone, v_order_title, v_now, v_now)
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

-- Preserve Order-to-Production synchronization only for normal post-acceptance
-- Order status changes. The RPC is the sole initial acceptance-time handoff.
drop trigger if exists orders_sync_workflow_to_production on public.orders;
create trigger orders_sync_workflow_to_production
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.sync_order_workflow_to_production();

-- Retire only the overlapping Quote-time Production trigger path.
drop trigger if exists quotes_advance_linked_production on public.quotes;
drop function if exists public.advance_linked_production_on_quote_acceptance();

revoke execute on function public.respond_to_quote_public(text,text,text,text) from public;
grant execute on function public.respond_to_quote_public(text,text,text,text) to anon, authenticated, service_role;
revoke all on table public.quote_accepted_commercial_snapshots from public, anon, authenticated;
grant all on table public.quote_accepted_commercial_snapshots to service_role;

commit;
