-- Run after deploying 202608020003_repair_finance_adjustment_helper_resolution.sql.
select p.oid::regprocedure as signature, p.prorettype::regtype as result_type,
       l.lanname as language, p.prosecdef as security_definer,
       p.proconfig as function_settings, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='public' and p.proname in ('finance_adjustment_value','correct_financial_entry')
order by p.proname,p.oid::regprocedure::text;

select p.oid::regprocedure as signature,
       has_function_privilege('anon',p.oid,'execute') as anon_execute,
       has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'execute') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('finance_adjustment_value','correct_financial_entry')
order by p.proname,p.oid::regprocedure::text;

-- Expected: one helper row, exactly public.finance_adjustment_value(jsonb,text).
select count(*) as helper_overload_count,
       array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) as helper_signatures
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='finance_adjustment_value';
