-- Read-only snapshot. Replace the two values only; run repeatedly while the
-- authenticated diagnostic request is pending.
with parameters as (
  select
    '27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid as job_id,
    'diagnostic:REPLACE_WITH_CORRELATION_ID'::text as correlation_id
), expected as (
  select p.*, left(md5(p.correlation_id), 12) as correlation_fingerprint
  from parameters p
), candidates as (
  select distinct a.pid
  from pg_stat_activity a
  cross join expected e
  left join pg_locks l on l.pid = a.pid
  where a.pid <> pg_backend_pid()
    and (
      a.application_name like 'olipoly-preacc s=% c=' || e.correlation_fingerprint || '%'
      or a.query ilike '%preacceptance_production_command%'
      or a.query ilike '%' || e.job_id::text || '%'
      or l.relation in ('public.production_jobs'::regclass, 'public.workflow_command_receipts'::regclass)
    )
)
select
  clock_timestamp() as captured_at,
  e.job_id,
  e.correlation_fingerprint,
  a.pid,
  a.backend_start,
  a.xact_start,
  a.query_start,
  a.state,
  a.state in ('active', 'idle in transaction', 'idle in transaction (aborted)') as transaction_state_relevant,
  clock_timestamp() - a.xact_start as transaction_age,
  clock_timestamp() - a.query_start as query_age,
  a.wait_event_type,
  a.wait_event,
  pg_blocking_pids(a.pid) as blocking_pids,
  a.backend_xid,
  a.backend_xmin,
  a.application_name,
  l.locktype,
  l.mode,
  l.granted,
  l.relation::regclass as relation_name,
  l.page,
  l.tuple,
  l.transactionid,
  l.virtualxid,
  l.classid,
  l.objid,
  a.query
from candidates c
join pg_stat_activity a on a.pid = c.pid
cross join expected e
left join pg_locks l on l.pid = a.pid
order by a.backend_start, a.xact_start, a.query_start, a.pid, l.granted desc, l.locktype;

-- Committed outcome check. An update and receipt are atomic in the production
-- RPC, so a visible matching receipt proves commit; absence does not distinguish
-- an in-flight transaction from rollback until the backend is gone.
with parameters as (
  select
    '27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid as job_id,
    'diagnostic:REPLACE_WITH_CORRELATION_ID'::text as correlation_id
)
select
  p.job_id,
  p.correlation_id,
  j.production_status,
  j.quote_number,
  j.updated_at,
  r.command_identity,
  r.command,
  r.from_state,
  r.to_state,
  r.resulting_updated_at,
  r.created_at,
  (r.command_identity is not null and r.resulting_updated_at = j.updated_at) as committed_atomic_outcome
from parameters p
left join public.production_jobs j on j.id = p.job_id
left join public.workflow_command_receipts r
  on r.command_identity = p.correlation_id
 and r.production_job_id = p.job_id;

