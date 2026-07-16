const assert=require('node:assert/strict');
const C=require('../js/customer-360.js');

assert.equal(C.match({customer_id:'c1',customer_email:'same@x.com'},{customer_id:'c2',customer_email:'same@x.com'}),false,'conflicting explicit IDs do not merge');
assert.equal(C.match({customer_email:' Pat@Example.COM '},{customer_email:'pat@example.com'}),true);
assert.equal(C.match({customer_phone:'+1 (330) 555-1212'},{phone:'330-555-1212'}),true);
assert.equal(C.match({company_name:'Acme, Inc.',customer_name:'Pat Lee'},{shipping_company:'Acme Inc',contact_name:'Pat Lee'}),true);
assert.equal(C.match({customer_name:'Ann Smith'},{customer_name:'Anne Smith'}),false,'similar names stay separate');

const duplicate=C.dedupe([{id:'o1',order_number:'OP-1',status:'printing'},{id:'o1',order_number:'OP-1',payment_status:'paid'}],'order');
assert.equal(duplicate.length,1);assert.equal(duplicate[0].status,'printing');assert.equal(duplicate[0].payment_status,'paid');

const orders=[
 {id:'o1',customer_email:'pat@example.com',order_number:'OP-1',order_title:'Active',status:'printing',order_total:200,payment_status:'deposit_paid',deposit_amount:50,created_at:'2026-01-01'},
 {id:'o2',customer_email:'pat@example.com',order_number:'OP-2',order_title:'Done',status:'closed',order_total:100,payment_status:'paid',invoice_number:'INV-2',po_number:'PO-9',invoice_terms:'net_30',created_at:'2025-01-01',closed_at:'2026-02-01'}
];
const summary=C.financialSummary(orders);assert.deepEqual(summary,{acceptedValue:300,paid:150,outstanding:150,invoiceOutstanding:0});
const bundle=C.build({orders,quotes:[{id:'q1',customer_email:'PAT@example.com',quote_number:'Q-1',quote_total:200,converted_order_number:'OP-1',customer_response:'accepted',created_at:'2025-12-01'}],jobs:[{id:'j1',customer_email:'pat@example.com',order_number:'OP-1',production_status:'printing',updated_at:'2026-01-05'}],events:[{id:'e1',order_number:'OP-1',event_type:'request_received',created_at:'2025-11-01'}]},orders[0]);
assert.equal(bundle.activeOrders.length,1);assert.equal(bundle.completedOrders.length,1);assert.equal(bundle.business,true);assert.ok(bundle.timeline.some(e=>e.type==='production'));assert.ok(bundle.timeline.some(e=>e.type==='request_received'));assert.equal(C.quoteOrderLink(bundle.quotes[0],bundle.orders),'orders-admin.html?search=OP-1');
assert.equal(C.deepLink('production-control.html',{order_number:'OP 1'}),'production-control.html?search=OP%201');
const draft=C.reorderDraft(orders[1]);assert.equal(draft.source_order_number,'OP-2');assert.equal(draft.order_title,'Done - Reorder');assert.equal('order_number' in draft,false,'reorder does not create an order');
console.log('Customer identity, deduplication, financial, classification, PO, timeline, links, and reorder assertions passed.');
