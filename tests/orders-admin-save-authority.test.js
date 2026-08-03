const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('orders-admin.html', 'utf8');
const sql = fs.readFileSync('supabase/migrations/202608020010_orders_metadata_update_command.sql', 'utf8');

test('ordinary payload builder includes changed allowlisted metadata only', () => {
  const columnsSource = html.match(/const ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)[0];
  const builderSource = html.match(/function buildOrdinaryOrderEditPayload\([\s\S]*?\n    \}/)[0];
  const context = {};
  vm.runInNewContext(`${columnsSource};${builderSource};this.build = buildOrdinaryOrderEditPayload`, context);
  const payload = context.build({customer_name:'New',status:'closed',payment_status:'paid',finance_pushed:true,destination_county:'Summit',sales_tax_rate:6.75,updated_at:'forged'}, {customer_name:'Old',destination_county:'Summit'});
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {customer_name:'New',sales_tax_rate:6.75});
});

test('one canonical Save path owns click, keyboard and pending suppression', () => {
  assert.match(html, /if\(pendingOrderSaves\.has\(lockKey\)\) return pendingOrderSaves\.get\(lockKey\)/);
  assert.match(html, /\.finally\(\(\) => \{[\s\S]*pendingOrderSaves\.delete\(lockKey\)[\s\S]*setOrderSavePending\(false\)/);
  assert.match(html, /setAttribute\('aria-busy','true'\)/);
  assert.match(html, /bind\('saveBtn', saveOrder, 'Save Order'\)/);
  assert.match(html, /detail\.addEventListener\('keydown'[\s\S]*event\.preventDefault\(\);[\s\S]*saveOrder\(\)/);
  assert.equal((html.match(/bind\('saveBtn', saveOrder, 'Save Order'\)/g) || []).length, 1);
});

test('one RPC request carries order identity and concurrency, and 403 is never replayed', () => {
  assert.match(html, /requestPath = '\/rest\/v1\/rpc\/update_order_metadata'/);
  assert.match(html, /p_order_id: activeId,[\s\S]*p_expected_updated_at: currentRow\.updated_at,[\s\S]*p_changes: ordinaryPayload/);
  assert.match(html, /result\.status === 401 && window\.OliPolyAuth\?\.refresh/);
  assert.doesNotMatch(html, /result\.status === 401 \|\| result\.status === 403/);
  assert.match(html, /res\.data\.length !== 1[\s\S]*This order changed after the page loaded/);
});

test('database authority remains narrow, owner-scoped and active-only', () => {
  assert.match(sql, /alter table public\.orders enable row level security/);
  assert.match(sql, /where id = p_order_id and user_id = v_actor/);
  assert.match(sql, /in \('closed','fulfilled','cancelled','canceled'\)/);
  assert.doesNotMatch(sql, /grant update on (table )?public\.orders to authenticated/i);
  assert.match(sql, /revoke update on table public\.orders from public, anon, authenticated/);
  for(const protectedColumn of ['status','payment_status','paid_date','invoice_number','finance_pushed','updated_at']) {
    assert.doesNotMatch(sql.match(/v_allowed constant text\[\] := array\[([\s\S]*?)\];/)[1], new RegExp(`'${protectedColumn}'`));
  }
});

test('frontend allowlist and RPC authority contract stay identical', () => {
  const frontend = [...html.match(/ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)[1].matchAll(/'([a-z0-9_]+)'/g)].map(match => match[1]);
  const command = [...sql.match(/v_allowed constant text\[\] := array\[([\s\S]*?)\];/)[1].matchAll(/'([a-z0-9_]+)'/g)].map(match => match[1]);
  assert.deepEqual(frontend, command);
  for(const column of frontend) assert.match(sql, new RegExp(`\\b${column}\\s*=`), `${column} must be updated by the command`);
});

test('a two-field county/rate metadata payload is accepted for OP-000189', () => {
  const columnsSource = html.match(/const ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)[0];
  const builderSource = html.match(/function buildOrdinaryOrderEditPayload\([\s\S]*?\n    \}/)[0];
  const context = {};
  vm.runInNewContext(`${columnsSource};${builderSource};this.build = buildOrdinaryOrderEditPayload`, context);
  const payload = context.build({order_number:'OP-000189',destination_county:'Summit',sales_tax_rate:6.75,status:'closed'}, {order_number:'OP-000189',destination_county:'Portage',sales_tax_rate:7.25,status:'printing'});
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {destination_county:'Summit',sales_tax_rate:6.75});
});

test('closed orders remain UI read-only independently of Finance', () => {
  assert.match(html, /button\.disabled = closed/);
  assert.match(html, /orderIsClosed\(selectedOrder\)[\s\S]*This order is closed and cannot be edited\./);
  const lifecycle = html.match(/function orderLifecycleClass\(order\)[\s\S]*?\n    \}/)[0];
  assert.doesNotMatch(lifecycle, /finance_pushed|payment_status/);
});
