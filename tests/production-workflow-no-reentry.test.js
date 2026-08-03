const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/202608030003_remove_recursive_workflow_trigger_paths.sql','utf8');
const trace=fs.readFileSync('supabase/verification/install_production_workflow_stage_trace.sql','utf8');
const graph=fs.readFileSync('supabase/verification/production_workflow_execution_graph.sql','utf8');
const fn=migration.slice(migration.indexOf('create or replace function public.production_workflow_command'),migration.indexOf('-- Fail deployment'));

assert.match(migration,/drop trigger if exists orders_sync_workflow_to_production on public\.orders/);
assert.match(migration,/drop function if exists public\.sync_order_workflow_to_production\(\)/);
assert.match(migration,/pg_get_functiondef\(p\.oid\) ~\* 'production_workflow_command/);
assert.match(migration,/raise exception 'Trigger .* can re-enter production_workflow_command'/);
assert.equal((fn.match(/update public\.production_jobs/g)||[]).length,1,'one Production update');
assert.equal((fn.match(/update public\.orders set status/g)||[]).length,1,'one linked Order update');
assert.equal((fn.match(/insert into public\.project_events/g)||[]).length,1,'one workflow receipt insert');
assert.equal((fn.match(/return v_job;/g)||[]).length,2,'one idempotent return and one successful command return');
assert.doesNotMatch(fn,/perform\s+public\.production_workflow_command|select\s+public\.production_workflow_command|execute[^;]*production_workflow_command/i);
for(const stage of ['ENTER','AUTH_VALIDATED','ORDER_FOUND','PRODUCTION_FOUND','LINK_VALIDATED','COMMAND_VALIDATED','UPDATING_PRODUCTION','PRODUCTION_UPDATED','UPDATING_ORDER','ORDER_UPDATED','UPDATING_TRACKING','WRITING_RECEIPT','RECEIPT_WRITTEN','RETURNING']) assert.match(trace,new RegExp(`stage=${stage}`));
for(const trigger of ['normalize_status','set_orders_updated_at','legacy_order_sync']) {
  assert.match(trace,new RegExp(`trigger=${trigger} stage=TRIGGER_ENTER`));
  assert.match(trace,new RegExp(`trigger=${trigger} stage=TRIGGER_EXIT`));
}
assert.match(graph,/pg_get_triggerdef/);assert.match(graph,/workflow_command_receipts/);
console.log('Production workflow no-reentry execution-graph assertions passed');
