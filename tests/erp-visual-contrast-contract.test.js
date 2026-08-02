"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const tokens = fs.readFileSync("css/erp-contrast-tokens.css", "utf8");
const quoteCss = fs.readFileSync("css/quote-finance-contrast.css", "utf8");
const productionCss = fs.readFileSync("css/production-control-modern.css", "utf8");
const quoteHtml = fs.readFileSync("quote.html", "utf8");
const productionHtml = fs.readFileSync("production-control.html", "utf8");

for (const token of ["bg", "panel", "panel-raised", "input", "input-disabled", "border", "border-strong", "text", "text-secondary", "text-muted", "placeholder", "focus", "warning-bg", "error-bg", "success-bg", "disabled-opacity"]) {
  assert.match(tokens, new RegExp(`--erp-${token}:`), `missing shared --erp-${token}`);
}
assert.match(quoteHtml, /erp-contrast-tokens\.css[\s\S]*quote-finance-contrast\.css/);
assert.match(productionHtml, /erp-contrast-tokens\.css[\s\S]*production-control-modern\.css/);
for (const css of [quoteCss, productionCss]) {
  assert.match(css, /::placeholder[^}]*opacity:\s*1/s);
  assert.match(css, /:disabled[^}]*opacity:\s*(?:var\(--erp-disabled-opacity\)|1)/s);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
}
assert.match(quoteCss, /\.quote-order-error[^}]*var\(--erp-error-text\)[^}]*var\(--erp-error-bg\)/s);
assert.match(productionCss, /details\.ops-collapse\s*>\s*summary[^}]*var\(--pc-surface\)/s);
assert.match(productionCss, /\.lane-empty[\s\S]*var\(--pc-text\)/);
assert.doesNotMatch(quoteCss, /(?:\.card|\.panel|\.mode-card|\.summary|\.lite-muted-section)[^{]*\{[^}]*opacity:\s*\.(?:[0-9]+)/s, "active Quote containers must not fade descendants");
assert.doesNotMatch(productionCss, /(?:\.card|\.panel|\.lane|\.job-card)[^{]*\{[^}]*opacity:\s*\.(?:[0-9]+)/s, "active Production containers must not fade descendants");

console.log("Final HTML/CSS Finance-aligned contrast contracts passed.");
