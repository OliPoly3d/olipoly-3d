-- READ ONLY: durable Production backlog classification and repair verification.
-- Explicit provenance wins. Dates are reported but are not classification gates.
with evidence as (
  select
    p.id as production_job_id,
    p.job_title,
    p.user_id,
    p.created_at,
    p.updated_at,
    p.job_type,
    p.production_source_type,
    p.production_status,
    p.quote_number,
    p.order_number,
    nullif(btrim(p.job_payload->>'quote_number'), '') as payload_quote_number,
    nullif(btrim(p.job_payload->>'order_number'), '') as payload_order_number,
    nullif(btrim(p.job_payload->>'order_id'), '') as payload_order_id,
    p.quote_handoff_status,
    p.quote_handoff_at,
    p.quote_accepted_at,
    q.id as quote_id,
    q.quote_status,
    q.accepted_at,
    q.converted_to_order,
    q.converted_order_number,
    exists (
      select 1 from public.production_linkage_audit a
       where a.production_job_id = p.id
         and a.event_type in ('production_quote_linked', 'production_order_linked', 'legacy_linkage_repaired')
    ) as has_modern_linkage_receipt
  from public.production_jobs p
  left join lateral (
    select x.* from public.quotes x
     where x.user_id = p.user_id
       and x.quote_number = coalesce(p.quote_number, nullif(btrim(p.job_payload->>'quote_number'), ''))
     order by x.created_at, x.id
     limit 1
  ) q on true
), order_matches as (
  select e.*,
    c.matching_order_count,
    c.candidate_order_id,
    c.candidate_order_number,
    c.source_quote_number,
    c.same_owner_result
  from evidence e
  left join lateral (
    select
      count(*)::integer as matching_order_count,
      (array_agg(o.id order by o.created_at, o.id))[1] as candidate_order_id,
      (array_agg(o.order_number order by o.created_at, o.id))[1] as candidate_order_number,
      (array_agg(o.source_quote_number order by o.created_at, o.id))[1] as source_quote_number,
      bool_and(o.user_id = e.user_id) as same_owner_result
    from public.orders o
    where (coalesce(e.quote_number, e.payload_quote_number) is not null
           and o.source_quote_number = coalesce(e.quote_number, e.payload_quote_number))
       or (coalesce(e.order_number, e.payload_order_number) is not null
           and o.order_number = coalesce(e.order_number, e.payload_order_number))
       or (e.payload_order_id is not null and o.id::text = e.payload_order_id)
  ) c on true
), classified as (
  select o.*,
    case
      when production_source_type = 'legacy_standalone' then 'LEGACY_STANDALONE'
      when coalesce(order_number, payload_order_number, payload_order_id) is not null
           and matching_order_count = 1 and same_owner_result
           and (coalesce(quote_number, payload_quote_number) is null
                or source_quote_number = coalesce(quote_number, payload_quote_number)) then 'MODERN_LINKED'
      when coalesce(quote_number, payload_quote_number) is not null
           and coalesce(order_number, payload_order_number, payload_order_id) is null
           and matching_order_count = 1 and same_owner_result
           and source_quote_number = coalesce(quote_number, payload_quote_number) then 'LEGACY_REPAIRABLE'
      when production_status = 'closed'
           and (coalesce(quote_number, payload_quote_number, order_number, payload_order_number, payload_order_id) is not null
                or has_modern_linkage_receipt) then 'LINKAGE_BROKEN_HISTORY'
      when coalesce(quote_number, payload_quote_number) is not null
           and matching_order_count = 0 then 'QUOTE_WITHOUT_ORDER_REVIEW'
      else 'AMBIGUOUS_REVIEW'
    end as classification
  from order_matches o
)
select
  production_job_id,
  job_title,
  created_at,
  updated_at,
  job_type,
  production_source_type,
  production_status,
  quote_number,
  order_number,
  payload_quote_number,
  payload_order_number,
  payload_order_id,
  quote_handoff_status,
  quote_handoff_at,
  quote_accepted_at,
  matching_order_count,
  candidate_order_id,
  candidate_order_number,
  source_quote_number,
  same_owner_result,
  classification,
  case classification
    when 'MODERN_LINKED' then 'Explicit Order identity resolves to one same-owner Order with matching Quote provenance.'
    when 'LEGACY_REPAIRABLE' then 'Quote provenance resolves uniquely to one same-owner Order without conflicting Order identity.'
    when 'LEGACY_STANDALONE' then 'Explicit operator-approved standalone provenance; no Order fallback was inferred.'
    when 'QUOTE_WITHOUT_ORDER_REVIEW' then format('Quote exists=%s; status=%s; accepted=%s; converted=%s; no Order candidate exists.', quote_id is not null, coalesce(quote_status, 'missing'), coalesce((accepted_at is not null or quote_accepted_at is not null)::text, 'false'), coalesce(converted_to_order::text, 'false'))
    when 'LINKAGE_BROKEN_HISTORY' then 'Closed historical row has modern identity evidence but incomplete resolvable linkage.'
    else 'Provenance is absent, conflicting, cross-owner, or has multiple candidates.'
  end as classification_reason,
  (classification = 'LEGACY_REPAIRABLE'
    and matching_order_count = 1
    and same_owner_result
    and source_quote_number = coalesce(quote_number, payload_quote_number)) as safe_repair_eligibility,
  case classification
    when 'MODERN_LINKED' then 'Keep strict Quote/Order lifecycle synchronization.'
    when 'LEGACY_REPAIRABLE' then 'Repair only through a reviewed, identity-pinned migration.'
    when 'LEGACY_STANDALONE' then 'Use authoritative standalone Production lifecycle; keep full Inventory validation.'
    when 'QUOTE_WITHOUT_ORDER_REVIEW' then 'Review Quote acceptance history; do not create or infer an Order.'
    when 'LINKAGE_BROKEN_HISTORY' then 'Report only; do not rewrite closed lifecycle history.'
    else 'Manual provenance review; leave untouched.'
  end as recommended_action,
  quote_id,
  quote_status,
  accepted_at as quote_accepted_at_from_quote,
  converted_to_order,
  converted_order_number
from classified
order by classification, created_at, production_job_id;
