-- Explicit legacy Production classification and record-class-aware lifecycle compatibility.
-- Deploy through the reviewed Supabase migration process; this migration does not classify
-- or mutate any existing Production row automatically.
begin;

alter table public.production_jobs add column if not exists production_source_type text;
alter table public.production_jobs drop constraint if exists production_jobs_source_type_check;
alter table public.production_jobs add constraint production_jobs_source_type_check
  check (production_source_type is null or production_source_type in ('legacy_repaired','legacy_standalone'));
comment on column public.production_jobs.production_source_type is
  'Explicit compatibility marker. NULL remains strict modern/investigation; standalone is never inferred from a missing Order.';

create or replace view public.production_legacy_classification_report with (security_invoker=true) as
with evidence as (
 select p.*,
   nullif(btrim(p.job_payload->>'quote_number'),'') payload_quote_number,
   nullif(btrim(p.job_payload->>'order_number'),'') payload_order_number,
   nullif(btrim(p.job_payload->>'order_id'),'') payload_order_id,
   (select count(*) from public.quotes q where q.user_id=p.user_id and q.quote_number=coalesce(p.quote_number,nullif(btrim(p.job_payload->>'quote_number'),''))) matching_quote_count,
   (select count(*) from public.orders o where o.source_quote_number=coalesce(p.quote_number,nullif(btrim(p.job_payload->>'quote_number'),'')) or o.order_number=coalesce(p.order_number,nullif(btrim(p.job_payload->>'order_number'),'')) or o.id::text=nullif(btrim(p.job_payload->>'order_id'),'')) matching_order_count
 from public.production_jobs p
), candidates as (
 select e.*,o.id candidate_order_id,o.order_number candidate_order_number,o.source_quote_number candidate_source_quote_number,
        (o.user_id=e.user_id) same_owner_result
 from evidence e left join lateral (
   select x.* from public.orders x
   where x.source_quote_number=coalesce(e.quote_number,e.payload_quote_number)
      or x.order_number=coalesce(e.order_number,e.payload_order_number)
      or x.id::text=e.payload_order_id
   order by x.created_at,x.id limit 1
 ) o on e.matching_order_count=1
), classified as (
 select c.*,
   (c.quote_number is not null or c.order_number is not null or c.payload_quote_number is not null or c.payload_order_number is not null or c.payload_order_id is not null
     or exists(select 1 from public.production_linkage_audit a where a.production_job_id=c.id and a.event_type in ('production_quote_linked','production_order_linked'))
   ) modern_provenance,
   case
    when c.production_source_type='legacy_standalone' then 'LEGACY_STANDALONE'
    when c.production_source_type='legacy_repaired' then 'MODERN_LINKED'
    when c.matching_order_count>1 then 'AMBIGUOUS'
    when c.order_number is not null and c.matching_order_count=1 and c.same_owner_result then 'MODERN_LINKED'
    when c.created_at < timestamptz '2026-08-03 00:00:00+00' and c.matching_order_count=1 and c.same_owner_result and coalesce(c.quote_number,c.payload_quote_number) is not null then 'LEGACY_REPAIRABLE'
    when c.quote_number is not null or c.order_number is not null or c.payload_quote_number is not null or c.payload_order_number is not null or c.payload_order_id is not null
      or exists(select 1 from public.production_linkage_audit a where a.production_job_id=c.id and a.event_type in ('production_quote_linked','production_order_linked')) then 'MODERN_LINKED'
    when c.created_at < timestamptz '2026-08-03 00:00:00+00' and c.matching_order_count=0 then 'LEGACY_STANDALONE'
    else 'AMBIGUOUS' end classification
 from candidates c
)
select id production_job_id,job_title title,user_id owner,created_at,production_status,quote_number,order_number,
 payload_quote_number,payload_order_number,payload_order_id,matching_quote_count,matching_order_count,
 candidate_order_id,candidate_order_number,candidate_source_quote_number,same_owner_result,
 jsonb_build_object('identity_fields',modern_provenance,'source_type',production_source_type,
   'linkage_audit',exists(select 1 from public.production_linkage_audit a where a.production_job_id=classified.id)) modern_provenance_markers,
 classification,
 (classification='LEGACY_REPAIRABLE' and matching_order_count=1 and same_owner_result and candidate_source_quote_number is not null) safe_repair_eligibility,
 case when classification='AMBIGUOUS' then 'Modern cutoff/provenance is inconclusive or linkage has multiple candidates'
      when classification='MODERN_LINKED' and matching_order_count<>1 then 'Modern provenance requires exactly one linked Order'
      when classification='LEGACY_STANDALONE' and production_source_type is null then 'Operator approval required before standalone workflow is enabled'
      when classification='LEGACY_REPAIRABLE' and not same_owner_result then 'Cross-owner candidate rejected' else null end exclusion_rejection_reason
from classified;
revoke all on public.production_legacy_classification_report from public,anon;
grant select on public.production_legacy_classification_report to authenticated,service_role;

create or replace function public.approve_legacy_standalone_production(p_production_job_id uuid,p_expected_updated_at timestamptz,p_command_identity text)
returns public.production_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_job public.production_jobs%rowtype; v_report record;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if nullif(btrim(coalesce(p_command_identity,'')),'') is null then raise exception 'Operator approval identity is required' using errcode='22004'; end if;
 select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update;
 if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
 if v_job.production_source_type='legacy_standalone' then return v_job; end if;
 if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production job changed; refresh before approval' using errcode='PT409'; end if;
 select * into v_report from public.production_legacy_classification_report where production_job_id=v_job.id;
 if v_report.classification<>'LEGACY_STANDALONE' or v_report.matching_order_count<>0 or v_report.modern_provenance_markers->>'identity_fields'<>'false' then
   raise exception 'Standalone classification rejected: modern, repairable, conflicting, or ambiguous provenance exists' using errcode='23514';
 end if;
 update public.production_jobs set production_source_type='legacy_standalone',updated_at=now() where id=v_job.id returning * into v_job;
 insert into public.production_linkage_audit(user_id,production_job_id,command_identity,event_type,from_status,to_status,evidence)
 values(v_actor,v_job.id,p_command_identity,'legacy_standalone_approved',v_job.production_status,v_job.production_status,jsonb_build_object('approved_without_order',true))
 on conflict(command_identity) do nothing;
 return v_job;
end $$;

alter table public.production_linkage_audit drop constraint if exists production_linkage_audit_event_type_check;
alter table public.production_linkage_audit add constraint production_linkage_audit_event_type_check check(event_type in ('production_quote_linked','production_order_linked','legacy_linkage_repaired','legacy_standalone_approved'));

create or replace function public.repair_production_quote_order_linkage(p_production_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_job public.production_jobs%rowtype; v_quote public.quotes%rowtype; v_order public.orders%rowtype; v_count int; v_identity text;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update;
 if not found then raise exception 'Production job not found or access denied' using errcode='42501'; end if;
 if v_job.production_source_type='legacy_standalone' then raise exception 'Standalone approval conflicts with linkage repair' using errcode='23514'; end if;
 v_identity:=coalesce(v_job.quote_number,nullif(btrim(v_job.job_payload->>'quote_number'),''));
 if v_identity is null or (v_job.quote_number is not null and nullif(btrim(v_job.job_payload->>'quote_number'),'') is not null and v_job.quote_number is distinct from nullif(btrim(v_job.job_payload->>'quote_number'),'')) then raise exception 'Unique Quote provenance is required' using errcode='23514'; end if;
 select count(*) into v_count from public.quotes where user_id=v_actor and quote_number=v_identity;
 if v_count<>1 then raise exception 'Expected exactly one same-owner Quote; found %',v_count using errcode='23514'; end if;
 select * into v_quote from public.quotes where user_id=v_actor and quote_number=v_identity for update;
 if v_quote.production_job_id is not null and v_quote.production_job_id<>v_job.id then raise exception 'Quote has conflicting Production provenance' using errcode='23514'; end if;
 select count(*) into v_count from public.orders where source_quote_number=v_identity;
 if v_count<>1 then raise exception 'Expected exactly one Order candidate; found %',v_count using errcode='23514'; end if;
 select * into v_order from public.orders where source_quote_number=v_identity for update;
 if v_order.user_id<>v_actor then raise exception 'Order candidate owner mismatch' using errcode='42501'; end if;
 if v_order.created_from_quote is not true or v_order.source_type is distinct from 'quote' then raise exception 'Order candidate is not Quote-created' using errcode='23514'; end if;
 if v_job.order_number is not null and v_job.order_number<>v_order.order_number then raise exception 'Production job has conflicting Order identity' using errcode='23514'; end if;
 if nullif(v_job.job_payload->>'order_number','') is not null and v_job.job_payload->>'order_number'<>v_order.order_number then raise exception 'Payload has conflicting Order identity' using errcode='23514'; end if;
 if nullif(v_job.job_payload->>'order_id','') is not null and v_job.job_payload->>'order_id'<>v_order.id::text then raise exception 'Payload has conflicting Order ID' using errcode='23514'; end if;
 update public.quotes set production_job_id=v_job.id where id=v_quote.id and production_job_id is null;
 update public.production_jobs set quote_number=coalesce(quote_number,v_identity),order_number=v_order.order_number,production_source_type='legacy_repaired',
   job_payload=coalesce(job_payload,'{}')||jsonb_build_object('quote_number',v_identity,'order_number',v_order.order_number,'order_id',v_order.id),updated_at=now()
 where id=v_job.id returning * into v_job;
 insert into public.production_linkage_audit(user_id,production_job_id,quote_id,order_id,command_identity,event_type,from_status,to_status,evidence)
 values(v_actor,v_job.id,v_quote.id,v_order.id,'legacy-repair:'||v_job.id||':'||v_order.id,'legacy_linkage_repaired',v_job.production_status,v_job.production_status,jsonb_build_object('quote_number',v_identity,'order_number',v_order.order_number)) on conflict(command_identity) do nothing;
 return jsonb_build_object('outcome','linked','production_job',to_jsonb(v_job),'order_id',v_order.id,'idempotent',v_job.production_source_type='legacy_repaired');
end $$;
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
  v_is_standalone boolean := false;
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
  v_is_standalone := v_job.production_source_type='legacy_standalone';
  begin
    if v_is_standalone then
      if v_job.order_number is not null then raise exception 'Standalone Production cannot contain Order identity' using errcode='23514'; end if;
      select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
    else
      if v_job.order_number is null then raise exception 'Accepted linked Order not found for modern Production job' using errcode='23514'; end if;
      select * into v_order from public.orders where user_id=v_actor and order_number=v_job.order_number for update nowait;
      if not found then raise exception 'Accepted linked Order not found for modern Production job' using errcode='23514'; end if;
      select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
      if v_order.source_quote_number is distinct from coalesce(v_job.quote_number,nullif(v_job.job_payload->>'quote_number',''))
         or nullif(v_job.job_payload->>'order_number','') is not null and v_job.job_payload->>'order_number' is distinct from v_order.order_number
         or nullif(v_job.job_payload->>'order_id','') is not null and v_job.job_payload->>'order_id' is distinct from v_order.id::text then
        raise exception 'Modern Production Quote/Order provenance mismatch' using errcode='23514';
      end if;
    end if;
  exception when lock_not_available then
    raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=order_production';
  end;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'This Production job changed after the page loaded. Refresh before retrying.' using errcode='PT409',detail='appCode=40001 conflictScope=production_row';
  end if;
  if v_job.production_status <> 'qc' or (not v_is_standalone and v_order.status <> 'qc') then raise exception 'QC command requires qc' using errcode='22023'; end if;

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
  if not v_is_standalone then
    update public.orders set status=v_target,updated_at=v_now where id=v_order.id and user_id=v_actor returning * into v_order;
    if not found then raise exception 'Order workflow projection affected no rows' using errcode='40001'; end if;
    update public.order_tracking_public set status=v_target,public_status_text=public.workflow_public_status_text(v_target),public_next_step=public.workflow_public_next_step(v_target),updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
    if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;
    insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
    values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from','qc','to',v_target),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_key,null,1,jsonb_build_object('command',v_command,'from','qc','status',v_target,'production_job_id',v_job.id))
    on conflict (correlation_id,event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;
  end if;

  v_result:=v_result||jsonb_build_object('production_job',to_jsonb(v_job),'record_class',case when v_is_standalone then 'LEGACY_STANDALONE' else 'MODERN_LINKED' end,'order_status',case when v_is_standalone then null else v_order.status end,'lifecycle_completed',true);
  insert into public.production_attempt_consumption_receipts(command_identity,owner_id,production_job_id,attempt_id,inventory_mode,result_snapshot,created_at)
  values(v_key,v_actor,p_production_job_id,p_attempt_id,v_result->>'inventory_mode',v_result,v_now);
  return v_result;
exception when lock_not_available then
  raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=bounded_statement';
end; $$;

revoke all on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) from public,anon;
grant execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) to authenticated,service_role;
comment on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) is 'Atomic, idempotent Production attempt consumption and QC lifecycle authority with bounded contention.';

create or replace function public.production_workflow_command(
 p_production_job_id uuid,p_command text,p_expected_updated_at timestamptz,p_payload jsonb default '{}'::jsonb,
 p_correlation_id text default null,p_causation_id text default null
) returns public.production_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_job public.production_jobs%rowtype; v_receipt public.workflow_command_receipts%rowtype;
 v_now timestamptz:=now(); v_from text; v_to text; v_command text:=lower(btrim(coalesce(p_command,''))); v_key text:=nullif(btrim(coalesce(p_correlation_id,'')),''); v_attempt jsonb;
begin
 perform set_config('lock_timeout','2000ms',true);
 if v_actor is null then raise exception 'Authentication is required for Production workflow commands' using errcode='28000'; end if;
 if p_expected_updated_at is null or v_key is null then raise exception 'expected_updated_at and command identity are required' using errcode='22004'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended(v_key,0)) then raise exception 'Production workflow command identity is already in progress' using errcode='55P03'; end if;
 select * into v_receipt from public.workflow_command_receipts where command_identity=v_key;
 if found then
   if v_receipt.owner_id<>v_actor or v_receipt.production_job_id<>p_production_job_id or v_receipt.command<>v_command then raise exception 'Command identity is already used for another workflow command' using errcode='23505'; end if;
   select * into v_job from jsonb_populate_record(null::public.production_jobs,v_receipt.result_snapshot); return v_job;
 end if;
 begin select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
 exception when lock_not_available then raise exception 'Production workflow job is already in progress' using errcode='55P03'; end;
 if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
 if v_job.production_source_type<>'legacy_standalone' or v_job.order_number is not null then raise exception 'Job-scoped workflow is restricted to explicitly approved standalone legacy Production' using errcode='23514'; end if;
 if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production workflow changed since this page loaded; refresh before retrying' using errcode='PT409',detail='appCode=40001 conflictScope=production_row'; end if;
 v_from:=v_job.production_status;
 if v_command='start_print' and v_from='ready_to_print' then v_to:='printing';
 elsif v_command='complete_print' and v_from='printing' then
   v_to:='qc';
   if coalesce(p_payload->>'actual_machine','')='' or coalesce(p_payload->>'actual_grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' or coalesce(p_payload->>'actual_print_hours','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Complete Print requires authoritative actuals' using errcode='22023'; end if;
   v_attempt:=coalesce(p_payload->'production_attempt',jsonb_build_object('id','attempt-'||v_job.id||'-'||extract(epoch from v_now),'captured_at',v_now,'actual_grams_used',p_payload->'actual_grams_used','scrap_grams',coalesce(p_payload->'scrap_grams','0'::jsonb),'actual_print_hours',p_payload->'actual_print_hours','actual_machine',p_payload->>'actual_machine','actual_quantity',p_payload->'actual_quantity','roll_usages',coalesce(p_payload->'roll_usages','[]')));
 elsif v_command='close' and v_from='ready_for_fulfillment' then v_to:='closed';
 else raise exception 'Invalid standalone Production transition from % using %',v_from,v_command using errcode='22023'; end if;
 update public.production_jobs set production_status=v_to,
  print_started_at=case when v_command='start_print' then coalesce(print_started_at,v_now) else print_started_at end,
  completed_at=case when v_command='complete_print' then v_now else completed_at end,
  actual_machine=case when v_command='complete_print' then p_payload->>'actual_machine' else actual_machine end,
  actual_quantity=case when v_command='complete_print' then nullif(p_payload->>'actual_quantity','')::numeric else actual_quantity end,
  actual_print_hours=case when v_command='complete_print' then (p_payload->>'actual_print_hours')::numeric else actual_print_hours end,
  actual_grams_used=case when v_command='complete_print' then (p_payload->>'actual_grams_used')::numeric else actual_grams_used end,
  scrap_grams=case when v_command='complete_print' then coalesce(nullif(p_payload->>'scrap_grams','')::numeric,0) else scrap_grams end,
  roll_usages=case when v_command='complete_print' then coalesce(p_payload->'roll_usages','[]') else roll_usages end,
  job_payload=coalesce(job_payload,'{}')||jsonb_build_object('production_status',v_to,'updated_at',v_now)||case when v_command='complete_print' then jsonb_build_object('last_completed_attempt',v_attempt,'production_attempts',coalesce(job_payload->'production_attempts','[]')||jsonb_build_array(v_attempt)) else '{}'::jsonb end,
  updated_at=v_now where id=v_job.id and user_id=v_actor returning * into v_job;
 insert into public.workflow_command_receipts(command_identity,owner_id,production_job_id,command,from_state,to_state,resulting_updated_at,result_snapshot,created_at)
 values(v_key,v_actor,v_job.id,v_command,v_from,v_to,v_job.updated_at,to_jsonb(v_job),v_now);
 return v_job;
end $$;

revoke all on function public.production_workflow_command(uuid,text,timestamptz,jsonb,text,text) from public,anon;
grant execute on function public.production_workflow_command(uuid,text,timestamptz,jsonb,text,text) to authenticated,service_role;
revoke all on function public.approve_legacy_standalone_production(uuid,timestamptz,text) from public,anon;
grant execute on function public.approve_legacy_standalone_production(uuid,timestamptz,text) to authenticated,service_role;
revoke all on function public.repair_production_quote_order_linkage(uuid) from public,anon;
grant execute on function public.repair_production_quote_order_linkage(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
