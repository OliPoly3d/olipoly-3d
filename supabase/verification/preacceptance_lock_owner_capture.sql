-- Read-only live lock/overload capture for the one affected Production job.
-- Paste the exact p_correlation_id from DevTools into command_identity.

-- A. Exact signed bigint keys and pg_locks bigint-key representation.
with parameters as (
  select
    '27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid as job_id,
    null::text as command_identity -- replace NULL with the quoted live value
), keys as (
  select
    job_id,
    command_identity,
    hashtextextended('preacceptance-production-job:' || job_id::text, 0) as job_key,
    case when command_identity is null then null else
      hashtextextended('preacceptance-production-command:' || btrim(command_identity), 0)
    end as command_key
  from parameters
)
select
  scope,
  key_value as signed_bigint_key,
  ((key_value >> 32) & 4294967295)::bigint as expected_classid,
  (key_value & 4294967295)::bigint as expected_objid,
  1 as expected_objsubid
from keys
cross join lateral (values ('job', job_key), ('command', command_key)) v(scope,key_value)
where key_value is not null;

-- B. Point-in-time advisory holders/waiters matching either exact key.
with parameters as (
  select
    '27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid as job_id,
    null::text as command_identity -- replace NULL with the quoted live value
), keys as (
  select 'job'::text as lock_scope,
         hashtextextended('preacceptance-production-job:' || job_id::text, 0) as key_value
  from parameters
  union all
  select 'command',
         hashtextextended('preacceptance-production-command:' || btrim(command_identity), 0)
  from parameters where command_identity is not null
), expected as (
  select lock_scope, key_value,
         ((key_value >> 32) & 4294967295)::bigint as classid,
         (key_value & 4294967295)::bigint as objid
  from keys
)
select
  clock_timestamp() as captured_at,
  e.lock_scope,
  e.key_value as signed_bigint_key,
  l.classid::bigint,
  l.objid::bigint,
  l.objsubid,
  l.granted,
  a.pid,
  a.backend_start,
  a.xact_start,
  a.query_start,
  a.state,
  a.application_name,
  a.backend_xid,
  a.backend_xmin,
  a.wait_event_type,
  a.wait_event,
  clock_timestamp() - a.xact_start as transaction_age,
  pg_blocking_pids(a.pid) as blocking_pids,
  a.query ~* 'preacceptance_production_command\s*\(' as current_query_is_preacceptance,
  case
    when a.xact_start is null and l.granted then 'session-level lock confirmed: no open transaction'
    when a.xact_start is not null then 'transaction open: session-vs-xact scope cannot be inferred from pg_locks alone'
    else 'waiting lock'
  end as advisory_scope_evidence,
  a.query
from expected e
join pg_locks l
  on l.locktype = 'advisory'
 and l.classid::bigint = e.classid
 and l.objid::bigint = e.objid
 and l.objsubid = 1
left join pg_stat_activity a on a.pid = l.pid
order by e.lock_scope, l.granted desc, a.backend_start, a.xact_start;

-- C. Every lock held or awaited by a backend currently executing this RPC.
with active_preacceptance as (
  select * from pg_stat_activity
  where pid <> pg_backend_pid()
    and state = 'active'
    and query ~* 'preacceptance_production_command\s*\('
)
select
  clock_timestamp() as captured_at,
  a.pid,
  a.backend_start,
  a.xact_start,
  a.query_start,
  a.state,
  a.application_name,
  a.wait_event_type,
  a.wait_event,
  pg_blocking_pids(a.pid) as blocking_pids,
  l.locktype,
  l.mode,
  l.granted,
  l.relation::regclass as relation,
  l.page,
  l.tuple,
  l.virtualxid,
  l.transactionid,
  l.classid,
  l.objid,
  l.objsubid,
  a.query
from active_preacceptance a
left join pg_locks l on l.pid = a.pid
order by a.pid, l.granted desc, l.locktype, l.relation, l.page, l.tuple;

-- D. Every live overload and its exact callable contract.
select
  p.oid,
  p.oid::regprocedure as overload,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  p.proacl as executable_privileges,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname = 'preacceptance_production_command'
order by p.oid::regprocedure::text;

-- E. Repository-expected PostgREST target: expect exactly one row.
select
  to_regprocedure('public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text)') as expected_overload,
  count(*) filter (
    where p.oid = to_regprocedure(
      'public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text)'
    )
  ) as expected_overload_count,
  count(*) as all_named_overload_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'preacceptance_production_command';
