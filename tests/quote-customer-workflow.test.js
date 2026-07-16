"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("quote.html", "utf8");
const quoteSource = fs.readFileSync("quote.js", "utf8");
const pricingSource = fs.readFileSync("js/quote-pricing.js", "utf8");

const customerTypeOptions = [...html.matchAll(/<select id="liteQuoteType">([\s\S]*?)<\/select>/g)][0][1]
  .match(/<option value="[^"]+">/g);
assert.equal(customerTypeOptions.length, 2, "one selector must offer exactly two customer types");
assert.match(html, /<option value="retail">Individual \/ Retail<\/option>/);
assert.match(html, /<option value="business">Business \/ PO<\/option>/);

for (const id of [
  "companyName", "contactName", "poNumber", "customerPartNumber", "olipolyPartNumber",
  "partRevision", "taxExempt", "taxExemptReason", "certificateOnFile", "billingAddress",
  "shippingContactName", "shippingCompany", "shippingAddress", "invoiceRequired", "invoiceType"
]) {
  assert.match(html, new RegExp(`id="${id}"`), `business field ${id} must remain available`);
}
assert.match(quoteSource, /businessFields\.classList\.toggle\("lite-field-hidden", type !== "business"\)/);
assert.match(quoteSource, /retail:[\s\S]*?invoiceRequired: "no"/);
assert.match(quoteSource, /business:[\s\S]*?invoiceRequired: "yes"/);

const typeChangeHandler = quoteSource.match(/function initQuoteType\(\)[\s\S]*?\n  \}/)?.[0] || "";
assert.match(typeChangeHandler, /applyQuoteType\(selector\.value, \{ applyInvoiceDefault: true \}\)/);
assert.doesNotMatch(typeChangeHandler, /reset|clear|depositPercent|paymentTerms/);
assert.doesNotMatch(quoteSource, /resetQuoteTool\(event, \{ keepType:selected, typeChanged:true \}\)/);

assert.match(quoteSource, /fields\.liteQuoteType = liteQuoteType/);
assert.match(quoteSource, /lite_quote_type: liteQuoteType/);
assert.match(quoteSource, /applyQuoteType\(liteType, \{ allowAutofill: false \}\)/);

const pricingContext = {};
vm.createContext(pricingContext);
vm.runInContext(pricingSource, pricingContext);
for (const customerType of ["retail", "business"]) {
  const totals = pricingContext.calculateQuoteTotals({
    customerType,
    quantity: 4,
    manualPiecePrice: "5.125",
    discount: 0,
    taxRate: 6.5,
    depositPercent: 0
  });
  assert.equal(totals.total, 21.83, `${customerType} must use the same $21.83 pricing fixture`);
}

console.log("Individual and Business quote workflow assertions passed.");
