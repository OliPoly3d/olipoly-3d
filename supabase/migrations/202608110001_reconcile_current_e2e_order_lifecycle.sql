-- One-time lifecycle-only reconciliation for the current clean E2E chain.
-- This deliberately does not call consume_production_attempt and does not touch
-- payment, Finance, commercial data, document identity, or Inventory.
begin;

do $$
declare
  v_job public.production_jobs%rowtype;
  v_order public.orders%rowtype;
  v_quote public.quotes%rowtype;
  v_now timestamptz := statement_timestamp();
  v_tracking_count integer;
begin
  select * into strict v_job
    from public.production_jobs
   where id = '48fb7537-e97e-44a5-81f7-1995a79a37ae'::uuid
   for update;
  select * into strict v_order
    from public.orders
   where id = 'e75bebfe-fb30-4c39-9aad-695bc4727732'::uuid
   for update;
  select * into strict v_quote
    from public.quotes
   where id = '10766f5b-b9e0-465c-9526-ce96c065468e'::uuid
   for update;

  if v_job.user_id is distinct from v_order.user_id
     or v_job.user_id is distinct from v_quote.user_id then
    raise exception 'E2E reconciliation refused: Production, Quote, and Order owners differ';
  end if;
  if v_job.quote_number is distinct from 'Q-000014'
     or v_job.order_number is distinct from 'OP-000190'
     or v_job.job_payload->>'quote_number' is distinct from 'Q-000014'
     or v_job.job_payload->>'order_number' is distinct from 'OP-000190'
     or v_quote.quote_number is distinct from 'Q-000014'
     or v_quote.converted_order_number is distinct from 'OP-000190'
     or v_quote.customer_response is distinct from 'accepted'
     or v_quote.quote_status is distinct from 'converted_to_order'
     or v_quote.converted_to_order is distinct from true
     or v_order.order_number is distinct from 'OP-000190'
     or v_order.source_quote_number is distinct from 'Q-000014' then
    raise exception 'E2E reconciliation refused: Q-000014 -> OP-000190 provenance changed';
  end if;
  if v_job.production_status is distinct from 'ready_for_fulfillment'
     or v_order.status is distinct from 'qc'
     or v_job.updated_at is distinct from '2026-08-11 12:46:50.242621+00'::timestamptz
     or v_order.updated_at is distinct from '2026-08-11 12:50:03.094683+00'::timestamptz then
    raise exception 'E2E reconciliation refused: authoritative lifecycle/version precondition changed';
  end if;

  update public.orders
     set status = 'ready_for_fulfillment', updated_at = v_now
   where id = v_order.id and user_id = v_order.user_id and status = 'qc';
  if not found then raise exception 'E2E reconciliation refused: stale Order update affected no row'; end if;

  update public.order_tracking_public
     set status = 'ready_for_fulfillment',
         public_status_text = public.workflow_public_status_text('ready_for_fulfillment'),
         public_next_step = public.workflow_public_next_step('ready_for_fulfillment'),
         updated_at = v_now
   where order_number = 'OP-000190' and user_id = v_order.user_id;
  get diagnostics v_tracking_count = row_count;
  if v_tracking_count <> 1 then
    raise exception 'E2E reconciliation refused: expected one owner-scoped tracking row, found %', v_tracking_count;
  end if;
end $$;

commit;
