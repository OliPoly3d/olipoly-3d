const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202608010001_repair_order_finance_shipping_charged.sql', 'utf8');
const orders = fs.readFileSync('orders-admin.html', 'utf8');
const originalPosting = fs.readFileSync('supabase/migrations/202607210005_authoritative_finance_posting_corrections.sql', 'utf8');
const invoiceAuthority = fs.readFileSync('supabase/migrations/202607210009_invoice_authority_contract.sql', 'utf8');

// OP-000010's immutable accepted totals contain the complete legacy contract and
// intentionally contain no distinct customer shipping revenue component.
const op10 = Object.freeze({
  quantity: 4,
  subtotal: 20.50,
  discount: 0,
  taxable_subtotal: 20.50,
  tax_rate: 6.5,
  tax: 1.33,
  deposit: 0,
  balance: 21.83,
  final_total: 21.83
});
assert.equal(op10.subtotal, 20.50);
assert.equal(op10.tax, 1.33);
assert.equal(op10.final_total, 21.83);
assert.equal(op10.deposit, 0);
assert.equal(op10.balance, 21.83);
assert.equal('shipping' in op10, false);

assert.match(migration, /create or replace function public\.apply_invoice_authority_to_finance_post\(\)/i);
assert.match(migration, /v_totals \? 'shipping_charged'[\s\S]*v_shipping_source := 'invoice_totals\.shipping_charged'/i, 'explicit canonical shipping has first priority');
assert.match(migration, /v_totals \? 'shipping'[\s\S]*v_shipping_source := 'invoice_totals\.shipping'/i, 'explicit legacy shipping is preserved');
assert.match(migration, /v_shipping_charged := 0;[\s\S]*verified_legacy_totals_no_shipping_component/i, 'verified complete legacy totals receive explicit zero');
assert.match(migration, /v_shipping_charged is distinct from v_shipping_explicit[\s\S]*contradict/i, 'contradictory authoritative values fail');
assert.match(migration, /jsonb_typeof\(v_totals->'shipping_charged'\) <> 'number'/i, 'malformed values fail');
assert.match(migration, /FINANCE_SHIPPING_UNRESOLVED[\s\S]*errcode='22023'/i, 'shipping validation has a stable server error identity');
assert.match(migration, /not \(v_complete and v_order_total is not null and v_final=round\(v_order_total::numeric,2\)\)[\s\S]*raise exception/i, 'unverified totals fail before normalization/insert');
assert.match(migration, /new\.shipping_charged := v_shipping_charged/i, 'Finance receives an explicit non-null resolved value');
assert.match(migration, /new\.sales_tax_collected := \(v_totals->>'tax'\)::numeric/i, 'accepted tax remains snapshot-owned');
assert.doesNotMatch(migration, /new\.shipping_cost\s*:=/i, 'shipping cost is never substituted for shipping charged');
assert.doesNotMatch(migration, /alter table[\s\S]*shipping_charged[\s\S]*default/i, 'the fix is normalization, not a table default');
assert.doesNotMatch(migration, /grant execute[\s\S]*authenticated/i, 'trigger helper is not browser executable');
assert.doesNotMatch(migration, /disable row level security|drop constraint|drop not null/i, 'RLS and NOT NULL are not weakened');

// Existing transaction/idempotency authority remains the single write path.
assert.match(originalPosting, /insert into public\.financial_entries\([\s\S]*shipping_charged/i);
assert.match(originalPosting, /financial_entries_order_income_once/i);
assert.match(originalPosting, /return jsonb_build_object\('idempotent', true/i);
assert.match(originalPosting, /insert into public\.financial_entries[\s\S]*update public\.orders[\s\S]*finance_pushed = true/i, 'Order status follows the Finance insert in one RPC transaction');
assert.match(invoiceAuthority, /invoice_totals[\s\S]*subtotal[\s\S]*tax[\s\S]*final_total/i, 'existing invoice totals contract remains intact');

assert.match(orders, /result\?\.idempotent \? 'Order is already posted to Finance\.' : 'Order posted to Finance\.'/);
assert.match(orders, /FINANCE_SHIPPING_UNRESOLVED[\s\S]*Finance could not determine the customer shipping charge/i);
assert.match(orders, /Finance posting configuration is incomplete\. The order was not posted\./);
for (const field of ['orderNumber', 'correlationId', 'rpcName', 'httpStatus', 'postgresCode', 'postingStage', 'shippingValue', 'shippingSource']) {
  assert.match(orders, new RegExp(`${field}:`), `structured diagnostics include ${field}`);
}
assert.doesNotMatch(orders.slice(orders.indexOf('async function postOrderToFinanceCommand'), orders.indexOf('function buildCatalogPartPayload')), /shipping_charged\s*:\s*.*\|\|\s*0/, 'browser does not invent shipping revenue');

console.log('Orders Finance shipping_charged regression assertions passed.');
