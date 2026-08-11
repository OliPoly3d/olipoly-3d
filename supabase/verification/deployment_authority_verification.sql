-- OliPoly deployment-authority evidence collector
-- READ ONLY: this file contains SELECT statements only. Run as a database owner
-- in Supabase SQL Editor and save every result grid (CSV is preferred).
-- PostgreSQL 15/Supabase compatible. No result from this file is a remediation.

select '00_RUN_CONTEXT' as section, current_database() as database_name,
       current_user as run_as, session_user, current_setting('server_version') as server_version,
       statement_timestamp() as captured_at, pg_is_in_recovery() as is_replica;

select '01_DEPLOYED_MIGRATIONS' as section, version, name, statements
from supabase_migrations.schema_migrations order by version;

select '02_RLS' as section, n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       p.polname as policy_name, case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
       when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as command,
       case p.polpermissive when true then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
       array(select rolname from pg_roles where oid=any(p.polroles)) as roles,
       pg_get_expr(p.polqual,p.polrelid) as using_expression,
       pg_get_expr(p.polwithcheck,p.polrelid) as with_check_expression,
       md5(concat_ws('|',p.polcmd,p.polpermissive,p.polroles::text,
           pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))) as policy_hash
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_policy p on p.polrelid=c.oid
where c.relkind in ('r','p') and n.nspname in ('public','storage')
order by n.nspname,c.relname,p.polname;

select '03_FUNCTIONS' as section, n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       l.lanname as language, case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
       p.provolatile as volatility, p.proparallel as parallel_safety,
       pg_get_userbyid(p.proowner) as owner, p.proconfig as settings,
       md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) as normalized_definition_hash,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='public' order by p.proname,signature;

select '04_GRANTS' as section, n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as signature, r.rolname as role_name,
       has_function_privilege(r.oid,p.oid,'EXECUTE') as has_execute,
       case when r.rolname in ('public','anon') and p.proname ~
         '(workflow|consume|cancel|finance|inventory|reserve|repair|correct|paid|fulfillment)'
         then 'REVIEW_INTERNAL_EXPOSURE' else 'CLASSIFY_WITH_REGISTRY' end as review_hint
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join pg_roles r
where n.nspname='public' and r.rolname in ('anon','authenticated','service_role')
union all
select '04_GRANTS',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),'PUBLIC',
       has_function_privilege('public',p.oid,'EXECUTE'),
       case when p.proname ~ '(workflow|consume|cancel|finance|inventory|reserve|repair|correct|paid|fulfillment)'
       then 'REVIEW_INTERNAL_EXPOSURE' else 'CLASSIFY_WITH_REGISTRY' end
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
order by function_name,signature,role_name;

select '05_SECURITY_DEFINER' as section, n.nspname as schema_name,p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as signature,pg_get_userbyid(p.proowner) as owner,
       p.proconfig as settings,
       has_function_privilege('public',p.oid,'EXECUTE') as public_execute,
       coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute,
       coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
       pg_get_functiondef(p.oid) ~* 'auth\\.uid\\s*\\(' as mentions_auth_uid,
       pg_get_functiondef(p.oid) ~* '\\bexecute\\b' as may_use_dynamic_sql,
       not exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) x
                  where x ~ '^search_path=') as missing_explicit_search_path,
       md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) as definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef order by p.proname,signature;

select '06_TRIGGERS' as section,n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,
       pg_get_triggerdef(t.oid,true) as trigger_definition,
       pn.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as trigger_function,
       md5(regexp_replace(pg_get_triggerdef(t.oid,true),'\\s+',' ','g')) as trigger_hash,
       md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) as function_hash,
       pg_get_functiondef(p.oid) as trigger_function_definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal and n.nspname='public' order by c.relname,t.tgname;

select '07_STORAGE_BUCKETS' as section,to_jsonb(b) - 'id' as bucket_configuration,b.id as bucket_id
from storage.buckets b order by b.id;
select '07_STORAGE_OBJECT_POLICIES' as section,policyname,cmd,roles,qual,with_check
from pg_policies where schemaname='storage' and tablename='objects' order by policyname;

select '08_STATUS_AUTHORITY_COLUMNS' as section,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and (column_name ~ '(status|finance_pushed|converted|accepted)' or
     (table_name='production_jobs' and column_name in ('job_payload','job_status','production_status')))
order by table_name,ordinal_position;

select '09_LINKAGE' as section,'production_order_quote_mismatch' as check_name,count(*) as affected_count,
       coalesce(jsonb_agg(jsonb_build_object('production_job_id',p.id,'order_id',o.id)
                order by p.id) filter(where p.id is not null),'[]'::jsonb) as affected_ids
from public.production_jobs p join public.orders o on o.order_number=p.order_number
where nullif(p.quote_number,'') is distinct from nullif(o.source_quote_number,'');
select '09_LINKAGE' as section,'cross_owner_production_order' as check_name,count(*) as affected_count,
       coalesce(jsonb_agg(jsonb_build_object('production_job_id',p.id,'order_id',o.id)
                order by p.id),'[]'::jsonb) as affected_ids
from public.production_jobs p join public.orders o on o.order_number=p.order_number
where p.user_id is distinct from o.user_id;
select '09_LINKAGE' as section,'duplicate_orders_per_quote' as check_name,count(*) as affected_count,
       coalesce(jsonb_agg(jsonb_build_object('source_quote_number',source_quote_number,'count',n)),'[]'::jsonb) affected_ids
from (select source_quote_number,count(*) n from public.orders where nullif(source_quote_number,'') is not null
      group by source_quote_number having count(*)>1) d;

select '10_CONCURRENCY' as section,n.nspname||'.'||p.proname as function_name,
 pg_get_function_identity_arguments(p.oid) signature,
 pg_get_functiondef(p.oid) ~ 'p_expected_updated_at' has_expected_version,
 pg_get_functiondef(p.oid) ~* 'updated_at\\s+is\\s+distinct\\s+from\\s+p_expected_updated_at' raw_distinct_comparison,
 pg_get_functiondef(p.oid) ~* 'raise[^;]+errcode' documents_sqlstate,
 md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname ~ '(workflow|production|order|finance|inventory|reserve|consume|cancel)' order by p.proname,signature;

select '11_LOCKING' as section,p.proname as function_name,pg_get_function_identity_arguments(p.oid) signature,
 pg_get_functiondef(p.oid) ~* 'pg_advisory_xact_lock' uses_blocking_advisory,
 pg_get_functiondef(p.oid) ~* 'pg_try_advisory_xact_lock' uses_try_advisory,
 pg_get_functiondef(p.oid) ~* 'for update' uses_for_update,
 pg_get_functiondef(p.oid) ~* 'nowait' uses_nowait,
 pg_get_functiondef(p.oid) ~* 'lock_timeout' sets_lock_timeout,
 pg_get_functiondef(p.oid) ~* 'statement_timeout' sets_statement_timeout
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and pg_get_functiondef(p.oid) ~* '(advisory|for update|nowait|lock_timeout|statement_timeout)'
order by p.proname,signature;

select '12_INVENTORY' as section,'duplicate_attempt_consumption' check_name,count(*) affected_count,
 coalesce(jsonb_agg(jsonb_build_object('production_job_id',production_job_id,'attempt_id',attempt_id,'count',n)),'[]'::jsonb) affected_ids
from (select production_job_id,attempt_id,count(*) n from public.production_attempt_consumption_receipts
 group by production_job_id,attempt_id having count(*)>1) d;
select '12_INVENTORY' as section,'reservation_on_terminal_job' check_name,count(*) affected_count,
 coalesce(jsonb_agg(jsonb_build_object('reservation_id',r.id,'production_job_id',r.production_job_id)),'[]'::jsonb) affected_ids
from public.production_material_reservations r join public.production_jobs p on p.id=r.production_job_id
where lower(coalesce(p.production_status,'')) in ('closed','cancelled','canceled')
and lower(coalesce(to_jsonb(r)->>'status','active')) not in ('released','consumed','cancelled','canceled');

select '13_FINANCE' as section,'duplicate_primary_order_income' check_name,count(*) affected_count,
 coalesce(jsonb_agg(jsonb_build_object('order_id',order_id,'count',n)),'[]'::jsonb) affected_ids
from (select order_id,count(*) n from public.financial_entries
 where coalesce((to_jsonb(financial_entries)->>'finance_command_owned')::boolean,false)
 group by order_id having count(*)>1) d;
select '13_FINANCE' as section,'finance_pushed_without_entry' check_name,count(*) affected_count,
 coalesce(jsonb_agg(jsonb_build_object('order_id',o.id,'order_number',o.order_number)),'[]'::jsonb) affected_ids
from public.orders o where coalesce(o.finance_pushed,false) and not exists
 (select 1 from public.financial_entries f where f.order_id=o.id);
select '13_FINANCE' as section,'entry_but_order_not_pushed' check_name,count(*) affected_count,
 coalesce(jsonb_agg(jsonb_build_object('order_id',o.id,'order_number',o.order_number)),'[]'::jsonb) affected_ids
from public.orders o where not coalesce(o.finance_pushed,false) and exists
 (select 1 from public.financial_entries f where f.order_id=o.id and
  coalesce((to_jsonb(f)->>'finance_command_owned')::boolean,false));

select '14_PUBLIC_RPC' as section,p.proname as function_name,pg_get_function_identity_arguments(p.oid) signature,
 p.prosecdef as security_definer,has_function_privilege('public',p.oid,'EXECUTE') public_execute,
 coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) anon_execute,
 case when p.proname ~ '(public|tracking|campaign|quote)' then 'EXPECTED_OR_QUESTIONABLE_PUBLIC'
      else 'INTERNAL_REVIEW_REQUIRED' end classification_hint,
 md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (has_function_privilege('public',p.oid,'EXECUTE') or coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false))
order by p.proname,signature;

select '15_TEMP_TRACING' as section,p.proname as function_name,pg_get_function_identity_arguments(p.oid) signature,
 regexp_matches(pg_get_functiondef(p.oid),'(OP_WORKFLOW|HELPER_ENTER|HELPER_EXIT|TRIGGER_ENTER|TRIGGER_EXIT|temporary trace|stage trace)','gi') marker,
 md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and pg_get_functiondef(p.oid) ~* '(OP_WORKFLOW|HELPER_ENTER|HELPER_EXIT|TRIGGER_ENTER|TRIGGER_EXIT|temporary trace|stage trace)';

select '16_DATA_INTEGRITY' as section,'production_order_status_snapshot' check_name,
 count(*) affected_count,coalesce(jsonb_agg(jsonb_build_object('production_job_id',p.id,'order_id',o.id,
 'production_status',p.production_status,'order_status',o.status)),'[]'::jsonb) affected_ids
from public.production_jobs p join public.orders o on o.order_number=p.order_number
where (lower(coalesce(p.production_status,'')),lower(coalesce(o.status,''))) not in
 (('ready_to_print','ready_to_print'),('printing','printing'),('qc_finishing','qc_finishing'),
  ('ready_for_pickup','ready_for_pickup'),('ready_for_shipment','ready_for_shipment'),('closed','closed'),
  ('cancelled','cancelled'),('canceled','canceled'));

select '17_OWNERSHIP' as section,n.nspname schema_name,c.relname object_name,
 case c.relkind when 'r' then 'table' when 'p' then 'partitioned table' when 'v' then 'view'
 when 'm' then 'materialized view' when 'S' then 'sequence' else c.relkind::text end object_type,
 pg_get_userbyid(c.relowner) owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m','S') order by schema_name,object_type,object_name;

select '18_VIEWS' as section,n.nspname schema_name,c.relname view_name,
 case c.relkind when 'm' then 'materialized view' else 'view' end view_type,
 pg_get_userbyid(c.relowner) owner,c.reloptions,
 md5(regexp_replace(pg_get_viewdef(c.oid,false),'\\s+',' ','g')) definition_hash,
 pg_get_viewdef(c.oid,false) definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') order by c.relname;

select '19_TABLE_GRANTS' as section,table_schema,table_name,grantee,privilege_type,is_grantable
from information_schema.role_table_grants where table_schema in ('public','storage')
and grantee in ('anon','authenticated','service_role','PUBLIC') order by table_schema,table_name,grantee,privilege_type;

select '20_IMMUTABILITY' as section,c.relname table_name,c.relrowsecurity rls_enabled,
 coalesce(has_table_privilege('anon',c.oid,'UPDATE'),false) anon_can_update,
 coalesce(has_table_privilege('anon',c.oid,'DELETE'),false) anon_can_delete,
 coalesce(has_table_privilege('authenticated',c.oid,'UPDATE'),false) authenticated_can_update,
 coalesce(has_table_privilege('authenticated',c.oid,'DELETE'),false) authenticated_can_delete,
 coalesce(has_table_privilege('service_role',c.oid,'UPDATE'),false) service_role_can_update,
 coalesce(has_table_privilege('service_role',c.oid,'DELETE'),false) service_role_can_delete,
 coalesce(jsonb_agg(distinct jsonb_build_object('trigger',t.tgname,'definition',pg_get_triggerdef(t.oid,true)))
 filter(where t.oid is not null),'[]'::jsonb) mutation_triggers,
 coalesce(jsonb_agg(distinct jsonb_build_object('policy',pol.polname,'command',pol.polcmd,
 'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)))
 filter(where pol.oid is not null),'[]'::jsonb) policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal left join pg_policy pol on pol.polrelid=c.oid
where n.nspname='public' and c.relname in ('quote_accepted_commercial_snapshots','financial_entries','finance_correction_receipts')
group by c.oid,c.relname,c.relrowsecurity order by c.relname;

select '20_IMMUTABILITY_GUARD_FUNCTIONS' as section,c.relname table_name,t.tgname trigger_name,
 pn.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' guard_function,
 p.prosecdef security_definer,p.proconfig settings,pg_get_userbyid(p.proowner) owner,
 md5(regexp_replace(pg_get_functiondef(p.oid),'\\s+',' ','g')) definition_hash,
 pg_get_functiondef(p.oid) definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal and n.nspname='public'
and c.relname in ('quote_accepted_commercial_snapshots','financial_entries','finance_correction_receipts')
order by c.relname,t.tgname;

select '20_IMMUTABILITY_COLUMN_GRANTS' as section,table_name,column_name,grantee,privilege_type,is_grantable
from information_schema.column_privileges where table_schema='public'
and table_name in ('quote_accepted_commercial_snapshots','financial_entries','finance_correction_receipts')
and grantee in ('anon','authenticated','service_role','PUBLIC')
order by table_name,column_name,grantee,privilege_type;
group by c.relname,c.relrowsecurity order by c.relname;
