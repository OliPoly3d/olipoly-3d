import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

test('Fulfillment form shows tracking and a copyable update after carrier handoff', {
  skip: !process.env.OPS_JSDOM_MODULE,
}, async () => {
  const {JSDOM} = await import(pathToFileURL(process.env.OPS_JSDOM_MODULE));
  const html = fs.readFileSync(new URL('../ops-order-preview.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {url: 'https://example.test/ops-order-preview.html?section=pickup', runScripts: 'outside-only'});
  const {window} = dom;
  const load = name => window.eval(fs.readFileSync(new URL('../js/' + name, import.meta.url), 'utf8'));
  const submit = form => form.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  const settle = () => new Promise(resolve => setImmediate(resolve));

  try {
    for (const script of ['tax-rate.js', 'order-line-items.js', 'quote-pricing.js', 'ops-preview/model.js', 'ops-preview/customer-view.js']) load(script);
    const model = window.OliPolyOpsPreview;
    let state = model.seed();
    const id = state.orders[0].id;
    state.orders[0].items = [{...state.orders[0].items[1], quantity: 1}];
    for (const action of [{type: 'approve', method: 'Test approval'}, {type: 'release'}, {type: 'start', itemId: 'tags', quantity: 1, printer: 'P1S'}]) {
      state = model.command(state, id, action);
    }
    state = model.command(state, id, {
      type: 'inspect', runId: state.orders[0].runs[0].id, accepted: 1, rejected: 0, hours: 0.5,
      usage: [{key: 'PLA / Black', grams: 15}],
    });
    window.localStorage.setItem('olipoly.ops.preview.v1', JSON.stringify(state));
    load('ops-preview/workspace.js');

    const doc = window.document;
    const choice = doc.querySelector('[data-form="fulfillment_plan"]');
    assert.ok(choice);
    assert.equal(doc.querySelector('[data-form="save_shipping_label"]'), null);
    choice.elements.method.value = 'shipping';
    choice.elements.address.value = '123 Fictional Street';
    choice.elements.customerFee.value = '8';
    choice.elements.approval.value = 'Fictional customer approved by email';
    choice.elements.customerFee.dispatchEvent(new window.Event('input', {bubbles: true}));
    assert.match(choice.querySelector('[data-fulfillment-amounts]').textContent, /Order total\$38.56/);
    submit(choice);
    await settle();
    const staged = JSON.parse(window.localStorage.getItem('olipoly.ops.preview.v1')).orders[0];
    const pendingView = window.OliPolyCustomerView;
    assert.match(pendingView.render(pendingView.project(staged), 'track'), /fulfillment to be arranged/);
    assert.doesNotMatch(pendingView.render(pendingView.project(staged), 'track'), /Shipping charged|Ready to ship|38\.56/);
    assert.match(pendingView.render(pendingView.project(staged), 'pay'), /Payment is on hold/);
    const labelForm = doc.querySelector('[data-form="save_shipping_label"]');
    assert.ok(labelForm);
    const values = {
      destination: '123 Fictional Street', weightOz: '16.5', lengthIn: '8', widthIn: '6', heightIn: '4',
      service: 'Ground Advantage', tracking: 'TEST-1234', purchaseRef: 'ORDER-LABEL-1234',
      postage: '7.25', receiptUrl: 'https://example.test/receipt',
    };
    for (const [name, value] of Object.entries(values)) labelForm.elements.namedItem(name).value = value;
    labelForm.elements.confirmDetails.checked = true;
    submit(labelForm);
    await settle();
    const saved = () => JSON.parse(window.localStorage.getItem('olipoly.ops.preview.v1')).orders[0];
    const customer = window.OliPolyCustomerView;
    assert.match(doc.querySelector('[data-panel="pickup"]').textContent, /Label purchased/);
    assert.doesNotMatch(doc.querySelector('#fulfillment-message')?.value || '', /has shipped/);
    assert.doesNotMatch(customer.render(customer.project(saved()), 'track'), /TEST-1234/);
    const handoffForm = doc.querySelector('[data-form="ship"]');
    handoffForm.elements.confirmHandoff.checked = true;
    submit(handoffForm);
    await settle();
    assert.match(doc.querySelector('#fulfillment-message').value, /has shipped via USPS Ground Advantage.*TEST-1234/);
    assert.match(doc.querySelector('[data-panel="money"]').textContent, /Actual postage included\$7.25/);
    const tracking = customer.render(customer.project(saved()), 'track');
    assert.match(tracking, /<strong>Shipped<\/strong>.*Shipping method · USPS · Ground Advantage.*Tracking number · TEST-1234/);
    assert.doesNotMatch(tracking, /123 Fictional Street|7\.25|example\.test\/receipt|ORDER-LABEL-1234/);
  } finally {
    window.close();
  }
});

test('the completed-order form records actual handoff and keeps historical usage out of stock', {
  skip: !process.env.OPS_JSDOM_MODULE,
}, async () => {
  const {JSDOM} = await import(pathToFileURL(process.env.OPS_JSDOM_MODULE));
  const html = fs.readFileSync(new URL('../ops-order-preview.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {url: 'https://example.test/ops-order-preview.html?section=production', runScripts: 'outside-only'});
  const {window} = dom;
  const load = name => window.eval(fs.readFileSync(new URL('../js/' + name, import.meta.url), 'utf8'));

  try {
    for (const script of ['tax-rate.js', 'order-line-items.js', 'quote-pricing.js', 'ops-preview/model.js', 'ops-preview/customer-view.js']) load(script);
    const M = window.OliPolyOpsPreview;
    const initial = M.seed();
    const state = M.command(initial, initial.orders[0].id, {type:'approve',method:'Recorded acceptance'});
    window.localStorage.setItem('olipoly.ops.preview.v1', JSON.stringify(state));
    load('ops-preview/workspace.js');
    const form = window.document.querySelector('[data-form="historical_completion"]');
    for (const [name,value] of Object.entries({method:'shipping',handoffDate:'2026-11-01',carrier:'USPS',tracking:'TEST-HISTORY'})) {
      form.elements[name].value = value;
    }
    const items = form.querySelectorAll('[data-historical-item]');
    items[0].querySelector('[name="material"]').value = 'Untracked PETG-CF';
    items[0].querySelector('[name="grams"]').value = '300';
    items[0].querySelector('[name="materialCost"]').value = '8';
    items[1].querySelector('[name="hours"]').value = '1.25';
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve => setImmediate(resolve));

    const saved = JSON.parse(window.localStorage.getItem('olipoly.ops.preview.v1'));
    const order = saved.orders[0];
    assert.equal(order.historicalCompletion.handoffDate,'2026-11-01');
    assert.equal(order.runs[0].usage[0].key,'Untracked PETG-CF');
    assert.equal(order.runs[0].usage[0].materialCost,8);
    assert.equal(order.runs[1].usage[0].grams,null);
    assert.equal(order.runs[1].hours,1.25);
    assert.equal(order.payments.length,0);
    assert.equal(JSON.stringify(saved.inventory),JSON.stringify(state.inventory));
    assert.match(window.document.querySelector('[data-panel="pickup"]').textContent,/Actual handoff date2026-11-01/);
    const V = window.OliPolyCustomerView;
    assert.match(V.render(V.project(order),'track'),/Shipped.*2026-11-01.*USPS.*TEST-HISTORY/);
  } finally {
    window.close();
  }
});
