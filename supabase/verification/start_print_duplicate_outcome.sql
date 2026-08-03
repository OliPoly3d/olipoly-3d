-- Read-only outcome reconstruction for the timed-out Start Print attempt.
-- Run before asking the operator to issue another lifecycle command.
select p.id production_job_id,p.production_status production_status,p.updated_at production_updated_at,
       o.id order_id,o.order_number,o.status order_status,o.updated_at order_updated_at,
       p.order_number=o.order_number and p.user_id=o.user_id linkage_consistent
from public.production_jobs p
join public.orders o on o.order_number=p.order_number and o.user_id=p.user_id
where p.id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59';

select event_id,correlation_id,causation_id,event_type,created_at,occurred_at,
       payload->>'command' command,payload->>'from' from_status,payload->>'status' to_status,
       payload->>'production_job_id' production_job_id
from public.project_events
where order_number='OP-000189'
  and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint')
order by created_at desc;

select correlation_id,event_type,count(*) receipt_count,min(created_at) first_created_at,max(created_at) last_created_at
from public.project_events
where order_number='OP-000189'
  and event_type='order.printing_started'
group by correlation_id,event_type
order by first_created_at desc;
