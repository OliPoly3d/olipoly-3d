-- Keep attempt consumption out of the Order/workflow lock graph and make every
-- possible contention point fail before the API gateway timeout.
begin;

create table if not exists public.production_attempt_consumption_receipts (
  command_identity text primary key,
  owner_id uuid not null,
  production_job_id uuid not null,
  attempt_id text not null,
  inventory_mode text not null check (inventory_mode in ('included','excluded')),
  result_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, production_job_id, attempt_id)
);
alter table public.production_attempt_consumption_receipts enable row level security;
revoke all on public.production_attempt_consumption_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.production_attempt_consumption_receipts to service_role;
drop policy if exists production_attempt_consumption_receipts_service_all on public.production_attempt_consumption_receipts;
create policy production_attempt_consumption_receipts_service_all on public.production_attempt_consumption_receipts for all to service_role using (true) with check (true);

create or replace function public.consume_production_attempt(
  p_production_job_id uuid, p_attempt_id text, p_correlation_id text,
  p_expected_updated_at timestamptz, p_roll_usages jsonb, p_workflow_command text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_now timestamptz:=now(); v_job public.production_jobs%rowtype;
  v_attempt jsonb; v_command text:=lower(btrim(coalesce(p_workflow_command,'')));
  v_key text:=nullif(btrim(coalesce(p_correlation_id,'')),''); v_usage record;
  v_total numeric:=0; v_results jsonb:='[]'::jsonb; v_result jsonb; v_receipt record; v_tx record;
begin
  perform set_config('lock_timeout','2000ms',true);
  if v_actor is null then raise exception 'Authentication is required for Inventory consumption' using errcode='28000'; end if;
  if p_production_job_id is null or nullif(btrim(coalesce(p_attempt_id,'')),'') is null or v_key is null or p_expected_updated_at is null then raise exception 'Production job, attempt identity, command identity, and expected_updated_at are required' using errcode='22004'; end if;
  if v_command not in ('pass_qc','needs_reprint') then raise exception 'Inventory consumption is only permitted at QC Pass or Needs Reprint command boundaries' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('inventory-consumption:'||v_key,0)) then raise exception 'Production attempt consumption command is already in progress' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=command'; end if;

  select * into v_receipt from public.production_attempt_consumption_receipts where command_identity=v_key;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.production_job_id is distinct from p_production_job_id or v_receipt.attempt_id is distinct from p_attempt_id then raise exception 'Command identity is already used for another attempt' using errcode='23505'; end if;
    return v_receipt.result_snapshot || jsonb_build_object('idempotent',true);
  end if;
  if exists(select 1 from public.production_attempt_consumption_receipts where owner_id=v_actor and production_job_id=p_production_job_id and attempt_id=p_attempt_id) then raise exception 'Attempt identity is already consumed by another command identity' using errcode='23505'; end if;

  begin select * into v_job from public.production_jobs where id=p_production_job_id for update nowait;
  exception when lock_not_available then raise exception 'Production job is busy while recording attempt consumption' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=production_job'; end;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.order_number is null or not exists(select 1 from public.orders where user_id=v_actor and order_number=v_job.order_number) then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;
  select elem into v_attempt from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem where elem->>'id'=p_attempt_id order by elem->>'captured_at' desc nulls last limit 1;
  if v_attempt is null and coalesce(v_job.job_payload->'last_completed_attempt'->>'id','')=p_attempt_id then v_attempt:=v_job.job_payload->'last_completed_attempt'; end if;
  if v_attempt is null then raise exception 'Authoritative Production attempt evidence was not found' using errcode='23514'; end if;

  if coalesce(v_job.exclude_inventory_reduction,false) then
    v_result:=jsonb_build_object('production_job_id',p_production_job_id,'attempt_id',p_attempt_id,'correlation_id',v_key,'idempotent',false,'inventory_mode','excluded','inventory_skipped',true,'rolls','[]'::jsonb);
  else
    if jsonb_typeof(p_roll_usages)<>'array' or jsonb_array_length(p_roll_usages)=0 then raise exception 'Explicit roll usage lines are required' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_roll_usages) u where nullif(u->>'raw_material_roll_id','') is null or coalesce(u->>'grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' or (u->>'grams_used')::numeric<=0) then raise exception 'Every roll usage requires a roll and positive finite grams' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_roll_usages) u group by u->>'raw_material_roll_id' having count(*)>1) then raise exception 'Duplicate roll usage lines are not allowed' using errcode='23505'; end if;
    -- Canonical lock order: job, then reservation/roll pairs by roll UUID. Orders are read only.
    for v_usage in select (u->>'raw_material_roll_id')::uuid roll_id,(u->>'grams_used')::numeric grams from jsonb_array_elements(p_roll_usages) u order by 1 loop
      begin
        perform 1 from public.production_material_reservations a join public.raw_material_inventory r on r.id=a.raw_material_roll_id and r.user_id=a.user_id where a.user_id=v_actor and a.production_job_id=p_production_job_id and a.raw_material_roll_id=v_usage.roll_id and a.status='active' and a.reserved_grams>=v_usage.grams and r.remaining_grams>=v_usage.grams for update of a,r nowait;
      exception when lock_not_available then raise exception 'Inventory is busy while recording attempt consumption' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=reservation_roll'; end;
      if not found then raise exception 'Applicable active reservation is missing, cross-owner, or has insufficient available material' using errcode='23514'; end if;
      update public.raw_material_inventory set remaining_grams=remaining_grams-v_usage.grams,reserved_grams=greatest(coalesce(reserved_grams,0)-(select reserved_grams from public.production_material_reservations where user_id=v_actor and production_job_id=p_production_job_id and raw_material_roll_id=v_usage.roll_id and status='active'),0),updated_at=v_now where id=v_usage.roll_id and user_id=v_actor;
      update public.production_material_reservations set status='consumed',consume_command_id=v_key,attempt_id=p_attempt_id,consumed_at=v_now,updated_at=v_now where user_id=v_actor and production_job_id=p_production_job_id and raw_material_roll_id=v_usage.roll_id and status='active';
      insert into public.inventory_transactions(id,user_id,created_at,occurred_at,transaction_type,type,production_job_id,attempt_id,correlation_id,raw_material_id,quantity_grams,order_number,quote_number,note) values(gen_random_uuid(),v_actor,v_now,v_now,'production_attempt_consumption','raw_usage',p_production_job_id,p_attempt_id,v_key,v_usage.roll_id,-v_usage.grams,v_job.order_number,v_job.quote_number,'Authoritative Production attempt material consumption') returning id,raw_material_id,quantity_grams into v_tx;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('raw_material_id',v_tx.raw_material_id,'quantity_grams',v_tx.quantity_grams,'transaction_id',v_tx.id)); v_total:=v_total+v_usage.grams;
    end loop;
    v_result:=jsonb_build_object('production_job_id',p_production_job_id,'attempt_id',p_attempt_id,'correlation_id',v_key,'idempotent',false,'inventory_mode','included','total_grams',v_total,'rolls',v_results);
  end if;
  insert into public.production_attempt_consumption_receipts(command_identity,owner_id,production_job_id,attempt_id,inventory_mode,result_snapshot,created_at) values(v_key,v_actor,p_production_job_id,p_attempt_id,v_result->>'inventory_mode',v_result,v_now);
  return v_result;
exception when lock_not_available then raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=bounded_statement';
end; $$;

revoke execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) from public,anon;
grant execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) to authenticated,service_role;
comment on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) is 'Inventory-only attempt consumption with one durable receipt, canonical locks, prompt 55P03 contention, and idempotent replay.';
notify pgrst,'reload schema';
commit;
