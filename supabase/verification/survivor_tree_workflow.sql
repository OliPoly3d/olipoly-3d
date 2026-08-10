-- READ ONLY. Run before and after the reviewed migration/cancel operation.
-- The result reports exact identities, ownership, acceptance, uniqueness, and lifecycle coherence.
with target_production as (
  select p.id,p.user_id,p.production_status,p.quote_number,p.order_number,p.job_payload,
         p.updated_at,p.production_source_type,p.quote_handoff_status,p.quote_accepted_at
  from public.production_jobs p where p.id='27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid
), target_quote as (
  select q.id,q.user_id,q.quote_number,q.customer_response,q.quote_status,q.converted_to_order,
         q.accepted_at,q.accepted_date,q.converted_order_number,q.production_job_id
  from public.quotes q where q.quote_number='Q-000007'
), target_order as (
  select o.id,o.user_id,o.order_number,o.source_quote_number,o.status,o.updated_at
  from public.orders o where o.order_number='OP-000188'
), facts as (
 select p.*,q.id quote_id,q.user_id quote_owner,q.customer_response,q.quote_status,q.converted_to_order,
        q.accepted_at,q.accepted_date,q.converted_order_number,q.production_job_id,
        o.id order_id,o.user_id order_owner,o.source_quote_number,o.status order_status,o.updated_at order_updated_at,
        (select count(*) from public.orders x where x.source_quote_number='Q-000007') source_quote_order_count
 from target_production p cross join target_quote q cross join target_order o
)
select id production_id,production_status,quote_number,order_number,
 jsonb_build_object('quote_number',job_payload->>'quote_number','order_number',job_payload->>'order_number','order_id',job_payload->>'order_id') payload_identity,
 updated_at production_updated_at,production_source_type,quote_handoff_status,quote_accepted_at,
 order_id,'OP-000188' expected_order_number,source_quote_number,order_status,order_updated_at,order_owner,
 quote_id,'Q-000007' expected_quote_number,customer_response,quote_status,converted_to_order,accepted_at,accepted_date,converted_order_number,production_job_id,quote_owner,
 (user_id=quote_owner and user_id=order_owner) same_owner,
 (customer_response='accepted' and converted_to_order and accepted_at is not null) quote_accepted,
 (source_quote_order_count=1) unique_order_for_quote,
 (quote_number='Q-000007' and order_number='OP-000188' and source_quote_number='Q-000007' and converted_order_number='OP-000188') linkage_valid,
 (production_status is distinct from order_status) lifecycle_only_inconsistent
from facts;

-- Cancellation/history receipt verification (also read only).
select p.id,p.production_status,p.order_number,p.close_note,p.job_payload->>'cancellation_reason' cancellation_reason,
       p.job_payload->>'canceled_at' canceled_at,o.status order_status,t.status tracking_status,
       (select count(*) from public.production_material_reservations r where r.production_job_id=p.id and r.status='active') active_reservations,
       (select count(*) from public.workflow_command_receipts r where r.production_job_id=p.id and r.command='cancel') cancellation_receipts
from public.production_jobs p
join public.orders o on o.user_id=p.user_id and o.order_number=p.order_number
left join public.order_tracking_public t on t.user_id=o.user_id and t.order_number=o.order_number
where p.id='27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid;
