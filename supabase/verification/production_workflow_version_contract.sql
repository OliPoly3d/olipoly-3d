-- Read-only timestamp contract inspection for the proven chain. Replace the
-- NULL below with the exact raw p_expected_updated_at string from Network.
with request_input as (
  select null::timestamptz as client_expected_production_updated_at
), versions as (
  select p.id production_job_id,p.updated_at production_updated_at,
         nullif(p.job_payload->>'updated_at','')::timestamptz payload_updated_at,
         o.id order_id,o.order_number,o.updated_at order_updated_at,
         i.client_expected_production_updated_at
  from public.production_jobs p
  join public.orders o on o.id=(p.job_payload->>'order_id')::uuid
  cross join request_input i
  where p.id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'
    and o.order_number='OP-000189'
)
select *,
  to_char(production_updated_at,'YYYY-MM-DD"T"HH24:MI:SS.USOF') production_exact,
  to_char(order_updated_at,'YYYY-MM-DD"T"HH24:MI:SS.USOF') order_exact,
  to_char(payload_updated_at,'YYYY-MM-DD"T"HH24:MI:SS.USOF') payload_exact,
  to_char(client_expected_production_updated_at,'YYYY-MM-DD"T"HH24:MI:SS.USOF') client_expected_exact,
  extract(epoch from production_updated_at) production_epoch,
  extract(epoch from client_expected_production_updated_at) client_expected_epoch,
  client_expected_production_updated_at is not distinct from production_updated_at production_version_matches,
  client_expected_production_updated_at is not distinct from order_updated_at client_accidentally_matches_order,
  client_expected_production_updated_at is not distinct from payload_updated_at client_accidentally_matches_payload
from versions;

select t.tgname,pg_get_triggerdef(t.oid,true),p.oid::regprocedure,pg_get_functiondef(p.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and c.oid in ('public.production_jobs'::regclass,'public.orders'::regclass)
  and pg_get_functiondef(p.oid) ~* 'updated_at';
