-- Complete Inventory reconciliation and the QC lifecycle transition in one
-- transaction. This clean definition supersedes the temporary statement trace.
begin;

-- Existing keys already cover command_identity (the receipt primary key), the
-- attempt tuple (its UNIQUE constraint), production_jobs(id), the active
-- reservation lookup, and Inventory ledger idempotency. No duplicate index is
-- added by this repair.

create or replace function public.consume_production_attempt(
  p_production_job_id uuid, p_attempt_id text, p_correlation_id text,
  p_expected_updated_at timestamptz, p_roll_usages jsonb, p_workflow_command text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_order public.orders%rowtype;
  v_reservation public.production_material_reservations%rowtype;
  v_roll public.raw_material_inventory%rowtype;
  v_attempt jsonb;
  v_attempts jsonb;
  v_command text := lower(btrim(coalesce(p_workflow_command,'')));
  v_key text := nullif(btrim(coalesce(p_correlation_id,'')),'');
  v_target text;
  v_event text;
  v_usage record;
  v_total numeric := 0;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_receipt public.production_attempt_consumption_receipts%rowtype;
  v_tx record;
begin
  perform set_config('lock_timeout','2000ms',true);
  if v_actor is null then raise exception 'Authentication is required for Inventory consumption' using errcode='28000'; end if;
  if p_production_job_id is null or nullif(btrim(coalesce(p_attempt_id,'')),'') is null or v_key is null or p_expected_updated_at is null then
    raise exception 'Production job, attempt identity, command identity, and expected_updated_at are required' using errcode='22004';
  end if;
  if v_command not in ('pass_qc','needs_reprint') then
    raise exception 'Inventory consumption is only permitted at QC Pass or Needs Reprint command boundaries' using errcode='22023';
  end if;
  v_target := case v_command when 'pass_qc' then 'ready_for_fulfillment' else 'ready_to_print' end;
  v_event := case v_command when 'pass_qc' then 'order.qc_passed' else 'order.needs_reprint' end;

  if not pg_try_advisory_xact_lock(hashtextextended('inventory-consumption:'||v_key,0)) then
    raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=command';
  end if;
  select * into v_receipt from public.production_attempt_consumption_receipts where command_identity=v_key;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.production_job_id is distinct from p_production_job_id or v_receipt.attempt_id is distinct from p_attempt_id then
      raise exception 'Command identity is already used for another attempt' using errcode='23505';
    end if;
    return v_receipt.result_snapshot || jsonb_build_object('idempotent',true);
  end if;
  if exists(select 1 from public.production_attempt_consumption_receipts where owner_id=v_actor and production_job_id=p_production_job_id and attempt_id=p_attempt_id) then
    raise exception 'Attempt identity is already consumed by another command identity' using errcode='23505';
  end if;

  -- Read identity without locking, then use the same Order -> Production lock
  -- order as production_workflow_command. NOWAIT plus lock_timeout prevents a
  -- browser request from waiting behind an unrelated operator transaction.
  select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor;
  if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  begin
    select * into v_order from public.orders where user_id=v_actor and order_number=v_job.order_number for update nowait;
    select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
  exception when lock_not_available then
    raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=order_production';
  end;
  if not found or v_order.id is null then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'This Production job changed after the page loaded. Refresh before retrying.' using errcode='PT409',detail='appCode=40001 conflictScope=production_row';
  end if;
  if v_job.production_status <> 'qc' or v_order.status <> 'qc' then raise exception 'QC command requires qc' using errcode='22023'; end if;

  select elem into v_attempt from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem
   where elem->>'id'=p_attempt_id order by elem->>'captured_at' desc nulls last limit 1;
  if v_attempt is null and coalesce(v_job.job_payload->'last_completed_attempt'->>'id','')=p_attempt_id then v_attempt:=v_job.job_payload->'last_completed_attempt'; end if;
  if v_attempt is null then raise exception 'Authoritative Production attempt evidence was not found' using errcode='23514'; end if;

  if coalesce(v_job.exclude_inventory_reduction,false) then
    v_result:=jsonb_build_object('production_job_id',p_production_job_id,'attempt_id',p_attempt_id,'correlation_id',v_key,'idempotent',false,'inventory_mode','excluded','inventory_skipped',true,'rolls','[]'::jsonb);
  else
    if jsonb_typeof(p_roll_usages)<>'array' or jsonb_array_length(p_roll_usages)=0 then raise exception 'Record actual material usage before passing QC.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_roll_usages) u where nullif(u->>'raw_material_roll_id','') is null or coalesce(u->>'grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' or (u->>'grams_used')::numeric<=0) then raise exception 'Every roll usage requires a roll and positive finite grams' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_roll_usages) u group by u->>'raw_material_roll_id' having count(*)>1) then raise exception 'Duplicate roll usage lines are not allowed' using errcode='23505'; end if;

    for v_usage in select (u->>'raw_material_roll_id')::uuid roll_id,(u->>'grams_used')::numeric grams from jsonb_array_elements(p_roll_usages) u order by 1 loop
      begin
        select * into v_reservation from public.production_material_reservations
         where user_id=v_actor and production_job_id=p_production_job_id and raw_material_roll_id=v_usage.roll_id and status='active'
         for update nowait;
        select * into v_roll from public.raw_material_inventory
         where id=v_usage.roll_id and user_id=v_actor for update nowait;
      exception when lock_not_available then
        raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=reservation_roll';
      end;
      if v_reservation.id is null or v_roll.id is null or v_reservation.reserved_grams < v_usage.grams or v_roll.remaining_grams < v_usage.grams then
        raise exception 'Applicable active reservation is missing, cross-owner, or has insufficient available material' using errcode='23514';
      end if;
      update public.raw_material_inventory
         set remaining_grams=remaining_grams-v_usage.grams,
             reserved_grams=greatest(coalesce(reserved_grams,0)-v_reservation.reserved_grams,0), updated_at=v_now
       where id=v_roll.id and user_id=v_actor;
      update public.production_material_reservations
         set status='consumed',consume_command_id=v_key,attempt_id=p_attempt_id,consumed_at=v_now,updated_at=v_now
       where id=v_reservation.id and user_id=v_actor;
      insert into public.inventory_transactions(id,user_id,created_at,occurred_at,transaction_type,type,production_job_id,attempt_id,correlation_id,raw_material_id,quantity_grams,order_number,quote_number,note)
      values(gen_random_uuid(),v_actor,v_now,v_now,'production_attempt_consumption','raw_usage',p_production_job_id,p_attempt_id,v_key,v_roll.id,-v_usage.grams,v_job.order_number,v_job.quote_number,'Authoritative Production attempt material consumption')
      returning id,raw_material_id,quantity_grams into v_tx;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('raw_material_id',v_tx.raw_material_id,'quantity_grams',v_tx.quantity_grams,'transaction_id',v_tx.id));
      v_total:=v_total+v_usage.grams;
    end loop;
    v_result:=jsonb_build_object('production_job_id',p_production_job_id,'attempt_id',p_attempt_id,'correlation_id',v_key,'idempotent',false,'inventory_mode','included','total_grams',v_total,'rolls',v_results);
  end if;

  select coalesce(jsonb_agg(case when elem->>'id'=p_attempt_id then elem||jsonb_build_object('consumed_at',v_now,'consumption_correlation_id',v_key) else elem end),'[]'::jsonb)
    into v_attempts from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem;
  update public.production_jobs
     set production_status=v_target,
         job_payload=coalesce(job_payload,'{}'::jsonb)||jsonb_build_object('production_status',v_target,'updated_at',v_now,'production_attempts',v_attempts,'last_completed_attempt',v_attempt||jsonb_build_object('consumed_at',v_now,'consumption_correlation_id',v_key)),
         updated_at=v_now
   where id=v_job.id and user_id=v_actor returning * into v_job;
  update public.orders set status=v_target,updated_at=v_now where id=v_order.id and user_id=v_actor returning * into v_order;
  update public.order_tracking_public set status=v_target,public_status_text=public.workflow_public_status_text(v_target),public_next_step=public.workflow_public_next_step(v_target),updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from','qc','to',v_target),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_key,null,1,jsonb_build_object('command',v_command,'from','qc','status',v_target,'production_job_id',v_job.id))
  on conflict (correlation_id,event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;

  v_result:=v_result||jsonb_build_object('production_job',to_jsonb(v_job),'order_status',v_order.status,'lifecycle_completed',true);
  insert into public.production_attempt_consumption_receipts(command_identity,owner_id,production_job_id,attempt_id,inventory_mode,result_snapshot,created_at)
  values(v_key,v_actor,p_production_job_id,p_attempt_id,v_result->>'inventory_mode',v_result,v_now);
  return v_result;
exception when lock_not_available then
  raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=bounded_statement';
end; $$;

revoke all on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) from public,anon;
grant execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) to authenticated,service_role;
comment on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) is 'Atomic, idempotent Production attempt consumption and QC lifecycle authority with bounded contention.';
notify pgrst,'reload schema';
commit;
