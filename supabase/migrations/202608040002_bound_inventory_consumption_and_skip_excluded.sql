-- Bound linked Production attempt Inventory consumption and make Inventory-excluded
-- jobs return promptly if an old/stale client still reaches the consumption RPC.
--
-- consume_production_attempt is an Inventory command only. It does not advance
-- Production/Order lifecycle state; production_workflow_command remains the
-- controlled QC lifecycle authority.

begin;

create or replace function public.consume_production_attempt(
  p_production_job_id uuid,
  p_attempt_id text,
  p_correlation_id text,
  p_expected_updated_at timestamptz,
  p_roll_usages jsonb,
  p_workflow_command text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_order public.orders%rowtype;
  v_attempt jsonb;
  v_command text := lower(btrim(coalesce(p_workflow_command,'')));
  v_command_key text := nullif(btrim(coalesce(p_correlation_id,'')),'');
  v_roll jsonb;
  v_roll_id uuid;
  v_grams numeric;
  v_total numeric := 0;
  v_existing jsonb;
  v_results jsonb := '[]'::jsonb;
  v_tx record;
begin
  perform set_config('lock_timeout','2000ms',true);

  if v_actor is null then raise exception 'Authentication is required for Inventory consumption' using errcode='28000'; end if;
  if p_production_job_id is null or nullif(btrim(coalesce(p_attempt_id,'')),'') is null or v_command_key is null then raise exception 'Production job, attempt identity, and command/correlation identity are required' using errcode='22004'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command not in ('pass_qc','needs_reprint') then raise exception 'Inventory consumption is only permitted at QC Pass or Needs Reprint command boundaries' using errcode='22023'; end if;

  if not pg_try_advisory_xact_lock(hashtextextended(v_command_key, 0)) then
    raise exception 'Production attempt consumption command is already in progress'
      using errcode='55P03', detail='lockScope=inventory_consumption_command';
  end if;

  select jsonb_agg(jsonb_build_object('raw_material_id', raw_material_id, 'quantity_grams', quantity_grams, 'transaction_id', id) order by raw_material_id) into v_existing
  from public.inventory_transactions
  where user_id = v_actor and production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption';
  if v_existing is not null then
    if exists (select 1 from public.inventory_transactions where user_id = v_actor and production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption' and correlation_id is distinct from v_command_key) then raise exception 'Attempt identity is already consumed by another command identity' using errcode='23505'; end if;
    return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', v_command_key, 'idempotent', true, 'inventory_mode', 'included', 'rolls', v_existing);
  end if;
  if exists (select 1 from public.inventory_transactions where correlation_id = v_command_key and (user_id is distinct from v_actor or production_job_id is distinct from p_production_job_id)) then raise exception 'Command identity is already used for another owner, job, roll set, or command' using errcode='23505'; end if;

  begin
    select * into v_job from public.production_jobs where id = p_production_job_id for update nowait;
  exception when lock_not_available then
    raise exception 'Production job is busy while recording attempt consumption'
      using errcode='55P03', detail='lockScope=production_job';
  end;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory consumption' using errcode='23514'; end if;

  begin
    select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update nowait;
  exception when lock_not_available then
    raise exception 'Linked Order is busy while recording attempt consumption'
      using errcode='55P03', detail='lockScope=order';
  end;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;

  select elem into v_attempt from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem where elem->>'id' = p_attempt_id order by elem->>'captured_at' desc nulls last limit 1;
  if v_attempt is null then v_attempt := case when coalesce(v_job.job_payload->'last_completed_attempt'->>'id','') = p_attempt_id then v_job.job_payload->'last_completed_attempt' else null end; end if;
  if v_attempt is null then raise exception 'Authoritative Production attempt evidence was not found' using errcode='23514'; end if;

  if coalesce(v_job.exclude_inventory_reduction,false) then
    return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', v_command_key, 'idempotent', true, 'inventory_mode', 'excluded', 'inventory_skipped', true, 'rolls', '[]'::jsonb);
  end if;

  if jsonb_typeof(p_roll_usages) <> 'array' or jsonb_array_length(p_roll_usages) = 0 then raise exception 'Explicit roll usage lines are required' using errcode='22023'; end if;

  for v_roll in select * from jsonb_array_elements(p_roll_usages) loop
    if nullif(v_roll->>'raw_material_roll_id','') is null then raise exception 'Every roll usage must include raw_material_roll_id' using errcode='22004'; end if;
    v_roll_id := (v_roll->>'raw_material_roll_id')::uuid;
    if coalesce(v_roll->>'grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Roll usage quantities must be finite numbers' using errcode='22023'; end if;
    v_grams := (v_roll->>'grams_used')::numeric;
    if v_grams::text in ('NaN','Infinity','-Infinity') or v_grams <= 0 then raise exception 'Roll usage quantity must be greater than zero and finite' using errcode='22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_roll_usages) d where d->>'raw_material_roll_id' = v_roll_id::text group by d->>'raw_material_roll_id' having count(*) > 1) then raise exception 'Duplicate roll usage lines are not allowed' using errcode='23505'; end if;

    perform 1 from public.production_material_reservations a join public.raw_material_inventory r on r.id = a.raw_material_roll_id and r.user_id = a.user_id where a.user_id = v_actor and a.production_job_id = p_production_job_id and a.raw_material_roll_id = v_roll_id and a.status = 'active' and a.reserved_grams >= v_grams and r.remaining_grams >= v_grams for update;
    if not found then raise exception 'Applicable active reservation is missing, cross-owner, or has insufficient available material' using errcode='23514'; end if;
    update public.raw_material_inventory r set remaining_grams = remaining_grams - v_grams, reserved_grams = greatest(coalesce(r.reserved_grams,0) - a.reserved_grams, 0), updated_at = v_now from public.production_material_reservations a where a.user_id = v_actor and a.production_job_id = p_production_job_id and a.raw_material_roll_id = v_roll_id and a.status = 'active' and r.id = a.raw_material_roll_id and r.user_id = v_actor;
    update public.production_material_reservations set status = 'consumed', consume_command_id = v_command_key, attempt_id = p_attempt_id, consumed_at = v_now, updated_at = v_now where user_id = v_actor and production_job_id = p_production_job_id and raw_material_roll_id = v_roll_id and status = 'active';
    insert into public.inventory_transactions(id,user_id,created_at,occurred_at,transaction_type,type,production_job_id,attempt_id,correlation_id,raw_material_id,quantity_grams,order_number,quote_number,note) values(gen_random_uuid(), v_actor, v_now, v_now, 'production_attempt_consumption', 'raw_usage', p_production_job_id, p_attempt_id, v_command_key, v_roll_id, -v_grams, v_job.order_number, v_job.quote_number, 'Authoritative Production attempt material consumption') returning id, raw_material_id, quantity_grams into v_tx;
    v_results := v_results || jsonb_build_array(jsonb_build_object('raw_material_id', v_tx.raw_material_id, 'quantity_grams', v_tx.quantity_grams, 'transaction_id', v_tx.id)); v_total := v_total + v_grams;
  end loop;
  return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', v_command_key, 'idempotent', false, 'inventory_mode', 'included', 'total_grams', v_total, 'rolls', v_results);
end;
$$;

revoke execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) from public, anon;
grant execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) to authenticated, service_role;
comment on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) is 'Idempotent Inventory-only Production attempt consumption. Uses bounded locks; Inventory-excluded jobs return a skipped result and do not consume material.';
notify pgrst,'reload schema';
commit;
