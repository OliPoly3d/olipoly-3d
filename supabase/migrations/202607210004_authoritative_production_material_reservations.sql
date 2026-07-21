-- Inventory corrective milestone: durable, owner-scoped raw-material reservations for linked Production work.
-- Forward-only migration after 202607210003_reconcile_authoritative_inventory_consumption_repair.sql.
-- Historical unlinked inventory_transactions rows remain untouched and are not reinterpreted.

create table if not exists public.production_material_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  production_job_id uuid not null references public.production_jobs(id) on delete restrict,
  order_number text not null,
  raw_material_roll_id uuid not null references public.raw_material_inventory(id) on delete restrict,
  reserved_grams numeric not null check (reserved_grams > 0 and reserved_grams::text not in ('NaN','Infinity','-Infinity')),
  status text not null check (status in ('active','released','consumed')),
  reservation_command_id text not null,
  release_command_id text,
  consume_command_id text,
  attempt_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  constraint production_material_reservations_terminal_timestamp check (
    (status = 'active' and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
    or (status = 'released' and released_at is not null and consumed_at is null)
  )
);

create unique index if not exists production_material_reservations_active_job_roll_once
  on public.production_material_reservations (user_id, production_job_id, raw_material_roll_id)
  where status = 'active';

create unique index if not exists production_material_reservations_reserve_command_roll_once
  on public.production_material_reservations (user_id, reservation_command_id, raw_material_roll_id);

create unique index if not exists production_material_reservations_release_command_roll_once
  on public.production_material_reservations (user_id, release_command_id, raw_material_roll_id)
  where release_command_id is not null;

create unique index if not exists production_material_reservations_consume_attempt_roll_once
  on public.production_material_reservations (user_id, production_job_id, attempt_id, raw_material_roll_id)
  where status = 'consumed' and attempt_id is not null;

alter table public.production_material_reservations enable row level security;

drop policy if exists production_material_reservations_owner_select on public.production_material_reservations;
create policy production_material_reservations_owner_select
  on public.production_material_reservations for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists production_material_reservations_service_all on public.production_material_reservations;
create policy production_material_reservations_service_all
  on public.production_material_reservations for all
  to service_role
  using (true)
  with check (true);

revoke all on public.production_material_reservations from public, anon, authenticated;
grant select on public.production_material_reservations to authenticated;
grant select, insert, update, delete on public.production_material_reservations to service_role;

create or replace function public.reserve_production_material(
  p_production_job_id uuid,
  p_expected_updated_at timestamptz,
  p_reservation_command_id text,
  p_roll_reservations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid(); v_now timestamptz := now(); v_job public.production_jobs%rowtype; v_order public.orders%rowtype;
  v_line jsonb; v_roll_id uuid; v_grams numeric; v_existing jsonb; v_results jsonb := '[]'::jsonb; v_reserved_total numeric := 0;
begin
  if v_actor is null then raise exception 'Authentication is required for Inventory reservation' using errcode='28000'; end if;
  if p_production_job_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_reservation_command_id,'')),'') is null then raise exception 'Production job, optimistic concurrency, and command identity are required' using errcode='22004'; end if;
  if jsonb_typeof(p_roll_reservations) <> 'array' or jsonb_array_length(p_roll_reservations) = 0 then raise exception 'Explicit reservation roll lines are required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_reservation_command_id, 0));

  select jsonb_agg(jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'reserved_grams', reserved_grams, 'status', status) order by raw_material_roll_id) into v_existing
  from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and reservation_command_id = p_reservation_command_id;
  if v_existing is not null then
    if exists (select 1 from public.production_material_reservations where reservation_command_id = p_reservation_command_id and (user_id is distinct from v_actor or production_job_id is distinct from p_production_job_id)) then raise exception 'Command identity is already used for another owner or job' using errcode='23505'; end if;
    return jsonb_build_object('production_job_id', p_production_job_id, 'reservation_command_id', p_reservation_command_id, 'idempotent', true, 'reservations', v_existing);
  end if;
  if exists (select 1 from public.production_material_reservations where reservation_command_id = p_reservation_command_id and user_id is distinct from v_actor) then raise exception 'Command identity is already used by another owner' using errcode='23505'; end if;

  select * into v_job from public.production_jobs where id = p_production_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.production_status <> 'ready_to_print' then raise exception 'Material can only be reserved when linked Production is ready_to_print' using errcode='22023'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory reservation' using errcode='23514'; end if;
  select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;

  for v_line in select * from jsonb_array_elements(p_roll_reservations) loop
    if nullif(v_line->>'raw_material_roll_id','') is null then raise exception 'Every reservation must include raw_material_roll_id' using errcode='22004'; end if;
    v_roll_id := (v_line->>'raw_material_roll_id')::uuid;
    if coalesce(v_line->>'grams_reserved','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Reservation quantities must be finite numbers' using errcode='22023'; end if;
    v_grams := (v_line->>'grams_reserved')::numeric;
    if v_grams::text in ('NaN','Infinity','-Infinity') or v_grams <= 0 then raise exception 'Reservation quantity must be greater than zero and finite' using errcode='22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_roll_reservations) d where d->>'raw_material_roll_id' = v_roll_id::text group by d->>'raw_material_roll_id' having count(*) > 1) then raise exception 'Duplicate roll reservation lines are not allowed' using errcode='23505'; end if;
    perform 1 from public.raw_material_inventory r where r.id = v_roll_id and r.user_id = v_actor and (coalesce(r.remaining_grams,0) - coalesce(r.reserved_grams,0)) >= v_grams for update;
    if not found then raise exception 'Raw material roll is missing, cross-owner, or has insufficient available material' using errcode='23514'; end if;
    update public.raw_material_inventory set reserved_grams = coalesce(reserved_grams,0) + v_grams, updated_at = v_now where id = v_roll_id and user_id = v_actor;
    insert into public.production_material_reservations(user_id, production_job_id, order_number, raw_material_roll_id, reserved_grams, status, reservation_command_id, created_at, updated_at)
    values(v_actor, p_production_job_id, v_job.order_number, v_roll_id, v_grams, 'active', p_reservation_command_id, v_now, v_now)
    returning jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'reserved_grams', reserved_grams, 'status', status) into v_line;
    v_results := v_results || jsonb_build_array(v_line); v_reserved_total := v_reserved_total + v_grams;
  end loop;
  return jsonb_build_object('production_job_id', p_production_job_id, 'reservation_command_id', p_reservation_command_id, 'idempotent', false, 'reserved_grams', v_reserved_total, 'reservations', v_results);
end;
$$;

create or replace function public.release_production_material_reservation(
  p_production_job_id uuid,
  p_expected_updated_at timestamptz,
  p_release_command_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid(); v_now timestamptz := now(); v_job public.production_jobs%rowtype; v_order public.orders%rowtype; v_existing jsonb; v_results jsonb; v_total numeric;
begin
  if v_actor is null then raise exception 'Authentication is required for Inventory reservation release' using errcode='28000'; end if;
  if p_production_job_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_release_command_id,'')),'') is null then raise exception 'Production job, optimistic concurrency, and command identity are required' using errcode='22004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_release_command_id, 0));
  select jsonb_agg(jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'released_grams', reserved_grams, 'status', status) order by raw_material_roll_id) into v_existing from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and release_command_id = p_release_command_id;
  if v_existing is not null then return jsonb_build_object('production_job_id', p_production_job_id, 'release_command_id', p_release_command_id, 'idempotent', true, 'reservations', v_existing); end if;
  if exists (select 1 from public.production_material_reservations where release_command_id = p_release_command_id and (user_id is distinct from v_actor or production_job_id is distinct from p_production_job_id)) then raise exception 'Command identity is already used for another owner or job' using errcode='23505'; end if;
  select * into v_job from public.production_jobs where id = p_production_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory release' using errcode='23514'; end if;
  select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;
  if v_job.production_status not in ('ready_to_print','printing','qc','ready_for_fulfillment','closed') then raise exception 'Invalid lifecycle command for reservation release' using errcode='22023'; end if;
  perform 1 from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and status = 'active' for update;
  if not found then return jsonb_build_object('production_job_id', p_production_job_id, 'release_command_id', p_release_command_id, 'idempotent', false, 'released_grams', 0, 'reservations', '[]'::jsonb); end if;
  update public.raw_material_inventory r set reserved_grams = greatest(coalesce(r.reserved_grams,0) - a.reserved_grams, 0), updated_at = v_now from public.production_material_reservations a where a.user_id = v_actor and a.production_job_id = p_production_job_id and a.status = 'active' and a.raw_material_roll_id = r.id and r.user_id = v_actor;
  update public.production_material_reservations set status = 'released', release_command_id = p_release_command_id, released_at = v_now, updated_at = v_now where user_id = v_actor and production_job_id = p_production_job_id and status = 'active';
  select coalesce(sum(reserved_grams),0), coalesce(jsonb_agg(jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'released_grams', reserved_grams, 'status', status) order by raw_material_roll_id), '[]'::jsonb) into v_total, v_results from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and release_command_id = p_release_command_id;
  return jsonb_build_object('production_job_id', p_production_job_id, 'release_command_id', p_release_command_id, 'idempotent', false, 'released_grams', v_total, 'reservations', v_results);
end;
$$;

-- Replace consumption so linked attempts validate and close active durable reservations atomically.
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
  v_actor uuid := auth.uid(); v_now timestamptz := now(); v_job public.production_jobs%rowtype; v_order public.orders%rowtype; v_attempt jsonb; v_command text := lower(btrim(coalesce(p_workflow_command,''))); v_roll jsonb; v_roll_id uuid; v_grams numeric; v_total numeric := 0; v_existing jsonb; v_results jsonb := '[]'::jsonb; v_tx record;
begin
  if v_actor is null then raise exception 'Authentication is required for Inventory consumption' using errcode='28000'; end if;
  if p_production_job_id is null or nullif(btrim(coalesce(p_attempt_id,'')),'') is null or nullif(btrim(coalesce(p_correlation_id,'')),'') is null then raise exception 'Production job, attempt identity, and command/correlation identity are required' using errcode='22004'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command not in ('pass_qc','needs_reprint') then raise exception 'Inventory consumption is only permitted at QC Pass or Needs Reprint command boundaries' using errcode='22023'; end if;
  if jsonb_typeof(p_roll_usages) <> 'array' or jsonb_array_length(p_roll_usages) = 0 then raise exception 'Explicit roll usage lines are required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_correlation_id, 0));
  select jsonb_agg(jsonb_build_object('raw_material_id', raw_material_id, 'quantity_grams', quantity_grams, 'transaction_id', id) order by raw_material_id) into v_existing from public.inventory_transactions where user_id = v_actor and production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption';
  if v_existing is not null then
    if exists (select 1 from public.inventory_transactions where user_id = v_actor and production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption' and correlation_id is distinct from p_correlation_id) then raise exception 'Attempt identity is already consumed by another command identity' using errcode='23505'; end if;
    return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', p_correlation_id, 'idempotent', true, 'rolls', v_existing);
  end if;
  if exists (select 1 from public.inventory_transactions where correlation_id = p_correlation_id and (user_id is distinct from v_actor or production_job_id is distinct from p_production_job_id)) then raise exception 'Command identity is already used for another owner, job, roll set, or command' using errcode='23505'; end if;
  select * into v_job from public.production_jobs where id = p_production_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory consumption' using errcode='23514'; end if;
  select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;
  select elem into v_attempt from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem where elem->>'id' = p_attempt_id order by elem->>'captured_at' desc nulls last limit 1;
  if v_attempt is null then v_attempt := case when coalesce(v_job.job_payload->'last_completed_attempt'->>'id','') = p_attempt_id then v_job.job_payload->'last_completed_attempt' else null end; end if;
  if v_attempt is null then raise exception 'Authoritative Production attempt evidence was not found' using errcode='23514'; end if;
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
    update public.production_material_reservations set status = 'consumed', consume_command_id = p_correlation_id, attempt_id = p_attempt_id, consumed_at = v_now, updated_at = v_now where user_id = v_actor and production_job_id = p_production_job_id and raw_material_roll_id = v_roll_id and status = 'active';
    insert into public.inventory_transactions(id,user_id,created_at,occurred_at,transaction_type,type,production_job_id,attempt_id,correlation_id,raw_material_id,quantity_grams,order_number,quote_number,note) values(gen_random_uuid(), v_actor, v_now, v_now, 'production_attempt_consumption', 'raw_usage', p_production_job_id, p_attempt_id, p_correlation_id, v_roll_id, -v_grams, v_job.order_number, v_job.quote_number, 'Authoritative Production attempt material consumption') returning id, raw_material_id, quantity_grams into v_tx;
    v_results := v_results || jsonb_build_array(jsonb_build_object('raw_material_id', v_tx.raw_material_id, 'quantity_grams', v_tx.quantity_grams, 'transaction_id', v_tx.id)); v_total := v_total + v_grams;
  end loop;
  return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', p_correlation_id, 'idempotent', false, 'total_grams', v_total, 'rolls', v_results);
end;
$$;

revoke execute on function public.reserve_production_material(uuid,timestamptz,text,jsonb) from public, anon;
revoke execute on function public.release_production_material_reservation(uuid,timestamptz,text,text) from public, anon;
revoke execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) from public, anon;
grant execute on function public.reserve_production_material(uuid,timestamptz,text,jsonb) to authenticated, service_role;
grant execute on function public.release_production_material_reservation(uuid,timestamptz,text,text) to authenticated, service_role;
grant execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) to authenticated, service_role;

-- Consolidated read-only JSONB verification query (operator).
-- select jsonb_build_object(
--   'reservation_table_exists', to_regclass('public.production_material_reservations') is not null,
--   'reservation_rls_enabled', (select relrowsecurity from pg_class where oid = 'public.production_material_reservations'::regclass),
--   'normal_browser_mutation_policies', (select count(*) from pg_policies where schemaname='public' and tablename='production_material_reservations' and cmd in ('INSERT','UPDATE','DELETE') and roles::text <> '{service_role}'),
--   'active_once_index', (select indexdef from pg_indexes where schemaname='public' and tablename='production_material_reservations' and indexname='production_material_reservations_active_job_roll_once'),
--   'available_grams_contract', 'remaining_grams minus active reserved_grams',
--   'rpcs', (select jsonb_object_agg(p.proname, jsonb_build_object('security_definer', p.prosecdef, 'search_path', p.proconfig, 'public_execute', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE'), 'authenticated_execute', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl join pg_roles r on r.oid=acl.grantee where r.rolname='authenticated' and acl.privilege_type='EXECUTE'), 'service_role_execute', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl join pg_roles r on r.oid=acl.grantee where r.rolname='service_role' and acl.privilege_type='EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('reserve_production_material','release_production_material_reservation','consume_production_attempt'))
-- ) as production_material_reservation_contract_verification;
