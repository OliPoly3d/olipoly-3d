-- Repair Milestone 2A when the original migration stopped partway through.
-- Remove both known status CHECKs before changing existing values; an old CHECK
-- can otherwise reject the canonical replacement value. IF EXISTS covers both
-- a fully rolled-back run and any point at which the original migration stopped.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.order_tracking_public
  drop constraint if exists order_tracking_public_status_check;

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

-- These updates preserve every row and are no-ops after successful application.
update public.orders
set status = public.normalize_accepted_order_status(status)
where status is distinct from public.normalize_accepted_order_status(status);

update public.order_tracking_public
set status = public.normalize_accepted_order_status(status)
where status is distinct from public.normalize_accepted_order_status(status);

alter table public.orders alter column status set default 'ready_to_print';
alter table public.order_tracking_public alter column status set default 'ready_to_print';

-- Recreate the canonical constraints only after every stored value is canonical.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed'));

alter table public.order_tracking_public
  drop constraint if exists order_tracking_public_status_check;
alter table public.order_tracking_public
  add constraint order_tracking_public_status_check
  check (status in ('ready_to_print','printing','qc','ready_for_fulfillment','closed'));

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

drop trigger if exists order_tracking_normalize_accepted_status
  on public.order_tracking_public;
create trigger order_tracking_normalize_accepted_status
before insert or update of status on public.order_tracking_public
for each row execute function public.enforce_accepted_order_status();

-- Regression assertions: all rows satisfy the final status set, and the known
-- production record remains closed if it is present in this database.
do $verify$
begin
  if exists (
    select 1
    from public.orders
    where status is null
       or status not in (
         'ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed'
       )
  ) then
    raise exception 'orders contains a status rejected by orders_status_check';
  end if;

  if exists (
    select 1
    from public.orders
    where order_number = 'OP-000008'
      and status is distinct from 'closed'
  ) then
    raise exception 'OP-000008 must remain closed after status normalization';
  end if;
end
$verify$;

-- SQL Editor verification result sets.
select status, count(*) as order_count
from public.orders
group by status
order by status;

select con.conname as constraint_name,
       pg_catalog.pg_get_constraintdef(con.oid) as constraint_definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'orders'
  and con.conname = 'orders_status_check';

select column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name = 'status';

select trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('orders', 'order_tracking_public')
  and trigger_name in (
    'orders_normalize_accepted_status',
    'order_tracking_normalize_accepted_status'
  )
group by trigger_name
order by trigger_name;
