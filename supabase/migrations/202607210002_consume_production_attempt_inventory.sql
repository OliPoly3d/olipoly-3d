-- Inventory corrective milestone: authoritative, idempotent Production-attempt material consumption.
-- Forward-only migration after 202607210001_retire_complete_production_job_overloads.sql.
-- Historical unlinked inventory_transactions rows remain untouched.

-- Read-only preflight (operator):
-- with inventory_contract as (
--   select jsonb_build_object(
--     'raw_quantity_column', case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='raw_material_inventory' and column_name='remaining_grams') then 'remaining_grams' else 'missing' end,
--     'has_current_grams', exists (select 1 from information_schema.columns where table_schema='public' and table_name='raw_material_inventory' and column_name='current_grams'),
--     'consume_rpc_exists', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='consume_production_attempt'),
--     'ledger_columns', (select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='inventory_transactions'),
--     'production_attempt_evidence', (select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='production_jobs' and column_name in ('job_payload','production_attempts','roll_usages','current_attempt_id'))
--   ) as verification
-- ) select verification from inventory_contract;

create unique index if not exists inventory_transactions_production_attempt_roll_once
  on public.inventory_transactions (user_id, production_job_id, raw_material_id, attempt_id)
  where production_job_id is not null and raw_material_id is not null and attempt_id is not null;

create unique index if not exists inventory_transactions_production_command_once
  on public.inventory_transactions (user_id, correlation_id)
  where correlation_id is not null and transaction_type = 'production_attempt_consumption';

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
  v_roll jsonb;
  v_roll_id uuid;
  v_grams numeric;
  v_total numeric := 0;
  v_existing jsonb;
  v_results jsonb := '[]'::jsonb;
  v_tx record;
begin
  if v_actor is null then raise exception 'Authentication is required for Inventory consumption' using errcode='28000'; end if;
  if p_production_job_id is null or nullif(btrim(coalesce(p_attempt_id,'')),'') is null or nullif(btrim(coalesce(p_correlation_id,'')),'') is null then
    raise exception 'Production job, attempt identity, and command/correlation identity are required' using errcode='22004';
  end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command not in ('pass_qc','needs_reprint') then raise exception 'Inventory consumption is only permitted at QC Pass or Needs Reprint command boundaries' using errcode='22023'; end if;
  if jsonb_typeof(p_roll_usages) <> 'array' or jsonb_array_length(p_roll_usages) = 0 then raise exception 'Explicit roll usage lines are required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_correlation_id, 0));

  select * into v_job from public.production_jobs where id = p_production_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory consumption' using errcode='23514'; end if;

  select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;

  select elem into v_attempt
  from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem
  where elem->>'id' = p_attempt_id
  order by elem->>'captured_at' desc nulls last
  limit 1;
  if v_attempt is null then
    v_attempt := case when coalesce(v_job.job_payload->'last_completed_attempt'->>'id','') = p_attempt_id then v_job.job_payload->'last_completed_attempt' else null end;
  end if;
  if v_attempt is null then raise exception 'Authoritative Production attempt evidence was not found' using errcode='23514'; end if;
  if coalesce(v_attempt->>'good_grams', v_attempt->>'actual_grams_used', '') !~ '^[0-9]+(\.[0-9]+)?$'
     or coalesce(v_attempt->>'actual_print_hours','') !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'Production attempt does not contain completed manufacturing actuals' using errcode='23514';
  end if;

  select jsonb_agg(jsonb_build_object('raw_material_id', raw_material_id, 'quantity_grams', -quantity_grams, 'transaction_id', id) order by raw_material_id) into v_existing
  from public.inventory_transactions
  where user_id = v_actor and production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption';
  if v_existing is not null then
    if exists (select 1 from public.inventory_transactions where user_id = v_actor and production_job_id = p_production_job_id and attempt_id = p_attempt_id and transaction_type = 'production_attempt_consumption' and correlation_id is distinct from p_correlation_id) then
      raise exception 'Attempt identity is already consumed by another command identity' using errcode='23505';
    end if;
    return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', p_correlation_id, 'idempotent', true, 'rolls', v_existing);
  end if;
  if exists (select 1 from public.inventory_transactions where correlation_id = p_correlation_id and user_id is distinct from v_actor) then raise exception 'Command identity is already used by another owner' using errcode='23505'; end if;

  for v_roll in select * from jsonb_array_elements(p_roll_usages) loop
    if nullif(v_roll->>'raw_material_roll_id','') is null then raise exception 'Every roll usage must include raw_material_roll_id' using errcode='22004'; end if;
    v_roll_id := (v_roll->>'raw_material_roll_id')::uuid;
    if coalesce(v_roll->>'grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Roll usage quantities must be finite nonnegative numbers' using errcode='22023'; end if;
    v_grams := (v_roll->>'grams_used')::numeric;
    if v_grams::text in ('NaN','Infinity','-Infinity') or v_grams <= 0 then raise exception 'Roll usage quantity must be greater than zero and finite' using errcode='22023'; end if;

    perform 1 from public.raw_material_inventory where id = v_roll_id and user_id = v_actor and remaining_grams >= v_grams for update;
    if not found then raise exception 'Raw material roll is missing, cross-owner, or has insufficient available material' using errcode='23514'; end if;

    update public.raw_material_inventory
       set remaining_grams = remaining_grams - v_grams,
           reserved_grams = greatest(coalesce(reserved_grams,0) - v_grams, 0),
           updated_at = v_now
     where id = v_roll_id and user_id = v_actor;

    insert into public.inventory_transactions(id,user_id,created_at,occurred_at,transaction_type,type,production_job_id,attempt_id,correlation_id,raw_material_id,quantity_grams,order_number,quote_number,note)
    values(gen_random_uuid(), v_actor, v_now, v_now, 'production_attempt_consumption', 'raw_usage', p_production_job_id, p_attempt_id, p_correlation_id, v_roll_id, -v_grams, v_job.order_number, v_job.quote_number, 'Authoritative Production attempt material consumption')
    returning id, raw_material_id, quantity_grams into v_tx;
    v_results := v_results || jsonb_build_array(jsonb_build_object('raw_material_id', v_tx.raw_material_id, 'quantity_grams', v_tx.quantity_grams, 'transaction_id', v_tx.id));
    v_total := v_total + v_grams;
  end loop;

  return jsonb_build_object('production_job_id', p_production_job_id, 'attempt_id', p_attempt_id, 'correlation_id', p_correlation_id, 'idempotent', false, 'total_grams', v_total, 'rolls', v_results);
end;
$$;

revoke execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) from public, anon;
grant execute on function public.consume_production_attempt(uuid,text,text,timestamptz,jsonb,text) to authenticated, service_role;

-- Post-deployment read-only verification (operator):
-- select jsonb_build_object(
--   'function', p.oid::regprocedure::text,
--   'security_definer', p.prosecdef,
--   'search_path', p.proconfig,
--   'public_execute', has_function_privilege('PUBLIC', p.oid, 'execute'),
--   'anon_execute', has_function_privilege('anon', p.oid, 'execute'),
--   'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute'),
--   'service_role_execute', has_function_privilege('service_role', p.oid, 'execute'),
--   'raw_quantity_authority', 'remaining_grams',
--   'does_not_update_current_grams', pg_get_functiondef(p.oid) not like '%current_grams%'
-- ) as inventory_consumption_rpc_verification
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname='consume_production_attempt';
