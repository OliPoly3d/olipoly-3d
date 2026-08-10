-- Orders closeout authority. Declarative only: do not assume this migration is
-- deployed until the verification queries at the end succeed.
begin;

create or replace function public.order_status_is_closure_eligible(p_status text)
returns boolean language sql immutable set search_path=pg_catalog,pg_temp as $$
  select lower(btrim(coalesce(p_status,''))) = 'ready_for_fulfillment'
$$;

-- Repair the existing Fulfillment-owned command so a semantic retry after a
-- committed close is a no-op, while all new closes share the server rule above.
create or replace function public.fulfillment_workflow_command(
  p_order_number text,
  p_command text,
  p_expected_updated_at timestamptz,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_causation_id text default null
) returns public.orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_now timestamptz:=statement_timestamp();
  v_order public.orders%rowtype; v_job public.production_jobs%rowtype;
  v_command text:=lower(btrim(coalesce(p_command,'')));
  v_command_id text:=nullif(btrim(p_correlation_id),''); v_from text;
begin
  if v_actor is null then raise exception 'Authentication is required for Fulfillment workflow commands' using errcode='28000'; end if;
  if v_command <> 'close_order' then raise exception 'Invalid Fulfillment workflow command: %',p_command using errcode='22023'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_command_id,0));

  select * into v_order from public.orders where order_number=p_order_number for update;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  if exists(select 1 from public.project_events where correlation_id=v_command_id and not(event_type='order.closed' and user_id=v_actor and aggregate_type='order' and aggregate_id=v_order.id::text and payload->>'command'=v_command)) then
    raise exception 'Command identity is already used for a different workflow command' using errcode='23505';
  end if;
  if v_order.status='closed' then return v_order; end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order workflow changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if not public.order_status_is_closure_eligible(v_order.status) then raise exception 'ORDER_NOT_READY_TO_CLOSE: Close requires Ready for Pickup / Shipment' using errcode='55000'; end if;
  if coalesce(p_payload->>'fulfillment_confirmed_at','')='' or coalesce(p_payload->>'fulfillment_method','')='' then raise exception 'Fulfillment confirmation requires fulfillment_confirmed_at and fulfillment_method' using errcode='22023'; end if;
  select * into v_job from public.production_jobs where user_id=v_actor and order_number=v_order.order_number limit 1 for update;
  if not found then raise exception 'Linked Production job not found for %',p_order_number using errcode='P0002'; end if;
  if not public.order_status_is_closure_eligible(v_job.production_status) then raise exception 'ORDER_NOT_READY_TO_CLOSE: linked Production is not Ready for Pickup / Shipment' using errcode='55000'; end if;
  v_from:=v_order.status;
  update public.orders set status='closed',updated_at=v_now where id=v_order.id and user_id=v_actor returning * into v_order;
  update public.production_jobs set production_status='closed',updated_at=v_now where id=v_job.id and user_id=v_actor;
  if not found then raise exception 'Production fulfillment projection affected no rows' using errcode='40001'; end if;
  update public.order_tracking_public set status='closed',public_status_text=public.workflow_public_status_text('closed'),public_next_step=public.workflow_public_next_step('closed'),updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,'order.closed',jsonb_build_object('from',v_from,'to','closed'),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_command_id,p_causation_id,1,jsonb_build_object('command',v_command,'from',v_from,'status','closed','occurred_at',v_now,'fulfillment_confirmation',coalesce(p_payload,'{}'::jsonb)))
  on conflict(correlation_id,event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;
  return v_order;
end $$;

-- Finance posting, finance flags, lifecycle close, Production/tracking
-- projections, and both audit records commit or roll back as one transaction.
create or replace function public.post_order_finance_income(p_order_id uuid,p_order_number text,p_expected_updated_at timestamptz,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_job public.production_jobs%rowtype;
  v_entry public.financial_entries%rowtype; v_snapshot jsonb; v_now timestamptz:=statement_timestamp(); v_from text;
begin
  if v_actor is null then raise exception 'Authenticated owner is required' using errcode='42501'; end if;
  if p_order_id is null or nullif(btrim(p_order_number),'') is null or p_expected_updated_at is null or nullif(btrim(p_correlation_id),'') is null then raise exception 'Order identity, expected updated_at, and Finance command identity are required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('finance-order-posting:'||p_correlation_id));
  select * into v_order from public.orders where id=p_order_id and order_number=p_order_number and user_id=v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  select * into v_entry from public.financial_entries where user_id=v_actor and order_id=p_order_id and finance_command='post_order_income' and finance_command_owned is true for update;
  if found then
    if v_order.status <> 'closed' then raise exception 'FINANCE_RECONCILIATION_REQUIRED: Finance entry exists but Order is not closed' using errcode='55000'; end if;
    return jsonb_build_object('idempotent',true,'entry_id',v_entry.id,'order_id',v_order.id,'order_number',v_order.order_number,'order',to_jsonb(v_order),'snapshot',v_entry.accepted_commercial_snapshot);
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed; refresh before posting Finance' using errcode='40001'; end if;
  if v_order.payment_status not in ('paid','deposit_paid') then raise exception 'FINANCE_PAYMENT_INCOMPLETE: Mark this Order paid before pushing it to Finance.' using errcode='55000'; end if;
  if coalesce(v_order.order_total,0)<=0 then raise exception 'FINANCE_TOTAL_REQUIRED: authoritative Order total must be greater than zero' using errcode='22023'; end if;
  if not public.order_status_is_closure_eligible(v_order.status) then raise exception 'FINANCE_ORDER_NOT_READY_TO_CLOSE: Order must be Ready for Pickup / Shipment' using errcode='55000'; end if;
  select * into v_job from public.production_jobs where user_id=v_actor and order_number=v_order.order_number limit 1 for update;
  if not found or not public.order_status_is_closure_eligible(v_job.production_status) then raise exception 'FINANCE_ORDER_NOT_READY_TO_CLOSE: linked Production must be Ready for Pickup / Shipment' using errcode='55000'; end if;
  v_from:=v_order.status;
  v_snapshot:=jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'order_total',coalesce(v_order.order_total,0),'deposit_amount',coalesce(v_order.deposit_amount,0),'balance_amount',coalesce(v_order.balance_amount,0),'tax_exempt',coalesce(v_order.tax_exempt,false),'payment_status',v_order.payment_status,'paid_date',v_order.paid_date,'invoice_number',v_order.invoice_number,'source','accepted_order_snapshot_from_orders_not_mutable_quote_recalculation');
  insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,vendor_name,payment_method,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,finance_command_id,finance_command,finance_command_owned,posted_by,posted_at,accepted_commercial_snapshot)
  values(v_actor,'income',coalesce(v_order.paid_date,current_date),'Sale','income_sales','Order income - '||p_order_number,'Authoritative Finance command posting for Order '||p_order_number||'. Corrections must be append-only.',coalesce(v_order.order_total,0),coalesce(v_order.order_total,0),v_order.customer_name,coalesce(v_order.payment_status,''),100,0,0,coalesce(v_order.tax_exempt,false),0,0,0,0,0,p_order_id,p_order_number,p_correlation_id,'post_order_income',true,v_actor,v_now,v_snapshot) returning * into v_entry;
  update public.orders set finance_pushed=true,finance_pushed_at=v_now,status='closed',updated_at=v_now,internal_notes=concat_ws(E'\n\n',nullif(v_order.internal_notes,''),'Finance entry '||v_entry.id||' posted and Order closed by authoritative command at '||v_now::text) where id=v_order.id and user_id=v_actor returning * into v_order;
  update public.production_jobs set production_status='closed',updated_at=v_now where id=v_job.id and user_id=v_actor;
  update public.order_tracking_public set status='closed',public_status_text=public.workflow_public_status_text('closed'),public_next_step=public.workflow_public_next_step('closed'),updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,'order.closed',jsonb_build_object('from',v_from,'to','closed'),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,p_correlation_id,null,1,jsonb_build_object('command','push_to_finance','from',v_from,'status','closed','finance_entry_id',v_entry.id))
  on conflict(correlation_id,event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;
  return jsonb_build_object('idempotent',false,'entry_id',v_entry.id,'order_id',v_order.id,'order_number',v_order.order_number,'order',to_jsonb(v_order),'snapshot',v_entry.accepted_commercial_snapshot);
end $$;

revoke all on function public.order_status_is_closure_eligible(text) from public,anon,authenticated;
grant execute on function public.order_status_is_closure_eligible(text) to service_role;
revoke all on function public.fulfillment_workflow_command(text,text,timestamptz,jsonb,text,text),public.post_order_finance_income(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.fulfillment_workflow_command(text,text,timestamptz,jsonb,text,text),public.post_order_finance_income(uuid,text,timestamptz,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Manual deployment checks:
-- select relrowsecurity from pg_class where oid='public.orders'::regclass; -- true
-- select has_table_privilege('authenticated','public.orders','update'); -- false
-- select has_function_privilege('anon','public.fulfillment_workflow_command(text,text,timestamptz,jsonb,text,text)','execute'); -- false
-- select has_function_privilege('anon','public.post_order_finance_income(uuid,text,timestamptz,text)','execute'); -- false
