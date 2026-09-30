-- Operator repair requested for OP-000198. Run after the QC null-classification fix.
-- Reconcile projections using the committed QC receipt; never replay consumption.
-- This is deliberately separate from the schema migration and affects one order.
begin;
set local lock_timeout='2s';
do $$
declare
 v_order public.orders%rowtype;
 v_job public.production_jobs%rowtype;
 v_receipt public.production_attempt_consumption_receipts%rowtype;
 v_count integer;
 v_now timestamptz:=statement_timestamp();
begin
 select * into strict v_order from public.orders where order_number='OP-000198' for update;
 if v_order.source_quote_number is distinct from 'Q-000016' then
   raise exception 'Order provenance changed; review before reconciliation';
 end if;
 select * into strict v_job from public.production_jobs
  where order_number=v_order.order_number and user_id=v_order.user_id for update;
 if v_order.status='ready_for_fulfillment' and v_job.production_status='ready_for_fulfillment'
    and exists(select 1 from public.order_tracking_public where order_number=v_order.order_number and user_id=v_order.user_id and status='ready_for_fulfillment') then
   return; -- Safe repeat after a successful repair.
 end if;
 if v_order.status is distinct from 'qc' or v_job.production_status is distinct from 'ready_for_fulfillment'
    or v_job.production_source_type is not null or v_job.quote_number is distinct from v_order.source_quote_number then
   raise exception 'Expected QC projection mismatch changed; no repair applied';
 end if;
 select * into strict v_receipt from public.production_attempt_consumption_receipts r
  where r.production_job_id=v_job.id and r.owner_id=v_job.user_id
    and r.attempt_id=v_job.job_payload#>>'{last_completed_attempt,id}'
    and r.result_snapshot->>'record_class'='MODERN_LINKED'
    and r.result_snapshot->>'lifecycle_completed'='true'
    and r.result_snapshot->>'order_status'='qc'
    and r.result_snapshot#>>'{production_job,order_number}'=v_order.order_number
    and r.result_snapshot#>>'{production_job,production_status}'='ready_for_fulfillment'
    and (r.result_snapshot#>>'{production_job,updated_at}')::timestamptz=v_job.updated_at;

 update public.orders set status='ready_for_fulfillment',updated_at=v_now
  where id=v_order.id and user_id=v_order.user_id;
 update public.order_tracking_public
  set status='ready_for_fulfillment',
      public_status_text=public.workflow_public_status_text('ready_for_fulfillment'),
      public_next_step=public.workflow_public_next_step('ready_for_fulfillment'),updated_at=v_now
  where order_number=v_order.order_number and user_id=v_order.user_id and status='qc';
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Expected exactly one QC tracker projection; repair rolled back'; end if;

 insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,
  created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
 values(gen_random_uuid(),v_order.user_id,v_order.source_quote_number,v_order.order_number,'order.qc_passed',
  jsonb_build_object('from','qc','to','ready_for_fulfillment','repair_reason','Restore Order and tracker projections omitted by nullable legacy classification'),
  v_now,v_receipt.created_at,'order',v_order.id::text,'system','database-reconciliation',v_receipt.command_identity,null,1,
  jsonb_build_object('command','pass_qc','from','qc','status','ready_for_fulfillment','production_job_id',v_job.id,
   'reconciled_at',v_now,'source','committed_production_attempt_consumption_receipt','inventory_replayed',false));
end $$;
commit;
