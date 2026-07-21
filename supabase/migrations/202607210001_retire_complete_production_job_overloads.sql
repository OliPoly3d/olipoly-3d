-- Forward-only ERP Blueprint v1 corrective milestone: retire legacy
-- public.complete_production_job RPC overloads that bypass the deployed workflow
-- command authority and Inventory command boundary.
--
-- Scope:
-- - Migration 202607200008 workflow command authority is already deployed and is
--   not changed here.
-- - Historical inventory_transactions rows, including raw_usage rows with no
--   Production/attempt/command/reference linkage, are not cleaned, backfilled, or
--   reinterpreted.
-- - No new Inventory command is created by this migration.
-- - Existing deployed complete_production_job function identities are preserved:
--   parameter names, parameter defaults, identity arguments, and return types are
--   read from pg_proc and used verbatim in CREATE OR REPLACE statements.
-- - The obsolete function bodies are replaced with explicit retired-function
--   exceptions before EXECUTE grants are revoked.
--
-- Operator-supplied deployed evidence this migration responds to:
-- - Five overloads of public.complete_production_job coexist.
-- - All currently grant EXECUTE to PUBLIC, anon, authenticated, and service_role.
-- - Multiple overloads are SECURITY DEFINER.
-- - They directly update production_jobs workflow status/actuals.
-- - They directly reduce raw_material_inventory.
-- - They directly add finished_goods_inventory.
-- - They directly insert inventory_transactions.
-- - They use conflicting legacy quantity columns, including current_grams and
--   remaining_grams.
-- - The deployed transaction ledger contains 384 raw_usage rows with no
--   Production, attempt, command, or reference linkage.
--
-- Read-only preflight queries (run before deployment; do not mutate data):
-- select count(*) as complete_production_job_overload_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_production_job'; -- expect 5 from operator-supplied deployed evidence
-- select p.oid::regprocedure as function_identity, pg_get_function_arguments(p.oid) as deployed_arguments, pg_get_function_identity_arguments(p.oid) as deployed_identity_arguments, pg_get_function_result(p.oid) as deployed_return_type, p.proargnames as deployed_parameter_names, pg_get_expr(p.proargdefaults, 0) as deployed_parameter_defaults, p.prosecdef as security_definer, p.proconfig as function_config, p.proacl as grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_production_job' order by p.oid::regprocedure::text;
-- select routine_name, routine_definition from information_schema.routines where specific_schema='public' and routine_name='complete_production_job' order by specific_name; -- review legacy bodies for direct Production/Inventory mutations before applying
-- select lower(coalesce(transaction_type, type, movement_type, '')) as transaction_kind, count(*) from public.inventory_transactions where lower(coalesce(transaction_type, type, movement_type, '')) similar to '%(raw_usage|consume|consumption|usage|production)%' group by 1 order by 2 desc; -- read-only historical context only
-- select has_function_privilege('PUBLIC', p.oid, 'execute') as public_can_execute, has_function_privilege('anon', p.oid, 'execute') as anon_can_execute, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute, has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute, p.oid::regprocedure as function_identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_production_job' order by p.oid::regprocedure::text;
--
-- Post-deployment verification queries:
-- select count(*) as complete_production_job_overload_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_production_job'; -- expect same count as preflight, 5 for the confirmed deployed contract
-- select p.oid::regprocedure as function_identity, pg_get_function_arguments(p.oid) as deployed_arguments, pg_get_function_identity_arguments(p.oid) as deployed_identity_arguments, pg_get_function_result(p.oid) as deployed_return_type, p.proargnames as deployed_parameter_names, pg_get_expr(p.proargdefaults, 0) as deployed_parameter_defaults, p.prosecdef as security_definer, p.proconfig as function_config, pg_get_functiondef(p.oid) like '%complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption%' as has_retired_exception from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_production_job' order by p.oid::regprocedure::text; -- expect has_retired_exception=true and search_path=public, pg_temp
-- select has_function_privilege('PUBLIC', p.oid, 'execute') as public_can_execute, has_function_privilege('anon', p.oid, 'execute') as anon_can_execute, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute, has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute, p.oid::regprocedure as function_identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_production_job' order by p.oid::regprocedure::text; -- expect all false
-- begin; select public.complete_production_job(/* supply exact preflight arguments/defaults for one retired overload in staging only */); rollback; -- expect SQLSTATE 2F000 retired-function exception and no Production/Inventory mutation; do not run with production customer data
--
-- Forward recovery:
-- If deployment or verification fails, do not restore browser EXECUTE grants and
-- do not mutate historical Production or Inventory rows. Ship a new reviewed
-- forward-only migration that preserves the deployed function signatures.

begin;

do $$
declare
  v_count integer;
  v_fn record;
  v_sql text;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_production_job';

  if v_count <> 5 then
    raise exception 'Expected exactly 5 deployed public.complete_production_job overloads, found %; stop and update this retirement migration from deployed metadata', v_count
      using errcode = 'P0001';
  end if;

  for v_fn in
    select p.oid,
           p.oid::regprocedure::text as function_identity,
           pg_get_function_arguments(p.oid) as function_arguments,
           pg_get_function_identity_arguments(p.oid) as identity_arguments,
           pg_get_function_result(p.oid) as return_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'complete_production_job'
    order by p.oid::regprocedure::text
  loop
    v_sql := format($create$
create or replace function public.complete_production_job(%s)
returns %s
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
begin
  raise exception 'complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption'
    using errcode = '2F000',
          hint = 'This legacy RPC bypassed ERP Blueprint v1 workflow authority and Inventory command ownership.';
end;
$body$;
$create$, v_fn.function_arguments, v_fn.return_type);

    execute v_sql;

    execute format('revoke execute on function public.complete_production_job(%s) from public, anon, authenticated, service_role', v_fn.identity_arguments);
  end loop;
end $$;

commit;
