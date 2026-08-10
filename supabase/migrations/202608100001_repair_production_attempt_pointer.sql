-- Preserve the authoritative current attempt pointer written by Complete Print.
--
-- Older production_workflow_command deployments stored last_completed_attempt and
-- production_attempts, but omitted job_payload.current_attempt_id.  The browser
-- could render QC from its in-memory copy, then lose the attempt pointer on
-- refresh and fail the Inventory evidence guard at Pass QC.

begin;

create or replace function public.preserve_production_attempt_pointer()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_attempt_id text;
begin
  if new.production_status = 'qc'
     and jsonb_typeof(new.job_payload->'last_completed_attempt') = 'object' then
    v_attempt_id := nullif(new.job_payload->'last_completed_attempt'->>'id', '');
    if v_attempt_id is not null then
      new.job_payload := coalesce(new.job_payload, '{}'::jsonb)
        || jsonb_build_object('production_status', 'qc', 'current_attempt_id', v_attempt_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists production_jobs_preserve_attempt_pointer on public.production_jobs;
create trigger production_jobs_preserve_attempt_pointer
before insert or update of production_status, job_payload on public.production_jobs
for each row execute function public.preserve_production_attempt_pointer();

-- Repair existing owner-scoped rows without inventing usage.  The pointer is
-- copied only from an already-persisted attempt receipt/evidence object.
update public.production_jobs
set job_payload = coalesce(job_payload, '{}'::jsonb)
  || jsonb_build_object(
       'production_status', production_status,
       'current_attempt_id', job_payload->'last_completed_attempt'->>'id'
     )
where production_status = 'qc'
  and jsonb_typeof(job_payload->'last_completed_attempt') = 'object'
  and nullif(job_payload->'last_completed_attempt'->>'id', '') is not null
  and coalesce(job_payload->>'current_attempt_id', '') = '';

revoke all on function public.preserve_production_attempt_pointer() from public, anon, authenticated;
grant execute on function public.preserve_production_attempt_pointer() to service_role;

comment on function public.preserve_production_attempt_pointer() is
  'Maintains the current attempt pointer from persisted Complete Print evidence; never creates roll usage.';

notify pgrst, 'reload schema';
commit;
