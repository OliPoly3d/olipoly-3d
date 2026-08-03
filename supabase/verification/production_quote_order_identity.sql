-- Read-only verification. Set the UUID to inspect another Production job.
with candidate_counts as (
  select p.id production_job_id,count(o.*)::int candidate_count
  from public.production_jobs p left join public.orders o on o.source_quote_number=p.quote_number
  where p.id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59' group by p.id
)
select p.id production_job_id,p.quote_number production_quote_number,p.order_number production_order_number,
 p.job_payload->>'quote_number' payload_quote_number,p.job_payload->>'order_number' payload_order_number,p.job_payload->>'order_id' payload_order_id,
 o.id order_id,o.order_number,o.source_quote_number,o.user_id=p.user_id same_owner,c.candidate_count,
 p.production_status,o.status order_status,
 (p.quote_number=o.source_quote_number and p.order_number=o.order_number and p.job_payload->>'quote_number'=p.quote_number and p.job_payload->>'order_number'=o.order_number and p.job_payload->>'order_id'=o.id::text) linkage_consistent,
 (p.production_status='ready_to_print' and o.status='ready_to_print') lifecycle_aligned
from public.production_jobs p join candidate_counts c on c.production_job_id=p.id
left join public.orders o on o.source_quote_number=p.quote_number
where p.id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59';
