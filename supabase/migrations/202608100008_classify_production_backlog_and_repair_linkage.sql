-- Deterministic Production backlog classification and linkage repair.
-- This migration intentionally touches only the three audited active rows below.
begin;

do $$
declare
  v_job public.production_jobs%rowtype;
  v_order public.orders%rowtype;
  v_id uuid;
  v_count integer;
begin
  -- Positive legacy evidence is required for each explicitly approved row. A
  -- failed assertion aborts the whole migration rather than broadening scope.
  foreach v_id in array array[
    '633ae5d6-33b9-4c11-86ee-1026b94f9ca6'::uuid, -- Alphabet blocks
    '0b6c9fe4-1ed1-48ae-abe4-f27281e5b7c7'::uuid  -- Turkey decoy
  ] loop
    select * into strict v_job
      from public.production_jobs
     where id = v_id
     for update;

    if v_job.production_source_type is not null
       and v_job.production_source_type <> 'legacy_standalone' then
      raise exception 'Production job % already has conflicting source type %; no rows classified', v_id, v_job.production_source_type
        using errcode = '23514';
    end if;

    if v_job.production_source_type is null then
      if v_job.quote_number is not null
         or v_job.order_number is not null
         or nullif(btrim(v_job.job_payload->>'quote_number'), '') is not null
         or nullif(btrim(v_job.job_payload->>'order_number'), '') is not null
         or nullif(btrim(v_job.job_payload->>'order_id'), '') is not null
         or v_job.quote_handoff_status is not null
         or v_job.quote_handoff_at is not null
         or v_job.quote_accepted_at is not null
         or exists (
           select 1 from public.production_linkage_audit a
            where a.production_job_id = v_job.id
              and a.event_type in ('production_quote_linked', 'production_order_linked', 'legacy_linkage_repaired')
         )
         or exists (
           select 1 from public.orders o
            where o.user_id = v_job.user_id
              and (
                o.order_number = v_job.order_number
                or o.source_quote_number = v_job.quote_number
                or o.order_number = nullif(btrim(v_job.job_payload->>'order_number'), '')
                or o.source_quote_number = nullif(btrim(v_job.job_payload->>'quote_number'), '')
                or o.id::text = nullif(btrim(v_job.job_payload->>'order_id'), '')
              )
         ) then
        raise exception 'Legacy standalone evidence changed for Production job %; no rows classified', v_id
          using errcode = '23514';
      end if;

      update public.production_jobs
         set production_source_type = 'legacy_standalone',
             updated_at = now()
       where id = v_id
         and production_source_type is null;
    end if;
  end loop;

  -- Survivor Tree Puzzles: Q-000007 has exactly one Order candidate and both
  -- records must have the same owner. Existing conflicting identity fails closed.
  select * into strict v_job
    from public.production_jobs
   where id = '27be9786-47bb-4e20-a4b5-5ad05c407f08'::uuid
   for update;

  if v_job.quote_number is distinct from 'Q-000007'
     or nullif(btrim(v_job.job_payload->>'quote_number'), '') is distinct from 'Q-000007'
     or (v_job.order_number is not null and v_job.order_number is distinct from 'OP-000188')
     or (nullif(btrim(v_job.job_payload->>'order_number'), '') is not null
         and nullif(btrim(v_job.job_payload->>'order_number'), '') is distinct from 'OP-000188')
     or (nullif(btrim(v_job.job_payload->>'order_id'), '') is not null
         and nullif(btrim(v_job.job_payload->>'order_id'), '') is distinct from 'db361c40-b958-42cf-86e5-94238d252499')
     or v_job.production_source_type = 'legacy_standalone' then
    raise exception 'Survivor Tree Puzzles has conflicting Production provenance; no rows repaired'
      using errcode = '23514';
  end if;

  select count(*) into v_count
    from public.orders
   where source_quote_number = 'Q-000007';
  if v_count <> 1 then
    raise exception 'Q-000007 expected exactly one Order candidate; found %', v_count
      using errcode = '23514';
  end if;

  select * into strict v_order
    from public.orders
   where source_quote_number = 'Q-000007'
   for update;
  if v_order.id is distinct from 'db361c40-b958-42cf-86e5-94238d252499'::uuid
     or v_order.order_number is distinct from 'OP-000188'
     or v_order.user_id is distinct from v_job.user_id then
    raise exception 'Q-000007 Order identity or owner no longer matches the approved repair'
      using errcode = '23514';
  end if;

  update public.production_jobs
     set order_number = 'OP-000188',
         production_source_type = 'legacy_repaired',
         job_payload = coalesce(job_payload, '{}'::jsonb) || jsonb_build_object(
           'order_number', 'OP-000188',
           'order_id', 'db361c40-b958-42cf-86e5-94238d252499'
         ),
         updated_at = now()
   where id = v_job.id
     and (
       order_number is distinct from 'OP-000188'
       or production_source_type is distinct from 'legacy_repaired'
       or nullif(btrim(job_payload->>'order_number'), '') is distinct from 'OP-000188'
       or nullif(btrim(job_payload->>'order_id'), '') is distinct from 'db361c40-b958-42cf-86e5-94238d252499'
     );
end $$;

notify pgrst, 'reload schema';
commit;
