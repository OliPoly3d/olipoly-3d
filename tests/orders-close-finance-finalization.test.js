const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('orders-admin.html','utf8');
const sql = fs.readFileSync('supabase/migrations/202608100004_orders_close_and_finance_finalization.sql','utf8');

test('ordinary editing cannot present or persist a lifecycle change',()=>{
  assert.match(html,/<select id="status" disabled aria-readonly="true"/);
  const allowlist = html.match(/ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)[1];
  assert.doesNotMatch(allowlist,/'status'/);
  assert.match(html,/id="closeOrderBtn"[^>]*>Close Order</);
  assert.match(html,/fulfillmentWorkflowRpcRequest\(order\.order_number,'close_order',order\.updated_at/);
  assert.match(html,/authoritative\.status\) !== 'closed'/);
});

test('one server closure rule protects manual and Finance close paths',()=>{
  assert.match(sql,/order_status_is_closure_eligible\(p_status text\)/);
  assert.match(sql,/= 'ready_for_fulfillment'/);
  assert.ok((sql.match(/public\.order_status_is_closure_eligible\(/g)||[]).length >= 5);
  assert.doesNotMatch(sql,/status\s+in\s*\([^\n]*(?:ready_to_print|printing|qc)[^\n]*\)[^\n]*status='closed'/);
  assert.match(sql,/if v_order\.status='closed' then return v_order; end if/);
});

test('manual close is owner-scoped, concurrent, audited, and does not touch Finance',()=>{
  const fn = sql.match(/create or replace function public\.fulfillment_workflow_command[\s\S]*?end \$\$;/)[0];
  assert.match(fn,/auth\.uid\(\)/);
  assert.match(fn,/v_order\.user_id is distinct from v_actor/);
  assert.match(fn,/updated_at is distinct from p_expected_updated_at/);
  assert.match(fn,/event_type,details[\s\S]*'order\.closed'/);
  assert.doesNotMatch(fn,/finance_pushed|financial_entries|payment_status/);
});

test('Finance posting validates payment and final lifecycle before atomically closing',()=>{
  const fn = sql.match(/create or replace function public\.post_order_finance_income[\s\S]*?end \$\$;/)[0];
  assert.match(fn,/FINANCE_PAYMENT_INCOMPLETE: Mark this Order paid before pushing it to Finance/);
  assert.match(fn,/FINANCE_ORDER_NOT_READY_TO_CLOSE/);
  const insertAt = fn.indexOf('insert into public.financial_entries');
  const closeAt = fn.indexOf("status='closed'");
  assert.ok(insertAt > 0 && closeAt > insertAt,'Finance entry is inserted before the Order is closed in the same function transaction');
  assert.match(fn,/finance_pushed=true,finance_pushed_at=v_now,status='closed'/);
  assert.match(fn,/production_status='closed'/);
  assert.match(fn,/order_tracking_public set status='closed'/);
  assert.match(fn,/select \* into v_entry[\s\S]*if found then[\s\S]*'idempotent',true/);
});

test('RPC exposure and existing Orders RLS remain narrow',()=>{
  assert.match(sql,/set search_path=public,pg_temp/);
  assert.match(sql,/revoke all on function public\.fulfillment_workflow_command[\s\S]*from public,anon/);
  assert.match(sql,/revoke all on function public\.order_status_is_closure_eligible\(text\) from public,anon,authenticated/);
  assert.doesNotMatch(sql,/grant update on (table )?public\.orders/i);
  assert.doesNotMatch(sql,/disable row level security/i);
});

test('operator receives explicit closeout outcomes',()=>{
  assert.match(html,/Finance entry created and Order closed\./);
  assert.match(html,/Order closed\. No Finance entry was required\./);
  assert.match(html,/Mark this Order paid before pushing it to Finance\./);
  assert.match(html,/Cannot push to Finance: the Order must be Ready for Pickup \/ Shipment\./);
});
