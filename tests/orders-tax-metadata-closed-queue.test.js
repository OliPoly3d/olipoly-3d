const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const orders = fs.readFileSync('orders-admin.html','utf8');
const workflowSource = fs.readFileSync('js/workflow-status.js','utf8');
const migration = fs.readFileSync('supabase/migrations/202608020005_repair_orders_tax_metadata_and_finance_county.sql','utf8');
const quote = fs.readFileSync('quote.js','utf8');

function workflow() {
  const context = { module:{exports:{}}, exports:{} };
  vm.runInNewContext(workflowSource, context);
  return context.module.exports;
}

test('Orders PATCH schema contract is backed by the focused migration', () => {
  const contract = [...orders.matchAll(/const ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/g)][0][1];
  const columns = [...contract.matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const column of ['destination_county','sales_tax_rate','taxable_subtotal','sales_tax_amount']) {
    assert.ok(columns.includes(column), `${column} must remain in the save contract`);
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`));
  }
  assert.match(migration, /orders_destination_county_valid[\s\S]*is_ohio_county\(destination_county\)/);
  assert.match(orders, /sales_tax_rate: \$\('orderSalesTaxRate'\)\?\.value === '' \? null : Number/, 'explicit zero is not replaced by null');
});

test('Quote, Order snapshot, and Finance use one destination county path', () => {
  assert.match(quote, /destination_county: document\.getElementById\('salesTax'\)\?\.dataset\.taxCounty \|\| null/);
  assert.match(migration, /new\.destination_county:=coalesce\(new\.destination_county,v_county\)/);
  assert.match(migration, /'destination_county',v_order\.destination_county[\s\S]*'sales_tax_rate'/);
  assert.match(migration, /new\.sales_county:=v_county;[\s\S]*new\.sales_tax_rate:=v_rate;[\s\S]*new\.sales_tax_collected:=v_tax;[\s\S]*new\.amount:=v_taxable/);
  assert.match(migration, /FINANCE_TAX_COUNTY_REQUIRED: Select the destination county before posting this taxable order to Finance/);
  assert.match(migration, /round\(v_taxable\*v_rate\/100,2\) is distinct from round\(v_tax,2\)/);
});

test('OP-000010 accepted totals remain unchanged', () => {
  const fixture = fs.readFileSync('tests/orders-finance-shipping-charged.test.js','utf8');
  assert.match(fixture, /taxable_subtotal: 20\.50/);
  assert.match(fixture, /tax_rate: 6\.5/);
  assert.match(fixture, /tax: 1\.33/);
  assert.match(fixture, /final_total: 21\.83/);
});

test('lifecycle aliases classify centrally and independently of Finance', () => {
  const api = workflow();
  for (const status of ['closed','fulfilled','cancelled']) assert.equal(api.normalizeOrderStatus(status), 'closed');
  for (const status of ['ready_to_print','printing','needs_action']) assert.notEqual(api.normalizeOrderStatus(status), 'closed');
  assert.match(orders, /function orderLifecycleClass\(order\)[\s\S]*normalizeOrderStatusForDb\(order\?\.status\) === 'closed'/);
  assert.match(orders, /function activeOrders\(\)[\s\S]*orderLifecycleClass\(o\) === 'active'/);
  assert.doesNotMatch(orders.match(/function activeOrders\(\)[\s\S]*?\n    }/)[0], /finance_pushed|payment_status|orderClosureFlags/);
});

test('closed Orders are read-only and zero-value Orders are never Finance-ready', () => {
  assert.match(orders, /Closed Order[^]*This order is closed\./);
  assert.match(orders, /button\.disabled = closed/);
  assert.match(orders, /This order is closed and cannot be edited through normal Save\./);
  assert.match(orders, /num\(o\.order_total\) > 0 && !o\.finance_pushed/);
  assert.doesNotMatch(migration, /disable row level security|grant update on (table )?public\.orders/);
});
