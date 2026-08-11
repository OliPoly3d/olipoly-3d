"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const phoneMigration = fs.readFileSync("supabase/migrations/202608020007_orders_optional_customer_phone.sql", "utf8");
const quoteMigration = fs.readFileSync("supabase/migrations/202608020006_repair_quote_order_optional_phone.sql", "utf8");
const taxMigration = fs.readFileSync("supabase/migrations/202608020005_repair_orders_tax_metadata_and_finance_county.sql", "utf8");
const admin = fs.readFileSync("orders-admin.html", "utf8");
const verification = fs.readFileSync("supabase/verification/quote_order_phone_contract.sql", "utf8");

function quotedColumns(source) {
  return [...source.matchAll(/'([a-z_][a-z0-9_]*)'/g)].map(match => match[1]);
}

const insertMatch = quoteMigration.match(/insert into public\.orders\s*\(([^)]+)\)\s*values/i);
assert.ok(insertMatch, "authoritative Quote conversion must use an explicit Orders INSERT column list");
const insertColumns = insertMatch[1].split(",").map(column => column.trim());

const preflightMatch = phoneMigration.match(/v_required_order_columns constant text\[\] := array\[([\s\S]*?)\];/);
assert.ok(preflightMatch, "migration must validate every conversion INSERT column against information_schema");
const preflightColumns = quotedColumns(preflightMatch[1]);
assert.deepEqual(preflightColumns, insertColumns, "runtime schema preflight must exactly match the Quote conversion INSERT");
assert.equal(new Set(insertColumns).size, insertColumns.length, "Quote conversion INSERT must not repeat columns");

assert.match(phoneMigration, /alter table public\.orders[\s\S]*add column if not exists customer_phone text;/);
assert.match(phoneMigration, /comment on column public\.orders\.customer_phone[\s\S]*Optional customer contact phone/);
assert.doesNotMatch(phoneMigration, /customer_phone text (?:not null|default)/i, "phone stays nullable with no invented default");
assert.match(phoneMigration, /before insert or update of customer_phone[\s\S]*normalize_order_customer_phone/);
assert.match(phoneMigration, /new\.customer_phone := nullif\(btrim\(new\.customer_phone\), ''\)/);
assert.match(phoneMigration, /'n\/a', 'na', 'none', 'not available', 'not provided', 'unknown', '-', '—'/);
assert.match(phoneMigration, /grant update\(customer_phone\) on public\.orders to authenticated/);
assert.match(phoneMigration, /notify pgrst, 'reload schema'/);

for (const field of ["customer_phone", "customer_name", "customer_email", "order_total", "deposit_amount", "balance_amount", "source_quote_number", "order_number"]) {
  assert.ok(insertColumns.includes(field), `conversion INSERT must retain ${field}`);
}
for (const notInserted of ["destination_county", "sales_tax_rate", "taxable_subtotal", "sales_tax_amount"]) {
  assert.ok(!insertColumns.includes(notInserted), `${notInserted} remains snapshot-trigger-owned rather than browser/RPC-recalculated`);
}
assert.match(taxMigration, /create trigger accepted_order_tax_metadata before insert on public\.orders/);
assert.match(taxMigration, /new\.destination_county:=coalesce\(new\.destination_county,v_county\)/);
assert.match(taxMigration, /new\.sales_tax_rate:=coalesce\(new\.sales_tax_rate,v_rate\)/);

assert.match(admin, /id="customerPhone" type="tel" placeholder="Not provided"/);
assert.match(admin, /customer_phone: customerPhone/);
assert.match(admin, /'customer_name','customer_email','customer_phone','order_title'/);
assert.match(admin, /\$\('customerPhone'\)\) \$\('customerPhone'\)\.value = o\.customer_phone \|\| ''/);
assert.match(admin, /o\.customer_phone \? ` • \${esc\(o\.customer_phone\)}`/, 'order list conditionally renders the persisted customer_phone through HTML escaping');
assert.match(admin, /orderIsClosed\(selectedOrder\)[\s\S]*This order is closed and cannot be edited/, 'closed Orders reject ordinary phone edits');

assert.match(verification, /column_name = 'customer_phone'/);
assert.match(verification, /pg_get_functiondef\('public\.respond_to_quote_public\(text,text,text,text\)'::regprocedure\)/);
assert.match(verification, /information_schema\.routine_privileges/);
assert.match(verification, /exists_on_orders/);

console.log(`Orders phone/schema contract passed (${insertColumns.length} Quote conversion columns checked).`);
