const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/tax-rate.js');
const L = require('../js/order-line-items.js');
require('../js/quote-pricing.js');
const P = require('../js/order-pricing.js');
const A = require('../js/invoice-authority.js');
const items = [{id:'dragon',description:'Dragon',quantity:5,unit_price:3},{id:'puppy',description:'Puppy',quantity:1,unit_price:2}];
function section(file, start, end) {
  const source=fs.readFileSync(file,'utf8');
  return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
}
function rendererContext() {
  const c={window:{OliPolyLineItems:L,OliPolyInvoiceAuthority:A},today:()=> '2026-09-28',invoiceTermsLabelV2:()=> 'Due on receipt',paymentLabel:v=>v};
  vm.createContext(c);vm.runInContext(fs.readFileSync('js/document-theme.js','utf8'),c);
  c.money=c.window.OliPolyDocumentTheme.money;
  return c;
}
test('active invoice PDF and emails show revised items, shipping, tax and unpaid total',()=>{
  const c=rendererContext();
  vm.runInContext(section('orders-admin.html','function buildInvoiceV2HTML(order)','function generateInvoicePdfV2(order)'),c);
  vm.runInContext(section('orders-admin.html','function buildInvoicePlainEmail(d)','let lastInvoiceEmail='),c);
  const accepted=P.snapshot([items[0]],{shipping:6,taxRate:7});
  const invoice=A.normalize({reconciliation_status:'verified',component_breakdown_available:true,accepted_commercial_breakdown:accepted,
    identity:{order_number:'OP-000198',quote_number:'Q-000304',order_title:'Mixed toys'},
    pricing_revision:{number:1,reason:'Second item canceled; shipping finalized'},
    current_payment_state:{order_total:22.47,balance_amount:22.47,amount_paid:0,payment_status:'unpaid'}});
  const pdf=c.buildInvoiceV2HTML(invoice);
  assert.match(pdf,/<td>Dragon<\/td>/);assert.match(pdf,/<td>Shipping<\/td>/);
  assert.match(pdf,/\$22\.47/);assert.match(pdf,/\$1\.47/);assert.doesNotMatch(pdf,/Puppy|PAID/);
  assert.match(pdf,/Second item canceled/);
  for(const email of [c.buildInvoicePlainEmail(invoice),c.buildInvoiceHtmlEmail(invoice)]) {
    assert.match(email,/Dragon/);assert.match(email,/Shipping/);assert.match(email,/\$22\.47/);assert.doesNotMatch(email,/Puppy/);
  }
});
test('active quote PDF and emails preserve multiple prices and deferred-shipping disclosure',()=>{
  const c=rendererContext();
  const fields={quoteNumber:'Q-000304',quoteTitle:'Mixed toys'};
  Object.assign(c,{escapedMultiline:A.escapedMultiline,absoluteAssetUrl:v=>v,quotePlaceholderImage:'placeholder.png',
    val:id=>fields[id]||'',esc:A.escapeHtml,quoteTypeLabel:()=> 'Retail',termsLabel:()=> 'Due on receipt'});
  c.window.olipolyQuoteShippingNote=()=> 'Shipping is not included and will be added to the final invoice if shipment is required.';
  vm.runInContext(section('quote.js','function buildQuotePdfV2Html(data)','function quotePdfV2Css()'),c);
  vm.runInContext(section('quote.js','function buildQuotePlainEmailV2(responseLink, totals)','let quoteEmailV2Last ='),c);
  const totals={...globalThis.calculateQuoteTotals({lineItems:items,shippingDeferred:true,taxRate:7}),totalText:'$18.19',taxText:'$1.19'};
  const pdf=c.buildQuotePdfV2Html({mode:'quote',quoteNumber:'Q-000304',quoteTitle:'Mixed toys',qty:6,total:'$18.19',tax:'$1.19',totals,
    orderNumber:'Assigned when accepted',notes:c.window.olipolyQuoteShippingNote(),assumptions:'Scope confirmed'});
  for(const doc of [pdf,c.buildQuotePlainEmailV2('https://example.test/review',totals),c.buildQuoteStyledEmailV2('https://example.test/review',totals)]) {
    assert.match(doc,/Dragon/);assert.match(doc,/Puppy/);assert.match(doc,/\$15\.00/);assert.match(doc,/\$2\.00/);
    assert.match(doc,/\$18\.19/);assert.match(doc,/Shipping is not included/);assert.doesNotMatch(doc,/OP-000304/);
  }
});
test('quote item editor add/edit/remove/restore and shipping controls work in the actual page DOM', {skip:!process.env.JSDOM_MODULE}, async()=>{
  const {JSDOM}=require(process.env.JSDOM_MODULE);
  const dom=new JSDOM(fs.readFileSync('quote.html','utf8'),{runScripts:'outside-only',url:'https://example.test/quote.html'});
  const w=dom.window;
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  w.olipolyQuoteTotals={piecePrice:3};w.olipolySyncQuoteTotals=()=>{};
  w.eval(fs.readFileSync('js/order-line-items.js','utf8'));
  w.eval(fs.readFileSync('js/quote-line-items.js','utf8'));
  const $=id=>w.document.getElementById(id);
  $('quoteTitle').value='Dragon';$('qty').value=5;$('quoteItemizeBtn').click();
  const input=(selector,value)=>{const el=w.document.querySelector(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  w.document.querySelector('#quoteItems [data-add]').click();
  input('#quoteItems [data-item="1"] [data-field="description"]','Puppy');
  input('#quoteItems [data-item="1"] [data-field="unit_price"]','2');
  assert.deepEqual(JSON.parse($('quoteLineItems').value).map(i=>i.line_total),[15,2]);
  input('#quoteItems [data-item="1"] [data-field="quantity"]','0');
  assert.throws(()=>w.olipolyReadQuoteItems(),/positive whole/,'invalid draft cannot silently save stale prices');
  w.document.querySelector('#quoteItems [data-remove="1"]').click();
  assert.equal(w.olipolyReadQuoteItems().length,1);
  $('quoteShippingChargeMode').value='deferred';$('quoteShippingChargeMode').dispatchEvent(new w.Event('change'));
  assert.equal($('customerShippingCharge').disabled,true);assert.match($('quoteShippingNotice').textContent,/final invoice/);
  $('quoteLineItems').value='[]';$('quoteLineItems').dispatchEvent(new w.Event('change'));
  assert.equal(w.olipolyReadQuoteItems().length,0);assert.equal($('quoteItemizeBtn').classList.contains('hidden'),false);
  dom.window.close();
});
