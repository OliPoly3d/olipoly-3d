-- Read-only deployed execution graph. This reports actual live trigger/function
-- definitions rather than assuming every historical migration completed.
select c.relname table_name,t.tgname trigger_name,
       pg_get_triggerdef(t.oid,true) trigger_definition,
       p.oid::regprocedure trigger_function,
       pg_get_functiondef(p.oid) trigger_function_definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and n.nspname='public'
  and c.relname in ('production_jobs','orders','order_tracking_public','project_events','workflow_command_receipts')
order by c.relname,t.tgname;

select p.oid::regprocedure function_identity,pg_get_functiondef(p.oid) function_definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (p.proname in ('production_workflow_command','workflow_public_status_text','workflow_public_next_step','normalize_accepted_order_status','enforce_accepted_order_status','set_orders_updated_at','sync_order_workflow_to_production')
       or pg_get_functiondef(p.oid) ~* 'production_workflow_command\s*\(')
order by p.oid::regprocedure::text;
