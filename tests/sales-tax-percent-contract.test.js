"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/tax-rate.js", "utf8"), context);
const { normalizeTaxRatePercent, calculateSalesTax } = context.OliPolyTax;

assert.equal(normalizeTaxRatePercent(0), 0, "explicit zero is preserved");
assert.equal(normalizeTaxRatePercent(7), 7, "7 remains percentage points");
assert.equal(normalizeTaxRatePercent(6.5), 6.5, "fractional percentage points are preserved");
assert.equal(normalizeTaxRatePercent(0.07), 0.07, "valid sub-1 rates are not silently reinterpreted");
assert.equal(calculateSalesTax(40, 7), 2.8);
assert.equal(calculateSalesTax(20.50, 6.5), 1.33);
assert.equal(calculateSalesTax(100, 0), 0);
for (const invalid of [NaN, Infinity, -Infinity, -1, 20.01]) {
  assert.throws(() => normalizeTaxRatePercent(invalid));
}

const orders = fs.readFileSync("orders-admin.html", "utf8");
const finance = fs.readFileSync("finance-pro.js", "utf8");
const quote = fs.readFileSync("js/quote-pricing.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/202608020008_canonical_sales_tax_rate_percent_contract.sql", "utf8");

assert.match(orders, /calculateSalesTax\(subtotal, rate\)/, "Orders Admin uses shared percent math");
assert.doesNotMatch(orders, /subtotal \* rate \+ Number\.EPSILON/, "280.00 decimal-fraction defect is absent");
assert.match(quote, /root\.calculateSalesTax\(subtotal, taxRate\)/, "Quote pricing uses shared tax authority");
assert.match(finance, /calculateSalesTax\(amount, els\.salesTaxRate\.value\)/, "Finance entry uses shared tax authority");
assert.match(finance, /calculateSalesTax\(taxable, rate\)/, "Finance correction uses shared tax authority");
assert.match(migration, /round\(new\.amount \* new\.sales_tax_rate \/ 100,2\)/, "server validates posting with percentage points");
assert.match(migration, /likely legacy decimal fraction[\s\S]*unresolved\/ambiguous/, "candidate report distinguishes proven and ambiguous sub-1 rates");
assert.match(migration, /grant select on public\.sales_tax_rate_contract_candidates to authenticated,service_role/, "candidate report is read-only to operators");
assert.doesNotMatch(migration, /update public\.financial_entries/, "migration never mutates append-only Finance originals");

console.log("Canonical sales-tax percentage-point contract passed.");
