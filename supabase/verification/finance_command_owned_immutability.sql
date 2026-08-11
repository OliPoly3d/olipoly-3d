-- Read-only post-deployment verification. This file performs no mutation and needs no transaction.
select 'finance_command_owned_immutability_privileges' as section,
  has_table_privilege('authenticated', 'public.financial_entries', 'UPDATE') as authenticated_table_update,
  has_any_column_privilege('authenticated', 'public.financial_entries', 'UPDATE') as authenticated_any_column_update,
  has_table_privilege('authenticated', 'public.financial_entries', 'DELETE') as authenticated_delete,
  has_table_privilege('service_role', 'public.financial_entries', 'INSERT') as service_role_insert,
  has_function_privilege('service_role', 'public.post_order_finance_income(uuid,text,timestamptz,text)', 'EXECUTE') as service_role_post_rpc,
  has_function_privilege('authenticated', 'public.correct_financial_entry(uuid,jsonb,text[],text,timestamptz,boolean,text,text)', 'EXECUTE') as authenticated_correction_rpc;

select 'finance_command_owned_immutability_column_update' as section,
  a.attname as column_name,
  has_column_privilege('authenticated', 'public.financial_entries', a.attname, 'UPDATE') as authenticated_can_update
from pg_attribute a
where a.attrelid = 'public.financial_entries'::regclass and a.attnum > 0 and not a.attisdropped
order by a.attnum;

select 'finance_command_owned_immutability_policies' as section,
  policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'financial_entries' and cmd in ('UPDATE', 'DELETE', 'ALL')
order by policyname;

select 'finance_command_owned_immutability_guard' as section,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  p.oid::regprocedure::text as function_signature,
  md5(pg_get_functiondef(p.oid)) as function_definition_md5,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.financial_entries'::regclass
  and not t.tgisinternal
  and t.tgname = 'financial_entries_guard_command_owned_mutation';

select 'finance_command_owned_immutability_counts' as section,
  count(*) filter (where coalesce(finance_command_owned, false)) as command_owned_rows,
  count(*) filter (where finance_command = 'post_order_income') as posted_order_income_rows,
  count(*) filter (where correction_of_entry_id is not null) as correction_rows
from public.financial_entries;
