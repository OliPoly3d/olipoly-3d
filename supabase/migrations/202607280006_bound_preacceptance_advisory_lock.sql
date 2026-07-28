begin;

-- Bound duplicate pre-acceptance command contention without weakening the
-- authoritative receipt, owner, evidence, row-lock, or optimistic checks.
create or replace function public.preacceptance_production_command(
  p_job_id uuid,
  p_command text,
  p_expected_updated_at timestamptz,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_causation_id text default null
)
returns public.production_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
  v_to text;
  v_command_id text := nullif(btrim(p_correlation_id),'');
  v_quote_number text := nullif(btrim(p_payload->>'quote_number'),'');
  v_receipt public.workflow_command_receipts%rowtype;
  v_from text;
begin
  if v_actor is null then raise exception 'Authentication is required for pre-acceptance Production commands' using errcode='28000'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  -- Never let duplicate PostgREST transactions form a long advisory-lock queue.
  -- The transaction-scoped try-lock preserves receipt/idempotency semantics.
  if not pg_try_advisory_xact_lock(hashtextextended(v_command_id, 0)) then
    raise exception 'Quote handoff command is already in progress; refresh before retrying.' using errcode='55P03';
  end if;

  select * into v_receipt from public.workflow_command_receipts where command_identity = v_command_id for update;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.production_job_id is distinct from p_job_id or v_receipt.command is distinct from v_command then
      raise exception 'Command identity is already used for a different pre-acceptance Production command' using errcode='23505';
    end if;
    select * into v_job from public.production_jobs where id = v_receipt.production_job_id and user_id = v_actor for update;
    if not found then raise exception 'Pre-acceptance command receipt no longer matches Production owner/job' using errcode='40001'; end if;
    return v_job;
  end if;

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.order_number is not null then raise exception 'Pre-acceptance command cannot mutate linked Order work' using errcode='22023'; end if;
  if v_job.production_status not in ('estimate','waiting_customer') then raise exception 'Pre-acceptance Production command requires estimate or waiting_customer' using errcode='22023'; end if;
  if v_job.actual_grams_used is not null or v_job.scrap_grams is not null or v_job.actual_print_hours is not null or v_job.print_started_at is not null or v_job.completed_at is not null then raise exception 'Pre-acceptance command rejects actual or completion evidence' using errcode='22023'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production job changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  v_from := v_job.production_status;

  if v_command = 'mark_waiting_customer' then v_to := 'waiting_customer';
  elsif v_command = 'return_to_estimate' then v_to := 'estimate';
  else raise exception 'Invalid pre-acceptance Production command: %', p_command using errcode='22023'; end if;

  update public.production_jobs
     set production_status = v_to,
         quote_number = coalesce(v_quote_number, quote_number),
         job_payload = coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'quote_number', coalesce(v_quote_number, quote_number), 'updated_at', v_now),
         updated_at = v_now
   where id = v_job.id and user_id = v_actor
   returning * into v_job;
  if not found then raise exception 'Pre-acceptance Production update affected no rows' using errcode='40001'; end if;

  insert into public.workflow_command_receipts(command_identity, owner_id, production_job_id, command, from_state, to_state, resulting_updated_at, result_snapshot, created_at)
  values(v_command_id, v_actor, v_job.id, v_command, v_from, v_to, v_job.updated_at, to_jsonb(v_job), v_now);

  return v_job;
end;
$$;


revoke execute on function public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text) from public, anon;
grant execute on function public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text) to authenticated, service_role;

commit;
