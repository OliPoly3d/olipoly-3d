(function () {
  'use strict';
  const M = window.OliPolyOpsFinance;
  const Corrections = window.OliPolyOpsFinanceCorrections;
  let correcting = null, correctionDirty = new Set();
  const correctionPending = () => cloud.financeCorrectionPending?.();
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
  let reportHalf = 'all', orders = [], ordersError = '', sharedSettings = null;
  const notice = (text, error = false) => { message.textContent = text; message.className = error ? 'alert error-live' : 'status-line error-live'; };
  function input(label, name, value = '', type = 'text', extra = '') {
    return `<label>${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
  }
  function options(values, selected) {
    return values.map(value => `<option value="${E(value)}" ${value === selected ? 'selected' : ''}>${E(value)}</option>`).join('');
  }
  function expenseForm() {
    const today = new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
    return `<section class="card"><h2>Add an expense</h2>${ordersError ? '<p class="alert">Shared defaults are unavailable. Reload before relying on saved business defaults.</p>' : ''}<form id="expense-form" class="form-grid">
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
        ${input('From','trip_from',sharedSettings?.headquarters ?? (ordersError ? '' : window.OliPolyOpsFinanceDefaults?.headquarters || ''),'text','maxlength="120"')}${input('To','trip_to','','text','maxlength="120"')}
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
      <button type="button" data-action="correct" data-entry-id="${E(entry.id)}">Correct entry</button>${auditHistory(entry)}
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
  function annualReport() { return Reports.summarize(entries,reportYear,'all',orders); }
  function annualRows(report) {
    return [
      {kind:'Revenue',name:'Products / services',amount:report.total.productRevenue,reference:'Receipts before sales tax'},
      {kind:'Revenue',name:'Shipping charged',amount:report.total.shippingRevenue,reference:'Included once in revenue'},
      {kind:'Total',name:'Revenue before sales tax',amount:report.total.revenue,reference:'Schedule C line 1 reference; review returns / allowances'},
      ...report.categories.map(row=>({...row,kind:'Expense category'})),
      {kind:'Total',name:'Recorded expenses',amount:report.total.expenses,reference:'Posted business portions; includes purchases and mileage'},
      {kind:'Total',name:'Revenue less recorded expenses',amount:report.total.profit,reference:'Bookkeeping result; inventory, equipment and home-office tax treatment may differ'},
      {kind:'Memo',name:'Sales tax recorded',amount:report.total.taxCollected,reference:'Excluded from revenue; separate sales-tax liability'}
    ];
  }
  function officeReference() {
    if (!sharedSettings) return 'Shared home-office settings unavailable. Refresh to review.';
    const office = sharedSettings.officeSqft, home = sharedSettings.homeSqft;
    const percent = home > 0 ? window.OliPolyBusinessSettings?.officePercent(sharedSettings) : null;
    return `Current shared reference: office ${office || 0} sq. ft.; home ${home || 0} sq. ft.; ${percent == null ? 'area ratio unavailable' : `${percent}% area ratio`}. Verify areas and eligibility for the report year. No home-office deduction is calculated or added to expenses.`;
  }
  function renderAnnual() {
    const report = annualReport();
    const link = entry => /^https:\/\/[^\s]+$/i.test(entry.receipt_link || '') ? `<a href="${E(entry.receipt_link)}" target="_blank" rel="noopener noreferrer">Receipt / document</a>` : 'No HTTPS receipt link';
    return `<details id="annual-finance" ${document.getElementById('annual-finance')?.open ? 'open' : ''}><summary>Annual expenses &amp; tax preparation · ${E(reportYear)}</summary>
      <p>Full year: ${E(report.period.start)} through ${E(report.period.end)}, regardless of the period selected above. Uses effective posted records and saved business portions.</p>
      <div class="actions"><button data-action="export-annual">Export annual summary</button><button data-action="export-expenses">Export expense detail</button><button data-action="export-mileage">Export mileage log</button></div>
      ${report.warnings.length ? `<div class="alert"><ul>${report.warnings.map(note=>`<li>${E(note)}</li>`).join('')}</ul></div>` : ''}
      ${reportTable(['Category / total','Records','Amount','Tax preparation reference'],annualRows(report).map(row=>`<tr><th scope="row">${E(row.name)}</th><td>${row.count ?? '—'}</td><td>${money(row.amount)}</td><td>${E(row.reference)}</td></tr>`))}
      <p class="muted">Tax references support preparation, not an automatic tax return. Material purchases and production consumption must not both be deducted. Review beginning/ending inventory, equipment treatment, refunds and unpaid orders before filing. Owner design/printing time is not an additional posted expense.</p>
      <p class="muted">References checked November 23, 2026: <a href="https://www.irs.gov/pub/irs-pdf/f1040sc.pdf" target="_blank" rel="noopener noreferrer">2026 Schedule C</a> · <a href="https://www.irs.gov/instructions/i1040sc" target="_blank" rel="noopener noreferrer">IRS instructions (2025)</a>. Other report years require their own form review.</p>
      <h3>Business mileage</h3><p class="muted">Total business miles are entered once, including both directions when applicable. Reports retain each saved rate and amount; changing defaults does not reprice past trips. Do not deduct vehicle operating expenses again when using standard mileage.</p>
      ${report.mileage.length ? reportTable(['Date / purpose','From → to','Miles / saved rate','Recorded amount'],report.mileage.map(row=>`<tr><th scope="row">${E(row.entry_date)} · ${E(row.trip_purpose)}</th><td>${E(row.trip_from)} → ${E(row.trip_to)}</td><td>${E(row.miles_driven)} mi · $${E(row.mileage_rate)}/mi</td><td>${money(row.amount)}</td></tr>`)) : '<p>No recorded mileage in this year.</p>'}
      <h3>Home office</h3><p>${E(officeReference())}</p>
      <details><summary>Expense records &amp; receipt links · ${report.expenses.length}</summary>
      ${report.expenses.length ? reportTable(['Date / description','Category / business portion','Posted expense','Evidence / audit reference'],report.expenses.map(row=>`<tr><th scope="row">${E(row.entry_date)} · ${E(row.title)}</th><td>${E(row.category || 'Uncategorized')} · ${row.business_use_percent == null ? 'Unrecorded' : `${E(row.business_use_percent)}%`}</td><td>${money(row.amount)}</td><td>${link(row)}<br>Original ${E(row.original_entry_id)}<br>Effective ${E(row.effective_entry_id)}</td></tr>`)) : '<p>No posted expenses in this year.</p>'}</details></details>`;
  }
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
        ${renderAnnual()}
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
      <section class="card" id="finance-correction" hidden></section>
      <section class="alert" id="correction-pending" hidden><p>A Finance correction is awaiting confirmation. Retry this same correction to check its saved result.</p><button data-action="retry-correction">Check pending correction</button></section>
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
    window.OliPolyOpsFinanceDefaults?.bind(document.getElementById('expense-form'),{kind:'mileage',rate:'mileage_rate',date:'entry_date',auto:true,initial:true,mileageMode:sharedSettings?.mileageMode,customRate:sharedSettings?.mileageRate});
    showCorrectionPending();
  }
  async function load() {
    loadError = '';
    const [ledger,workspace] = await Promise.allSettled([cloud.financeLoad(),cloud.load()]);
    sharedSettings = workspace.status === 'fulfilled' ? workspace.value.settings || null : null;
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
    if (event.target.closest('#correction-form')) { correctionDirty.add(event.target.name); previewCorrection(); return; }
    if (event.target.closest('#expense-form')) updateForm();
    if (event.target.name === 'search') { filters.search = event.target.value; renderTransactions(); }
  });
  app.addEventListener('change',event => {
    if (event.target.name === 'report_year') { reportYear = Number(event.target.value); renderReports(); return; }
    if (event.target.name === 'report_half') { reportHalf = event.target.value; renderReports(); return; }
    if (event.target.name === 'filter_type') filters.type = event.target.value;
    if (event.target.name === 'filter_month') filters.month = event.target.value;
    if (event.target.closest('#correction-form')) { correctionDirty.add(event.target.name); previewCorrection(); return; }
    if (event.target.closest('#expense-form')) updateForm();
    else renderTransactions();
  });
  app.addEventListener('submit',async event => {
    if (event.target.id === 'correction-form') { event.preventDefault(); await saveCorrection(event.target); return; }
    if (event.target.id !== 'expense-form') return;
    event.preventDefault();
    if (busy || uncertain || correctionPending() || loadError) { notice('Refresh and review the financial records before saving.',true); return; }
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
      if (action === 'correct') { openCorrection(event.target.closest('[data-entry-id]').dataset.entryId); return; }
      if (action === 'cancel-correction') { closeCorrection(); return; }
      if (action === 'retry-correction') { await saveCorrection(null,true); return; }
      if (action === 'reports') { const panel = document.getElementById('finance-reports'); panel.open = true; panel.scrollIntoView({behavior:'smooth',block:'start'}); return; }
      if (['export-annual','export-expenses','export-mileage'].includes(action)) {
        if (loadError) throw new Error('Refresh successfully before exporting.');
        const report = annualReport();
        const notes = [...report.warnings,...(ordersError ? [ordersError] : []),...report.unpostedOrders.map(order=>`${order.reference} awaiting sale posting`)].join(' | ');
        const summary = action === 'export-annual';
        const rows = summary ? annualRows(report) : action === 'export-mileage' ? report.mileage : report.expenses;
        const fields = summary ? ['kind','name','count','amount','group','reference'] : ['entry_date','category','title','amount','original_amount','business_use_percent','shipping_cost','report_group','tax_category','tax_reference','vendor_name','payment_method','receipt_link','miles_driven','mileage_rate','trip_purpose','trip_from','trip_to','round_trip','order_number','original_entry_id','effective_entry_id','notes'];
        const exported = rows.map(row=>({...row,periodStart:report.period.start,periodEnd:report.period.end,reviewNotes:notes,...(summary ? {homeOfficeReference:officeReference()} : {})}));
        download(M.csv(exported,['periodStart','periodEnd',...fields,'reviewNotes',...(summary ? ['homeOfficeReference'] : [])]),`OliPoly-Test-${action.slice(7)}-${reportYear}.csv`);
        return;
      }
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
      if (action === 'reload') { busy = true; closeCorrection(); await load(); refreshedAfterUncertain = true; renderTransactions(); renderReports(); notice('Financial records refreshed.'); }
    } catch (error) { notice(error.message,true); if (document.getElementById('finance-rows')) { renderTransactions(); renderReports(); } }
    finally { busy = false; }
  });
  const fieldLabel = key => key.replaceAll('_',' ');
  const displayValue = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  function auditHistory(entry) {
    const history = entry.correction_history || [];
    return `<details><summary>Correction history · ${history.length}</summary><p class="muted">Original entry ${E(entry.original_entry_id || entry.id)}<br>Effective entry ${E(entry.effective_entry_id || entry.id)}</p>${history.map(item => `<article class="finance-entry"><strong>${E(item.reason)}</strong><p>${E(item.created_at)} · ${item.correction_kind === 'metadata_only' ? 'Details updated' : 'Reversal and replacement'}</p>${reportTable(['Field','Previous','Corrected'],Object.entries(item.changed_fields || {}).map(([key,value]) => `<tr><th scope="row">${E(fieldLabel(key))}</th><td>${E(displayValue(value.old))}</td><td>${E(displayValue(value.new))}</td></tr>`))}<p class="muted">Command ${E(item.command_identity)}<br>Audit entry ${E(item.metadata_entry_id || item.replacement_entry_id)}${item.reversal_entry_id ? `<br>Reversal ${E(item.reversal_entry_id)}` : ''}</p></article>`).join('') || '<p>No corrections recorded.</p>'}</details>`;
  }
  function showCorrectionPending() {
    const pending = !!correctionPending();
    const panel = document.getElementById('correction-pending');
    if (panel) panel.hidden = !pending;
    const save = document.querySelector('#expense-form button[type="submit"]');
    if (save) save.disabled = pending || uncertain;
  }
  function closeCorrection() {
    correcting = null; correctionDirty = new Set();
    const panel = document.getElementById('finance-correction');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  }
  function openCorrection(id) {
    if (loadError || uncertain || correctionPending()) throw new Error('Refresh and resolve any pending save before correcting an entry.');
    correcting = entries.find(entry => entry.id === id);
    if (!correcting) throw new Error('Refresh to find this entry.');
    correctionDirty = new Set();
    const entry = Corrections.baseline(correcting), income = entry.type === 'income';
    const number = (label,key,step='.01') => input(label,key,entry[key] ?? 0,'number',`min="0" step="${step}"`);
    const text = (label,key,type='text') => input(label,key,entry[key] || '',type);
    const check = (label,key) => `<label class="check full"><input name="${key}" type="checkbox" value="yes" ${entry[key] ? 'checked' : ''}>${label}</label>`;
    const panel = document.getElementById('finance-correction'); panel.hidden = false;
    panel.innerHTML = `<h2>Correct ${income ? 'income' : 'expense'}</h2><p>${E(correcting.title)} · ${E(correcting.order_number || '')}</p><p class="muted">Corrections preserve the original entry and require a reason. This updates accounting records. Manage customer pricing, invoices and payments in the order.</p>
      <form id="correction-form" class="form-grid">
      ${text('Date','entry_date','date')}${text('Description','title')}${text('Category','category')}${text('Tax reporting category','tax_category')}
      ${text('Vendor','vendor_name')}${text('Payment method','payment_method')}${text('Receipt or supporting document link','receipt_link','url')}
      <label class="full">Notes<textarea name="notes" maxlength="4000">${E(entry.notes || '')}</textarea></label>
      ${income ? `${number('Products / services before tax ($)','amount')}${number('Shipping charged ($)','shipping_charged')}${text('Tax reporting county','sales_county')}${number('Recorded sales-tax rate (%)','sales_tax_rate')}${check('Tax-exempt sale','tax_exempt_sale')}${text('Exemption reason','tax_exempt_reason')}${check('Exemption certificate on file','exemption_certificate_on_file')}
      <p class="muted full">The tax reporting county follows the applicable sourcing rule. A delivery-address change alone does not select a new county or rate. Enter the rate applicable to the sale date and explain any reallocation below. A rate change proposes recalculated recorded tax. If the customer actually paid a different tax amount, use Actual tax override and record any customer settlement separately.</p><p class="full">Current recorded sales tax · ${money(entry.sales_tax_collected)}</p>
      <details class="full"><summary>Actual tax override</summary><label class="check"><input type="checkbox" name="overrideEnabled" value="yes">Record actual tax differing from calculated tax</label>${input('Actual tax ($)','overrideAmount',entry.sales_tax_collected || 0,'number','min="0" step=".01"')}${input('Tax override explanation','overrideReason','','text','maxlength="500"')}</details>
      <details class="full"><summary>Recorded fulfillment and production costs</summary><div class="form-grid">${['shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost'].map(key => number(`${fieldLabel(key)} ($)`,key)).join('')}</div></details>` : `${number('Full purchase amount ($)','original_amount')}${number('Business use (%)','business_use_percent')}
      <details class="full" ${entry.category === 'Vehicle / Delivery Mileage' ? 'open' : ''}><summary>Mileage details — used for Vehicle / Delivery Mileage</summary><div class="form-grid">${number('Total business miles','miles_driven')}${number('Rate used ($ per mile)','mileage_rate','.0001')}${text('Trip purpose','trip_purpose')}${text('From','trip_from')}${text('To','trip_to')}${check('Round trip — total miles already include the return','round_trip')}</div></details>`}
      <label class="full">Reason for correction<textarea name="reason" required minlength="3" maxlength="500"></textarea></label>
      <div class="full" id="correction-review" role="status"></div>
      <div class="actions full"><button class="primary" type="submit">Save audited correction</button><button type="button" data-action="cancel-correction">Cancel</button></div></form>`;
    window.OliPolyOpsFinanceDefaults?.bind(document.getElementById('correction-form'),income ? {kind:'tax',rate:'sales_tax_rate',date:'entry_date',county:'sales_county',exempt:'tax_exempt_sale',auto:false} : {kind:'mileage',rate:'mileage_rate',date:'entry_date',auto:false});
    panel.scrollIntoView?.({behavior:'smooth',block:'start'}); previewCorrection();
  }
  function correctionValues(form) {
    const values = Object.fromEntries(new FormData(form));
    if (correcting?.type === 'expense' && correctionDirty.has('category') && !correctionDirty.has('tax_category') && Object.hasOwn(M.categories,values.category)) { values.tax_category = M.categories[values.category]; }
    form.querySelectorAll('input[type="checkbox"]').forEach(input => { values[input.name] = input.checked; });
    return values;
  }
  function proposalFields(values) {
    return new Set([...correctionDirty,...(correcting.type === 'expense' && correctionDirty.has('category') && !correctionDirty.has('tax_category') && Object.hasOwn(M.categories,values.category) ? ['tax_category'] : [])]);
  }
  function previewCorrection() {
    const form = document.getElementById('correction-form'); if (!form || !correcting) return;
    if (correcting.type === 'expense') form.elements.original_amount.readOnly = form.elements.category.value.trim() === 'Vehicle / Delivery Mileage';
    const review = document.getElementById('correction-review');
    try {
      const values = correctionValues(form);
      const proposal = Corrections.prepare(correcting,{...values,reason:values.reason || 'Preview only'},proposalFields(values));
      review.innerHTML = `<p>${proposal.kind === 'metadata_only' ? 'Details correction. Recorded amounts stay the same.' : 'Financial correction. The original is retained with a reversal and corrected replacement.'}</p>${reportTable(['Field','Current','Proposed'],proposal.changes.map(change => `<tr><th scope="row">${E(fieldLabel(change.field))}</th><td>${E(displayValue(change.old))}</td><td>${E(displayValue(change.new))}</td></tr>`))}`;
    } catch (error) { review.textContent = error.message; }
  }
  async function saveCorrection(form,retry=false) {
    if (busy) return;
    let saved = false;
    try {
      if (loadError && !retry) throw new Error('Refresh successfully before correcting an entry.');
      const values = retry ? null : correctionValues(form);
      const proposal = retry ? null : Corrections.prepare(correcting,values,proposalFields(values));
      busy = true; if (form) form.inert = true;
      if (retry) await cloud.financeCorrectionRetry(); else await cloud.financeCorrect(proposal.params);
      saved = true; closeCorrection(); await load(); renderTransactions(); renderReports();
      notice('Finance correction saved. Reports and history now use the corrected entry.');
    } catch (error) {
      notice(saved ? 'Correction saved. Refresh records to load its history. Avoid entering it again.' : error.message,true);
      if (loadError) { renderTransactions(); renderReports(); }
    } finally { busy = false; if (form) form.inert = false; showCorrectionPending(); }
  }
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
