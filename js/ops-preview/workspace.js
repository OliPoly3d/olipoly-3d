(function () {
  'use strict';
  const M = window.OliPolyOpsPreview;
  const escape = window.OliPolyLineItems.escape;
  const format = value => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value);
  const key = 'olipoly.ops.preview.v1';
  const app = document.getElementById('app');
  const page = document.body.dataset.page;
  const databaseMode = new URLSearchParams(location.search).get('database') === 'test';
  const cloud = databaseMode ? window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig) : null;
  let busy = false;
  let state;
  let dirty = false;
  const requestedTab = new URLSearchParams(location.search).get('section');
  let activeTab = ['request', 'details', 'quote', 'production', 'pickup', 'money', 'receipt'].includes(requestedTab) ? requestedTab : 'details';
  let draft;
  let intakeDraft = null;
  let queueFilter = new URLSearchParams(location.search).get('filter') || 'open';
  let queueSearch = '';
  try { state = JSON.parse(localStorage.getItem(key)) || M.seed(); }
  catch { state = M.seed(); }
  if (state.version !== 1 || !Array.isArray(state.orders) || !Array.isArray(state.inventory)) state = M.seed();
  let selected = new URLSearchParams(location.search).get('order') || state.orders[0]?.id;
  if (!state.orders.some(order => order.id === selected)) selected = state.orders[0]?.id;
  function message(text, error = false) {
    const node = document.getElementById('message');
    node.className = error ? 'alert error-live' : 'status-line error-live';
    node.textContent = text;
  }
  async function persist(next, action = {type: 'save'}, orderId = selected) {
    if (busy) throw new Error('Wait for the current save to finish.');
    if (cloud) {
      busy = true; app.inert = true;
      try {
        state = await cloud.save(next.orders.find(order => order.id === orderId), action, state.revision);
        dirty = false;
      } finally { busy = false; app.inert = false; renderConnection(); }
      return;
    }
    const current = localStorage.getItem(key);
    if (current && JSON.parse(current).revision !== state.revision) throw new Error('This sample changed in another tab. Reload before saving.');
    localStorage.setItem(key, JSON.stringify(next));
    state = next;
    dirty = false;
  }
  function selectedOrder() { return state.orders.find(order => order.id === selected); }
  function status(order) { return M.stages.find(([id]) => id === M.stage(order))[1]; }
  function field(label, name, value, type = 'text', attrs = '') {
    return `<label>${escape(label)}<input name="${name}" type="${type}" value="${escape(value)}" ${attrs}></label>`;
  }
  function select(label, name, options, value) {
    return `<label>${escape(label)}<select name="${name}">${options.map(option => {
      const [id, text] = Array.isArray(option) ? option : [option, option];
      return `<option value="${escape(id)}" ${id === value ? 'selected' : ''}>${escape(text)}</option>`;
    }).join('')}</select></label>`;
  }
  function row(label, value) { return `<div class="row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`; }
  function projectLabel(order) {
    const identity = M.projectIdentity(order);
    return `${escape(identity.primary)}${identity.legacyQuote ? ` · Original quote ${escape(identity.legacyQuote)}` : ''}`;
  }
  function sharedProductionQueue() {
    const orders = M.productionQueue(state);
    return `<section class="card"><h2>Shared production queue</h2><p class="muted">All approved projects, including those awaiting release. Open a project to release materials or manage its runs.</p>${orders.map(order => {
      const ready = !order.released;
      const accepted = order.items.reduce((sum, item) => sum + M.accepted(order, item.id), 0);
      const quantity = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);
      return `<article class="queue-row"><div><strong>${projectLabel(order)}</strong><h3>${escape(order.title)}</h3><p>${escape(order.customer)}</p><span class="badge ${ready ? 'rose' : ''}">${ready ? 'Approved · awaiting release' : escape(status(order))}</span><p>${accepted} / ${quantity} pieces accepted${order.intake?.neededBy ? ` · Requested ${escape(order.intake.neededBy)}` : ''}</p></div><div class="queue-row-end"><a class="button" href="${orderLink(order, 'production')}">${ready ? 'Review & release' : 'Open production'}</a></div></article>`;
    }).join('') || '<p class="empty">No approved projects awaiting production or fulfillment.</p>'}</section>`;
  }
  function orderLink(order, section = M.nextStep(order)[1]) { return `ops-order-preview.html?order=${encodeURIComponent(order.id)}&section=${section}${cloud ? '&database=test' : ''}`; }
  function trackingLink(order) { return cloud && order.database?.orderNumber ? `ops-track-preview.html?database=test&tracking=${encodeURIComponent(order.database.orderNumber)}` : `ops-track-preview.html?order=${encodeURIComponent(order.id)}${cloud ? '&database=test' : ''}`; }
  function textArea(label, name, value, attrs = '') {
    return `<label class="full">${escape(label)}<textarea name="${name}" ${attrs}>${escape(value || '')}</textarea></label>`;
  }
  function intakeFields(order, fresh = false) {
    const intake = order.intake || {};
    return `${field('Customer / company', 'customer', order.customer, 'text', 'required maxlength="200"')}${field('Project / request title', 'title', order.title, 'text', 'required maxlength="200"')}
      ${select('Request came from', 'source', ['Email / PO', 'Text / social message', 'Website inquiry', 'In person / show', 'Other'], intake.source || 'Email / PO')}
      ${field('Contact email or phone', 'contact', intake.contact || '', 'text', 'maxlength="300"')}
      ${select('Starting preset', 'preset', [['individual','Individual / friend'],['business','Business / PO'],['program','Fundraiser'],['stock','Show / stock']], order.preset)}
      ${select('Information available', 'evidence', ['Idea / reference','Drawing','Completed model','Sliced file','Previous actual results'], order.evidence)}
      ${field('Customer requested date (not a promise)', 'neededBy', intake.neededBy || '', 'date')}
      ${select('Material preference', 'materialPreference', ['Not decided','PLA','PETG','PETG-CF','Other'], intake.materialPreference || 'Not decided')}
      ${fresh ? field('Initial quantity (can revise)', 'quantity', 1, 'number', 'min="1" step="1" required') : ''}
      ${field('File, drawing or conversation reference', 'fileReference', intake.fileReference || '', 'text', 'maxlength="500"')}
      ${textArea('What does the customer need?', 'summary', intake.summary, 'maxlength="5000"')}`;
  }
  function readIntake(form, order) {
    const data = Object.fromEntries(new FormData(form));
    const result = M.copy(order);
    ['customer','title','preset','evidence'].forEach(name => { result[name] = String(data[name] || '').trim(); });
    result.intake = Object.fromEntries(['source','contact','neededBy','materialPreference','fileReference','summary'].map(name => [name,String(data[name] || '').trim()]));
    if (data.quantity != null) result.items = [{...result.items[0], description: result.title || 'Requested component', quantity: data.quantity}];
    return result;
  }
  function renderToday() {
    if (intakeDraft) {
      app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Start here</div><h1>Capture a new request.</h1><p class="muted">Record what you know. Pricing, materials and print estimates can follow.</p></div></header><form id="new-request-form" class="card"><div class="form-grid">${intakeFields(intakeDraft,true)}</div><div class="actions" style="margin-top:22px"><button class="primary" type="submit" value="request">Save new request</button><button type="submit" value="quote">Save & start quote</button><button type="button" data-action="cancel-intake">Cancel</button></div><p class="muted" style="margin-top:18px">A request is not an accepted order and does not reserve materials.</p></form>`;
      return;
    }
    const counts = Object.fromEntries(M.stages.map(([id]) => [id,state.orders.filter(order => M.stage(order) === id).length]));
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Your studio, from the first conversation</div><h1>All your work. One queue.</h1><p class="muted">Capture requests, prepare quotes and see what needs your attention next.</p></div><button class="primary" data-action="new">+ New request</button></header>
      <div class="grid metrics queue-metrics"><button class="card metric" data-filter="request"><small>NEW REQUESTS</small><strong>${counts.request}</strong><small>Need review or more information</small></button><button class="card metric" data-filter="awaiting"><small>AWAITING APPROVAL</small><strong>${counts.awaiting}</strong><small>Quotes shared with customers</small></button><button class="card metric" data-filter="approved"><small>QUOTE APPROVED</small><strong>${counts.approved}</strong><small>Ready for production release</small></button><button class="card metric" data-filter="printing"><small>IN PROGRESS</small><strong>${counts.printing}</strong><small>${counts.queued} queued · ${counts.ready} ready</small></button></div>
      <section class="card"><div class="section-head"><div><h2>All work</h2><p class="muted" style="margin-bottom:0">Each request stays in this queue as it becomes a quote, order and completed job.</p></div><span class="badge neutral">${state.orders.filter(order=>M.stage(order)!=='complete').length} open</span></div>
      <nav class="queue-filters" aria-label="Filter work by stage">${[['open','All open'],...M.stages,['all','Everything']].map(([id,label])=>`<button data-filter="${id}" class="${queueFilter===id?'active':''}" aria-pressed="${queueFilter===id}">${escape(label)} <span>${id==='open'?state.orders.length-counts.complete:id==='all'?state.orders.length:counts[id]}</span></button>`).join('')}</nav>
      <input class="search" id="search" aria-label="Find work" placeholder="Find a customer, project or reference…" value="${escape(queueSearch)}"><div id="order-list">${orderRows()}</div></section>
      <div style="margin-top:22px">${sharedProductionQueue()}</div><div class="two-col" style="margin-top:22px"><section class="card"><h2>From request to production</h2><ol class="journey"><li><strong>New request</strong><span>Customer, idea, files and requested date.</span></li><li><strong>Prepare quote</strong><span>Mixed items, estimates, design fee, price and terms.</span></li><li><strong>Await approval</strong><span>Preview or print the quote, then record when it was shared.</span></li><li><strong>Approved → production</strong><span>Record authorization, release materials and assign runs.</span></li></ol></section><section class="card"><h2>Materials & balances</h2>${state.inventory.map(stock => row(stock.key, `${Math.round(stock.grams-M.reserved(state,stock.key))} g available`)).join('')}${row('Accepted-order balances', format(state.orders.filter(o=>o.snapshot).reduce((sum,o)=>sum+M.balance(o),0)))}<button style="margin-top:18px" data-action="reset">${cloud?'Reload test records':'Reset local sample'}</button></section></div>`;
  }
  function orderRows() {
    const orders = M.queue(state, queueFilter, queueSearch);
    return orders.map(order => {
      const [action] = M.nextStep(order);
      const stage = M.stage(order);
      const amount = stage === 'request' ? 'Not priced yet' : format((order.snapshot || order.quoteOffer?.totals || M.totals(order)).total);
      return `<article class="queue-row"><div><span class="badge ${order.snapshot?'':'rose'}">${escape(status(order))}</span><h3>${escape(order.title)}</h3><p>${escape(order.customer)} · ${projectLabel(order)}${order.intake?.neededBy ? ` · Requested ${escape(order.intake.neededBy)}`:''}</p></div><div class="queue-row-end"><strong>${amount}</strong><a class="button" href="${orderLink(order)}">${escape(action)}</a></div></article>`;
    }).join('') || '<p class="empty">No work matches this view. Use New request to capture the next conversation.</p>';
  }
  function requestPanel(order) {
    const locked = order.snapshot || order.quoteStage === 'sent';
    if (locked) return `<section class="card"><h2>Original request</h2>${row('Source',order.intake?.source || 'Not recorded')}${row('Contact',order.intake?.contact || 'Not recorded')}${row('Information supplied',order.evidence)}${row('Customer requested date',order.intake?.neededBy || 'Not recorded')}<p class="request-notes">${escape(order.intake?.summary || 'No request notes recorded.')}</p><p class="muted">${escape(order.intake?.fileReference || '')}</p></section>`;
    return `<form id="request-form" class="card"><h2>Customer request</h2><div class="form-grid">${intakeFields(order)}</div><div class="actions" style="margin-top:22px"><button type="submit" value="request">Save request details</button>${M.stage(order)==='request'?'<button class="primary" type="submit" value="quote">Save & start quote</button>':`<a class="button primary" href="${orderLink(order,'details')}">Open quote builder</a>`}</div><small id="request-save-state">Saved request</small></form>`;
  }
  function readDraft() {
    const form = document.getElementById('details-form');
    if (!form || !draft) return;
    const data = new FormData(form);
    ['customer', 'title', 'preset', 'evidence', 'terms', 'county', 'turnaround', 'validUntil', 'customerNotes'].forEach(name => { draft[name] = String(data.get(name)); });
    ['designFee', 'taxRate', 'laborRate', 'estimatedLabor'].forEach(name => { draft[name] = Number(data.get(name)); });
    draft.taxIncluded = data.get('taxIncluded') === 'yes';
    draft.taxExempt = data.has('taxExempt');
    form.querySelectorAll('[data-item]').forEach(node => {
      const item = draft.items[Number(node.dataset.item)];
      node.querySelectorAll('[data-field]').forEach(input => { item[input.dataset.field] = input.type === 'number' ? input.value : input.value; });
      node.querySelectorAll('[data-material]').forEach(materialNode => {
        const material = item.materials[Number(materialNode.dataset.material)];
        const [name, color] = materialNode.querySelector('select').value.split(' / ');
        Object.assign(material, {material: name, color, grams_each: materialNode.querySelector('input').value});
      });
    });
  }
  function itemEditor(order) {
    return order.items.map((item, i) => `<fieldset class="item" data-item="${i}"><legend>ITEM ${i + 1}</legend><div class="form-grid">
      <label class="full">Description<input data-field="description" value="${escape(item.description)}" required></label><label>Quantity<input data-field="quantity" type="number" min="1" step="1" value="${item.quantity}" required></label><label>${order.taxIncluded ? 'All-in unit price' : 'Unit price before tax'}<input data-field="unit_price" type="number" min="0" step=".01" value="${item.unit_price}" required></label><label>Print hours per piece<input data-field="hours_each" type="number" min="0" step=".01" value="${item.hours_each}" required></label><button type="button" data-action="remove-item" data-index="${i}" ${order.items.length === 1 ? 'disabled' : ''}>Remove item</button></div>
      ${item.materials.map((material, j) => `<div class="material-row" data-material="${j}"><label>Material / color<select>${state.inventory.map(stock => `<option ${stock.key === M.materialKey(material) ? 'selected' : ''}>${escape(stock.key)}</option>`).join('')}</select></label><label>Grams per piece<input type="number" min="0" step=".01" value="${material.grams_each}" required></label><button type="button" data-action="remove-material" data-index="${i}" data-material-index="${j}">Remove</button></div>`).join('')}
      <button style="margin-top:14px" type="button" data-action="add-material" data-index="${i}">+ Material or support filament</button></fieldset>`).join('');
  }
  function detailPanel(order) {
    if (order.quoteStage === 'request') return `<section class="card"><h2>Start with the request</h2><p class="muted">Capture the scope first, then start its quote. No price or sliced file is required to save a request.</p><a class="button primary" href="${orderLink(order,'request')}">Review request</a></section>`;
    if (!order.snapshot && order.quoteStage === 'sent') return `<section class="card"><h2>Quote awaiting approval</h2><p>The shared quote is saved as revision ${order.quoteOffer?.revision || 1}. Open Customer quote to record approval or start a revision.</p><a class="button primary" href="${orderLink(order,'quote')}">Review shared quote</a></section>`;
    if (order.snapshot) return `<section class="card"><h2>Agreed scope</h2><p class="status-line">${escape(order.approval)} · final fixed price ${format(order.snapshot.total)}</p>${order.items.map(item => row(`${item.quantity} × ${item.description}`, format(item.quantity * item.unit_price))).join('')}${row('Design / preparation', format(order.designFee))}<p class="muted" style="margin-top:18px">${escape(order.terms)} · ${escape(order.evidence)}</p><p class="muted">This first sample exercises a fixed-price order. Capped design additions, files and document revisions belong to the next connected workflow.</p></section>`;
    return `<form class="card" id="details-form"><div class="section-head"><h2>Build the quote</h2><span class="badge rose">Draft</span></div><div class="form-grid">
      ${field('Customer', 'customer', order.customer, 'text', 'required')}${field('Project', 'title', order.title, 'text', 'required')}
      ${select('Starting preset', 'preset', [['individual', 'Individual / friend'], ['business', 'Business / PO'], ['program', 'Fundraiser'], ['stock', 'Show / stock']], order.preset)}
      ${select('Estimate based on', 'evidence', ['Idea / reference', 'Drawing', 'Completed model', 'Sliced file', 'Previous actual results'], order.evidence)}
      ${field('Payment terms', 'terms', order.terms)}${field('Quoted turnaround / delivery', 'turnaround', order.turnaround || '')}${field('Quote valid through', 'validUntil', order.validUntil || '', 'date')}${select('Prices entered', 'taxIncluded', [['yes', 'Include sample tax'], ['no', 'Before sample tax']], order.taxIncluded ? 'yes' : 'no')}
      ${field('Sample Ohio county', 'county', order.county, 'text', 'required')}
      ${field('Sample tax rate (%)', 'taxRate', order.taxRate, 'number', 'min="0" max="20" step=".01" required')}
      <label class="check"><input type="checkbox" name="taxExempt" ${order.taxExempt ? 'checked' : ''}>Sample exemption scenario</label>
      <p class="muted full">Use this rate only for the fictional sample. Verified county sourcing and certificate evidence are required for a live connection.</p></div>
      <h3>Items & manufacturing estimates</h3><p class="muted">Quantities, grams and hours below are per piece. Add body and support filament separately.</p>${itemEditor(order)}
      <button type="button" data-action="add-item">+ Add another item</button><div class="form-grid" style="margin-top:24px">${field('Fixed design / preparation charge', 'designFee', order.designFee, 'number', 'min="0" step=".01" required')}${field('Estimated total hands-on hours', 'estimatedLabor', order.estimatedLabor, 'number', 'min="0" step=".01" required')}${field('Sample labor cost per hour', 'laborRate', order.laborRate, 'number', 'min="0" step=".01" required')}</div>
      <div style="margin-top:18px">${textArea('Customer-facing scope / notes', 'customerNotes', order.customerNotes, 'maxlength="3000"')}</div><div class="actions" style="margin-top:22px"><button class="primary" type="submit">Save quote draft</button><small id="draft-state">Saved quote draft</small></div></form>`;
  }
  function approvalForm(order) {
    return `<form data-form="approve">${select('Approval evidence', 'method', ['Email / text', 'Verbal agreement recorded', 'Purchase order', 'Customer quote link', 'Payment for agreed items'], 'Email / text')}<button class="primary" style="width:100%;margin-top:15px" type="submit">Record approval & create order</button></form>`;
  }
  function priceCard(order) {
    if (M.stage(order)==='request') return `<section class="card"><h2>No quote needed yet</h2><p class="muted">Save the request with the information available. Prepare pricing when you are ready.</p></section>`;
    const t = order.snapshot || order.quoteOffer?.totals || M.totals(order);
    const cost = M.costs(state,order);
    return `<section class="card money-list"><div class="eyebrow">${order.snapshot?'Accepted price':'Quote pricing'}</div><h2>One combined total</h2>${row('Before tax',format(t.beforeTax))}${row('Sample tax',format(t.tax))}${t.roundingAdjustment?row('Price rounding',format(t.roundingAdjustment)):''}<div class="row"><strong>Total</strong><span class="total">${format(t.total)}</span></div><p class="muted">${order.taxIncluded?'Tax is included in entered prices.':'Sample tax is added to item prices.'}</p>${!order.snapshot?`${row('Estimated production cost',format(cost.estimated))}${row('Estimated profit before unrecorded costs',format(cost.estimatedProfit))}<p class="muted">Estimates use the entered grams/hours and sample cost settings. Missing design or slicing information makes the cost estimate incomplete. This pilot records a final fixed price; capped additions remain a later step.</p><a class="button primary" href="${orderLink(order,'quote')}">Preview customer quote</a>`:'<span class="badge">Approval recorded</span>'}</section>`;
  }
  function quoteDocument(order) {
    const offer = order.quoteOffer;
    const t = order.snapshot || offer?.totals || M.totals(order);
    const doc = offer || order;
    return `<section class="card quote-document"><div class="eyebrow">OliPoly 3D LLC · test quotation</div><div class="section-head"><h1>Quotation</h1><strong>${projectLabel(order)}${offer?` · Rev ${offer.revision}`:''}</strong></div><p>990 Aurora Hudson Rd · Aurora, OH 44202<br>olipoly3d.com</p><h3>Prepared for ${escape(doc.customer)}</h3><p>${escape(doc.title)}</p><table class="receipt-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${window.OliPolyLineItems.tableRows(t.grossLineItems || t.lineItems,format)}</tbody></table><div style="margin-top:18px">${row('Before tax',format(t.beforeTax))}${row('Sample sales tax',format(t.tax))}${t.roundingAdjustment?row('Rounding adjustment',format(t.roundingAdjustment)):''}${row('Quoted total',format(t.total))}</div><p style="margin-top:20px"><strong>Payment terms:</strong> ${escape(doc.terms)}<br><strong>Turnaround:</strong> ${escape(doc.turnaround || 'To be agreed')}<br><strong>Valid through:</strong> ${escape(doc.validUntil || 'To be agreed')}</p>${doc.customerNotes?`<p class="request-notes">${escape(doc.customerNotes)}</p>`:''}<p class="muted">Fictional test quote. ${order.taxIncluded?'Sample tax is included in displayed item amounts.':'Item amounts are before sample tax.'}</p></section>`;
  }
  function quotePanel(order) {
    if (M.stage(order)==='request') return detailPanel(order);
    const t=order.snapshot || order.quoteOffer?.totals || M.totals(order);
    const messageText=`Hi ${order.customer}, here is the quote for ${order.title}: ${format(t.total)} total, including sample tax. ${order.terms}. ${order.turnaround?`Turnaround: ${order.turnaround}. `:''}Please reply to confirm the scope and price. Thank you, OliPoly 3D LLC`;
    return `<div class="two-col"><div>${quoteDocument(order)}</div><aside class="stack no-print"><section class="card"><h2>${order.snapshot?'Customer approved':order.quoteStage==='sent'?'Awaiting customer approval':'Review & share'}</h2><p class="muted">Preview the document, save it as PDF or copy the prepared message. Sending remains your action.</p><div class="actions"><button data-action="print-quote">Print / Save quote PDF</button><button data-action="copy-quote">Copy quote message</button></div><label style="margin-top:18px">Prepared message<textarea id="quote-message" readonly>${escape(messageText)}</textarea></label>${!order.snapshot && order.quoteStage!=='sent'?`<form data-form="send_quote" style="margin-top:20px">${select('How you shared it','via',['Email','Text / social message','PDF handed to customer','In person'],'Email')}<button class="primary" type="submit" style="margin-top:12px">Mark quote sent</button></form>`:''}${order.quoteOffer?`<p class="status-line" style="margin-top:18px">Revision ${order.quoteOffer.revision} shared via ${escape(order.quoteOffer.sharedVia)} · ${escape(new Date(order.quoteOffer.sentAt).toLocaleDateString())}</p>`:''}</section>${!order.snapshot?`<section class="card"><h2>Customer authorization</h2><p class="muted">Record their authorization when it arrives. Quick in-person work may be approved directly without marking a separate send step.</p>${approvalForm(order)}</section>`:''}${!order.snapshot && order.quoteStage==='sent'?`<form class="card" data-form="revise_quote"><h3>Need to change the quote?</h3>${textArea('Reason for revision','reason','','required maxlength="1000"')}<button type="submit" style="margin-top:12px">Start quote revision</button><p class="muted" style="margin-top:12px">The previous shared revision stays in the work record.</p></form>`:''}${order.quoteHistory?.length?`<section class="card"><h3>Shared quote history</h3>${order.quoteHistory.map(offer=>row(`Revision ${offer.revision}`,format(offer.totals.total))).join('')}</section>`:''}</aside></div>`;
  }
  function productionPanel(order) {
    const pending = order.items.filter(item => M.remaining(order, item) > 0);
    return `${sharedProductionQueue()}<section class="card"><div class="eyebrow">${projectLabel(order)}</div><div class="section-head"><h2>${escape(order.title)}</h2><span class="badge">${order.snapshot && !order.released ? 'Approved · awaiting release' : escape(status(order))}</span></div><p>${escape(order.customer)} · Selected project production</p>
      ${order.items.map(item => row(item.description, `${M.accepted(order, item.id)} / ${item.quantity} accepted`)).join('')}
      ${!order.released ? `<p class="muted" style="margin-top:20px">Release the approved scope to reserve its sample material.</p><button class="primary" data-action="release" ${!order.snapshot ? 'disabled' : ''}>Release to production</button>` : ''}
      ${order.released && pending.length ? `<form data-form="start" class="form-grid" style="margin-top:22px">${select('Item to print', 'itemId', pending.map(item => [item.id, `${item.description} · ${M.remaining(order, item)} remaining`]), pending[0].id)}${select('Printer', 'printer', ['P1S', 'P2S'], 'P1S')}${field('Pieces in this run', 'quantity', 1, 'number', 'min="1" step="1" required')}<button class="primary" type="submit">Start sample run</button></form>` : ''}
      </section>${order.runs.slice().reverse().map(run => runCard(order, run)).join('')}`;
  }
  function runCard(order, run) {
    const item = order.items.find(row => row.id === run.itemId);
    if (run.status === 'inspected') return `<section class="card"><div class="section-head"><h3>${escape(item.description)} · ${escape(run.printer)}</h3><span class="badge neutral">Inspected</span></div><p>${run.accepted} accepted · ${run.rejected} rejected · ${run.hours} printer hours</p><p class="muted">${run.usage.map(u => `${escape(u.key)} ${u.grams} g`).join(' · ')}</p>${run.notes ? `<p class="muted">${escape(run.notes)}</p>` : ''}</section>`;
    const grouped = {};
    item.materials.forEach(m => { const key = M.materialKey(m); grouped[key] = (grouped[key] || 0) + m.grams_each * run.quantity; });
    return `<form class="card" data-form="inspect" data-run="${run.id}"><div class="section-head"><h3>${escape(item.description)} · ${escape(run.printer)}</h3><span class="badge rose">Printing ${run.quantity}</span></div><div class="form-grid">${field('Accepted pieces', 'accepted', run.quantity, 'number', 'min="0" step="1" required')}${field('Rejected pieces', 'rejected', 0, 'number', 'min="0" step="1" required')}${field('Actual printer hours', 'hours', run.plannedHours, 'number', 'min="0" step=".01" required')}
      ${Object.entries(grouped).map(([key, grams], i) => `<label>${escape(key)} consumed (g)<input name="usage-${i}" data-usage-key="${escape(key)}" type="number" min="0" step=".01" value="${grams}" required></label>`).join('')}
      <p class="muted full">Enter total consumption for this attempt, including failed pieces and purge. Reject count records the loss without deducting the same filament twice.</p><label class="full">Optional notes<textarea name="notes" placeholder="Fit, appearance or reason for a rejected piece"></textarea></label></div><button class="primary" type="submit" style="margin-top:18px">Finish & inspect run</button></form>`;
  }
  function pickupPanel(order) {
    const ready = order.released && order.items.every(item => M.remaining(order, item) === 0);
    const text = `Hi ${order.customer}, your ${order.title} is ready for pickup. ${M.balance(order) > 0 ? `The remaining balance is ${format(M.balance(order))}. ` : ''}Please reply to arrange a convenient time. Thank you, OliPoly 3D LLC`;
    return `<section class="card"><h2>Pickup & customer update</h2><p class="muted">${order.fulfilled ? 'Pickup has been recorded in this sample.' : ready ? 'Every required piece has passed inspection.' : 'The sample pickup action becomes available after all pieces pass inspection.'}</p><label>Prepared pickup message<textarea id="pickup-message" readonly>${escape(text)}</textarea></label><div class="actions" style="margin-top:18px"><button data-action="copy-message" ${!ready ? 'disabled' : ''}>Copy message</button><button class="primary" data-action="pickup" ${!ready || order.fulfilled ? 'disabled' : ''}>Record pickup</button></div><p class="muted" style="margin-top:20px">The sample follows one complete pickup. Split fulfillment choices will be tested in the connected workflow.</p><a class="button" href="${trackingLink(order)}">Open customer milestone preview</a></section>`;
  }
  function moneyPanel(order) {
    const cost = M.costs(state, order);
    const baseline = order.estimateBaseline ?? cost.estimated;
    const marginChange = cost.revenue > 0 ? ((baseline - cost.actual) / cost.revenue * 100).toFixed(1) : '0.0';
    return `<section class="card"><h2>Payment & balance</h2>${row('Agreed total', format((order.snapshot || M.totals(order)).total))}${row('Payments recorded', format(M.paid(order)))}${row('Remaining balance', format(M.balance(order)))}
      ${order.snapshot && M.balance(order) > 0 ? `<form class="form-grid" data-form="pay" style="margin-top:22px">${field('Amount received', 'amount', M.balance(order), 'number', `min=".01" step=".01" required ${cloud ? 'readonly' : ''}`)}${select('Method', 'method', ['Cash', 'Check', 'ACH', 'Stripe', 'PayPal', 'Venmo'], 'Cash')}${field('Processing fee', 'fee', 0, 'number', 'min="0" step=".01" required')}${field('Reference / check number', 'reference', '')}<button class="primary" type="submit">Record sample payment</button></form>` : ''}
      ${order.payments.map(p => row(`${p.method} ${p.reference}`, `${format(p.amount)} · fee ${format(p.fee)}`)).join('')}<p class="muted" style="margin-top:18px">${cloud ? 'One combined full payment is supported in this connected pilot. It posts income and any fee to Finance in the test project. Job cost comparisons remain in Production until a later Finance reconciliation step.' : 'These payment records are on this device. Finance Pro posting is pending the test database connection.'}</p></section>
      <section class="card"><h2>Actual costs & profit</h2><p class="muted">Sample cost settings include $0.53 per printer hour for machine/energy reserves and the labor cost entered in Details. Recorded consumption starts with slicer figures.</p><form class="form-grid" data-form="actuals">${field('Actual total design + hands-on hours', 'hours', order.actualLabor, 'number', 'min="0" step=".01" required')}${field('Other actual costs (packaging, shipping, etc.)', 'otherCosts', order.otherCosts, 'number', 'min="0" step=".01" required')}<button type="submit">Save actual costs</button></form><div style="margin-top:20px">${row('Estimated job cost', format(order.estimateBaseline ?? cost.estimated))}${row('Recorded cost to date', format(cost.actual))}${row('Estimated profit', format(cost.revenue - baseline))}${row(order.fulfilled ? 'Profit after recorded costs' : 'Profit at recorded costs so far', format(cost.actualProfit))}${row('Cost variance (positive = under estimate)', format(baseline - cost.actual))}${row('Margin change from estimate', `${marginChange} percentage points`)}</div><p class="muted" style="margin-top:15px">${order.fulfilled ? 'Review all actual costs before treating this as reconciled.' : 'Profit remains provisional while production and actual cost entry are incomplete.'}</p></section>`;
  }
  function receiptPanel(order) {
    const t = order.snapshot || M.totals(order);
    const items = t.grossLineItems || t.lineItems;
    return `<section class="card receipt"><div class="eyebrow">Sample receipt · ${cloud ? 'test database' : 'device only'}</div><h1>OliPoly 3D LLC</h1><p>${escape(order.customer)}<br>${escape(order.title)} · ${escape(order.reference)}</p><table class="receipt-table"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${items.map(item => `<tr><td>${escape(item.description)}</td><td>${item.quantity}</td><td>${format(item.line_total)}</td></tr>`).join('')}</tbody></table><div style="margin-top:20px">${row('Before tax', format(t.beforeTax))}${row('Sample tax', format(t.tax))}${t.roundingAdjustment ? row('Rounding adjustment', format(t.roundingAdjustment)) : ''}${row('Total', format(t.total))}${row('Paid', format(M.paid(order)))}${row('Balance', format(M.balance(order)))}</div><p class="muted" style="margin-top:20px">${order.taxIncluded ? 'Applicable sample tax is included in displayed item amounts.' : 'Item amounts are before sample tax.'}</p><button class="primary no-print" data-action="print">Print / Save PDF</button></section>`;
  }
  function renderOrder() {
    const order = selectedOrder();
    draft = M.copy(order);
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">${projectLabel(order)} · ${escape(status(order))}</div><h1>${escape(order.title)}</h1><p class="muted">${escape(order.customer)} · ${escape(order.terms)}</p></div><a class="button" href="ops-preview.html${cloud ? '?database=test' : ''}">All work</a></header><nav class="tabs" aria-label="Order sections">${[['request', 'Request'], ['details', 'Quote builder'], ['quote', 'Customer quote'], ['production', 'Production'], ['pickup', 'Pickup'], ['money', 'Money'], ['receipt', 'Receipt']].map(([id, name]) => `<button data-tab="${id}" class="${id === activeTab ? 'active' : ''}">${name}</button>`).join('')}</nav>
      <div class="panel" data-panel="request" ${activeTab !== 'request' ? 'hidden' : ''}>${requestPanel(order)}</div><div class="panel quote" data-panel="quote" ${activeTab !== 'quote' ? 'hidden' : ''}>${quotePanel(order)}</div><div class="panel two-col" data-panel="details" ${activeTab !== 'details' ? 'hidden' : ''}><div>${detailPanel(order)}</div><aside class="stack"><div id="price-card">${priceCard(order)}</div><section class="card"><h3>About this sample</h3><p class="muted">The starting preset is editable. This milestone tests the mixed-item, fixed-price pickup journey. PO, fundraiser, capped-design and shipping workflows are scheduled for later milestones.</p></section></aside></div>
      <div class="panel stack" data-panel="production" ${activeTab !== 'production' ? 'hidden' : ''}>${productionPanel(order)}</div><div class="panel" data-panel="pickup" ${activeTab !== 'pickup' ? 'hidden' : ''}>${pickupPanel(order)}</div><div class="panel stack" data-panel="money" ${activeTab !== 'money' ? 'hidden' : ''}>${moneyPanel(order)}</div><div class="panel receipt" data-panel="receipt" ${activeTab !== 'receipt' ? 'hidden' : ''}>${receiptPanel(order)}</div>`;
  }
  function renderTracking() {
    const order = selectedOrder();
    const steps = ['Approved', 'Ready to print', 'Printing', 'Ready for pickup', 'Picked up'];
    let index = order.snapshot ? 0 : -1;
    if (order.released) index = 1;
    if (order.runs.length) index = 2;
    if (order.released && order.items.every(item => M.remaining(order, item) === 0)) index = 3;
    if (order.fulfilled) index = 4;
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Customer milestone preview</div><h1>Your project, moving along.</h1><p class="muted">${escape(order.title)} · ${escape(order.reference)}</p></div><a class="button" href="${orderLink(order)}">Back to workspace</a></header><section class="card" style="max-width:700px"><span class="badge">${escape(index < 0 ? 'Awaiting approval' : steps[index])}</span><div class="timeline">${steps.map((step, i) => `<div class="${i <= index ? 'done' : ''}">${step}</div>`).join('')}</div>${row('Remaining balance', format(M.balance(order)))}<p class="muted" style="margin-top:20px">For this interactive sample, the workspace and this view share device storage. For an accepted database order, open its customer link from Pickup to use the existing public tracking lookup.</p></section>`;
  }
  function render() {
    if (page === 'today') renderToday();
    else if (page === 'track') renderTracking();
    else renderOrder();
  }
  async function saveDetails() {
    readDraft();
    const next = M.copy(state);
    M.saveDraft(next, draft);
    next.revision += 1;
    await persist(next);
  }
  document.addEventListener('input', event => {
    if (event.target.id === 'search') {
      queueSearch = event.target.value;
      document.getElementById('order-list').innerHTML = orderRows();
      return;
    }
    if (event.target.closest('#new-request-form, #request-form')) { dirty = true; const label=document.getElementById('request-save-state'); if(label) label.textContent='Unsaved request changes'; }
    if (event.target.closest('#details-form')) {
      dirty = true;
      document.getElementById('draft-state').textContent = 'Unsaved changes';
      readDraft();
      try { document.getElementById('price-card').innerHTML = priceCard(draft); }
      catch { document.getElementById('price-card').textContent = 'Complete the item fields to preview totals.'; }
    }
  });
  document.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    try {
      if (busy) return;
      if (form.dataset.form === 'test-auth') {
        const values = Object.fromEntries(new FormData(form));
        busy = true; form.inert = true;
        try {
          const result = await cloud.auth(values.email, values.password, event.submitter?.value === 'signup');
          if (!result.signedIn) { message('Check your email to confirm this separate test account, then sign in here.'); return; }
          await loadCloud();
        } finally { busy = false; form.inert = false; }
        return;
      }
      if (['new-request-form','request-form'].includes(form.id)) {
        const fresh=form.id==='new-request-form';
        const order=readIntake(form, fresh?intakeDraft:selectedOrder());
        if (event.submitter?.value==='quote') order.quoteStage='draft';
        if (fresh) order.reference=`REQUEST-${String(state.orders.length+1).padStart(3,'0')}`;
        const next=M.copy(state); M.saveDraft(next,order); next.revision+=1;
        await persist(next,{type:fresh?'new':'save'},order.id);
        intakeDraft=null; selected=order.id; dirty=false;
        location.href=orderLink(state.orders.find(o=>o.id===order.id),event.submitter?.value==='quote'?'details':'request');
        return;
      }
      if (form.id === 'details-form') {
        await saveDetails(); render(); message(cloud ? 'Saved to OliPoly ERP Test.' : 'Sample details saved on this device.'); return;
      }
      if (!form.dataset.form) return;
      if (dirty) throw new Error('Save your changes before continuing.');
      const values = Object.fromEntries(new FormData(form));
      const action = {...values, type: form.dataset.form};
      if (action.type === 'inspect') {
        action.runId = form.dataset.run;
        action.usage = [...form.querySelectorAll('[data-usage-key]')].map(input => ({key: input.dataset.usageKey, grams: input.value}));
      }
      if (['send_quote','revise_quote'].includes(action.type)) {
        await persist(M.quoteCommand(state,selected,action),{type:'save'});
        if(action.type==='revise_quote') activeTab='details';
      } else await persist(M.command(state, selected, action), action);
      if (action.type === 'approve') {
        activeTab = 'production';
        const url = new URL(location.href);
        url.searchParams.set('section', activeTab);
        history.replaceState(null, '', url);
      }
      render(); message(cloud ? 'Saved to OliPoly ERP Test.' : 'Saved in this device’s sample records.');
    } catch (error) { message(error.message, true); }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (busy) return;
      if (button.dataset.action === 'test-signout') { cloud.signOut(); state = M.seed(); renderAuth(); renderConnection(); return; }
      if (button.dataset.action === 'test-reload') { await loadCloud(); return; }
      if (button.dataset.action === 'test-retry') { state = await cloud.retry(); render(); renderConnection(); message('Pending command resolved.'); return; }
      if (button.dataset.filter) { queueFilter=button.dataset.filter; const url=new URL(location.href); url.searchParams.set('filter',queueFilter); history.replaceState(null,'',url); renderToday(); return; }
      if (button.dataset.tab) {
        if (dirty) throw new Error('Save your changes before changing sections.');
        activeTab = button.dataset.tab;
        const url = new URL(location.href);
        url.searchParams.set('section', activeTab);
        history.replaceState(null, '', url);
        render(); return;
      }
      const action = button.dataset.action;
      if (!action) return;
      if (action === 'new') { intakeDraft=M.newRequest(); renderToday(); return; }
      if (action === 'cancel-intake') { intakeDraft=null; dirty=false; renderToday(); return; }
      if (action === 'reset') {
        if (cloud) { await loadCloud(); return; }
        if (!confirm('Reset all fictional records saved by this sample?')) return;
        const next = M.seed(); next.revision = state.revision + 1; await persist(next); render(); message('Sample reset.'); return;
      }
      if (action === 'print' || action === 'print-quote') { if(dirty) throw new Error('Save your changes before printing.'); activeTab=action==='print-quote'?'quote':'receipt'; document.body.dataset.printView=activeTab; render(); window.print(); return; }
      if (action === 'copy-quote') {
        if(dirty) throw new Error('Save your changes before copying the quote.');
        await navigator.clipboard.writeText(document.getElementById('quote-message').value); message('Quote message copied. Review it before sending.'); return;
      }
      if (action === 'copy-message') {
        const input = document.getElementById('pickup-message');
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
        else { input.select(); if (!document.execCommand('copy')) throw new Error('Select and copy the prepared message.'); }
        message('Pickup message copied.'); return;
      }
      if (['release', 'pickup'].includes(action)) {
        if (dirty) throw new Error('Save your changes before continuing.');
        await persist(M.command(state, selected, {type: action}), {type: action}); render(); message(cloud ? 'Saved to OliPoly ERP Test.' : 'Saved in this device’s sample records.'); return;
      }
      readDraft();
      const index = Number(button.dataset.index);
      if (action === 'add-item') draft.items.push({id: M.uid(), description: 'New item', quantity: 1, unit_price: 0, hours_each: 0, materials: []});
      else if (action === 'remove-item' && draft.items.length > 1) draft.items.splice(index, 1);
      else if (action === 'add-material') draft.items[index].materials.push({material: 'PLA', color: 'Black', grams_each: 0});
      else if (action === 'remove-material') draft.items[index].materials.splice(Number(button.dataset.materialIndex), 1);
      else return;
      const editor = document.getElementById('details-form');
      const currentDraft = draft;
      editor.outerHTML = detailPanel(currentDraft);
      dirty = true;
      document.getElementById('draft-state').textContent = 'Unsaved changes';
      document.getElementById('price-card').innerHTML = priceCard(currentDraft);
    } catch (error) { message(error.message, true); }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => {
    if (!cloud && event.key === key) message('Sample records changed in another tab. Reload before editing.', true);
  });
  function renderConnection() {
    const notice = document.querySelector('.notice');
    if (!cloud) {
      notice.innerHTML = '<strong>INTERACTIVE SAMPLE</strong><span>Fictional records saved on this device.</span><a class="button" href="ops-preview.html?database=test">Use test database</a>';
      return;
    }
    notice.innerHTML = `<strong>TEST DATABASE</strong><span>OliPoly ERP Test · fictional data only.</span>${cloud.signedIn() ? '<button data-action="test-reload">Reload</button><button data-action="test-signout">Sign out</button>' : ''}${cloud.pending() ? '<button class="primary" data-action="test-retry">Resolve pending save</button>' : ''}`;
  }
  function renderAuth() {
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Separate test account</div><h1>Your test studio.</h1><p class="muted">Sign in on each device with the same test account to share these fictional records.</p></div></header><form class="card stack" style="max-width:520px" data-form="test-auth">${field('Email', 'email', '', 'email', 'autocomplete="username" required')}${field('Password', 'password', '', 'password', 'minlength="12" autocomplete="current-password" required')}<div class="actions"><button class="primary" type="submit" value="signin">Sign in</button><button type="submit" value="signup">Create test account</button></div><p class="muted">This account belongs only to OliPoly ERP Test. Use a new password. Confirmation may be required by email.</p></form>`;
  }
  async function loadCloud() {
    state = await cloud.initialize();
    if (!state.orders.some(order => order.id === selected)) selected = state.orders[0]?.id;
    dirty = false; render(); renderConnection();
    if (cloud.pending()) message('An earlier save needs to be resolved. Use Resolve pending save before editing.', true);
    else message('Loaded the shared test workspace.');
  }
  async function loadPublicTracking(reference) {
    app.innerHTML = '<section class="card">Loading customer milestones…</section>';
    const rows = await cloud.tracking(reference);
    const record = rows?.[0];
    if (!record) throw new Error('No sample order matches that tracking reference.');
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Customer milestone preview</div><h1>Your project, moving along.</h1><p class="muted">${escape(record.order_number)}</p></div></header><section class="card" style="max-width:700px"><span class="badge">${escape(record.public_status_text || window.OliPolyWorkflow.orderStatusLabel(record.status))}</span><p style="margin-top:20px">${escape(record.public_next_step || '')}</p>${record.shipping_or_pickup_note ? `<p class="muted">${escape(record.shipping_or_pickup_note)}</p>` : ''}${row('Remaining balance', format(record.balance_amount))}</section>`;
  }
  renderConnection();
  if (cloud) {
    // Keep the staging query attached only to these three unique entry pages.
    document.querySelectorAll('a[href^="ops-"]').forEach(link => {
      const url = new URL(link.href); url.searchParams.set('database', 'test'); link.href = url.href;
    });
    const tracking = new URLSearchParams(location.search).get('tracking');
    if (page === 'track' && tracking) loadPublicTracking(tracking).catch(error => { app.innerHTML = '<section class="card">Tracking unavailable.</section>'; message(error.message, true); });
    else if (cloud.signedIn()) loadCloud().catch(error => { renderAuth(); message(error.message, true); });
    else renderAuth();
  } else render();
})();
