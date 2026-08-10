-- Read-only live wait inspection for one consume_production_attempt backend.
--
-- While the browser request is pending, run this as a database administrator in
-- a second session. Set target_pid to the pg_backend_pid() emitted by the
-- temporary stage trace. A null target_pid safely returns no rows.
with params as (
  select null::integer as target_pid
), activity as (
  select
    a.pid,
    a.usename,
    a.application_name,
    a.state,
    a.xact_start,
    a.query_start,
    clock_timestamp() - a.xact_start as transaction_age,
    clock_timestamp() - a.query_start as query_age,
    a.wait_event_type,
    a.wait_event,
    pg_blocking_pids(a.pid) as blocking_pids,
    a.query
  from pg_catalog.pg_stat_activity a
  join params p on p.target_pid = a.pid
), locks as (
  select
    l.pid,
    l.locktype,
    l.mode,
    l.granted,
    l.fastpath,
    l.relation,
    case when l.relation is null then null else l.relation::regclass::text end as relation_name,
    l.page,
    l.tuple,
    l.virtualxid,
    l.transactionid,
    l.classid,
    l.objid,
    l.objsubid
  from pg_catalog.pg_locks l
  join params p on p.target_pid = l.pid
), blockers as (
  select
    blocked.pid as blocked_pid,
    blocker.pid as blocker_pid,
    blocker.usename as blocker_user,
    blocker.application_name as blocker_application,
    blocker.state as blocker_state,
    blocker.xact_start as blocker_xact_start,
    blocker.query_start as blocker_query_start,
    clock_timestamp() - blocker.xact_start as blocker_transaction_age,
    clock_timestamp() - blocker.query_start as blocker_query_age,
    blocker.wait_event_type as blocker_wait_event_type,
    blocker.wait_event as blocker_wait_event,
    blocker.query as blocker_query
  from activity blocked
  cross join lateral unnest(blocked.blocking_pids) blocker_pid
  join pg_catalog.pg_stat_activity blocker on blocker.pid = blocker_pid
)
select jsonb_build_object(
  'activity', coalesce((select jsonb_agg(to_jsonb(a)) from activity a), '[]'::jsonb),
  'locks', coalesce((select jsonb_agg(to_jsonb(l) order by l.granted, l.locktype, l.mode) from locks l), '[]'::jsonb),
  'blockers', coalesce((select jsonb_agg(to_jsonb(b)) from blockers b), '[]'::jsonb)
) as consume_production_attempt_wait_snapshot;
