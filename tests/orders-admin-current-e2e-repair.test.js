const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('orders-admin.html', 'utf8');
const sql = fs.readFileSync('supabase/migrations/202608110001_reconcile_current_e2e_order_lifecycle.sql', 'utf8');

test('order list rendering uses its local escaping authority and no undefined document theme alias', () => {
  const renderList = html.match(/function renderList\(\)[\s\S]*?\n    async function signup/)[0];
  assert.doesNotMatch(renderList, /\bT\./);
  assert.match(renderList, /esc\(o\.customer_phone\)/);
  for (const marker of ['order-row', 'orderNeedsAction', 'orderIsClosed', "o.id===activeId", 'ready_for_fulfillment', 'payment_status']) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('remote owner-scoped fetch normalizes one authoritative status for every renderer', () => {
  assert.match(html, /orders = \(data \|\| \[\]\)\.map\(order => \(\{\.\.\.order, status: normalizeOrderStatusForDb\(order\.status\)\}\)\)/);
  assert.match(html, /\$\('status'\)\.value = normalizeOrderStatusForDb\(o\.status/);
  assert.match(html, /if \(\$\('status'\)\) \$\('status'\)\.disabled = true/);
  assert.doesNotMatch(html, /currentRow && currentRow\.status !== payload\.status/);
  assert.match(html, /const ordinaryPayload = buildOrdinaryOrderEditPayload\(payload, currentRow\)/);
});

test('canonical fulfillment-ready status feeds finance and daily fulfillment UI', () => {
  assert.match(html, /normalizeOrderStatusForDb\(order\.status\) !== 'ready_for_fulfillment'/);
  assert.match(html, /const ready = active\.filter\(o => o\.status === 'ready_for_fulfillment'\)/);
  assert.doesNotMatch(html.match(/function oaDailyBuckets\(\)[\s\S]*?return \{overdue/)[0], /ready_for_pickup|completed|shipped/);
});

test('one-time reconciliation accepts independent document sequences but fails closed on exact identity and versions', () => {
  for (const value of [
    '48fb7537-e97e-44a5-81f7-1995a79a37ae',
    '10766f5b-b9e0-465c-9526-ce96c065468e',
    'e75bebfe-fb30-4c39-9aad-695bc4727732',
    'Q-000014', 'OP-000190',
    '2026-08-11 12:46:50.242621+00', '2026-08-11 12:50:03.094683+00'
  ]) assert.match(sql, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(sql, /v_quote\.converted_order_number is distinct from 'OP-000190'/);
  assert.match(sql, /v_order\.source_quote_number is distinct from 'Q-000014'/);
  assert.match(sql, /set status = 'ready_for_fulfillment'/);
  const executableSql = sql.replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(executableSql, /consume_production_attempt|inventory_transactions|payment_status|finance_pushed/);
  assert.match(sql, /where order_number = 'OP-000190' and user_id = v_order\.user_id/);
  assert.match(sql, /v_tracking_count <> 1/);
});
