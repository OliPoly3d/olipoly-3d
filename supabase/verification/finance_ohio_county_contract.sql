-- Run after deploying 202608020004_restore_ohio_county_validator.sql.
select p.oid::regprocedure as signature,
       p.prorettype::regtype as result_type,
       l.lanname as language,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig as function_settings,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where n.nspname='public' and p.proname='is_ohio_county';

select public.is_ohio_county('Portage') as portage_is_valid;
select public.is_ohio_county('Summit') as summit_is_valid;
select public.is_ohio_county('FakeCounty') as fake_county_is_valid;

select has_function_privilege('anon','public.is_ohio_county(text)','execute') as anon_execute,
       has_function_privilege('authenticated','public.is_ohio_county(text)','execute') as authenticated_execute,
       has_function_privilege('service_role','public.is_ohio_county(text)','execute') as service_role_execute;
