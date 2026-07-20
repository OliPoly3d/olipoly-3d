-- Purpose and scope:
-- Forward-only ERP Blueprint v1 workflow-authority correction for accepted Order,
-- Production, and customer-safe tracking workflow mutations. Production owns
-- manufacturing transitions and actuals. Orders/Fulfillment owns fulfillment
-- readiness confirmation and closure. Public tracking is projection-only.
-- Browser clients must use command RPCs and cannot bypass the command boundary
-- with direct workflow table writes.
--
-- Deployment order:
-- Deploy after 202607200005_quote_acceptance_runtime_safety.sql. This migration
-- must be reviewed and applied by an operator through the approved Supabase
-- migration process. Codex did not apply or deploy this migration.
--
-- Read-only preflight queries:
-- select status, count(*) from public.orders group by status order by status;
-- select production_status, count(*) from public.production_jobs group by production_status order by production_status;
-- select status, count(*) from public.order_tracking_public group by status order by status;
-- select event_type, count(*) from public.project_events group by event_type order by event_type;
-- select policyname, cmd, roles from pg_policies where schemaname='public' and tablename in ('orders','production_jobs','order_tracking_public') order by tablename, policyname;
-- select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('orders','production_jobs','order_tracking_public') and grantee in ('anon','authenticated','PUBLIC','public','service_role') order by table_name, grantee, privilege_type;
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_sync_workflow_to_production';
-- select proname, prosecdef, proacl from pg_proc join pg_namespace on pg_namespace.oid=pronamespace where nspname='public' and proname in ('set_linked_workflow_status','sync_order_workflow_to_production','production_workflow_command','fulfillment_workflow_command');
--
-- Post-deployment verification queries:
-- select has_table_privilege('authenticated','public.orders','update') as authenticated_can_update_orders; -- expect false
-- select has_table_privilege('authenticated','public.production_jobs','update') as authenticated_can_update_production_jobs; -- expect false
-- select has_table_privilege('authenticated','public.order_tracking_public','insert') as authenticated_can_insert_tracking, has_table_privilege('authenticated','public.order_tracking_public','update') as authenticated_can_update_tracking, has_table_privilege('authenticated','public.order_tracking_public','delete') as authenticated_can_delete_tracking; -- expect all false
-- select has_function_privilege('PUBLIC','public.sync_order_workflow_to_production()','execute') as public_can_sync_trigger_helper; -- expect false
-- select has_function_privilege('anon','public.set_linked_workflow_status(text,text,timestamptz)','execute') as anon_can_old_workflow; -- expect false
-- select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='production_jobs' order by policyname; -- expect one owner SELECT policy and service-role recovery policies only
-- select indexname from pg_indexes where schemaname='public' and tablename='project_events' and indexname='project_events_workflow_command_once_idx'; -- expect one row
--
-- Forward-recovery guidance:
-- If any statement fails before COMMIT, PostgreSQL rolls back this entire
-- correction and preserves the previously deployed runtime-safety contract. If
-- verification fails after COMMIT, do not update, delete, backfill, or reinterpret
-- historical rows or legacy events; ship a new forward-only corrective migration.
-- Existing historical/test data intentionally remains untouched.

begin;

create unique index if not exists project_events_workflow_command_once_idx
  on public.project_events(correlation_id, event_type)
  where correlation_id is not null
    and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed');

create or replace function public.workflow_public_status_text(p_status text)
returns text language sql immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'ready_to_print' then 'Your order is ready for production.'
    when 'printing' then 'Your order is printing.'
    when 'qc' then 'Your order is in quality control and finishing.'
    when 'ready_for_fulfillment' then 'Your order is ready for pickup or shipment.'
    when 'closed' then 'Your order is complete.'
    else null end
$$;

create or replace function public.workflow_public_next_step(p_status text)
returns text language sql immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'ready_to_print' then 'Printing will begin when the assigned machine is available.'
    when 'printing' then 'Quality control and finishing follow printing.'
    when 'qc' then 'The finished order will be prepared for pickup or shipment.'
    when 'ready_for_fulfillment' then 'OliPoly 3D will coordinate the final handoff.'
    when 'closed' then 'No further production action is required.'
    else null end
$$;


create or replace function public.production_workflow_command(
  p_order_number text,
  p_command text,
  p_expected_updated_at timestamptz,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_causation_id text default null
)
returns public.production_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_job public.production_jobs%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
  v_to text;
  v_event text;
  v_from text;
  v_command_id text := nullif(btrim(p_correlation_id),'');
  v_actual_grams numeric;
  v_scrap_grams numeric;
  v_actual_hours numeric;
begin
  if v_actor is null then raise exception 'Authentication is required for Production workflow commands' using errcode='28000'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;

  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;

  select * into v_job from public.production_jobs
   where user_id = v_actor and (order_number = v_order.order_number or (v_order.source_quote_number is not null and quote_number = v_order.source_quote_number))
   order by case when order_number = v_order.order_number then 0 else 1 end, updated_at desc nulls last
   limit 1 for update;
  if not found then raise exception 'Linked Production job not found for %', p_order_number using errcode='P0002'; end if;
  if v_job.order_number is distinct from v_order.order_number then raise exception 'Production/Order linkage mismatch for %', p_order_number using errcode='23514'; end if;
  if v_command = 'start_print' then
    v_to := 'printing'; v_event := 'order.printing_started';
  elsif v_command = 'complete_print' then
    v_to := 'qc'; v_event := 'order.print_completed';
    if coalesce(jsonb_typeof(p_payload->'actual_grams_used') not in ('number','string'), true)
       or coalesce(jsonb_typeof(p_payload->'actual_print_hours') not in ('number','string'), true)
       or (p_payload ? 'scrap_grams' and coalesce(jsonb_typeof(p_payload->'scrap_grams') not in ('number','string'), true))
       or coalesce(p_payload->>'actual_grams_used','') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(p_payload->>'actual_print_hours','') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(nullif(p_payload->>'scrap_grams',''),'0') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Complete Print requires finite nonnegative numeric actual_grams_used, scrap_grams, and actual_print_hours' using errcode='22023';
    end if;
    v_actual_grams := (p_payload->>'actual_grams_used')::numeric;
    v_scrap_grams := coalesce(nullif(p_payload->>'scrap_grams','')::numeric, 0);
    v_actual_hours := (p_payload->>'actual_print_hours')::numeric;
    if v_actual_grams::text in ('NaN','Infinity','-Infinity') or v_scrap_grams::text in ('NaN','Infinity','-Infinity') or v_actual_hours::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Complete Print actuals must be finite' using errcode='22023';
    end if;
  elsif v_command = 'pass_qc' then
    v_to := 'ready_for_fulfillment'; v_event := 'order.qc_passed';
  elsif v_command = 'needs_reprint' then
    v_to := 'ready_to_print'; v_event := 'order.needs_reprint';
  else
    raise exception 'Invalid Production workflow command: %', p_command using errcode='22023';
  end if;

  if exists (
    select 1 from public.project_events
     where correlation_id = v_command_id
       and event_type = v_event
       and user_id = v_actor
       and aggregate_type = 'order'
       and aggregate_id = v_order.id::text
       and payload->>'command' = v_command
  ) then
    return v_job;
  end if;
  if exists (select 1 from public.project_events where correlation_id = v_command_id and not (event_type = v_event and user_id = v_actor and aggregate_type = 'order' and aggregate_id = v_order.id::text and payload->>'command' = v_command)) then
    raise exception 'Command identity is already used for a different workflow command' using errcode='23505';
  end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production workflow changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  v_from := v_job.production_status;
  if v_command = 'start_print' and (v_job.production_status <> 'ready_to_print' or v_order.status <> 'ready_to_print') then raise exception 'Start Print requires ready_to_print' using errcode='22023'; end if;
  if v_command = 'complete_print' and (v_job.production_status <> 'printing' or v_order.status <> 'printing') then raise exception 'Complete Print requires printing' using errcode='22023'; end if;
  if v_command in ('pass_qc','needs_reprint') and (v_job.production_status <> 'qc' or v_order.status <> 'qc') then raise exception 'QC command requires qc' using errcode='22023'; end if;

  update public.production_jobs
     set production_status = v_to,
         actual_grams_used = coalesce(v_actual_grams, actual_grams_used),
         scrap_grams = coalesce(v_scrap_grams, scrap_grams),
         actual_print_hours = coalesce(v_actual_hours, actual_print_hours),
         print_started_at = case when v_command='start_print' then coalesce(print_started_at, v_now) else print_started_at end,
         job_payload = coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now),
         updated_at = v_now
   where id = v_job.id and user_id = v_actor
   returning * into v_job;
  if not found then raise exception 'Production workflow update affected no rows' using errcode='40001'; end if;

  update public.orders set status = v_to, updated_at = v_now where id = v_order.id and user_id = v_actor returning * into v_order;
  if not found then raise exception 'Order workflow projection affected no rows' using errcode='40001'; end if;

  update public.order_tracking_public
     set status = v_to, public_status_text = public.workflow_public_status_text(v_to), public_next_step = public.workflow_public_next_step(v_to), updated_at = v_now
   where order_number = v_order.order_number and user_id = v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from',v_from,'to',v_to),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_command_id,p_causation_id,1,jsonb_build_object('command',v_command,'from',v_from,'status',v_to,'production_job_id',v_job.id,'actuals',coalesce(p_payload,'{}'::jsonb)))
  on conflict (correlation_id, event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;

  return v_job;
end;
$$;

create or replace function public.fulfillment_workflow_command(
  p_order_number text,
  p_command text,
  p_expected_updated_at timestamptz,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_causation_id text default null
)
returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_job public.production_jobs%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
  v_to text;
  v_event text;
  v_from text;
  v_command_id text := nullif(btrim(p_correlation_id),'');
begin
  if v_actor is null then raise exception 'Authentication is required for Fulfillment workflow commands' using errcode='28000'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;

  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  if v_command = 'close_order' then
    v_to := 'closed'; v_event := 'order.closed';
  else
    raise exception 'Invalid Fulfillment workflow command: %', p_command using errcode='22023';
  end if;

  if exists (
    select 1 from public.project_events
     where correlation_id = v_command_id
       and event_type = v_event
       and user_id = v_actor
       and aggregate_type = 'order'
       and aggregate_id = v_order.id::text
       and payload->>'command' = v_command
  ) then
    return v_order;
  end if;
  if exists (select 1 from public.project_events where correlation_id = v_command_id and not (event_type = v_event and user_id = v_actor and aggregate_type = 'order' and aggregate_id = v_order.id::text and payload->>'command' = v_command)) then
    raise exception 'Command identity is already used for a different workflow command' using errcode='23505';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order workflow changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  v_from := v_order.status;

  select * into v_job from public.production_jobs where user_id=v_actor and order_number=v_order.order_number limit 1 for update;
  if not found then raise exception 'Linked Production job not found for %', p_order_number using errcode='P0002'; end if;
  if v_order.status <> 'ready_for_fulfillment' or v_job.production_status <> 'ready_for_fulfillment' then raise exception 'Close requires ready_for_fulfillment' using errcode='22023'; end if;
  if coalesce(p_payload->>'fulfillment_confirmed_at','') = '' or coalesce(p_payload->>'fulfillment_method','') = '' then raise exception 'Fulfillment confirmation requires fulfillment_confirmed_at and fulfillment_method' using errcode='22023'; end if;

  update public.orders set status=v_to, updated_at=v_now where id=v_order.id and user_id=v_actor returning * into v_order;
  if not found then raise exception 'Order workflow update affected no rows' using errcode='40001'; end if;
  update public.production_jobs set production_status=v_to, updated_at=v_now where id=v_job.id and user_id=v_actor returning * into v_job;
  if not found then raise exception 'Production fulfillment projection affected no rows' using errcode='40001'; end if;
  update public.order_tracking_public set status=v_to, public_status_text=public.workflow_public_status_text(v_to), public_next_step=public.workflow_public_next_step(v_to), updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from',v_from,'to',v_to),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_command_id,p_causation_id,1,jsonb_build_object('command',v_command,'from',v_from,'status',v_to,'occurred_at',v_now,'fulfillment_confirmation',coalesce(p_payload,'{}'::jsonb)))
  on conflict (correlation_id, event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;
  return v_order;
end;
$$;

-- Retire blind Orders-to-Production status copying. Commands above own projections.
drop trigger if exists orders_sync_workflow_to_production on public.orders;
create or replace function public.sync_order_workflow_to_production()
returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
begin
  raise exception 'sync_order_workflow_to_production is retired; use workflow command RPCs' using errcode='0A000';
end;
$$;

create or replace function public.set_linked_workflow_status(text,text,timestamptz)
returns public.orders language plpgsql security definer set search_path=public, pg_temp as $$
begin
  raise exception 'set_linked_workflow_status is retired; use production_workflow_command or fulfillment_workflow_command' using errcode='0A000';
end;
$$;

alter table if exists public.orders enable row level security;
alter table if exists public.production_jobs enable row level security;
alter table if exists public.order_tracking_public enable row level security;

revoke insert, update, delete on table public.order_tracking_public from authenticated;
revoke update on table public.orders from authenticated;
revoke update on table public.production_jobs from authenticated;
grant select on table public.orders, public.production_jobs to authenticated;
grant select on table public.order_tracking_public to authenticated;
grant update(order_number, order_date, customer_name, customer_email, order_title, quantity, order_total, deposit_amount, balance_amount, payment_status, fulfillment, tracking_number, payment_link, payment_link_stripe, payment_link_paypal, payment_link_venmo, stripe_invoice_id, paid_date, po_number, tax_exempt, tax_exempt_reason, exemption_certificate_on_file, po_file_on_file, po_part_number, olipoly_part_number, part_revision, shipping_contact_name, shipping_company, material, color, printer_profile, layer_height, nozzle_size, estimated_print_time, estimated_piece_price, production_notes, post_processing_notes, invoice_number, invoice_date, invoice_due_date, invoice_terms, ap_email, billing_address, shipping_address, internal_notes, finance_pushed, finance_pushed_at, invoice_sent, invoice_sent_at, updated_at) on public.orders to authenticated;
grant insert(id, user_id, job_title, job_type, production_status, priority, customer_name, quote_number, quantity, machine_preference, due_date, primary_material, primary_color, other_colors, color_count, estimated_hours_each, estimated_grams_each, filament_breakdown, filament_recipe, finished_sku, estimated_price_each, design_fee, design_fee_mode, post_processing_fee, post_processing_fee_mode, supply_usage, supply_cost, estimated_material_cost, image_url, notes, failure_reason, close_note, exclude_inventory_reduction, finished_roll, spool_freed, manual_rank, job_payload, updated_at) on public.production_jobs to authenticated;
grant update(job_title, job_type, priority, customer_name, quote_number, quantity, machine_preference, due_date, primary_material, primary_color, other_colors, color_count, estimated_hours_each, estimated_grams_each, filament_breakdown, filament_recipe, finished_sku, estimated_price_each, design_fee, design_fee_mode, post_processing_fee, post_processing_fee_mode, supply_usage, supply_cost, estimated_material_cost, image_url, notes, failure_reason, close_note, exclude_inventory_reduction, finished_roll, spool_freed, manual_rank, job_payload, updated_at) on public.production_jobs to authenticated;
grant delete on table public.production_jobs to authenticated;
grant all on table public.orders, public.production_jobs, public.order_tracking_public to service_role;

-- Remove duplicate Production owner CRUD policy sets and replace with reviewed least privilege.
do $drop_policies$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='production_jobs' loop
    execute format('drop policy if exists %I on public.production_jobs', r.policyname);
  end loop;
end
$drop_policies$;
create policy production_jobs_owner_select on public.production_jobs for select to authenticated using (auth.uid() = user_id);
create policy production_jobs_owner_insert on public.production_jobs for insert to authenticated with check (auth.uid() = user_id and production_status in ('estimate','waiting_customer') and order_number is null and actual_grams_used is null and scrap_grams is null and actual_print_hours is null and print_started_at is null);
create policy production_jobs_owner_update on public.production_jobs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy production_jobs_owner_delete on public.production_jobs for delete to authenticated using (auth.uid() = user_id and production_status in ('estimate','waiting_customer') and order_number is null and actual_grams_used is null and scrap_grams is null and actual_print_hours is null and print_started_at is null);
create policy production_jobs_service_role_recovery on public.production_jobs for all to service_role using (true) with check (true);

-- Public tracking remains projection-only: owner SELECT for active clients; service-role recovery only for mutation.
drop policy if exists order_tracking_public_owner_insert on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_update on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_delete on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_select on public.order_tracking_public;
create policy order_tracking_public_owner_select on public.order_tracking_public for select to authenticated using (auth.uid() = user_id);
create policy order_tracking_public_service_role_recovery on public.order_tracking_public for all to service_role using (true) with check (true);

revoke execute on function public.workflow_public_status_text(text) from public, anon, authenticated;
revoke execute on function public.workflow_public_next_step(text) from public, anon, authenticated;
revoke execute on function public.sync_order_workflow_to_production() from public, anon, authenticated;
revoke execute on function public.set_linked_workflow_status(text,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.production_workflow_command(text,text,timestamptz,jsonb,text,text) from public, anon;
revoke execute on function public.fulfillment_workflow_command(text,text,timestamptz,jsonb,text,text) from public, anon;
grant execute on function public.production_workflow_command(text,text,timestamptz,jsonb,text,text) to authenticated, service_role;
grant execute on function public.fulfillment_workflow_command(text,text,timestamptz,jsonb,text,text) to authenticated, service_role;

commit;
