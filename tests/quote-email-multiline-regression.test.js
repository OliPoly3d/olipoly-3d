"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const quoteSource = fs.readFileSync("quote.js", "utf8");
const quoteHtml = fs.readFileSync("quote.html", "utf8");
const legacyQuoteSource = fs.readFileSync("js/quote.js", "utf8");

const activeIife = quoteSource.match(/\/\* === Quote Email v2:[\s\S]*?\n\}\)\(\);/)?.[0] || "";
assert.ok(activeIife, "the final Quote Email V2 IIFE must remain active");
assert.match(activeIife, /const escapedMultiline = \(value\) =>\s*esc\(value\)\.replace\(\/\\r\?\\n\/g, "<br>"\);/);
assert.doesNotMatch(activeIife, /window\.escapedMultiline|globalThis\.escapedMultiline/);

const styledBuilder = activeIife.match(/function buildQuoteStyledEmailV2\([\s\S]*?\n  \}/)?.[0] || "";
assert.ok(styledBuilder, "the active styled email builder must exist");

const fields = {
  customerName: "Customer <script> & \"Partner\" 'Owner'",
  quoteTitle: "Project",
  quoteNumber: "Q-100",
  customerNotes: "First <script>alert('notes')</script> & \"quoted\"\nSecond line",
  assumptions: "Assume <script>alert('assumptions')</script> & \"quoted\"\r\nNext line",
  liteQuoteType: "retail",
  paymentTerms: "due_on_receipt"
};
const context = {
  fields,
  totals: { totalText: "$100.00" },
  responseLink: "https://example.test/quote?a=1&b=2"
};
vm.createContext(context);
vm.runInContext(`
  const val = (id, fallback = "") => String(fields[id] || fallback || "").trim();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
  const escapedMultiline = (value) => esc(value).replace(/\\r?\\n/g, "<br>");
  const termsLabel = () => "Due on Receipt";
  const quoteTypeLabel = () => "Retail / Individual Quote";
  ${styledBuilder}
  output = buildQuoteStyledEmailV2(responseLink, totals);
`, context, { filename: "active-quote-email-builder.test.js" });

assert.match(context.output, /First &lt;script&gt;alert\(&#39;notes&#39;\)&lt;\/script&gt; &amp; &quot;quoted&quot;<br>Second line/);
assert.match(context.output, /Assume &lt;script&gt;alert\(&#39;assumptions&#39;\)&lt;\/script&gt; &amp; &quot;quoted&quot;<br>Next line/);
assert.doesNotMatch(context.output, /<script>/);
assert.match(context.output, /background:#312d2b;color:#fff[^>]*>Review & Approve Quote<\/a>/);

assert.match(activeIife, /cleanBtn\.addEventListener\("click",[\s\S]*?openQuoteEmailV2\(\);/,
  "Prepare Customer Email must still reach the final V2 builder");
assert.match(activeIife, /const totals = window\.olipolyQuoteTotals;\s*if \(!totals\) throw new Error\("Authoritative quote totals are not available\."\);/);
assert.match(quoteHtml, /<script src="quote\.js\?v=[^"]+"><\/script>/);
assert.doesNotMatch(quoteHtml, /<script src="js\/quote\.js/);
assert.notEqual(legacyQuoteSource, quoteSource, "legacy js/quote.js remains a separate inactive implementation");

const pdfIife = quoteSource.match(/\/\* === Quote PDF v2:[\s\S]*?\n\}\)\(\);/)?.[0] || "";
assert.match(pdfIife, /const escapedMultiline = \(value\) =>\s*window\.OliPolyDocumentTheme\.esc\(value\)\.replace\(\/\\r\?\\n\/g, "<br>"\);/,
  "the active PDF builder must own its multiline helper too");

console.log("Quote email multiline escaping, CTA contrast, and active wiring assertions passed.");
