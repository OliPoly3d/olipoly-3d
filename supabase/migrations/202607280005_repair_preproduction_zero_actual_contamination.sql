-- NULL means no actual-production evidence has been recorded. Zero is an explicit
-- recorded value and remains evidence. This migration does not weaken lifecycle
-- RPCs or RLS and never changes a produced or historically ambiguous row.

-- Optional evidence columns must not manufacture evidence when omitted on INSERT.
alter table if exists public.production_jobs
  alter column actual_grams_used drop default,
  alter column scrap_grams drop default,
  alter column actual_print_hours drop default,
  alter column actual_quantity drop default,
  alter column actual_machine drop default,
  alter column actual_filament_breakdown drop default,
  alter column actual_filaments drop default,
  alter column actual_filament_usage drop default,
  alter column print_started_at drop default,
  alter column completed_at drop default;

-- Candidate report (run before applying the UPDATE below). The eligible flag and
-- reason expose every safety decision; preserve this output with the deployment log.
-- select id, production_status, actual_grams_used, scrap_grams, actual_print_hours,
--   actual_quantity, actual_machine, print_started_at, completed_at, order_number,
--   (production_status in ('estimate','waiting_customer') and order_number is null
--    and print_started_at is null and completed_at is null and actual_machine is null
--    and actual_grams_used = 0 and scrap_grams = 0 and actual_print_hours = 0 and actual_quantity = 0
--    and actual_filament_breakdown is null and actual_filaments is null and actual_filament_usage is null
--    and coalesce(job_payload->'production_attempts','[]'::jsonb) = '[]'::jsonb
--    and coalesce(job_payload->'roll_usages','[]'::jsonb) = '[]'::jsonb
--    and nullif(job_payload->>'current_attempt_id','') is null
--    and nullif(job_payload->>'actuals_captured_at','') is null
--    and nullif(job_payload->>'inventory_deducted_at','') is null
--    and not coalesce((job_payload->>'inventory_deducted')::boolean,false)) as eligible,
--   case
--     when production_status not in ('estimate','waiting_customer') then 'advanced lifecycle'
--     when order_number is not null then 'order linkage exists'
--     when print_started_at is not null or completed_at is not null then 'production timestamp exists'
--     when actual_machine is not null then 'machine evidence exists'
--     when actual_filament_breakdown is not null or actual_filaments is not null or actual_filament_usage is not null then 'filament evidence exists'
--     when coalesce(job_payload->'production_attempts','[]'::jsonb) <> '[]'::jsonb then 'attempt evidence exists'
--     when coalesce(job_payload->'roll_usages','[]'::jsonb) <> '[]'::jsonb then 'roll usage evidence exists'
--     when nullif(job_payload->>'current_attempt_id','') is not null or nullif(job_payload->>'actuals_captured_at','') is not null then 'capture evidence exists'
--     when nullif(job_payload->>'inventory_deducted_at','') is not null or coalesce((job_payload->>'inventory_deducted')::boolean,false) then 'inventory evidence exists'
--     when actual_grams_used <> 0 or scrap_grams <> 0 or actual_print_hours <> 0 or actual_quantity <> 0 then 'numeric values are not the legacy all-zero signature'
--     else 'eligible: pre-production all-zero contamination without corroborating evidence'
--   end as reason
-- from public.production_jobs
-- where production_status in ('estimate','waiting_customer')
--    or actual_grams_used is not null or scrap_grams is not null
--    or actual_print_hours is not null or actual_quantity is not null
-- order by eligible desc, updated_at, id;

-- Two-stage repair: the CTE freezes only rows satisfying every report predicate.
-- In these states the controlled workflow cannot legitimately record actuals;
-- therefore an all-zero signature with no corroborating evidence is contamination.
with eligible as (
  select id
  from public.production_jobs
  where production_status in ('estimate','waiting_customer')
    and order_number is null and print_started_at is null and completed_at is null and actual_machine is null
    and actual_grams_used = 0 and scrap_grams = 0 and actual_print_hours = 0 and actual_quantity = 0
    and actual_filament_breakdown is null and actual_filaments is null and actual_filament_usage is null
    and coalesce(job_payload->'production_attempts','[]'::jsonb) = '[]'::jsonb
    and coalesce(job_payload->'roll_usages','[]'::jsonb) = '[]'::jsonb
    and nullif(job_payload->>'current_attempt_id','') is null
    and nullif(job_payload->>'actuals_captured_at','') is null
    and nullif(job_payload->>'inventory_deducted_at','') is null
    and not coalesce((job_payload->>'inventory_deducted')::boolean,false)
)
update public.production_jobs p
set actual_grams_used = null, scrap_grams = null, actual_print_hours = null, actual_quantity = null,
    job_payload = coalesce(p.job_payload,'{}'::jsonb)
      - 'actual_grams_used' - 'scrap_grams' - 'actual_print_hours' - 'actual_quantity',
    updated_at = now()
from eligible e where p.id = e.id;

-- Verification: expect zero rows. Explicit zeros with any authoritative evidence
-- remain untouched and still cause the pre-acceptance RPC to reject the command.
-- select id from public.production_jobs where production_status in ('estimate','waiting_customer')
-- and order_number is null and actual_grams_used = 0 and scrap_grams = 0
-- and actual_print_hours = 0 and actual_quantity = 0 and print_started_at is null and completed_at is null;
