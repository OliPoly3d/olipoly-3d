(function () {
  'use strict';
  const M = window.OliPolyOpsFinance;
  const Reports = window.OliPolyOpsFinanceReports;
  const E = window.OliPolyLineItems.escape;
  const cloud = window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);
  const app = document.querySelector('[data-finance-app]');
  const message = document.getElementById('message');
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value || 0));
  let entries = [], busy = false, loadError = '', uncertain = cloud.financePending();
  let refreshedAfterUncertain = false;
  let filters = {search:'',type:'all',month:''};
  let reportYear = Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/New_York'}).format(new Date()));
  let reportHalf = 'all', orders = [], ordersError = '';
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
  function reportTable(headers, rows) {
    return `<div class="finance-report-scroll" tabindex="0"><table class="receipt-table"><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function reportRow(name, amounts) {
    return `<tr><th scope="row">${E(name)}</th>${amounts.map(amount => `<td>${money(amount)}</td>`).join('')}</tr>`;
  }
  function currentReport() { return Reports.summarize(entries,reportYear,reportHalf,orders); }
  function renderReports() {
    const panel = document.getElementById('reports-content');
    if (!panel) return;
    if (loadError) { panel.innerHTML = '<p class="alert">Refresh financial records successfully to load reports.</p>'; return; }
    try {
      const report = currentReport(), t = report.total;
      const summary = [['Sales before tax',t.revenue],['Recorded expenses',t.expenses],['Revenue less expenses',t.profit],['Sales tax recorded',t.taxCollected]];
      const problems = [...report.warnings,...(ordersError ? ['Approved-order review is unavailable. Refresh before using this summary for filing.'] : [])];
      panel.innerHTML = `<p class="muted">Posted entries dated ${E(report.period.start)} through ${E(report.period.end)}. Report period is independent of the transaction search filters.</p>
        <div class="grid finance-report-metrics">${summary.map(([label,value]) => `<div class="metric"><span>${label}</span><strong>${money(value)}</strong></div>`).join('')}</div>
        <p class="muted">Revenue less expenses uses the posted expense amounts, including recorded purchases and mileage. Sales tax uses the saved transaction amounts. Equipment purchases appear in cash expenses for this report.</p>
        <div class="actions"><button data-action="export-months">Export monthly report</button><button data-action="export-counties">Export county tax report</button></div>
        ${problems.length ? `<div class="alert"><strong>Review these records</strong><ul>${problems.map(problem => `<li>${E(problem)}</li>`).join('')}</ul></div>` : ''}
        <h3>Monthly income and expenses</h3>
        ${reportTable(['Month','Products / services','Shipping revenue','Revenue before tax','Expenses','Revenue less expenses','Sales tax'],[...report.months,report.total].map(row => reportRow(row.name,[row.productRevenue,row.shippingRevenue,row.revenue,row.expenses,row.profit,row.taxCollected])))}
        <h3>County sales and tax</h3><p class="muted">Sales amounts exclude sales tax. Separate rows retain each recorded rate used during the period.</p>
        ${report.counties.length ? reportTable(['County / rate','Gross sales','Taxable sales','Exempt sales','Tax recorded'],[...report.counties.map(row => reportRow(`${row.name} · ${row.rate}%`,[row.grossSales,row.taxableSales,row.exemptSales,row.taxCollected])),reportRow('Total',[t.grossSales,t.taxableSales,t.exemptSales,t.taxCollected])]) : '<p>No posted sales in this period.</p>'}
        <h3>Current approved orders awaiting sale posting</h3>
        <p class="muted">Order sales post to Finance after final payment in the current workflow. Review completed or unpaid orders and deposits before preparing a tax return. This list covers current open records across all dates.</p>
        ${report.unpostedOrders.length ? reportTable(['Order','Agreed total','Payments recorded','Balance'],report.unpostedOrders.map(order => `<tr><th scope="row">${E(order.reference)}${order.fulfilled ? ' · fulfilled' : ''}</th><td>${money(order.total)}</td><td>${money(order.paid)}</td><td>${money(order.balance)}</td></tr>`)) : `<p>${ordersError ? 'Refresh to review unposted orders.' : 'All approved orders have a posted sale.'}</p>`}`;
    } catch (error) { panel.innerHTML = `<p class="alert">${E(error.message)}</p>`; }
  }
  function reportPanel() {
    return `<details class="card finance-reports" id="finance-reports"><summary>Finance reports</summary><div class="form-grid">
      ${input('Report year','report_year',reportYear,'number','min="2000" max="9999" step="1"')}
      <label>Report period<select name="report_half"><option value="all">Full year</option><option value="H1">January–June</option><option value="H2">July–December</option></select></label>
      </div><div id="reports-content"></div></details>`;
  }
  function render() {
    if (!cloud.signedIn()) {
      app.innerHTML = '<section class="card"><h1>Finance</h1><p>Sign in with your ERP Test account to open shared financial records.</p><a class="button primary" href="ops-preview.html?database=test">Open ERP sign-in</a></section>';
      return;
    }
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Your working studio</div><h1>Finance</h1><p class="muted">Shared transactions, expenses and business mileage.</p></div><div class="actions"><button data-action="reports">Reports</button><button data-action="reload">Refresh records</button><button data-action="export" ${loadError ? 'disabled' : ''}>Export filtered CSV</button></div></header>
      ${reportPanel()}
      ${uncertain ? '<section class="alert"><p>The expense save was interrupted. Refresh and inspect recent transactions before entering it again.</p><button data-action="reviewed">I checked the records and this expense is missing</button></section>' : ''}
      <div class="two-col"><section class="card"><h2>Transactions</h2><div class="form-grid">
      ${input('Search description, vendor or OP number','search',filters.search,'search')}
      <label>Entry type<select name="filter_type">${options(['all','income','expense'],filters.type)}</select></label>
      ${input('Month','filter_month',filters.month,'month')}<button data-action="clear" type="button">Clear filters</button></div>
      <p id="finance-count" class="muted" role="status"></p><div id="finance-rows"></div></section>${expenseForm()}</div>`;
    renderTransactions();
    document.querySelector('[name="report_half"]').value = reportHalf;
    renderReports();
    updateForm();
  }
  async function load() {
    loadError = '';
    const [ledger,workspace] = await Promise.allSettled([cloud.financeLoad(),cloud.load()]);
    ordersError = workspace.status === 'rejected' ? workspace.reason.message : '';
    orders = workspace.status === 'fulfilled' ? workspace.value.orders || [] : [];
    if (ledger.status === 'rejected') { loadError = ledger.reason.message; throw ledger.reason; }
    entries = ledger.value.map(row => typeof row === 'string' ? JSON.parse(row) : row);
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
    if (event.target.name === 'report_year') { reportYear = Number(event.target.value); renderReports(); return; }
    if (event.target.name === 'report_half') { reportHalf = event.target.value; renderReports(); return; }
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
      await load(); renderTransactions(); renderReports();
      notice('Expense saved to ERP Test.');
    } catch (error) {
      if (error.uncertain && !saved) { uncertain = true; refreshedAfterUncertain = false; render(); }
      if (loadError) { renderTransactions(); renderReports(); }
      notice(saved ? 'Expense saved. Refresh records to see it. Avoid entering it again.' : error.message,true);
    } finally { busy = false; const form = document.getElementById('expense-form'); if (form) form.inert = false; }
  });
  app.addEventListener('click',async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || busy) return;
    try {
      if (action === 'reports') { const panel = document.getElementById('finance-reports'); panel.open = true; panel.scrollIntoView({behavior:'smooth',block:'start'}); return; }
      if (action === 'export-months' || action === 'export-counties') {
        if (loadError) throw new Error('Refresh successfully before exporting.');
        const report = currentReport();
        const monthly = action === 'export-months';
        const rows = monthly ? [...report.months,report.total] : [...report.counties,{...report.total,rate:''}];
        const fields = monthly ? ['name','productRevenue','shippingRevenue','revenue','expenses','profit','taxCollected'] : ['name','rate','grossSales','taxableSales','exemptSales','taxCollected'];
        const range = report.period;
        const warnings = [...report.warnings,...(ordersError ? [ordersError] : []),...report.unpostedOrders.map(order => `${order.reference} awaiting sale posting; total ${order.total}; payments ${order.paid}`)].join(' | ');
        const exported = rows.map(row => ({...row,periodStart:range.start,periodEnd:range.end,reviewNotes:warnings}));
        download(M.csv(exported,['periodStart','periodEnd',...fields,'reviewNotes']),`OliPoly-Test-${monthly ? 'Monthly' : 'County-Tax'}-${range.year}-${range.half}.csv`);
        return;
      }
      if (action === 'export') {
        if (loadError) throw new Error('Refresh successfully before exporting.');
        download(M.csv(visibleEntries()),'OliPoly-Test-Finance.csv'); return;
      }
      if (action === 'clear') { filters = {search:'',type:'all',month:''}; renderTransactions(); document.querySelector('[name="search"]').value=''; document.querySelector('[name="filter_type"]').value='all'; document.querySelector('[name="filter_month"]').value=''; return; }
      if (action === 'reviewed') {
        if (loadError || !refreshedAfterUncertain) throw new Error('Refresh successfully and review recent entries before continuing.');
        cloud.financeReviewed(); uncertain = false; render(); return;
      }
      if (action === 'reload') { busy = true; await load(); refreshedAfterUncertain = true; renderTransactions(); renderReports(); notice('Financial records refreshed.'); }
    } catch (error) { notice(error.message,true); if (document.getElementById('finance-rows')) { renderTransactions(); renderReports(); } }
    finally { busy = false; }
  });
  function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  (async () => {
    if (cloud.signedIn()) { try { await load(); } catch (error) { notice(error.message,true); } }
    render();
  })();
})();
