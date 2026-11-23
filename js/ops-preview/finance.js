(function () {
  'use strict';
  const M = window.OliPolyOpsFinance;
  const E = window.OliPolyLineItems.escape;
  const cloud = window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);
  const app = document.querySelector('[data-finance-app]');
  const message = document.getElementById('message');
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value || 0));
  let entries = [], busy = false, loadError = '', uncertain = cloud.financePending();
  let refreshedAfterUncertain = false;
  let filters = {search:'',type:'all',month:''};
  const notice = (text, error = false) => { message.textContent = text; message.className = error ? 'alert error-live' : 'status-line error-live'; };
  function input(label, name, value = '', type = 'text', extra = '') {
    return `<label>${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
  }
  function options(values, selected) {
    return values.map(value => `<option value="${E(value)}" ${value === selected ? 'selected' : ''}>${E(value)}</option>`).join('');
  }
  function expenseForm() {
    const today = new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
    return `<section class="card"><h2>Add an expense</h2><form id="expense-form" class="form-grid">
      ${input('Date','entry_date',today,'date','required')}
      <label>Category<select name="category">${options(Object.keys(M.categories),'Material')}</select></label>
      <div class="full">${input('Description','title','','text','required maxlength="180"')}</div>
      ${input('Vendor','vendor_name','','text','maxlength="180"')}
      <label>Paid using<select name="payment_method">${options(['','Business Card','Personal Card','Cash','Check','ACH','PayPal','Venmo','Stripe','Other'],'')}</select></label>
      <div data-purchase-fields class="full form-grid">${input('Full purchase amount ($)','original_amount','','number','min=".01" step=".01" required')}${input('Business use (%)','business_use_percent',100,'number','min="0" max="100" step=".01" required')}</div>
      <div data-mileage-fields class="full form-grid" hidden>
        ${input('Total business miles','miles_driven','','number','min=".01" max="100000" step=".01"')}
        ${input('Rate used ($ per mile)','mileage_rate','','number','min=".0001" max="100" step=".0001"')}
        <div class="full">${input('Trip purpose','trip_purpose','','text','maxlength="180"')}</div>
        ${input('From','trip_from','','text','maxlength="120"')}${input('To','trip_to','','text','maxlength="120"')}
        <label class="check full"><input type="checkbox" name="round_trip" value="yes"> Round trip</label>
        <p class="muted full">Enter total miles, including the return leg. The checkbox labels the trip. Enter the rate appropriate for its date.</p>
      </div>
      <div class="full">${input('Receipt or supporting document link','receipt_link','','url','maxlength="1000" placeholder="https://drive.google.com/…"')}</div>
      <label class="full">Notes<textarea name="notes" maxlength="4000"></textarea></label>
      <p class="full" id="expense-preview" role="status">Enter the amount to preview the business portion.</p>
      <p class="muted full">Record each purchase once. Saving an expense records its cost. Add received material quantities in All inventory.</p>
      <button class="primary full" type="submit" ${uncertain ? 'disabled' : ''}>Save expense</button>
    </form></section>`;
  }
  function visibleEntries() {
    const query = filters.search.toLowerCase().trim();
    return entries.filter(entry => (filters.type === 'all' || entry.type === filters.type) &&
      (!filters.month || entry.entry_date?.startsWith(filters.month)) &&
      [entry.title,entry.category,entry.vendor_name,entry.order_number,entry.notes].join(' ').toLowerCase().includes(query));
  }
  function transaction(entry) {
    const linked = entry.order_number || entry.order_ref || '';
    const fields = [['Paid using',entry.payment_method],['Notes',entry.notes]];
    if (entry.type === 'expense') fields.unshift(['Original purchase',money(entry.original_amount)],['Business use',`${entry.business_use_percent ?? 100}%`]);
    if (entry.type === 'income') fields.push(['Sales tax',money(entry.sales_tax_collected)],['County',entry.sales_county || entry.destination_county]);
    if (Number(entry.miles_driven)) fields.push(['Total business miles',entry.miles_driven],['Rate used',entry.mileage_rate],['Trip purpose',entry.trip_purpose],['From',entry.trip_from],['To',entry.trip_to],['Round trip',entry.round_trip ? 'Yes' : 'No']);
    let receipt = '';
    if (/^https:\/\/[^\s]+$/i.test(entry.receipt_link || '')) receipt = `<p><a href="${E(entry.receipt_link)}" target="_blank" rel="noopener noreferrer">Open receipt or document</a></p>`;
    return `<article class="finance-entry"><div class="section-head"><div><strong>${E(entry.title)}</strong><p class="muted">${E(entry.entry_date)} · ${E(entry.category)}${linked ? ` · ${E(linked)}` : ''}${entry.vendor_name ? ` · ${E(entry.vendor_name)}` : ''}</p></div><strong>${money(entry.amount)}</strong></div>
      <details><summary>Transaction details${entry.is_corrected ? ' · corrected' : ''}</summary>
      ${fields.filter(([,value]) => value !== '' && value != null).map(([label,value]) => `<div class="row"><span>${label}</span><span>${E(value)}</span></div>`).join('')}
      ${receipt}${entry.correction_reason ? `<p>Correction reason · ${E(entry.correction_reason)}</p>` : ''}
      <p class="muted">${entry.finance_command_owned || entry.order_id ? 'Created by the order workflow.' : 'Manually recorded.'}</p></details></article>`;
  }
  function renderTransactions() {
    const rows = visibleEntries();
    document.getElementById('finance-count').textContent = `${rows.length} transactions`;
    document.getElementById('finance-rows').innerHTML = loadError ? `<p class="alert">${E(loadError)}</p>` : rows.map(transaction).join('') || '<p class="empty">No transactions match these filters.</p>';
  }
  function render() {
    if (!cloud.signedIn()) {
      app.innerHTML = '<section class="card"><h1>Finance</h1><p>Sign in with your ERP Test account to open shared financial records.</p><a class="button primary" href="ops-preview.html?database=test">Open ERP sign-in</a></section>';
      return;
    }
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Your working studio</div><h1>Finance</h1><p class="muted">Shared transactions, expenses and business mileage.</p></div><div class="actions"><button data-action="reload">Refresh records</button><button data-action="export" ${loadError ? 'disabled' : ''}>Export filtered CSV</button></div></header>
      ${uncertain ? '<section class="alert"><p>The expense save was interrupted. Refresh and inspect recent transactions before entering it again.</p><button data-action="reviewed">I checked the records and this expense is missing</button></section>' : ''}
      <div class="two-col"><section class="card"><h2>Transactions</h2><div class="form-grid">
      ${input('Search description, vendor or OP number','search',filters.search,'search')}
      <label>Entry type<select name="filter_type">${options(['all','income','expense'],filters.type)}</select></label>
      ${input('Month','filter_month',filters.month,'month')}<button data-action="clear" type="button">Clear filters</button></div>
      <p id="finance-count" class="muted" role="status"></p><div id="finance-rows"></div></section>${expenseForm()}</div>`;
    renderTransactions();
    updateForm();
  }
  async function load() {
    loadError = '';
    try { entries = (await cloud.financeLoad()).map(row => typeof row === 'string' ? JSON.parse(row) : row); }
    catch (error) { loadError = error.message; throw error; }
  }
  function updateForm() {
    const form = document.getElementById('expense-form');
    const mileage = form.elements.category.value === 'Vehicle / Delivery Mileage';
    for (const [selector,enabled] of [['[data-mileage-fields]',mileage],['[data-purchase-fields]',!mileage]]) {
      const group = form.querySelector(selector);
      group.hidden = !enabled;
      group.querySelectorAll('input').forEach(input => { input.disabled = !enabled; });
    }
    ['miles_driven','mileage_rate','trip_purpose'].forEach(name => { form.elements[name].required = mileage; });
    const preview = document.getElementById('expense-preview');
    try { const entry = M.expense(Object.fromEntries(new FormData(form))); preview.textContent = `Business portion recorded · ${money(entry.amount)}`; }
    catch { preview.textContent = mileage ? 'Enter total business miles, rate and trip purpose.' : 'Enter the purchase amount and business use percentage.'; }
  }
  app.addEventListener('input',event => {
    if (event.target.closest('#expense-form')) updateForm();
    if (event.target.name === 'search') { filters.search = event.target.value; renderTransactions(); }
  });
  app.addEventListener('change',event => {
    if (event.target.name === 'filter_type') filters.type = event.target.value;
    if (event.target.name === 'filter_month') filters.month = event.target.value;
    if (event.target.closest('#expense-form')) updateForm();
    else renderTransactions();
  });
  app.addEventListener('submit',async event => {
    if (event.target.id !== 'expense-form') return;
    event.preventDefault();
    if (busy || uncertain || loadError) { notice('Refresh and review the financial records before saving.',true); return; }
    let saved = false;
    try {
      const payload = M.expense(Object.fromEntries(new FormData(event.target)));
      busy = true; event.target.inert = true;
      await cloud.financeCreate(payload); saved = true;
      event.target.reset(); updateForm();
      await load(); renderTransactions();
      notice('Expense saved to ERP Test.');
    } catch (error) {
      if (error.uncertain && !saved) { uncertain = true; refreshedAfterUncertain = false; render(); }
      notice(saved ? 'Expense saved. Refresh records to see it. Avoid entering it again.' : error.message,true);
    } finally { busy = false; const form = document.getElementById('expense-form'); if (form) form.inert = false; }
  });
  app.addEventListener('click',async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || busy) return;
    try {
      if (action === 'export') {
        if (loadError) throw new Error('Refresh successfully before exporting.');
        const url = URL.createObjectURL(new Blob([M.csv(visibleEntries())],{type:'text/csv;charset=utf-8'}));
        const link = document.createElement('a'); link.href = url; link.download = 'OliPoly-Test-Finance.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return;
      }
      if (action === 'clear') { filters = {search:'',type:'all',month:''}; renderTransactions(); document.querySelector('[name="search"]').value=''; document.querySelector('[name="filter_type"]').value='all'; document.querySelector('[name="filter_month"]').value=''; return; }
      if (action === 'reviewed') {
        if (loadError || !refreshedAfterUncertain) throw new Error('Refresh successfully and review recent entries before continuing.');
        cloud.financeReviewed(); uncertain = false; render(); return;
      }
      if (action === 'reload') { busy = true; await load(); refreshedAfterUncertain = true; renderTransactions(); notice('Financial records refreshed.'); }
    } catch (error) { notice(error.message,true); if (document.getElementById('finance-rows')) renderTransactions(); }
    finally { busy = false; }
  });
  (async () => {
    if (cloud.signedIn()) { try { await load(); } catch (error) { notice(error.message,true); } }
    render();
  })();
})();
