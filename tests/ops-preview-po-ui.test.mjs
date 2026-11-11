import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

test('owner reviews a PO and records the acknowledgment from the quote screen', {
  skip: !process.env.OPS_JSDOM_MODULE,
}, async () => {
  const {JSDOM} = await import(pathToFileURL(process.env.OPS_JSDOM_MODULE));
  const html = fs.readFileSync(new URL('../ops-order-preview.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {url:'https://example.test/ops-order-preview.html?section=quote',runScripts:'outside-only'});
  const {window} = dom;
  const load = name => window.eval(fs.readFileSync(new URL('../js/' + name, import.meta.url),'utf8'));
  const submit = async form => {
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve => setImmediate(resolve));
  };

  try {
    for (const script of ['tax-rate.js','order-line-items.js','quote-pricing.js','ops-preview/model.js','ops-preview/customer-view.js']) load(script);
    const M = window.OliPolyOpsPreview;
    const V = window.OliPolyCustomerView;
    const state = M.seed();
    const order = state.orders[0];
    Object.assign(order,{reference:'OP-0000007',preset:'business',quoteStage:'draft',designFee:0,taxIncluded:false,
      terms:'Due at handoff',items:[{...order.items[0],quantity:12,unit_price:25}]});
    const sent = M.quoteCommand(state,order.id,{type:'send_quote',via:'Fictional rehearsal'});
    assert.doesNotMatch(V.render(V.project(sent.orders[0])) , /id="customer-accept"/);
    window.localStorage.setItem('olipoly.ops.preview.v1',JSON.stringify(sent));
    load('ops-preview/workspace.js');
    const saved = () => JSON.parse(window.localStorage.getItem('olipoly.ops.preview.v1')).orders[0];
    const form = window.document.querySelector('[data-form="po_review"]');
    for (const [name,value] of Object.entries({number:'TEST-PO-104',purchasingEmail:'buyer@example.test',
      receivingEmail:'receiving@example.test',apEmail:'ap@example.test',evidence:'Fictional PO',
      terms:'Net 30 from invoice date',shipTo:'100 Fictional Way, Aurora, OH 44202',acceptedQty:'8'})) form.elements.namedItem(name).value=value;
    form.elements.acceptedQty.dispatchEvent(new window.Event('input',{bubbles:true}));
    assert.match(form.querySelector('[data-po-total]').textContent,/Accepted order total\$214\.00/);
    await submit(form);
    assert.equal(saved().quoteOffer.items[0].quantity,12);
    assert.equal(saved().items[0].quantity,8);
    assert.equal(saved().poReview.apEmail,'ap@example.test');
    const customer=V.project(saved());
    assert.match(V.render(customer,'quote'),/\$321\.00/);
    assert.match(V.render(customer,'pay'),/\$214\.00.*Net 30 from invoice date/);
    assert.doesNotMatch(V.render(customer,'pay'),/receiving@example|ap@example/);

    const ack = window.document.querySelector('[data-form="po_acknowledgment"]');
    assert.match(ack.elements.message.value,/TEST-PO-104.*OP-0000007/s);
    assert.match(ack.elements.message.value,/8 × .*\$25\.00/);
    ack.elements.confirmSent.checked=true;
    await submit(ack);
    assert.equal(saved().poAcknowledgment.recipient,'buyer@example.test');
    assert.match(window.document.querySelector('[data-panel="quote"]').textContent,/Owner marked sent/);
  } finally {
    window.close();
  }
});
