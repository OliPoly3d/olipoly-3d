-- Read-only point-in-time write/lock capture for the affected Production row.
with parameters as (
  select '27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid as job_id
), production_relation as (
  select 'public.production_jobs'::regclass::oid as relation_oid
), candidate_backends as (
  select distinct a.pid
  from pg_stat_activity a
  cross join production_relation r
  left join pg_locks l on l.pid=a.pid
  where a.pid <> pg_backend_pid()
    and (
      l.relation = r.relation_oid
      or a.query ~* '(update|insert into|delete from|select).*production_jobs'
      or a.query ilike '%' || (select job_id::text from parameters) || '%'
    )
)
select
  clock_timestamp() as captured_at,
  p.job_id as affected_job_id,
  a.pid,
  a.backend_start,
  a.xact_start,
  a.query_start,
  a.state,
  a.application_name,
  a.wait_event_type,
  a.wait_event,
  pg_blocking_pids(a.pid) as blocking_pids,
  a.query ilike '%' || p.job_id::text || '%' as query_mentions_affected_job,
  l.locktype,
  l.mode,
  l.granted,
  l.relation::regclass as relation_name,
  l.page,
  l.tuple,
  l.virtualxid,
  l.transactionid,
  l.classid,
  l.objid,
  l.objsubid,
  a.query
from candidate_backends b
join pg_stat_activity a on a.pid=b.pid
cross join parameters p
left join pg_locks l on l.pid=a.pid
order by a.xact_start nulls last, a.pid, l.granted desc, l.locktype, l.relation;

-- Active statements that are currently capable of writing production_jobs.
-- PostgREST may show prepared/bound SQL without the literal job UUID; correlate
-- PID/backend_start and blocker output rather than relying on query text alone.
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
  a.query
from pg_stat_activity a
where a.pid <> pg_backend_pid()
  and a.state = 'active'
  and a.query ~* '(update\s+public\.)?production_jobs|insert\s+into\s+(public\.)?production_jobs|preacceptance_production_command'
order by a.query_start;
