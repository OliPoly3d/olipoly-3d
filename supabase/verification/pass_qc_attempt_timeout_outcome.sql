-- Read-only Pass QC / consume_production_attempt timeout outcome classifier.
-- Replace constants in params only. This does not execute mutations.
with params as (
  select
    'Q-000013'::text as quote_number,
    'OP-000189'::text as order_number,
    null::uuid as production_job_id,
    null::text as attempt_id,
    null::text as correlation_id
), job as (
  select p.*
  from public.production_jobs p, params x
  where (x.production_job_id is not null and p.id = x.production_job_id)
     or (x.production_job_id is null and (p.order_number = x.order_number or p.quote_number = x.quote_number))
  order by case when p.order_number = (select order_number from params) then 0 else 1 end,
           p.updated_at desc nulls last
  limit 1
), attempts as (
  select elem as attempt
  from job j
  cross join lateral jsonb_array_elements(coalesce(j.job_payload->'production_attempts','[]'::jsonb)) elem
  where (select attempt_id from params) is null or elem->>'id' = (select attempt_id from params)
  union all
  select j.job_payload->'last_completed_attempt'
  from job j
  where jsonb_typeof(j.job_payload->'last_completed_attempt') = 'object'
    and ((select attempt_id from params) is null or j.job_payload->'last_completed_attempt'->>'id' = (select attempt_id from params))
), inventory_rows as (
  select t.*
  from public.inventory_transactions t
  join job j on j.id = t.production_job_id
  where t.transaction_type = 'production_attempt_consumption'
    and ((select attempt_id from params) is null or t.attempt_id = (select attempt_id from params))
    and ((select correlation_id from params) is null or t.correlation_id = (select correlation_id from params))
), reservations as (
  select r.*
  from public.production_material_reservations r
  join job j on j.id = r.production_job_id
  where ((select attempt_id from params) is null or r.attempt_id = (select attempt_id from params))
), linked_order as (
  select o.* from public.orders o join job j on o.user_id = j.user_id and o.order_number = j.order_number
), events as (
  select e.* from public.project_events e
  where e.order_number = (select order_number from params)
     or e.quote_number = (select quote_number from params)
)
select jsonb_build_object(
  'classification', case
    when exists (select 1 from inventory_rows) then 'A_OR_E_inventory_consumption_committed'
    when coalesce((select exclude_inventory_reduction from job), false) and exists (select 1 from attempts) then 'A_inventory_excluded_attempt_evidence_present_no_consumption_expected'
    when exists (select 1 from attempts) then 'B_or_C_attempt_evidence_present_no_inventory_consumption'
    else 'B_or_C_no_attempt_evidence_or_consumption_found'
  end,
  'job', (select jsonb_build_object(
    'id', id, 'quote_number', quote_number, 'order_number', order_number, 'status', production_status,
    'updated_at', updated_at, 'exclude_inventory_reduction', exclude_inventory_reduction,
    'actual_machine', actual_machine, 'actual_quantity', actual_quantity, 'actual_print_hours', actual_print_hours,
    'actual_grams_used', actual_grams_used, 'scrap_grams', scrap_grams, 'completed_at', completed_at,
    'current_attempt_id', current_attempt_id, 'job_payload_current_attempt_id', job_payload->>'current_attempt_id'
  ) from job),
  'linked_order', (select jsonb_build_object('id', id, 'order_number', order_number, 'status', status, 'updated_at', updated_at) from linked_order),
  'attempts', coalesce((select jsonb_agg(attempt) from attempts), '[]'::jsonb),
  'inventory_transactions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'attempt_id', attempt_id, 'correlation_id', correlation_id, 'raw_material_id', raw_material_id, 'quantity_grams', quantity_grams, 'created_at', created_at, 'occurred_at', occurred_at)) from inventory_rows), '[]'::jsonb),
  'reservations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'raw_material_roll_id', raw_material_roll_id, 'status', status, 'reserved_grams', reserved_grams, 'attempt_id', attempt_id, 'consume_command_id', consume_command_id, 'consumed_at', consumed_at)) from reservations), '[]'::jsonb),
  'recent_lifecycle_events', coalesce((select jsonb_agg(jsonb_build_object('event_type', event_type, 'correlation_id', correlation_id, 'created_at', created_at, 'payload', payload) order by created_at desc) from (select * from events order by created_at desc limit 20) s), '[]'::jsonb)
) as pass_qc_attempt_timeout_outcome;
