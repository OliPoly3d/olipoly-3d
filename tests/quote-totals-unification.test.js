"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const pricingSource = fs.readFileSync("js/quote-pricing.js", "utf8");
const quoteSource = fs.readFileSync("quote.js", "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(pricingSource, context, { filename: "js/quote-pricing.js" });

const totals = context.calculateQuoteTotals({
  quantity: 4,
  manualPiecePrice: 5.125,
  suggestedTotal: 20.78,
  discount: 0,
  taxRate: 6.5,
  depositPercent: 0
});

assert.deepEqual(
  { subtotal: totals.subtotal, tax: totals.tax, total: totals.total, balance: totals.balance },
  { subtotal: 20.50, tax: 1.33, total: 21.83, balance: 21.83 }
);
assert.equal(totals.pricingMode, "manual");
assert.notEqual(totals.subtotal, totals.suggestedTotal);

// The active screen renderer stores this exact engine result, while the active
// PDF and email builders read it directly rather than invoking a calculator or
// falling back to rendered DOM totals.
assert.match(quoteSource, /window\.olipolyQuoteTotals=t;/);
assert.match(quoteSource, /function collectQuotePdfData[\s\S]*?const totals = window\.olipolyQuoteTotals;[\s\S]*?return \{[\s\S]*?totals,/);
assert.match(quoteSource, /async function openQuoteEmailV2[\s\S]*?const totals = window\.olipolyQuoteTotals;[\s\S]*?quoteEmailV2Last = \{ to, subject, html, plain, totals \};/);

const pdfCollector = quoteSource.match(/function collectQuotePdfData[\s\S]*?\n  \}/)?.[0] || "";
const emailBuilder = quoteSource.match(/async function openQuoteEmailV2[\s\S]*?\n  \}/)?.[0] || "";
for (const [name, source] of [["PDF", pdfCollector], ["email", emailBuilder]]) {
  assert.ok(source, `${name} runtime builder must exist`);
  assert.doesNotMatch(source, /calculateQuoteTotals|olipolyGetQuoteTotals|moneyText|sumSubtotal|sumTax|sumDeposit|sumBalance/);
}

console.log("Quote/PDF/email authoritative totals matrix passed.");
