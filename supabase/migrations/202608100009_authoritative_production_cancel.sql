-- Persist unlinked Production cancellation and reservation release as one
-- owner-scoped, optimistic, idempotent command. Historical consumption is not
-- changed and linked Orders must continue through their authoritative workflow.
begin;

create or replace function public.cancel_production_job(
  p_production_job_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_command_identity text
)
returns public.production_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_receipt public.workflow_command_receipts%rowtype;
  v_from text;
  v_to text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := nullif(btrim(coalesce(p_command_identity, '')), '');
begin
  perform set_config('lock_timeout', '2000ms', true);
  if v_actor is null then
    raise exception 'Authentication is required for Production cancellation' using errcode = '28000';
  end if;
  if p_production_job_id is null or p_expected_updated_at is null or v_key is null or v_reason is null then
    raise exception 'Production job, expected version, cancellation reason, and command identity are required' using errcode = '22004';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended(v_key, 0)) then
    raise exception 'Production cancellation is already in progress' using errcode = '55P03';
  end if;

  select * into v_receipt from public.workflow_command_receipts where command_identity = v_key;
  if found then
    if v_receipt.owner_id <> v_actor
       or v_receipt.production_job_id <> p_production_job_id
       or v_receipt.command <> 'cancel' then
      raise exception 'Command identity is already used for another workflow command' using errcode = '23505';
    end if;
    select * into v_job
      from jsonb_populate_record(null::public.production_jobs, v_receipt.result_snapshot);
    return v_job;
  end if;

  begin
    select * into v_job
      from public.production_jobs
     where id = p_production_job_id and user_id = v_actor
     for update nowait;
  exception when lock_not_available then
    raise exception 'Production job is already being changed' using errcode = '55P03';
  end;
  if not found then
    raise exception 'Production job not found for authenticated owner' using errcode = '42501';
  end if;
  if v_job.order_number is not null then
    raise exception 'Linked accepted work must be canceled through the Order workflow' using errcode = '23514';
  end if;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'Production changed since this page loaded; refresh before retrying'
      using errcode = 'PT409', detail = 'appCode=40001 conflictScope=production_row';
  end if;

  v_from := v_job.production_status;
  if v_from in ('void', 'canceled') then
    return v_job;
  end if;
  if v_from in ('closed', 'completed', 'archived', 'failed_scrap') then
    raise exception 'Historical Production cannot be canceled' using errcode = '23514';
  end if;
  v_to := case when v_from in ('estimate', 'waiting_customer', 'quote_sent', 'quote_declined') then 'void' else 'canceled' end;

  -- Release only active reservations. Consumed reservations, inventory
  -- transactions, and consumption receipts remain immutable history.
  update public.raw_material_inventory r
     set reserved_grams = greatest(coalesce(r.reserved_grams, 0) - a.reserved_grams, 0),
         updated_at = v_now
    from public.production_material_reservations a
   where a.user_id = v_actor
     and a.production_job_id = v_job.id
     and a.status = 'active'
     and a.raw_material_roll_id = r.id
     and r.user_id = v_actor;

  update public.production_material_reservations
     set status = 'released', release_command_id = v_key,
         released_at = v_now, updated_at = v_now
   where user_id = v_actor and production_job_id = v_job.id and status = 'active';

  update public.production_jobs
     set production_status = v_to,
         close_note = '[Canceled] ' || v_reason,
         estimated_finish_at = null,
         job_payload = coalesce(job_payload, '{}'::jsonb) || jsonb_build_object(
           'production_status', v_to,
           'cancellation_reason', v_reason,
           'canceled_at', v_now,
           'updated_at', v_now
         ),
         updated_at = v_now
   where id = v_job.id and user_id = v_actor
   returning * into v_job;

  insert into public.workflow_command_receipts(
    command_identity, owner_id, production_job_id, command, from_state,
    to_state, resulting_updated_at, result_snapshot, created_at
  ) values (
    v_key, v_actor, v_job.id, 'cancel', v_from, v_to,
    v_job.updated_at, to_jsonb(v_job), v_now
  );
  return v_job;
end;
$$;

revoke all on function public.cancel_production_job(uuid,timestamptz,text,text) from public, anon;
grant execute on function public.cancel_production_job(uuid,timestamptz,text,text) to authenticated, service_role;
comment on function public.cancel_production_job(uuid,timestamptz,text,text) is
  'Owner-scoped, optimistic, idempotent Production cancellation with atomic active-reservation release.';

notify pgrst, 'reload schema';
commit;
