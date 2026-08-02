-- Read-only post-deployment verification for the optional Orders phone contract.
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_phone';

select pg_get_functiondef('public.respond_to_quote_public(text,text,text,text)'::regprocedure)
  as quote_conversion_definition;

select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'respond_to_quote_public'
order by grantee, privilege_type;

with conversion_columns(column_name) as (
  select unnest(array[
    'user_id', 'order_number', 'source_quote_number', 'source_type',
    'created_from_quote', 'accepted_date', 'status', 'quantity', 'order_total',
    'deposit_amount', 'balance_amount', 'payment_status', 'fulfillment',
    'customer_name', 'customer_email', 'customer_phone', 'order_title',
    'created_at', 'updated_at'
  ]::text[])
)
select c.column_name,
       (o.column_name is not null) as exists_on_orders
from conversion_columns c
left join information_schema.columns o
  on o.table_schema = 'public'
 and o.table_name = 'orders'
 and o.column_name = c.column_name
order by c.column_name;
