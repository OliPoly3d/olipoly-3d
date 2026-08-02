const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('orders-admin.html', 'utf8');
const sql = fs.readFileSync('supabase/migrations/202608020009_orders_admin_active_metadata_authority.sql', 'utf8');

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

test('write is owner and concurrency filtered, and 403 is never replayed', () => {
  assert.match(html, /orders\?id=eq\.\$\{encodeURIComponent\(activeId\)\}&user_id=eq\.\$\{encodeURIComponent\(currentUser\.id\)\}&updated_at=eq\./);
  assert.match(html, /result\.status === 401 && window\.OliPolyAuth\?\.refresh/);
  assert.doesNotMatch(html, /result\.status === 401 \|\| result\.status === 403/);
  assert.match(html, /res\.data\.length !== 1[\s\S]*This order changed after the page loaded/);
});

test('database authority remains narrow, owner-scoped and active-only', () => {
  assert.match(sql, /alter table public\.orders enable row level security/);
  assert.match(sql, /using \(user_id = auth\.uid\(\) and status not in \('closed', 'fulfilled', 'cancelled'\)\)/);
  assert.match(sql, /with check \(user_id = auth\.uid\(\) and status not in \('closed', 'fulfilled', 'cancelled'\)\)/);
  assert.doesNotMatch(sql, /grant update on (table )?public\.orders to authenticated/i);
  for(const protectedColumn of ['payment_status','paid_date','invoice_number','finance_pushed','updated_at']) {
    assert.match(sql, new RegExp(`revoke update\\([\\s\\S]*?\\b${protectedColumn}\\b[\\s\\S]*?\\) on public\\.orders from authenticated`, 'i'));
  }
});

test('closed orders remain UI read-only independently of Finance', () => {
  assert.match(html, /button\.disabled = closed/);
  assert.match(html, /orderIsClosed\(selectedOrder\)[\s\S]*This order is closed and cannot be edited through normal Save/);
  const lifecycle = html.match(/function orderLifecycleClass\(order\)[\s\S]*?\n    \}/)[0];
  assert.doesNotMatch(lifecycle, /finance_pushed|payment_status/);
});
