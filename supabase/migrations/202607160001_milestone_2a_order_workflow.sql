-- Milestone 2A: accepted Orders use the same five states as Production Control.
-- Apply this migration before deploying the matching application files.

create or replace function public.normalize_accepted_order_status(p_status text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(trim(p_status), ''))
    when 'printing' then 'printing'
    when 'in_production' then 'printing'
    when 'qc' then 'qc'
    when 'post_processing' then 'qc'
    when 'production_complete' then 'qc'
    when 'qc_complete' then 'qc'
    when 'ready_for_fulfillment' then 'ready_for_fulfillment'
    when 'ready' then 'ready_for_fulfillment'
    when 'ready_for_pickup' then 'ready_for_fulfillment'
    when 'awaiting_pickup' then 'ready_for_fulfillment'
    when 'delivery_scheduled' then 'ready_for_fulfillment'
    when 'shipped' then 'ready_for_fulfillment'
    when 'delivered' then 'ready_for_fulfillment'
    when 'closed' then 'closed'
    when 'completed' then 'closed'
    when 'production_closed' then 'closed'
    when 'canceled' then 'closed'
    when 'cancelled' then 'closed'
    when 'archived' then 'closed'
    else 'ready_to_print'
  end
$$;

-- Existing rows are already accepted Orders, so obsolete early states map to
-- ready_to_print. This does not insert Orders for estimates or quotes.
update public.orders
set status = public.normalize_accepted_order_status(status)
where status is distinct from public.normalize_accepted_order_status(status);

update public.order_tracking_public
set status = public.normalize_accepted_order_status(status)
where status is distinct from public.normalize_accepted_order_status(status);

alter table public.orders alter column status set default 'ready_to_print';
alter table public.order_tracking_public alter column status set default 'ready_to_print';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed'));

alter table public.order_tracking_public drop constraint if exists order_tracking_public_status_check;
alter table public.order_tracking_public add constraint order_tracking_public_status_check
  check (status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed'));

-- The existing acceptance RPC may explicitly supply its former default. This
-- trigger keeps that RPC and all other writers on the authoritative model.
create or replace function public.enforce_accepted_order_status()
returns trigger
language plpgsql
as $$
begin
  new.status := public.normalize_accepted_order_status(new.status);
  return new;
end
$$;

drop trigger if exists orders_normalize_accepted_status on public.orders;
create trigger orders_normalize_accepted_status
before insert or update of status on public.orders
for each row execute function public.enforce_accepted_order_status();

drop trigger if exists order_tracking_normalize_accepted_status on public.order_tracking_public;
create trigger order_tracking_normalize_accepted_status
before insert or update of status on public.order_tracking_public
for each row execute function public.enforce_accepted_order_status();
