-- Orders owns payment tracking through an authenticated, idempotent command.
-- This migration deliberately uses version 202608100002. Version 202608100001
-- is already occupied by the Production attempt-pointer repair; sharing that
-- version prevented this function from being applied by migration tooling.
-- This migration is declarative only; application deployment must not assume it
-- has been applied until the verification query succeeds.
begin;

create table if not exists public.order_payment_command_receipts (
  command_identity text primary key,
  owner_id uuid not null,
  order_id uuid not null references public.orders(id),
  command text not null check (command = 'mark_paid'),
  previous_payment_status text,
  resulting_updated_at timestamptz not null,
  result_snapshot jsonb not null,
  created_at timestamptz not null default statement_timestamp()
);

alter table public.order_payment_command_receipts enable row level security;
revoke all on table public.order_payment_command_receipts from public, anon, authenticated;
grant all on table public.order_payment_command_receipts to service_role;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_correlation_id text
) returns setof public.orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_receipt public.order_payment_command_receipts%rowtype;
  v_previous_payment_status text;
  v_now timestamptz := statement_timestamp();
begin
  if v_actor is null then raise exception 'Authenticated order owner is required' using errcode='42501'; end if;
  if p_order_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_correlation_id,'')),'') is null then
    raise exception 'Order ID, expected updated_at, and payment command identity are required' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('order-payment:' || p_correlation_id));
  select * into v_receipt from public.order_payment_command_receipts where command_identity=p_correlation_id;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.order_id is distinct from p_order_id or v_receipt.command is distinct from 'mark_paid' then
      raise exception 'Payment command identity is already used for another owner, Order, or command' using errcode='22023';
    end if;
    return query select o.* from public.orders o where o.id=v_receipt.order_id and o.user_id=v_actor;
    return;
  end if;

  select * into v_order from public.orders where id=p_order_id and user_id=v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  -- A repeated semantic command is a no-op even when it has a fresh command ID.
  -- Return the current authoritative row without changing its concurrency token.
  if v_order.payment_status = 'paid' and coalesce(v_order.balance_amount,0) = 0 then
    insert into public.order_payment_command_receipts(command_identity,owner_id,order_id,command,previous_payment_status,resulting_updated_at,result_snapshot,created_at)
    values(p_correlation_id,v_actor,v_order.id,'mark_paid',v_order.payment_status,v_order.updated_at,to_jsonb(v_order),v_now);
    return next v_order;
    return;
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed after it was loaded' using errcode='40001'; end if;
  if lower(coalesce(v_order.status,'')) in ('cancelled','canceled','void') then raise exception 'Cancelled Orders cannot accept payment commands' using errcode='55000'; end if;
  if coalesce(v_order.order_total,0) < 0 then raise exception 'Order total is invalid' using errcode='22023'; end if;

  v_previous_payment_status := v_order.payment_status;
  update public.orders set payment_status='paid', balance_amount=0, paid_date=coalesce(paid_date,v_now::date), updated_at=v_now
   where id=v_order.id and user_id=v_actor returning * into v_order;
  insert into public.order_payment_command_receipts(command_identity,owner_id,order_id,command,previous_payment_status,resulting_updated_at,result_snapshot,created_at)
  values(p_correlation_id,v_actor,v_order.id,'mark_paid',v_previous_payment_status,v_order.updated_at,to_jsonb(v_order),v_now);
  return next v_order;
end $$;

-- Finance authority independently rejects unpaid or invalid Order postings even
-- if a caller bypasses Orders Admin's explanatory preflight.
create or replace function public.require_finance_eligible_order() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id and user_id=new.user_id;
  if not found then raise exception 'FINANCE_ORDER_NOT_FOUND: authoritative Order is unavailable' using errcode='42501'; end if;
  if v_order.payment_status not in ('paid','deposit_paid') then raise exception 'FINANCE_PAYMENT_INCOMPLETE: Order is still marked Unpaid' using errcode='55000'; end if;
  if coalesce(v_order.order_total,0) <= 0 then raise exception 'FINANCE_TOTAL_REQUIRED: authoritative Order total must be greater than zero' using errcode='22023'; end if;
  return new;
end $$;
drop trigger if exists aa_financial_entries_order_eligibility on public.financial_entries;
create trigger aa_financial_entries_order_eligibility before insert on public.financial_entries for each row execute function public.require_finance_eligible_order();

revoke all on function public.mark_order_paid(uuid,timestamptz,text), public.require_finance_eligible_order() from public,anon;
grant execute on function public.mark_order_paid(uuid,timestamptz,text) to authenticated,service_role;
grant execute on function public.require_finance_eligible_order() to service_role;

notify pgrst, 'reload schema';
commit;
