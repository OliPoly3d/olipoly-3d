-- Purpose and scope:
-- Make public.respond_to_quote_public the sole atomic Quote acceptance authority.
-- This reviewed migration adds immutable accepted customer snapshots, compatible
-- project_events envelope columns, exactly-one nonblank source_quote_number
-- enforcement, idempotent/collision-safe Order creation, RPC-owned Production
-- handoff, RPC-owned tracking initialization, and least-privilege grants.
-- It intentionally does not repair, delete, relink, or reinterpret historical
-- test/abandoned records. OP-000184 may continue to reference a deleted/missing
-- historical Quote; no foreign key is added here.
-- Codex did not apply this migration to any Supabase project or production data.
--
-- Deployment order:
-- 1. Deploy after 202607200001_public_access_ownership_security_hardening.sql.
-- 2. Run the read-only preflight queries below and stop if any prerequisite rows
--    appear except known historical rows explicitly reviewed outside this file.
-- 3. Apply this migration through the normal reviewed Supabase migration path.
-- 4. Run post-deployment verification queries and manual browser checks below.
--
-- Read-only preflight queries:
-- select source_quote_number, count(*) from public.orders where nullif(btrim(source_quote_number),'') is not null group by source_quote_number having count(*) > 1;
-- select order_number, count(*) from public.orders where nullif(btrim(order_number),'') is not null group by order_number having count(*) > 1;
-- select q.quote_number, q.user_id as quote_owner, o.user_id as order_owner, o.order_number from public.quotes q join public.orders o on o.order_number = regexp_replace(q.quote_number, '^Q-', 'OP-') where q.user_id is distinct from o.user_id or nullif(o.source_quote_number,'') is distinct from q.quote_number;
-- select order_number, source_quote_number from public.orders where order_number = 'OP-000184'; -- informational only; do not repair here.
--
-- Rollback / forward recovery guidance:
-- If deployment fails before commit, PostgreSQL rolls back the whole migration.
-- If post-deployment verification fails, disable browser promotion, preserve data,
-- and forward-fix with another reviewed migration rather than editing historical
-- snapshots/events. Do not drop accepted snapshots after customers accept offers.
--
-- Manual browser test checklist:
-- - Anonymous quote-response.html accepts Q/token once and receives only status/order_number/response.
-- - Refresh/retry same link returns same OP without changing accepted timestamps.
-- - Internal Accept + Create Order calls only /rpc/respond_to_quote_public after quote save/token lookup.
-- - Network panel shows no browser writes to orders, production_jobs, order_tracking_public, or project_events during acceptance.
-- - Public tracking lookup works through public_order_tracking_lookup(text).

alter table if exists public.orders add column if not exists source_quote_number text;
alter table if exists public.orders add column if not exists created_from_quote boolean default false;
alter table if exists public.orders add column if not exists accepted_date timestamptz;
alter table if exists public.quotes add column if not exists accepted_commercial_snapshot_id uuid;
alter table if exists public.quotes add column if not exists accepted_commercial_snapshot jsonb;
alter table if exists public.quotes add column if not exists accepted_at timestamptz;

create table if not exists public.quote_accepted_commercial_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quote_number text not null,
  order_number text not null,
  accepted_at timestamptz not null default now(),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint quote_accepted_commercial_snapshots_one_per_quote unique (quote_number),
  constraint quote_accepted_commercial_snapshots_customer_fields check (snapshot ? 'quote_number' and snapshot ? 'totals')
);

create or replace function public.prevent_quote_accepted_snapshot_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'accepted commercial snapshots are immutable' using errcode = '2F000';
end; $$;
drop trigger if exists quote_accepted_snapshots_no_update on public.quote_accepted_commercial_snapshots;
create trigger quote_accepted_snapshots_no_update before update or delete on public.quote_accepted_commercial_snapshots for each row execute function public.prevent_quote_accepted_snapshot_mutation();

-- Stop safely if uniqueness prerequisite is violated.
do $$
begin
  if exists (select 1 from public.orders where nullif(btrim(source_quote_number),'') is not null group by source_quote_number having count(*) > 1) then
    raise exception 'Cannot enforce one Order per source Quote: duplicate nonblank source_quote_number values exist';
  end if;
end $$;
create unique index if not exists orders_one_per_source_quote_number_idx on public.orders (source_quote_number) where nullif(btrim(source_quote_number),'') is not null;

alter table if exists public.project_events add column if not exists event_id uuid;
alter table if exists public.project_events add column if not exists occurred_at timestamptz;
alter table if exists public.project_events add column if not exists aggregate_type text;
alter table if exists public.project_events add column if not exists aggregate_id text;
alter table if exists public.project_events add column if not exists actor_type text;
alter table if exists public.project_events add column if not exists actor_id text;
alter table if exists public.project_events add column if not exists correlation_id text;
alter table if exists public.project_events add column if not exists causation_id text;
alter table if exists public.project_events add column if not exists schema_version integer;
alter table if exists public.project_events add column if not exists payload jsonb;
create unique index if not exists project_events_event_id_once_idx on public.project_events(event_id) where event_id is not null;
create unique index if not exists project_events_acceptance_once_idx on public.project_events(user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created');

create or replace function public.respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_response text := lower(btrim(coalesce(p_response,'')));
  v_order_number text;
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_snapshot_id uuid;
  v_correlation text := gen_random_uuid()::text;
begin
  if v_response in ('accept','approved','approve') then v_response := 'accepted'; end if;
  if v_response in ('decline','rejected','reject') then v_response := 'declined'; end if;
  if v_response not in ('accepted','declined') then raise exception 'Invalid quote response' using errcode = '22023'; end if;

  select * into v_quote from public.quotes
   where quote_number = p_quote_number and public_token = p_public_token
   for update;
  if not found then raise exception 'Quote response link is invalid or expired' using errcode = 'P0002'; end if;

  if v_response = 'declined' then
    update public.quotes set customer_response = 'declined', customer_response_message = p_message, updated_at = v_now
     where id = v_quote.id and coalesce(customer_response,'') <> 'declined';
    return jsonb_build_object('response','declined','status','recorded');
  end if;

  v_order_number := regexp_replace(v_quote.quote_number, '^Q-', 'OP-');

  select * into v_order from public.orders where order_number = v_order_number for update;
  if found and (v_order.user_id is distinct from v_quote.user_id or nullif(v_order.source_quote_number,'') is distinct from v_quote.quote_number) then
    raise exception 'Order number collision for %', v_order_number using errcode = '23505';
  end if;

  select id into v_snapshot_id from public.quote_accepted_commercial_snapshots where quote_number = v_quote.quote_number;
  if not found then
    v_snapshot := jsonb_build_object('quote_number', v_quote.quote_number, 'order_number', v_order_number, 'accepted_at', v_now, 'customer', jsonb_build_object('name', v_quote.customer_name, 'email', v_quote.customer_email), 'offer', coalesce(v_quote.quote_data,'{}'::jsonb), 'totals', coalesce(v_quote.customer_totals,'{}'::jsonb), 'terms', jsonb_build_object('message', p_message));
    insert into public.quote_accepted_commercial_snapshots(user_id, quote_number, order_number, accepted_at, snapshot)
    values (v_quote.user_id, v_quote.quote_number, v_order_number, v_now, v_snapshot) returning id into v_snapshot_id;
  end if;

  if not found or v_order.id is null then
    insert into public.orders(user_id, order_number, source_quote_number, created_from_quote, accepted_date, status, customer_name, customer_email, order_title, created_at, updated_at)
    values (v_quote.user_id, v_order_number, v_quote.quote_number, true, v_now, 'ready_to_print', v_quote.customer_name, v_quote.customer_email, coalesce(v_quote.quote_title,'Accepted Quote'), v_now, v_now)
    on conflict (source_quote_number) where nullif(btrim(source_quote_number),'') is not null do nothing;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then raise exception 'Order creation failed for accepted quote %', v_quote.quote_number using errcode = '40001'; end if;
  end if;

  update public.quotes set customer_response = 'accepted', customer_response_message = coalesce(customer_response_message, p_message), quote_status = 'converted_to_order', converted_to_order = true, converted_order_number = v_order.order_number, accepted_date = coalesce(accepted_date, v_now), accepted_at = coalesce(accepted_at, v_now), accepted_commercial_snapshot_id = coalesce(accepted_commercial_snapshot_id, v_snapshot_id), accepted_commercial_snapshot = coalesce(accepted_commercial_snapshot, (select snapshot from public.quote_accepted_commercial_snapshots where id = v_snapshot_id)), updated_at = v_now where id = v_quote.id;

  update public.production_jobs set production_status = 'ready_to_print', order_number = v_order.order_number, quote_number = coalesce(quote_number, v_quote.quote_number), updated_at = v_now where user_id = v_quote.user_id and quote_number = v_quote.quote_number and coalesce(production_status,'') in ('waiting_customer','quote_sent','quote_accepted','awaiting_approval');

  insert into public.order_tracking_public(user_id, order_number, status, public_status_text, public_next_step, updated_at)
  values(v_quote.user_id, v_order.order_number, 'ready_to_print', 'Your order is approved and ready for production.', 'Printing will begin when the assigned machine is available.', v_now)
  on conflict (order_number) do update set updated_at = public.order_tracking_public.updated_at where public.order_tracking_public.status = 'ready_to_print';

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_quote.user_id,v_quote.quote_number,v_order.order_number,'quote.accepted',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',v_order.order_number),v_now,v_now,'quote',v_quote.quote_number,'public_token',null,v_correlation,null,1,jsonb_build_object('response','accepted'))
  on conflict (user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created') do nothing;
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_quote.user_id,v_quote.quote_number,v_order.order_number,'order.created',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',v_order.order_number),v_now,v_now,'order',v_order.order_number,'public_token',null,v_correlation,'quote.accepted',1,jsonb_build_object('source_quote_number',v_quote.quote_number))
  on conflict (user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created') do nothing;

  return jsonb_build_object('response','accepted','status','accepted','order_number',v_order.order_number);
exception when others then
  raise; -- PostgreSQL rolls back every required acceptance write in this transaction.
end; $$;

revoke execute on function public.respond_to_quote_public(text,text,text,text) from public;
revoke execute on function public.get_quote_public(text,text) from public;
revoke execute on function public.set_linked_workflow_status(text,text,timestamptz) from public;
revoke execute on function public.set_linked_workflow_status(text,text,timestamptz) from anon;
grant execute on function public.respond_to_quote_public(text,text,text,text) to anon, authenticated, service_role;
grant execute on function public.get_quote_public(text,text) to anon, authenticated, service_role;
grant execute on function public.set_linked_workflow_status(text,text,timestamptz) to authenticated, service_role;

-- Post-deployment verification queries:
-- select source_quote_number, count(*) from public.orders where nullif(btrim(source_quote_number),'') is not null group by source_quote_number having count(*) > 1;
-- select quote_number, event_type, count(*) from public.project_events where event_type in ('quote.accepted','order.created') group by quote_number,event_type having count(*) > 1;
-- select proname, prosecdef, proconfig from pg_proc join pg_namespace on pg_namespace.oid=pronamespace where nspname='public' and proname in ('respond_to_quote_public','get_quote_public','prevent_quote_accepted_snapshot_mutation');
-- select has_function_privilege('public','public.respond_to_quote_public(text,text,text,text)','execute') as public_can_accept;
