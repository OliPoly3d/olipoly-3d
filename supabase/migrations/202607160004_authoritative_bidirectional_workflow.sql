-- Milestone 2B.1: orders.status is the canonical post-acceptance workflow state.
-- Deploy after 202607160001, 202607160002, and 202607160003. This migration is
-- idempotent and must be applied through the normal Supabase migration process.

create or replace function public.sync_order_workflow_to_production()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.production_jobs p
     set production_status = new.status,
         order_number = new.order_number,
         quote_number = coalesce(p.quote_number, new.source_quote_number),
         job_payload = coalesce(p.job_payload, '{}'::jsonb) || jsonb_build_object(
           'production_status', new.status,
           'order_number', new.order_number,
           'quote_number', coalesce(p.quote_number, new.source_quote_number),
           'updated_at', coalesce(new.updated_at, now())
         ),
         updated_at = coalesce(new.updated_at, now())
   where p.user_id = new.user_id
     and (p.order_number = new.order_number
       or (new.source_quote_number is not null and p.quote_number = new.source_quote_number));
  return new;
end;
$$;

drop trigger if exists orders_sync_workflow_to_production on public.orders;
create trigger orders_sync_workflow_to_production
after insert or update of status, order_number, source_quote_number on public.orders
for each row execute function public.sync_order_workflow_to_production();

create or replace function public.set_linked_workflow_status(
  p_order_number text,
  p_status text,
  p_expected_updated_at timestamptz default null
)
returns public.orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status not in ('ready_to_print','printing','qc','ready_for_fulfillment','closed') then
    raise exception 'Invalid accepted Order workflow status: %', p_status using errcode = '22023';
  end if;

  select * into v_order
    from public.orders
   where order_number = p_order_number
   for update;
  if not found then raise exception 'Order % was not found', p_order_number using errcode = 'P0002'; end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'Workflow changed since this page loaded; refresh before retrying' using errcode = '40001';
  end if;

  update public.orders
     set status = v_status, updated_at = now()
   where id = v_order.id
   returning * into v_order;

  update public.order_tracking_public
     set status = v_status,
         public_status_text = case v_status
           when 'ready_to_print' then 'Your order is ready for production.'
           when 'printing' then 'Your order is printing.'
           when 'qc' then 'Your order is in quality control and finishing.'
           when 'ready_for_fulfillment' then 'Your order is ready for pickup or shipment.'
           when 'closed' then 'Your order is complete.' end,
         public_next_step = case v_status
           when 'ready_to_print' then 'Printing will begin when the assigned machine is available.'
           when 'printing' then 'Quality control and finishing follow printing.'
           when 'qc' then 'The finished order will be prepared for pickup or shipment.'
           when 'ready_for_fulfillment' then 'OliPoly 3D will coordinate the final handoff.'
           when 'closed' then 'No further production action is required.' end,
         updated_at = v_order.updated_at
   where order_number = v_order.order_number;
  return v_order;
end;
$$;

-- Repair existing linked rows once, choosing the accepted Order as authority.
update public.production_jobs p
set production_status = o.status,
    order_number = o.order_number,
    quote_number = coalesce(p.quote_number, o.source_quote_number),
    job_payload = coalesce(p.job_payload, '{}'::jsonb) || jsonb_build_object(
      'production_status', o.status, 'order_number', o.order_number,
      'quote_number', coalesce(p.quote_number, o.source_quote_number),
      'updated_at', o.updated_at
    ),
    updated_at = o.updated_at
from public.orders o
where p.user_id = o.user_id
  and (p.order_number = o.order_number
    or (o.source_quote_number is not null and p.quote_number = o.source_quote_number));

do $verify$
begin
  if exists (
    select 1 from public.orders o join public.production_jobs p
      on p.user_id = o.user_id and (p.order_number = o.order_number
        or (o.source_quote_number is not null and p.quote_number = o.source_quote_number))
    where p.production_status is distinct from o.status
  ) then raise exception 'Linked Production and Order workflow states are not synchronized'; end if;
end
$verify$;
