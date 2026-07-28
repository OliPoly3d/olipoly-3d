-- Read-only deployment-state report for Production Control -> Quote handoff.
-- Safe for Supabase SQL Editor. This script does not mutate schema or data.

-- 1. Actual-production column nullability and defaults.
select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'production_jobs'
  and c.column_name in (
    'actual_print_hours', 'actual_filaments', 'actual_grams_used',
    'scrap_grams', 'actual_quantity', 'quantity_completed'
  )
order by c.ordinal_position;

-- 2-3. Exact function definition and expected lock/error markers.
with target as (
  select to_regprocedure(
    'public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text)'
  ) as function_oid
), definition as (
  select function_oid, pg_get_functiondef(function_oid) as function_definition
  from target
  where function_oid is not null
)
select
  function_oid::text as function_identity,
  function_definition,
  position('preacceptance-production-job:' in function_definition) > 0 as has_job_scoped_lock_key,
  position('pg_try_advisory_xact_lock(v_job_lock_key)' in function_definition) > 0 as has_job_scoped_try_lock,
  position('pg_try_advisory_xact_lock' in function_definition) > 0 as has_try_advisory_xact_lock,
  position('pg_advisory_xact_lock' in function_definition) > 0 as has_blocking_advisory_xact_lock,
  position('lock_timeout' in function_definition) > 0 as has_lock_timeout,
  position('55P03' in function_definition) > 0 as has_controlled_55p03
  ,position('lockScope=job' in function_definition) > 0 as distinguishes_job_lock
  ,position('lockScope=command' in function_definition) > 0 as distinguishes_command_lock
  ,position('lockScope=row_timeout' in function_definition) > 0 as distinguishes_row_timeout
from definition;

-- 4. Recent recorded migrations. to_jsonb avoids assuming optional metadata columns.
select to_jsonb(m) as migration_record
from supabase_migrations.schema_migrations m
order by m.version desc
limit 25;

-- 5. Relevant workflow receipt indexes.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('workflow_command_receipts', 'production_jobs')
order by tablename, indexname;

-- 5. Relevant workflow receipt constraints and their exact definitions.
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('workflow_command_receipts', 'production_jobs')
order by c.relname, con.conname;

-- 6. User-defined triggers only; internal PostgreSQL triggers are excluded.
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  p.proname as trigger_function,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname in ('production_jobs', 'workflow_command_receipts')
order by c.relname, t.tgname;
