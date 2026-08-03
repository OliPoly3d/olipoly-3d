-- TEMPORARY diagnostic migration. Deploy for exactly one Start Print capture, then replace with the non-logging authoritative definition.

begin;

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
  v_actual_quantity numeric;
  v_actual_machine text;
  v_actual_filament_breakdown text;
  v_roll_usage jsonb;
  v_attempt jsonb;
  v_actual_filaments jsonb;
  v_actual_filament_usage jsonb;
begin
  raise log 'OP_WORKFLOW stage=ENTER correlation=% order=% job=%',v_command_id,p_order_number,null;
  perform set_config('olipoly.workflow_correlation',coalesce(v_command_id,''),true);
  perform set_config('olipoly.workflow_order',coalesce(p_order_number,''),true);
  perform set_config('lock_timeout','2000ms',true);
  if v_actor is null then raise exception 'Authentication is required for Production workflow commands' using errcode='28000'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  raise log 'OP_WORKFLOW stage=AUTH_VALIDATED correlation=% order=% job=%',v_command_id,p_order_number,null;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  begin
    perform pg_advisory_xact_lock(hashtextextended(v_command_id, 0));
  exception when lock_not_available then
    raise exception 'Production workflow command identity is already in progress' using errcode='55P03', detail='lockScope=command';
  end;

  begin
    select * into v_order from public.orders where order_number = p_order_number for update nowait;
  exception when lock_not_available then
    raise exception 'Production workflow Order is already in progress' using errcode='55P03', detail='lockScope=order';
  end;
  raise log 'OP_WORKFLOW stage=ORDER_LOADED correlation=% order=% job=%',v_command_id,p_order_number,null;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;

  begin
    select * into v_job from public.production_jobs
     where user_id = v_actor and (order_number = v_order.order_number or (v_order.source_quote_number is not null and quote_number = v_order.source_quote_number))
     order by case when order_number = v_order.order_number then 0 else 1 end, updated_at desc nulls last
     limit 1 for update nowait;
  exception when lock_not_available then
    raise exception 'Production workflow job is already in progress' using errcode='55P03', detail='lockScope=job';
  end;
  perform set_config('olipoly.workflow_job',coalesce(v_job.id::text,''),true);
  raise log 'OP_WORKFLOW stage=PRODUCTION_JOB_LOADED correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  if not found then raise exception 'Linked Production job not found for %', p_order_number using errcode='P0002'; end if;
  raise log 'OP_WORKFLOW stage=LINK_VALIDATED correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
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
    if coalesce(p_payload->>'actual_machine','') = '' then raise exception 'Complete Print requires actual_machine' using errcode='22023'; end if;
    if coalesce(p_payload->>'actual_quantity','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Complete Print requires finite nonnegative actual_quantity' using errcode='22023'; end if;
    v_actual_quantity := (p_payload->>'actual_quantity')::numeric;
    if v_actual_quantity::text in ('NaN','Infinity','-Infinity') or v_actual_quantity < 0 then raise exception 'Complete Print actual_quantity must be finite and nonnegative' using errcode='22023'; end if;
    if p_payload ? 'actual_filament_breakdown' and jsonb_typeof(p_payload->'actual_filament_breakdown') not in ('array','object','string','null') then raise exception 'actual_filament_breakdown has invalid JSON structure' using errcode='22023'; end if;
    if p_payload ? 'roll_usages' and jsonb_typeof(p_payload->'roll_usages') <> 'array' then raise exception 'roll_usages must be an array' using errcode='22023'; end if;
    if p_payload ? 'production_attempt' and jsonb_typeof(p_payload->'production_attempt') <> 'object' then raise exception 'production_attempt must be an object' using errcode='22023'; end if;
    if p_payload ? 'actual_filaments' and jsonb_typeof(p_payload->'actual_filaments') not in ('array','object','null') then raise exception 'actual_filaments must be JSON array/object' using errcode='22023'; end if;
    if p_payload ? 'actual_filament_usage' and jsonb_typeof(p_payload->'actual_filament_usage') not in ('array','object','null') then raise exception 'actual_filament_usage must be JSON array/object' using errcode='22023'; end if;
    v_actual_machine := p_payload->>'actual_machine';
    v_actual_filament_breakdown := nullif(p_payload->>'actual_filament_breakdown','');
    v_roll_usage := coalesce(p_payload->'roll_usages', '[]'::jsonb);
    v_actual_filaments := coalesce(p_payload->'actual_filaments', 'null'::jsonb);
    v_actual_filament_usage := coalesce(p_payload->'actual_filament_usage', 'null'::jsonb);
    v_attempt := coalesce(p_payload->'production_attempt', jsonb_build_object('captured_at', v_now, 'actual_grams_used', v_actual_grams, 'scrap_grams', v_scrap_grams, 'actual_print_hours', v_actual_hours, 'actual_machine', v_actual_machine, 'actual_quantity', v_actual_quantity, 'roll_usages', v_roll_usage, 'actual_filaments', v_actual_filaments, 'actual_filament_usage', v_actual_filament_usage));
  elsif v_command = 'pass_qc' then
    v_to := 'ready_for_fulfillment'; v_event := 'order.qc_passed';
  elsif v_command = 'needs_reprint' then
    v_to := 'ready_to_print'; v_event := 'order.needs_reprint';
  else
    raise exception 'Invalid Production workflow command: %', p_command using errcode='22023';
  end if;

  raise log 'OP_WORKFLOW stage=COMMAND_VALIDATED correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  if exists (
    select 1 from public.project_events
     where correlation_id = v_command_id
       and event_type = v_event
       and user_id = v_actor
       and aggregate_type = 'order'
       and aggregate_id = v_order.id::text
       and payload->>'command' = v_command
  ) then
    raise log 'OP_WORKFLOW stage=RETURNING correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
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

  raise log 'OP_WORKFLOW stage=UPDATING_PRODUCTION correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  update public.production_jobs
     set production_status = v_to,
         actual_machine = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_machine else actual_machine end,
         actual_quantity = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_quantity else actual_quantity end,
         actual_print_hours = case when v_command='needs_reprint' then null else coalesce(v_actual_hours, actual_print_hours) end,
         actual_grams_used = case when v_command='needs_reprint' then null else coalesce(v_actual_grams, actual_grams_used) end,
         scrap_grams = case when v_command='needs_reprint' then null else coalesce(v_scrap_grams, scrap_grams) end,
         actual_filament_breakdown = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_filament_breakdown else actual_filament_breakdown end,
         actual_filaments = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_filaments else actual_filaments end,
         actual_filament_usage = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_filament_usage else actual_filament_usage end,
         roll_usages = case when v_command='needs_reprint' then '[]'::jsonb when v_command='complete_print' then v_roll_usage else roll_usages end,
         completed_at = case when v_command='needs_reprint' then null when v_command='complete_print' then v_now else completed_at end,
         print_started_at = case when v_command='start_print' then coalesce(print_started_at, v_now) when v_command='needs_reprint' then null else print_started_at end,
         job_payload = case
           when v_command='complete_print' then coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now, 'last_completed_attempt', v_attempt, 'production_attempts', coalesce(job_payload->'production_attempts','[]'::jsonb) || jsonb_build_array(v_attempt))
           when v_command='needs_reprint' then coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now, 'current_attempt', jsonb_build_object('created_at', v_now), 'needs_reprint_at', v_now)
           else coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now)
         end,
         updated_at = v_now
   where id = v_job.id and user_id = v_actor
   returning * into v_job;
  raise log 'OP_WORKFLOW stage=PRODUCTION_UPDATED correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  if not found then raise exception 'Production workflow update affected no rows' using errcode='40001'; end if;

  raise log 'OP_WORKFLOW stage=UPDATING_ORDER correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  update public.orders set status = v_to, updated_at = v_now where id = v_order.id and user_id = v_actor returning * into v_order;
  raise log 'OP_WORKFLOW stage=ORDER_UPDATED correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  if not found then raise exception 'Order workflow projection affected no rows' using errcode='40001'; end if;

  raise log 'OP_WORKFLOW stage=UPDATING_TRACKING correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  update public.order_tracking_public
     set status = v_to, public_status_text = public.workflow_public_status_text(v_to), public_next_step = public.workflow_public_next_step(v_to), updated_at = v_now
   where order_number = v_order.order_number and user_id = v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;

  raise log 'OP_WORKFLOW stage=WRITING_RECEIPT correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from',v_from,'to',v_to),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_command_id,p_causation_id,1,jsonb_build_object('command',v_command,'from',v_from,'status',v_to,'production_job_id',v_job.id,'actuals',coalesce(p_payload,'{}'::jsonb)))
  on conflict (correlation_id, event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;

  raise log 'OP_WORKFLOW stage=RECEIPT_WRITTEN correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  raise log 'OP_WORKFLOW stage=RETURNING correlation=% order=% job=%',v_command_id,p_order_number,v_job.id;
  return v_job;
end;
$$;

-- Temporary wrappers for every repository-defined trigger fired by the three
-- workflow writes. Unknown deployed triggers are listed by
-- production_workflow_execution_graph.sql and must be instrumented before use.
create or replace function public.enforce_accepted_order_status()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_correlation text:=current_setting('olipoly.workflow_correlation',true); v_order text:=current_setting('olipoly.workflow_order',true); v_job text:=current_setting('olipoly.workflow_job',true);
begin
  raise log 'OP_WORKFLOW trigger=normalize_status stage=TRIGGER_ENTER correlation=% order=% job=% table=%',v_correlation,v_order,v_job,tg_table_name;
  new.status:=public.normalize_accepted_order_status(new.status);
  raise log 'OP_WORKFLOW trigger=normalize_status stage=TRIGGER_EXIT correlation=% order=% job=% table=%',v_correlation,v_order,v_job,tg_table_name;
  return new;
end $$;

create or replace function public.set_orders_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_correlation text:=current_setting('olipoly.workflow_correlation',true); v_order text:=current_setting('olipoly.workflow_order',true); v_job text:=current_setting('olipoly.workflow_job',true);
begin
  raise log 'OP_WORKFLOW trigger=set_orders_updated_at stage=TRIGGER_ENTER correlation=% order=% job=% table=%',v_correlation,v_order,v_job,tg_table_name;
  new.updated_at:=now();
  raise log 'OP_WORKFLOW trigger=set_orders_updated_at stage=TRIGGER_EXIT correlation=% order=% job=% table=%',v_correlation,v_order,v_job,tg_table_name;
  return new;
end $$;

create or replace function public.sync_order_workflow_to_production()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_correlation text:=current_setting('olipoly.workflow_correlation',true); v_order text:=current_setting('olipoly.workflow_order',true); v_job text:=current_setting('olipoly.workflow_job',true);
begin
  raise log 'OP_WORKFLOW trigger=legacy_order_sync stage=TRIGGER_ENTER correlation=% order=% job=% table=%',v_correlation,v_order,v_job,tg_table_name;
  update public.production_jobs p set production_status=new.status,order_number=new.order_number,
    quote_number=coalesce(p.quote_number,new.source_quote_number),
    job_payload=coalesce(p.job_payload,'{}'::jsonb)||jsonb_build_object('production_status',new.status,'order_number',new.order_number,'quote_number',coalesce(p.quote_number,new.source_quote_number),'updated_at',coalesce(new.updated_at,now())),
    updated_at=coalesce(new.updated_at,now())
  where p.user_id=new.user_id and (p.order_number=new.order_number or (new.source_quote_number is not null and p.quote_number=new.source_quote_number));
  raise log 'OP_WORKFLOW trigger=legacy_order_sync stage=TRIGGER_EXIT correlation=% order=% job=% table=%',v_correlation,v_order,v_job,tg_table_name;
  return new;
end $$;


create or replace function public.workflow_public_status_text(p_status text)
returns text language plpgsql set search_path=public,pg_temp as $$
declare v_result text; v_correlation text:=current_setting('olipoly.workflow_correlation',true); v_order text:=current_setting('olipoly.workflow_order',true); v_job text:=current_setting('olipoly.workflow_job',true);
begin
  raise log 'OP_WORKFLOW helper=workflow_public_status_text stage=HELPER_ENTER correlation=% order=% job=%',v_correlation,v_order,v_job;
  v_result:=case p_status when 'ready_to_print' then 'Your order is ready for production.' when 'printing' then 'Your order is printing.' when 'qc' then 'Your order is in quality control and finishing.' when 'ready_for_fulfillment' then 'Your order is ready for pickup or shipment.' when 'closed' then 'Your order is complete.' else null end;
  raise log 'OP_WORKFLOW helper=workflow_public_status_text stage=HELPER_EXIT correlation=% order=% job=%',v_correlation,v_order,v_job;
  return v_result;
end $$;

create or replace function public.workflow_public_next_step(p_status text)
returns text language plpgsql set search_path=public,pg_temp as $$
declare v_result text; v_correlation text:=current_setting('olipoly.workflow_correlation',true); v_order text:=current_setting('olipoly.workflow_order',true); v_job text:=current_setting('olipoly.workflow_job',true);
begin
  raise log 'OP_WORKFLOW helper=workflow_public_next_step stage=HELPER_ENTER correlation=% order=% job=%',v_correlation,v_order,v_job;
  v_result:=case p_status when 'ready_to_print' then 'Printing will begin when the assigned machine is available.' when 'printing' then 'Quality control and finishing follow printing.' when 'qc' then 'The finished order will be prepared for pickup or shipment.' when 'ready_for_fulfillment' then 'OliPoly 3D will coordinate the final handoff.' when 'closed' then 'No further production action is required.' else null end;
  raise log 'OP_WORKFLOW helper=workflow_public_next_step stage=HELPER_EXIT correlation=% order=% job=%',v_correlation,v_order,v_job;
  return v_result;
end $$;

revoke all on function public.production_workflow_command(text,text,timestamptz,jsonb,text,text) from public,anon;
grant execute on function public.production_workflow_command(text,text,timestamptz,jsonb,text,text) to authenticated,service_role;
revoke all on function public.workflow_public_status_text(text) from public,anon,authenticated;
revoke all on function public.workflow_public_next_step(text) from public,anon,authenticated;
grant execute on function public.workflow_public_status_text(text) to service_role;
grant execute on function public.workflow_public_next_step(text) to service_role;
comment on function public.production_workflow_command(text,text,timestamptz,jsonb,text,text) is 'TEMPORARY server execution trace. Remove by deploying the final non-logging definition after one captured Start Print.';
notify pgrst,'reload schema';
commit;
