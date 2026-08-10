-- Run after deploying 202608100002_authoritative_order_payment_command.sql.
-- The first query must return exactly one row with the three-argument signature.
select
  p.oid,
  p.oid::regprocedure::text as function_signature,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'mark_order_paid'
order by p.oid;

-- Inspect the deployed security-definer body and fixed search_path.
select pg_get_functiondef(
  'public.mark_order_paid(uuid,timestamptz,text)'::regprocedure
);

-- public/anon must be false; authenticated/service_role must be true.
select role_name,
       has_function_privilege(
         role_name,
         'public.mark_order_paid(uuid,timestamptz,text)',
         'execute'
       ) as can_execute
from (values ('public'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
order by role_name;

-- The canonical Orders payment contract is payment_status, balance_amount,
-- paid_date, and updated_at. amount_paid remains derived as
-- order_total - balance_amount; Orders has no invented paid_at/payment_method.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'payment_status', 'order_total', 'deposit_amount', 'balance_amount',
    'paid_date', 'updated_at', 'amount_paid', 'paid_at', 'payment_method'
  )
order by ordinal_position;

-- Acceptance check for OP-000189 after clicking Mark Paid and again after a
-- hard refresh. Run as the owning authenticated user (or in SQL with an
-- explicit, authorized owner filter); do not remove the owner predicate.
select order_number, payment_status, order_total, deposit_amount,
       balance_amount, paid_date, updated_at, finance_pushed
from public.orders
where order_number = 'OP-000189'
  and user_id = auth.uid();
