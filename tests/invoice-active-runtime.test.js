const assert = require('node:assert/strict');
const fs = require('node:fs');
const A = require('../js/invoice-authority.js');
const orders = fs.readFileSync('orders-admin.html', 'utf8');

const op10 = {
  reconciliation_status:'verified', component_breakdown_available:true,
  breakdown_source:'legacy_offer_quote_data_customer_totals',
  identity:{order_number:'OP-000010',quote_number:'Q-0010',customer_name:'Fictional <Customer> & Co',customer_email:'billing@example.invalid',order_title:'A very long project title '.repeat(12),billing_address:'101 Example Ave\nSuite <2>',fulfillment:'shipping'},
  accepted_commercial_breakdown:{quantity:4,piece_price:5.125,subtotal:20.50,discount:0,taxable_subtotal:20.50,tax_rate:6.5,tax:1.33,deposit:0,balance:21.83,final_total:21.83},
  current_payment_state:{order_total:21.83,deposit_amount:0,balance_amount:21.83,amount_paid:0,payment_status:'unpaid',invoice_number:'INV-000010'}
};
const invoice=A.normalize(op10,{invoice_terms:'net_30',payment_link:'https://example.invalid/pay?a=1&b=2'});
assert.equal(invoice.accepted.subtotal,20.5);
assert.equal(invoice.accepted.tax,1.33);
assert.equal(invoice.accepted.final_total,21.83);
assert.equal(invoice.balance_amount,21.83);
assert.equal(A.preciseUnitPrice(invoice.accepted.piece_price),'$5.125');
assert.deepEqual(A.totalsRows(invoice).filter(r=>['Product subtotal','Sales tax','Accepted total','Current amount due'].includes(r[0])),[['Product subtotal',20.5],['Sales tax',1.33],['Accepted total',21.83],['Current amount due',21.83]]);
assert.notEqual(invoice.accepted.piece_price,5.46);
assert.equal(invoice.breakdownSource,'legacy_customer_totals_unspecified');
assert.equal(A.escapedMultiline(op10.identity.billing_address),'101 Example Ave<br>Suite &lt;2&gt;');

const paid=A.normalize({...op10,current_payment_state:{...op10.current_payment_state,balance_amount:0,amount_paid:21.83,payment_status:'paid'}});
assert.equal(paid.balance_amount,0);
assert.deepEqual(A.totalsRows(paid).at(-1),['Current amount due',0]);
const discounted=A.normalize({...op10,accepted_commercial_breakdown:{...op10.accepted_commercial_breakdown,discount:2,subtotal:22.5,taxable_subtotal:20.5}});
assert.deepEqual(A.totalsRows(discounted).find(r=>r[0]==='Discount'),['Discount',-2]);
const exempt=A.normalize({...op10,identity:{...op10.identity,tax_exempt:true},accepted_commercial_breakdown:{...op10.accepted_commercial_breakdown,tax_rate:0,tax:0,final_total:20.5,balance:20.5},current_payment_state:{...op10.current_payment_state,order_total:20.5,balance_amount:20.5}});
assert.deepEqual(A.totalsRows(exempt).find(r=>r[0]==='Sales tax'),['Sales tax',0]);
const aggregate=A.normalize({reconciliation_status:'aggregate_only',identity:{order_number:'OP-OLD'},current_payment_state:{order_total:50,deposit_amount:0,balance_amount:50,amount_paid:0,payment_status:'unpaid'}});
assert.deepEqual(A.totalsRows(aggregate).map(r=>r[0]),['Accepted order total','Deposit / prior payment','Amount paid','Current amount due']);
assert.throws(()=>A.normalize({...op10,current_payment_state:{...op10.current_payment_state,balance_amount:null}}),/balance is unavailable/);
for (const status of ['totals_mismatch','malformed_snapshot','unsupported_snapshot']) {
  const disputed=A.normalize({...op10,reconciliation_status:status});
  assert.throws(()=>A.totalsRows(disputed),/blocked/);
}

// Trace the actual final visible bindings and builders, not an unused comment/helper.
const finalGuard=orders.slice(orders.indexOf('function bindOrdersAdminVisibleActionsOnce'));
assert.match(finalGuard,/bind\('generateProfessionalInvoicePdfBtn',[\s\S]*?openInvoiceV2FromCurrentOrder/);
assert.doesNotMatch(finalGuard,/generateProfessionalInvoicePdf\), 'Generate Invoice PDF'/);
assert.match(orders,/async function openInvoiceV2FromCurrentOrder\(\)[\s\S]*?generateInvoicePdfV2\(await loadInvoiceAuthority\(order\)\)/);
assert.match(orders,/function generateInvoicePdfV2\(order\)[\s\S]*?buildInvoiceV2HTML\(order\)/);
assert.match(orders,/async function openInvoiceEmailModal\(\)[\s\S]*?const d=await loadInvoiceAuthority\(selected\);const html=buildInvoiceHtmlEmail\(d\),plain=buildInvoicePlainEmail\(d\)/);
assert.match(orders,/normalize\(response\.data, order\)/);
assert.doesNotMatch(finalGuard,/tax\s*=\s*0|subtotal\s*=\s*order_total|\/\s*qty/);
assert.match(orders,/order\.aggregateOnly \? '' : `<table/);
assert.match(orders,/order\.accepted\.quantity \?\? '—'/);
assert.doesNotMatch(orders.slice(orders.indexOf('function buildInvoiceV2HTML'),orders.indexOf('async function loadInvoiceAuthority')),/quantity \|\| 1|order_total\s*\/|tax\s*=\s*0/);
console.log('active invoice runtime assertions passed');
