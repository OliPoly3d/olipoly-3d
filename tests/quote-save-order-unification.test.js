"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const pricingSource = fs.readFileSync("js/quote-pricing.js", "utf8");
const quoteSource = fs.readFileSync("quote.js", "utf8");
const responseSource = fs.readFileSync("quote-response.html", "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(pricingSource, context);

function acceptanceTotals(manualPiecePrice) {
  return context.calculateQuoteTotals({
    quantity: 4,
    manualPiecePrice,
    discount: 0,
    taxRate: 6.5,
    depositPercent: 0
  });
}

const paid = acceptanceTotals("5.125");
assert.deepEqual(
  { piece: paid.piecePrice, subtotal: paid.subtotal, tax: paid.tax, total: paid.total, deposit: paid.deposit, balance: paid.balance },
  { piece: 5.125, subtotal: 20.5, tax: 1.33, total: 21.83, deposit: 0, balance: 21.83 }
);
const complimentary = acceptanceTotals("0");
assert.equal(complimentary.hasManualPrice, true);
assert.equal(complimentary.pricingMode, "manual");
assert.deepEqual(
  { piece: complimentary.piecePrice, subtotal: complimentary.subtotal, tax: complimentary.tax, total: complimentary.total, balance: complimentary.balance },
  { piece: 0, subtotal: 0, tax: 0, total: 0, balance: 0 }
);

const snapshotBuilder = quoteSource.match(/function authoritativeTotalsSnapshot\([\s\S]*?\n  \}/)?.[0] || "";
for (const key of ["quantity", "price_source", "piece_price", "subtotal", "discount", "taxable_subtotal", "tax_rate", "tax", "deposit", "balance", "final_total"]) {
  assert.match(snapshotBuilder, new RegExp(`${key}:`), `snapshot must persist ${key}`);
}
assert.match(quoteSource, /customer_totals: totalsSnapshot/);
assert.match(quoteSource, /production_estimate: productionEstimateSnapshot\(fields\)/);
assert.match(quoteSource, /quoteTotal: totalsSnapshot\.final_total/);
assert.match(quoteSource, /quote_total: totalsSnapshot\.final_total/);
assert.match(quoteSource, /writeLocalHistory\(readLocalHistory\(\)\.filter\(\(q\) => q\.quoteNumber !== quoteNumber\)\)/, "successful remote save clears its recovery copy");
assert.match(quoteSource, /durable: false/);
assert.match(quoteSource, /No browser copy is being shown as durable/);

const internalAcceptance = quoteSource.match(/async function acceptAndCreateOrder\([\s\S]*?\n  \}/)?.[0] || "";
assert.match(internalAcceptance, /saveCloudQuote\(\)/);
assert.match(internalAcceptance, /acceptQuoteThroughServer/);
assert.doesNotMatch(internalAcceptance, /order_total\s*:|subtotal\s*:|tax\s*:|deposit_amount\s*:|balance_amount\s*:|calculateQuoteTotals/);
assert.match(responseSource, /respond_to_quote_public[\s\S]*?p_response:decision/);
assert.doesNotMatch(quoteSource, /function (?:totalAmount|depositAmount|buildOrderPayload|upsertOrder|updateQuoteAccepted)\b/);

console.log("Saved quote and accepted order totals unification passed.");
