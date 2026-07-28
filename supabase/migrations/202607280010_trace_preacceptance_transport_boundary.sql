begin;

-- Add opt-in, transaction-local stage observability without changing the command's
-- authority, locks, validation, mutation, receipt, return shape, or grants. A
-- correlation ID beginning diagnostic: activates pg_stat_activity.application_name
-- stage markers. They contain only job ID and an MD5 correlation fingerprint.
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
  v_job_lock_key bigint := hashtextextended('preacceptance-production-job:' || p_job_id::text, 0);
  v_command_lock_key bigint := hashtextextended('preacceptance-production-command:' || coalesce(nullif(btrim(p_correlation_id),''), ''), 0);
  v_quote_number text := nullif(btrim(p_payload->>'quote_number'),'');
  v_receipt public.workflow_command_receipts%rowtype;
  v_from text;
  v_lock_stage text := 'arguments';
  v_trace boolean := v_command_id like 'diagnostic:%';
  v_trace_fingerprint text := left(md5(coalesce(v_command_id,'')), 12);
begin
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=function_enter j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
  if v_actor is null then raise exception 'Authentication is required for pre-acceptance Production commands' using errcode='28000'; end if;
  if p_job_id is null then raise exception 'p_job_id is required' using errcode='22004'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=arguments_validated j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
  -- Secondary defense only: same-job pre-acceptance requests must be rejected by
  -- the try-lock below before they can wait on a receipt, tuple, or transaction lock.
  perform set_config('lock_timeout', '2s', true);

  -- Concurrency is scoped to the Production aggregate, not the command identity.
  -- A stable 64-bit key is derived from the UUID's canonical text plus a domain
  -- prefix. Different correlation IDs for one job therefore contend here.
  if not pg_try_advisory_xact_lock(v_job_lock_key) then
    raise exception 'Pre-acceptance Production job lock is already held.'
      using errcode='55P03',
            detail=format('lockScope=job jobId=%s lockKey=%s', p_job_id, v_job_lock_key),
            hint='Another transaction owns the job-scoped advisory lock; inspect the matching key and refresh before retrying.';
  end if;
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=job_try_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;

  -- Command identity remains a separate idempotency concept. This second
  -- nonblocking lock prevents concurrent reuse of one identity across jobs from
  -- waiting on the receipt primary key. Blocking advisory locks are forbidden.
  if not pg_try_advisory_xact_lock(v_command_lock_key) then
    raise exception 'Pre-acceptance command identity lock is already held.'
      using errcode='55P03',
            detail=format('lockScope=command jobId=%s lockKey=%s', p_job_id, v_command_lock_key),
            hint='Another transaction owns the command-identity advisory lock; inspect the matching key and refresh before retrying.';
  end if;
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=command_try_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;

  -- Receipts are immutable technical outcomes keyed by command_identity. The
  -- advisory command lock serializes creation/replay, so FOR UPDATE is needless.
  begin
    v_lock_stage := 'receipt_lookup';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_lookup_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    select * into v_receipt from public.workflow_command_receipts where command_identity = v_command_id;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_lookup_completed j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if found then
      if v_receipt.owner_id is distinct from v_actor or v_receipt.production_job_id is distinct from p_job_id or v_receipt.command is distinct from v_command then
        raise exception 'Command identity is already used for a different pre-acceptance Production command' using errcode='23505';
      end if;
      v_lock_stage := 'receipt_replay_production_row';
      if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
      select * into v_job from public.production_jobs where id = v_receipt.production_job_id and user_id = v_actor for update nowait;
      if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
      if not found then raise exception 'Pre-acceptance command receipt no longer matches Production owner/job' using errcode='40001'; end if;
      if v_trace then perform set_config('application_name', format('olipoly-preacc s=function_returning j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
      return v_job;
    end if;
  
    v_lock_stage := 'production_row';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    select * into v_job from public.production_jobs where id = p_job_id for update nowait;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
    if v_job.order_number is not null then raise exception 'Pre-acceptance command cannot mutate linked Order work' using errcode='22023'; end if;
    if v_job.production_status not in ('estimate','waiting_customer') then raise exception 'Pre-acceptance Production command requires estimate or waiting_customer' using errcode='22023'; end if;
    if v_job.actual_grams_used is not null or v_job.scrap_grams is not null or v_job.actual_print_hours is not null or v_job.print_started_at is not null or v_job.completed_at is not null then raise exception 'Pre-acceptance command rejects actual or completion evidence' using errcode='22023'; end if;
    if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production job changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
    v_from := v_job.production_status;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=validations_complete j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
  
    if v_command = 'mark_waiting_customer' then v_to := 'waiting_customer';
    elsif v_command = 'return_to_estimate' then v_to := 'estimate';
    else raise exception 'Invalid pre-acceptance Production command: %', p_command using errcode='22023'; end if;
  
    v_lock_stage := 'production_update';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_update_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    update public.production_jobs
       set production_status = v_to,
           quote_number = coalesce(v_quote_number, quote_number),
           job_payload = coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'quote_number', coalesce(v_quote_number, quote_number), 'updated_at', v_now),
           updated_at = v_now
     where id = v_job.id and user_id = v_actor
     returning * into v_job;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_update_complete j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if not found then raise exception 'Pre-acceptance Production update affected no rows' using errcode='40001'; end if;
  
    v_lock_stage := 'receipt_insert';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_insert_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    insert into public.workflow_command_receipts(command_identity, owner_id, production_job_id, command, from_state, to_state, resulting_updated_at, result_snapshot, created_at)
    values(v_command_id, v_actor, v_job.id, v_command, v_from, v_to, v_job.updated_at, to_jsonb(v_job), v_now);
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_insert_complete j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=function_returning j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
  
    return v_job;
  exception
    when lock_not_available then
      if v_lock_stage in ('production_row','receipt_replay_production_row') then
        raise exception 'Production job row is busy in another operation.'
          using errcode='55P03',
                detail=format('lockScope=row_nowait stage=%s jobId=%s', v_lock_stage, p_job_id),
                hint='The nonblocking Production row lock found another transaction; inspect the row holder and refresh before retrying.';
      end if;
      raise exception 'Pre-acceptance database lock timeout.'
        using errcode='55P03',
              detail=format('lockScope=database_lock_timeout stage=%s jobId=%s', v_lock_stage, p_job_id),
              hint='A receipt, relation, update, trigger, index, or transaction lock exceeded the transaction-local two-second bound.';
  end;
end;
$$;


revoke execute on function public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text) from public, anon;
grant execute on function public.preacceptance_production_command(uuid,text,timestamptz,jsonb,text,text) to authenticated, service_role;

commit;
