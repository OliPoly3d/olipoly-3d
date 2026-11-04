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
  let activeTab = ['details', 'production', 'pickup', 'money', 'receipt'].includes(requestedTab) ? requestedTab : 'details';
  let draft;
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
  function status(order) {
    if (!order.snapshot) return 'Draft';
    if (!order.released) return 'Approved';
    return window.OliPolyWorkflow.orderStatusLabel(order.status);
  }
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
  function orderLink(order) { return `ops-order-preview.html?order=${encodeURIComponent(order.id)}${cloud ? '&database=test' : ''}`; }
  function trackingLink(order) { return cloud && order.database?.orderNumber ? `ops-track-preview.html?database=test&tracking=${encodeURIComponent(order.database.orderNumber)}` : `ops-track-preview.html?order=${encodeURIComponent(order.id)}${cloud ? '&database=test' : ''}`; }
  function renderToday() {
    const work = state.orders.filter(order => !order.fulfilled);
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Your studio, at a glance</div><h1>Today in the studio.</h1><p class="muted">Your work, materials and next decisions in one place.</p></div><button class="primary" data-action="new">+ New work</button></header>
      <div class="grid metrics"><div class="card metric"><small>OPEN WORK</small><strong>${work.length}</strong><small>From first idea to pickup</small></div><div class="card metric"><small>PRINTING NOW</small><strong>${state.orders.reduce((sum, order) => sum + order.runs.filter(run => run.status === 'printing').length, 0)} <small>/ 2 printers</small></strong><small>Assign a printer when you start</small></div><div class="card metric"><small>SAMPLE BALANCES</small><strong>${format(state.orders.filter(o => o.snapshot).reduce((sum, o) => sum + M.balance(o), 0))}</strong><small>Payment at pickup is the default</small></div></div>
      <div class="two-col"><section class="card"><div class="section-head"><h2>Work in progress</h2><span class="badge neutral">${work.length} open</span></div><input class="search" id="search" aria-label="Find sample work" placeholder="Find a customer or project…"><div id="order-list">${orderRows('')}</div></section>
      <div class="stack"><section class="card"><div class="eyebrow">Try the whole journey</div><h2>One order. Several items.</h2><p class="muted">Start with the sample project. Approve the price, print both items, record a rejection and reprint, then arrange pickup and one payment.</p><a class="button primary" href="${orderLink(state.orders[0])}">Open sample workspace</a></section><section class="card"><h2>Sample materials</h2><div class="muted">Available after reservations</div>${state.inventory.map(stock => row(stock.key, `${Math.round(stock.grams - M.reserved(state, stock.key))} g`)).join('')}</section><button data-action="reset">${cloud ? 'Reload test records' : 'Reset all sample records'}</button></div></div>`;
  }
  function orderRows(search) {
    const orders = state.orders.filter(o => `${o.customer} ${o.title} ${o.reference}`.toLowerCase().includes(search.toLowerCase()));
    return orders.map(order => `<div class="row"><div><strong>${escape(order.title)}</strong><p>${escape(order.customer)} · ${escape(order.reference)}</p><p><span class="badge ${order.snapshot ? '' : 'rose'}">${escape(status(order))}</span></p></div><a class="button" href="${orderLink(order)}">Open</a></div>`).join('') || '<p class="empty">No matching work.</p>';
  }
  function readDraft() {
    const form = document.getElementById('details-form');
    if (!form || !draft) return;
    const data = new FormData(form);
    ['customer', 'title', 'preset', 'evidence', 'terms', 'county'].forEach(name => { draft[name] = String(data.get(name)); });
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
    if (order.snapshot) return `<section class="card"><h2>Agreed scope</h2><p class="status-line">${escape(order.approval)} · final fixed price ${format(order.snapshot.total)}</p>${order.items.map(item => row(`${item.quantity} × ${item.description}`, format(item.quantity * item.unit_price))).join('')}${row('Design / preparation', format(order.designFee))}<p class="muted" style="margin-top:18px">${escape(order.terms)} · ${escape(order.evidence)}</p><p class="muted">This first sample exercises a fixed-price order. Capped design additions, files and document revisions belong to the next connected workflow.</p></section>`;
    return `<form class="card" id="details-form"><div class="section-head"><h2>Start with what you know</h2><span class="badge rose">Draft</span></div><div class="form-grid">
      ${field('Customer', 'customer', order.customer, 'text', 'required')}${field('Project', 'title', order.title, 'text', 'required')}
      ${select('Starting preset', 'preset', [['individual', 'Individual / friend'], ['business', 'Business / PO'], ['program', 'Fundraiser'], ['stock', 'Show / stock']], order.preset)}
      ${select('Estimate based on', 'evidence', ['Idea / reference', 'Drawing', 'Completed model', 'Sliced file', 'Previous actual results'], order.evidence)}
      ${field('Payment terms', 'terms', order.terms)}${select('Prices entered', 'taxIncluded', [['yes', 'Include sample tax'], ['no', 'Before sample tax']], order.taxIncluded ? 'yes' : 'no')}
      ${field('Sample Ohio county', 'county', order.county, 'text', 'required')}
      ${field('Sample tax rate (%)', 'taxRate', order.taxRate, 'number', 'min="0" max="20" step=".01" required')}
      <label class="check"><input type="checkbox" name="taxExempt" ${order.taxExempt ? 'checked' : ''}>Sample exemption scenario</label>
      <p class="muted full">Use this rate only for the fictional sample. Verified county sourcing and certificate evidence are required for a live connection.</p></div>
      <h3>Items & manufacturing estimates</h3><p class="muted">Quantities, grams and hours below are per piece. Add body and support filament separately.</p>${itemEditor(order)}
      <button type="button" data-action="add-item">+ Add another item</button><div class="form-grid" style="margin-top:24px">${field('Fixed design / preparation charge', 'designFee', order.designFee, 'number', 'min="0" step=".01" required')}${field('Estimated total hands-on hours', 'estimatedLabor', order.estimatedLabor, 'number', 'min="0" step=".01" required')}${field('Sample labor cost per hour', 'laborRate', order.laborRate, 'number', 'min="0" step=".01" required')}</div>
      <div class="actions" style="margin-top:22px"><button class="primary" type="submit">Save sample details</button><small id="draft-state">Saved sample on this device</small></div></form>`;
  }
  function priceCard(order) {
    const t = order.snapshot || M.totals(order);
    return `<section class="card money-list"><div class="eyebrow">${order.snapshot ? 'Accepted price' : 'Price preview'}</div><h2>One combined total</h2>${row('Before tax', format(t.beforeTax))}${row('Sample tax', format(t.tax))}${t.roundingAdjustment ? row('Price rounding', format(t.roundingAdjustment)) : ''}<div class="row"><strong>Total</strong><span class="total">${format(t.total)}</span></div><p class="muted">${order.taxIncluded ? 'Tax is included in the entered prices.' : 'Sample tax is added to item prices.'}</p>${order.snapshot ? `<p class="badge">Approval recorded</p>` : `<form data-form="approve">${select('Approval evidence', 'method', ['Email / text', 'Verbal agreement recorded', 'Purchase order', 'Customer quote link', 'Payment for agreed items'], 'Email / text')}<button class="primary" style="width:100%;margin-top:15px" type="submit">Record approval</button></form>`}</section>`;
  }
  function productionPanel(order) {
    const pending = order.items.filter(item => M.remaining(order, item) > 0);
    return `<section class="card"><div class="section-head"><h2>Shared production queue</h2><span class="badge">${escape(status(order))}</span></div>
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
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">${escape(order.reference)} · ${escape(status(order))}</div><h1>${escape(order.title)}</h1><p class="muted">${escape(order.customer)} · ${escape(order.terms)}</p></div><a class="button" href="ops-preview.html${cloud ? '?database=test' : ''}">All work</a></header><nav class="tabs" aria-label="Order sections">${[['details', 'Details & price'], ['production', 'Production'], ['pickup', 'Pickup'], ['money', 'Money'], ['receipt', 'Receipt']].map(([id, name]) => `<button data-tab="${id}" class="${id === activeTab ? 'active' : ''}">${name}</button>`).join('')}</nav>
      <div class="panel two-col" data-panel="details" ${activeTab !== 'details' ? 'hidden' : ''}><div>${detailPanel(order)}</div><aside class="stack"><div id="price-card">${priceCard(order)}</div><section class="card"><h3>About this sample</h3><p class="muted">The starting preset is editable. This milestone tests the mixed-item, fixed-price pickup journey. PO, fundraiser, capped-design and shipping workflows are scheduled for later milestones.</p></section></aside></div>
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
      document.getElementById('order-list').innerHTML = orderRows(event.target.value);
      return;
    }
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
      if (form.id === 'details-form') {
        await saveDetails(); render(); message(cloud ? 'Saved to OliPoly ERP Test.' : 'Sample details saved on this device.'); return;
      }
      if (!form.dataset.form) return;
      if (dirty) throw new Error('Save the edited details before continuing.');
      const values = Object.fromEntries(new FormData(form));
      const action = {...values, type: form.dataset.form};
      if (action.type === 'inspect') {
        action.runId = form.dataset.run;
        action.usage = [...form.querySelectorAll('[data-usage-key]')].map(input => ({key: input.dataset.usageKey, grams: input.value}));
      }
      await persist(M.command(state, selected, action), action);
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
      if (button.dataset.tab) {
        if (dirty) throw new Error('Save the edited details before changing sections.');
        activeTab = button.dataset.tab;
        const url = new URL(location.href);
        url.searchParams.set('section', activeTab);
        history.replaceState(null, '', url);
        render(); return;
      }
      const action = button.dataset.action;
      if (!action) return;
      if (action === 'new') {
        const next = M.copy(state);
        const order = M.seed().orders[0];
        order.id = M.uid(); order.reference = `SAMPLE-${String(next.orders.length + 1).padStart(3, '0')}`;
        order.customer = ''; order.title = 'New custom project'; order.designFee = 0;
        order.items = [{id: M.uid(), description: 'New item', quantity: 1, unit_price: 0, hours_each: 0, materials: []}];
        next.orders.push(order); next.revision += 1; await persist(next, {type: 'new'}, order.id); location.href = orderLink(order); return;
      }
      if (action === 'reset') {
        if (cloud) { await loadCloud(); return; }
        if (!confirm('Reset all fictional records saved by this sample?')) return;
        const next = M.seed(); next.revision = state.revision + 1; await persist(next); render(); message('Sample reset.'); return;
      }
      if (action === 'print') { activeTab = 'receipt'; render(); window.print(); return; }
      if (action === 'copy-message') {
        const input = document.getElementById('pickup-message');
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
        else { input.select(); if (!document.execCommand('copy')) throw new Error('Select and copy the prepared message.'); }
        message('Pickup message copied.'); return;
      }
      if (['release', 'pickup'].includes(action)) {
        if (dirty) throw new Error('Save the edited details before continuing.');
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
