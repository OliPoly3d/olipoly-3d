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
      terms:'Due at handoff',validUntil:'2026-12-11',intake:{contact:'rfq@example.test'},items:[{...order.items[0],quantity:12,unit_price:25}]});
    const sent = M.quoteCommand(state,order.id,{type:'send_quote',via:'Fictional rehearsal'});
    assert.doesNotMatch(V.render(V.project(sent.orders[0])) , /id="customer-accept"/);
    window.localStorage.setItem('olipoly.ops.preview.v1',JSON.stringify(sent));
    load('ops-preview/workspace.js');
    const saved = () => JSON.parse(window.localStorage.getItem('olipoly.ops.preview.v1')).orders[0];
    const draft = () => window.document.querySelector('[data-panel="quote"] [data-email-draft]');
    assert.equal(draft().querySelector('[name="emailRecipient"]').value,'rfq@example.test');
    assert.match(draft().textContent,/OP-0000007-quote-rev-1\.pdf/);
    assert.match(draft().querySelector('[data-email-body]').textContent,/send a purchase order referencing OP-0000007/i);
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

    assert.match(draft().querySelector('[name="emailPlain"]').value,/Quote total: \$321\.00/);
    assert.match(draft().querySelector('[name="emailPlain"]').value,/Valid through: 2026-12-11/);
    assert.match(draft().querySelector('[name="emailPlain"]').value,/Payment terms: Due at handoff/);
    assert.match(draft().querySelector('[name="emailPlain"]').value,/keep this quote for your records/);
    assert.doesNotMatch(draft().textContent,/ap@example\.test|receiving@example\.test/);

    let copied;
    window.ClipboardItem = class { constructor(parts) { this.parts = parts; } };
    const clipboard = {write:async ([item])=>{copied=item.parts;},writeText:async value=>{copied=value;}};
    Object.defineProperty(window.navigator,'clipboard',{value:clipboard});
    draft().querySelector('[data-action="copy-email-formatted"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(Object.keys(copied),['text/html','text/plain']);
    const richBody = await new Promise(resolve=>{
      const reader = new window.FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.readAsText(copied['text/html']);
    });
    assert.match(richBody,/Playfair Display/);
    assert.match(richBody,/Your OliPoly quote/);
    assert.doesNotMatch(richBody,/rfq@example\.test|data-action/);
    clipboard.write = async ()=>{throw new Error('Clipboard blocked in preview');};
    draft().querySelector('[data-action="copy-email-formatted"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.match(copied,/Quote total: \$321\.00/);
    draft().querySelector('[data-action="copy-email-subject"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(copied,'[ERP Test] Quote OP-0000007 · Rev 1');

    let quoteDownload;
    window.OliPolyDocumentPdf={ready:Promise.resolve(),quote(doc) {
      assert.equal(doc.revision,1);
      assert.equal(doc.totals.lineItems[0].quantity,12);
      assert.equal(doc.totals.total,321);
      return new window.Blob(['test'],{type:'application/pdf'});
    }};
    window.URL.createObjectURL=()=> 'blob:https://example.test/quote';
    window.HTMLAnchorElement.prototype.click=function() { quoteDownload=this.download; };
    window.document.querySelector('[data-action="download-quote"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(quoteDownload,'OP-0000007-quote-rev-1.pdf');

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

test('the invoice screen issues an immutable downloadable copy and records owner sending', {
  skip: !process.env.OPS_JSDOM_MODULE,
}, async () => {
  const {JSDOM} = await import(pathToFileURL(process.env.OPS_JSDOM_MODULE));
  const html = fs.readFileSync(new URL('../ops-order-preview.html', import.meta.url),'utf8');
  const dom = new JSDOM(html,{url:'https://example.test/ops-order-preview.html?section=invoice',runScripts:'outside-only'});
  const {window} = dom;
  const load = name => window.eval(fs.readFileSync(new URL('../js/' + name, import.meta.url),'utf8'));
  const submit = async form => {
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));
  };

  try {
    for (const script of ['tax-rate.js','order-line-items.js','quote-pricing.js','ops-preview/model.js','ops-preview/customer-view.js']) load(script);
    const M = window.OliPolyOpsPreview;
    const V = window.OliPolyCustomerView;
    const state = M.seed();
    const order = state.orders[0];
    Object.assign(order,{reference:'OP-0000007',terms:'Net 30 from invoice date',designFee:0,taxIncluded:false,
      items:[{...order.items[0],quantity:8,unit_price:25}]});
    const accepted = M.command(state,order.id,{type:'approve',method:'Fictional acceptance'});
    Object.assign(accepted.orders[0],{preset:'business',released:true,fulfilled:true,fulfilledAt:new Date().toISOString(),
      poReview:{number:'TEST-PO-104',quoteRevision:1,apEmail:'ap@example.test',billTo:'200 Fictional Way',shipTo:'100 Fictional Way'}});
    window.localStorage.setItem('olipoly.ops.preview.v1',JSON.stringify(accepted));
    load('ops-preview/workspace.js');
    const saved=()=>JSON.parse(window.localStorage.getItem('olipoly.ops.preview.v1')).orders[0];
    const invoiceForm=window.document.querySelector('[data-form="issue_invoice"]');
    assert.equal(invoiceForm.elements.recipient.value,'ap@example.test');
    assert.equal(invoiceForm.elements.dueDate.value,M.invoiceDueDate(order.terms,invoiceForm.elements.issueDate.value));
    assert.match(V.render(V.project(saved()),'pay'),/Invoice pending/);
    await submit(invoiceForm);

    const invoice=saved().invoice;
    assert.equal(invoice.number,'I-0000007');
    assert.equal(invoice.balance,214);
    assert.match(window.document.querySelector('.invoice-document').textContent,/Purchase orderTEST-PO-104/);
    const draft = window.document.querySelector('[data-panel="invoice"] [data-email-draft]');
    assert.equal(draft.querySelector('[name="emailRecipient"]').value,'ap@example.test');
    assert.equal(draft.querySelector('[name="emailSubject"]').value,'[ERP Test] Invoice I-0000007 · OP-0000007');
    assert.match(draft.querySelector('[name="emailPlain"]').value,/Current balance: \$214\.00/);
    assert.match(draft.querySelector('[name="emailPlain"]').value,/Purchase order: TEST-PO-104/);
    assert.match(draft.textContent,/I-0000007\.pdf/);
    assert.equal(saved().invoiceDelivery,undefined);
    const paymentPage=V.render(V.project(saved()),'pay');
    assert.match(paymentPage,/I-0000007/);
    assert.doesNotMatch(paymentPage,/ap@example\.test/);
    let download;
    window.OliPolyDocumentPdf={ready:Promise.resolve(),invoice(value) {
      assert.equal(value.number,'I-0000007');
      assert.match(value.footer,/Quote OP-0000007, revision 1 and PO TEST-PO-104/);
      return new window.Blob(['test'],{type:'application/pdf'});
    }};
    window.URL.createObjectURL=blob=>{
      assert.equal(blob.type,'application/pdf');
      return 'blob:https://example.test/invoice';
    };
    window.HTMLAnchorElement.prototype.click=function() { download={href:this.href,filename:this.download}; };
    window.document.querySelector('[data-action="download-invoice"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(download,{href:'blob:https://example.test/invoice',filename:'I-0000007.pdf'});
    assert.equal(window.document.querySelector('[data-document-download] a').textContent,'I-0000007.pdf');
    assert.equal(window.document.querySelector('[data-panel="invoice"] [data-document-download]').hidden,false);

    const iframe = window.document.createElement('iframe');
    iframe.src = `/ops-order-preview.html?order=${order.id}&section=invoice`;
    window.document.body.append(iframe);
    const frame = iframe.contentWindow;
    frame.document.open();
    frame.document.write(html);
    frame.document.close();
    for (const script of ['tax-rate.js','order-line-items.js','quote-pricing.js','ops-preview/model.js','ops-preview/workspace.js']) {
      frame.eval(fs.readFileSync(new URL('../js/' + script, import.meta.url),'utf8'));
    }
    const standalone = frame.document.querySelector('[data-panel="invoice"] a[target="_blank"]');
    assert.equal(standalone.textContent,'Open invoice in browser');
    assert.equal(new URL(standalone.href).searchParams.get('order'),order.id);
    assert.equal(new URL(standalone.href).searchParams.get('section'),'invoice');
    assert.equal(frame.document.querySelector('[name="invoicePageUrl"]').value,standalone.href);
    assert.equal(frame.document.querySelector('[data-action="download-invoice"]'),null);
    const quoteLink=frame.document.querySelector('[data-panel="quote"] a[target="_blank"]');
    assert.equal(quoteLink.textContent,'Open quote in browser');
    assert.equal(new URL(quoteLink.href).searchParams.get('section'),'quote');
    const record=window.document.querySelector('[data-form="record_invoice_sent"]');
    record.elements.confirmSent.checked=true;
    await submit(record);
    assert.equal(saved().invoiceDelivery.recipient,'ap@example.test');
    assert.deepEqual(saved().invoice,invoice);
  } finally {
    window.close();
  }
});
