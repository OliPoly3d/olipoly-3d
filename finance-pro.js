import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

const HUB_FINANCE_SUMMARY_KEY = 'olipoly_finance_dashboard_summary_v1';

const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;
const money = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(v));
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();
const currentMonth = () => new Date().toISOString().slice(0, 7);
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
const monthLabel = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const standardOhioDueDate = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 23).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const ids = [
  'startupTotal','loginSection','appSection','authMessage','loginBtn','signupBtn','logoutBtn','refreshBtn','exportBtn','taxExportBtn',
  'emailInput','passwordInput','showPasswordToggle','entryForm','formHeading','saveBtn','cancelEditBtn','formMessage','entryTypeHint',
  'entryType','entryDate','entryCategory','taxCategory','entryAmount','shippingCharged','taxIncluded','salesTaxRate','salesTaxCollected',
  'netRevenuePreview','shippingCost','materialCost','packagingCost','laborCost','otherDirectCost','entryTitle','entryNotes',
  'productRevenue','shippingRevenue','salesTaxCollectedTotal','totalCosts','netProfit','entryCount','monthlySummary','monthlyGrid',
  'tableWrap','typeFilter','monthFilter','searchFilter','clearFiltersBtn','taxYearFilter','runTaxReportBtn','taxReportWrap',
  'capexWrap','capexToggle','monthlyTaxMonth','monthlyTaxReportBtn','monthlyTaxOutput'
];
const els = Object.fromEntries(ids.map(id => [id, $(id)]));

const BASE_CATEGORIES = [
  'Sale','Material','Shipping','Packaging','Marketplace Fee','Machine Maintenance','Equipment',
  'Admin / Setup','Software / Subscriptions','Fees','Event Booth','Supplies'
];

let supabase;
let currentUser = null;
let entries = [];
let editingId = null;
let customCategoryValue = '';

const hide = el => el.classList.add('hidden');
const show = el => el.classList.remove('hidden');
const setPanel = (el, text, isError = false, palette = 'green') => {
  el.textContent = text;
  show(el);
  const themes = {
    green: ['rgba(79,224,163,.1)','rgba(79,224,163,.18)','#cffff0'],
    amber: ['rgba(255,195,100,.09)','rgba(255,195,100,.22)','#ffe2af'],
    red: ['rgba(255,110,145,.1)','rgba(255,110,145,.22)','#ffd7e1']
  };
  const [bg, border, color] = isError ? themes.red : themes[palette];
  Object.assign(el.style, { background: bg, borderColor: border, color });
};
const setMsg = (t, e = false) => setPanel(els.formMessage, t, e, 'green');
const setAuthMsg = (t, e = false) => setPanel(els.authMessage, t, e, 'amber');

const defaultTax = (type, cat) => type === 'income'
  ? (cat === 'Shipping' ? 'income_shipping' : 'income_sales')
  : ({
      Material:'materials',
      Packaging:'packaging',
      Shipping:'shipping_out',
      'Marketplace Fee':'marketplace_fees',
      'Machine Maintenance':'equipment_maintenance',
      Equipment:'equipment_maintenance',
      'Equipment (CapEx)':'equipment_maintenance',
      'Admin / Setup':'other',
      'Software / Subscriptions':'other',
      Fees:'marketplace_fees',
      'Event Booth':'event_fees',
      Supplies:'supplies'
    })[cat] || 'other';

const directCost = e => num(e.material_cost) + num(e.packaging_cost) + num(e.labor_cost) + num(e.other_direct_cost);
const visibleCost = e => (e.type === 'expense' ? num(e.amount) : 0) + num(e.shipping_cost) + directCost(e);

function computeTaxExclusive(total, rate) {
  if (!rate) return { tax: 0, net: total };
  const net = +(total / (1 + rate / 100)).toFixed(2);
  return { tax: +(total - net).toFixed(2), net };
}

function updateTaxPreview() {
  const total = num(els.entryAmount.value);
  const rate = num(els.salesTaxRate.value);
  if (els.entryType.value !== 'income') {
    els.salesTaxCollected.value = '';
    els.netRevenuePreview.value = '';
    return;
  }
  if (els.taxIncluded.value === 'yes') {
    const { tax, net } = computeTaxExclusive(total, rate);
    els.salesTaxCollected.value = tax ? tax.toFixed(2) : '';
    els.netRevenuePreview.value = net ? net.toFixed(2) : '';
  } else {
    els.salesTaxCollected.value = '';
    els.netRevenuePreview.value = total ? total.toFixed(2) : '';
  }
}

function updateEntryTypeHint() {
  els.capexWrap.classList.toggle('hidden', els.entryCategory.value !== 'Equipment');
  if (els.entryType.value === 'income') {
    setPanel(
      els.entryTypeHint,
      'Income entry: if Amount Includes Sales Tax = Yes, the tracker backs tax out automatically so only pre-tax revenue feeds revenue totals. Shipping charged stays separate. Use Expense for bulk materials, fees, maintenance, booth fees, and general supplies.',
      false,
      'amber'
    );
  } else {
    setPanel(
      els.entryTypeHint,
      'Expense entry: use this for bulk materials, marketplace fees, machine maintenance, event booths, supplies, startup/admin costs, software, and other overhead. Expense entries do not create revenue.',
      false,
      'amber'
    );
  }
  updateTaxPreview();
}

function setUI(on) {
  els.loginSection.classList.toggle('hidden', on);
  els.appSection.classList.toggle('hidden', !on);
  ['logoutBtn','refreshBtn','exportBtn','taxExportBtn'].forEach(k => els[k].classList.toggle('hidden', !on));
}

function resetForm() {
  editingId = null;
  customCategoryValue = '';
  els.entryForm.reset();
  els.entryType.value = 'income';
  els.entryDate.value = todayISO();
  els.entryCategory.value = 'Sale';
  els.taxCategory.value = 'auto';
  els.taxIncluded.value = 'no';
  els.capexToggle.checked = false;
  ['shippingCharged','salesTaxRate','salesTaxCollected','netRevenuePreview','shippingCost','materialCost','packagingCost','laborCost','otherDirectCost'].forEach(k => els[k].value = '');
  els.formHeading.textContent = 'Add Financial Entry';
  els.saveBtn.textContent = 'Save Entry';
  els.cancelEditBtn.classList.add('hidden');
  hide(els.formMessage);
  updateEntryTypeHint();
}

function filteredEntries() {
  const search = els.searchFilter.value.trim().toLowerCase();
  return [...entries]
    .filter(e => {
      if (els.typeFilter.value !== 'all' && e.type !== els.typeFilter.value) return false;
      if (els.monthFilter.value && !e.entry_date.startsWith(els.monthFilter.value)) return false;
      if (search && !`${e.title} ${e.category} ${e.notes || ''}`.toLowerCase().includes(search)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
}

function getFirstIncomeDate() {
  const incomeDates = entries.filter(x => x.type === 'income').map(x => x.entry_date).sort();
  return incomeDates.length ? incomeDates[0] : null;
}

function updateSummary(list) {
  const firstIncomeDate = getFirstIncomeDate();
  let startup = 0, pr = 0, sr = 0, st = 0, tc = 0;

  entries.forEach(e => {
    if (e.type === 'expense' && (!firstIncomeDate || e.entry_date < firstIncomeDate)) startup += visibleCost(e);
  });
  list.forEach(e => {
    if (e.type === 'income') {
      pr += num(e.amount);
      sr += num(e.shipping_charged);
      st += num(e.sales_tax_collected);
    }
    tc += visibleCost(e);
  });

  els.startupTotal.textContent = money(startup);
  els.productRevenue.textContent = money(pr);
  els.shippingRevenue.textContent = money(sr);
  els.salesTaxCollectedTotal.textContent = money(st);
  els.totalCosts.textContent = money(tc);
  els.netProfit.textContent = money(pr + sr - tc);
  els.entryCount.textContent = list.length;
}

function renderMonthly(list) {
  if (!list.length) {
    els.monthlySummary.textContent = 'No monthly data yet. Add entries to start building your summary.';
    els.monthlyGrid.innerHTML = '';
    return;
  }
  const m = {};
  list.forEach(e => {
    const k = e.entry_date.slice(0, 7);
    m[k] ??= { r: 0, t: 0, c: 0, o: 0 };
    if (e.type === 'income') {
      m[k].r += num(e.amount) + num(e.shipping_charged);
      m[k].t += num(e.sales_tax_collected);
      m[k].c += directCost(e);
      m[k].o += num(e.shipping_cost);
    } else {
      m[k].o += num(e.amount) + num(e.shipping_cost);
    }
  });
  els.monthlySummary.textContent = 'Latest visible months are summarized below.';
  els.monthlyGrid.innerHTML = Object.entries(m)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .map(([k, v]) => `<div class="month-card"><strong>${k}</strong><div>Revenue: ${money(v.r)}</div><div>Tax Collected: ${money(v.t)}</div><div>COGS: ${money(v.c)}</div><div>Other Costs: ${money(v.o)}</div><div>Profit: ${money(v.r - v.c - v.o)}</div></div>`)
    .join('');
}

function renderTable(list) {
  if (!list.length) {
    els.tableWrap.innerHTML = '<div class="empty-state">No entries match your current filters.</div>';
    return;
  }
  els.tableWrap.innerHTML = `<table><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Category</th><th>Revenue</th><th>Tax</th><th>Ship In</th><th>Ship Out</th><th>COGS</th><th>Actions</th></tr></thead><tbody>${list.map(e => `<tr><td>${e.entry_date}</td><td><span class="type-pill ${e.type === 'income' ? 'type-income' : 'type-expense'}">${e.type}</span></td><td><strong>${escapeHtml(e.title)}</strong>${e.notes ? `<div style="margin-top:6px;color:var(--muted);font-size:.86rem;line-height:1.5;">${escapeHtml(e.notes)}</div>` : ''}</td><td>${escapeHtml(e.category)}</td><td>${money(e.amount)}</td><td>${money(e.sales_tax_collected)}</td><td>${money(e.shipping_charged)}</td><td>${money(e.shipping_cost)}</td><td>${money(directCost(e))}</td><td><div class="mini-actions"><button class="btn-ghost" type="button" data-edit="${e.id}">Edit</button><button class="btn-danger" type="button" data-delete="${e.id}">Delete</button></div></td></tr>`).join('')}</tbody></table>`;
  els.tableWrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => startEdit(b.dataset.edit));
  els.tableWrap.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteEntry(b.dataset.delete));
}

function taxBuckets(year) {
  const out = {
    income_sales: 0,
    income_shipping: 0,
    sales_tax_collected: 0,
    materials: 0,
    packaging: 0,
    shipping_out: 0,
    marketplace_fees: 0,
    equipment_maintenance: 0,
    event_fees: 0,
    supplies: 0,
    other: 0
  };

  entries
    .filter(e => !year || e.entry_date.startsWith(String(year)))
    .forEach(e => {
      if (e.type === 'income') {
        out.income_sales += num(e.amount);
        out.income_shipping += num(e.shipping_charged);
        out.sales_tax_collected += num(e.sales_tax_collected);
      } else {
        const k = e.tax_category || defaultTax(e.type, e.category);
        out[k] = (out[k] || 0) + num(e.amount) + num(e.shipping_cost);
      }
    });

  return out;
}

function scheduleCMap(year) {
  const r = taxBuckets(year);

  const grossReceipts = r.income_sales + r.income_shipping;
  const line10 = r.marketplace_fees;
  const line13 = r.equipment_maintenance;
  const line20b = r.event_fees;
  const line21 = 0;
  const line22 = r.materials + r.packaging + r.supplies;
  const line27a = r.shipping_out + r.other;
  const totalExpenses = line10 + line13 + line20b + line21 + line22 + line27a;
  const netProfit = grossReceipts - totalExpenses;

  return {
    grossReceipts,
    salesTaxCollected: r.sales_tax_collected,
    line10,
    line13,
    line20b,
    line21,
    line22,
    line27a,
    otherBreakdown: {
      shipping_out: r.shipping_out,
      admin_software_other: r.other
    },
    totalExpenses,
    netProfit
  };
}

function monthlyOhioUST(month) {
  const base = {
    grossSales: 0,
    exemptSales: 0,
    clerksOfCourt: 0,
    taxLiability: 0
  };

  entries
    .filter(e => e.type === 'income' && e.entry_date.startsWith(month))
    .forEach(e => {
      base.grossSales += num(e.amount) + num(e.shipping_charged);
      base.taxLiability += num(e.sales_tax_collected);
    });

  const netTaxableSales = Math.max(0, +(base.grossSales - base.exemptSales).toFixed(2));
  const reportableTaxableSales = Math.max(0, +(netTaxableSales - base.clerksOfCourt).toFixed(2));
  const timelyDiscount = +(base.taxLiability * 0.0075).toFixed(2);
  const additionalCharge = 0;
  const interestOwed = 0;
  const netTaxDue = +(base.taxLiability - timelyDiscount + additionalCharge + interestOwed).toFixed(2);

  return {
    month,
    grossSales: +base.grossSales.toFixed(2),
    exemptSales: +base.exemptSales.toFixed(2),
    netTaxableSales,
    clerksOfCourt: +base.clerksOfCourt.toFixed(2),
    reportableTaxableSales,
    taxLiability: +base.taxLiability.toFixed(2),
    timelyDiscount,
    additionalCharge,
    interestOwed,
    netTaxDue
  };
}

function renderMonthlyTaxReport() {
  const month = els.monthlyTaxMonth.value;
  if (!month) {
    els.monthlyTaxOutput.textContent = 'Select a month first.';
    return;
  }

  const r = monthlyOhioUST(month);

  els.monthlyTaxOutput.innerHTML = `
    <div><strong>Filing month:</strong> ${escapeHtml(monthLabel(month))}</div>
    <div><strong>Standard Ohio due date:</strong> ${escapeHtml(standardOhioDueDate(month))}</div>
    <div class="filing-grid">
      <div class="filing-line"><strong>Line 1 – Gross sales</strong>${money(r.grossSales)}<span>Sales + shipping charged, excluding sales tax collected.</span></div>
      <div class="filing-line"><strong>Line 2 – Exempt sales</strong>${money(r.exemptSales)}<span>Defaulted to zero. Adjust manually if you had exempt or marketplace-facilitated sales.</span></div>
      <div class="filing-line"><strong>Line 3 – Net taxable sales</strong>${money(r.netTaxableSales)}<span>Line 1 minus Line 2.</span></div>
      <div class="filing-line"><strong>Line 4 – Clerks of courts</strong>${money(r.clerksOfCourt)}<span>Defaulted to zero for your business.</span></div>
      <div class="filing-line"><strong>Line 5 – Reportable taxable sales</strong>${money(r.reportableTaxableSales)}<span>Line 3 minus Line 4.</span></div>
      <div class="filing-line"><strong>Line 6 – Tax liability</strong>${money(r.taxLiability)}<span>Based on sales tax collected in the tracker.</span></div>
      <div class="filing-line"><strong>Line 7 – Discount</strong>${money(r.timelyDiscount)}<span>0.75% of Line 6 for an on-time filed and paid return.</span></div>
      <div class="filing-line"><strong>Line 8a – Additional charge</strong>${money(r.additionalCharge)}<span>Leave at zero for an on-time return.</span></div>
      <div class="filing-line"><strong>Line 8b – Interest owed</strong>${money(r.interestOwed)}<span>Leave at zero here; Ohio bills interest separately if needed.</span></div>
      <div class="filing-line"><strong>Line 9 – Net tax due</strong>${money(r.netTaxDue)}<span>Line 6 minus Line 7 plus Lines 8a and 8b.</span></div>
    </div>
    <div class="note">
      Copy these values into OH|TAX eServices for the selected month. This assumes standard taxable retail sales with no exempt sales, marketplace-facilitated deductions, or clerks-of-court transactions.
    </div>
  `;
}

function renderTaxReport() {
  const year = els.taxYearFilter.value || currentYear();
  els.taxYearFilter.value = year;

  const s = scheduleCMap(year);

  els.taxReportWrap.innerHTML = `
    <div><strong>Tax year:</strong> ${year}</div>
    <div style="margin-top:10px;line-height:1.7;">
      <div><strong>Schedule C Line 1 – Gross receipts:</strong> ${money(s.grossReceipts)}</div>
      <div><strong>Sales tax collected (tracked separately, not income):</strong> ${money(s.salesTaxCollected)}</div>

      <div style="margin-top:10px;"><strong>Schedule C expense lines</strong></div>
      <div>Line 10 – Commissions & fees: ${money(s.line10)}</div>
      <div>Line 13 – Depreciation / equipment bucket: ${money(s.line13)}</div>
      <div>Line 20b – Rent / booth fees: ${money(s.line20b)}</div>
      <div>Line 21 – Repairs & maintenance: ${money(s.line21)}</div>
      <div>Line 22 – Supplies: ${money(s.line22)}</div>
      <div>Line 27a – Other expenses: ${money(s.line27a)}</div>

      <div style="margin-left:14px;color:var(--muted);">• Shipping / postage: ${money(s.otherBreakdown.shipping_out)}</div>
      <div style="margin-left:14px;color:var(--muted);">• Admin / setup / software / other: ${money(s.otherBreakdown.admin_software_other)}</div>

      <div style="margin-top:8px;"><strong>Total Schedule C expenses:</strong> ${money(s.totalExpenses)}</div>
      <div><strong>Estimated net profit:</strong> ${money(s.netProfit)}</div>

      <div style="margin-top:10px;color:var(--muted);font-size:.9rem;line-height:1.55;">
        This report groups your tracker into Schedule C style lines. Per-sale material, packaging, labor, and other direct cost fields stay available for pricing/profit visibility only and are not deducted again here.
      </div>
    </div>
  `;
}

function getHubFinanceSummary() {
  const month = currentMonth();
  const today = todayISO();
  const monthEntries = entries.filter(e => (e.entry_date || '').startsWith(month));
  const todayEntries = monthEntries.filter(e => e.entry_date === today);

  const revenueOf = list => list.reduce((sum, e) => {
    if (e.type !== 'income') return sum;
    return sum + num(e.amount) + num(e.shipping_charged);
  }, 0);

  const expenseOf = list => list.reduce((sum, e) => sum + visibleCost(e), 0);

  const taxCollected = monthEntries.reduce((sum, e) => {
    if (e.type !== 'income') return sum;
    return sum + num(e.sales_tax_collected);
  }, 0);

  const latestRateEntry = [...monthEntries]
    .filter(e => e.type === 'income' && num(e.sales_tax_rate) > 0)
    .sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date))[0];

  const monthRevenue = revenueOf(monthEntries);
  const monthExpenses = expenseOf(monthEntries);

  return {
    enabled: true,
    todayRevenue: +revenueOf(todayEntries).toFixed(2),
    monthRevenue: +monthRevenue.toFixed(2),
    monthExpenses: +monthExpenses.toFixed(2),
    monthProfit: +(monthRevenue - monthExpenses).toFixed(2),
    taxCollected: +taxCollected.toFixed(2),
    taxRate: latestRateEntry ? num(latestRateEntry.sales_tax_rate) : 0,
    taxDueDate: standardOhioDueDate(month),
    savedAt: new Date().toLocaleString()
  };
}

function syncHubFinanceSummary() {
  try {
    localStorage.setItem(HUB_FINANCE_SUMMARY_KEY, JSON.stringify(getHubFinanceSummary()));
  } catch (err) {
    console.warn('Hub finance sync failed:', err);
  }
}

function renderAll() {
  const list = filteredEntries();
  updateSummary(list);
  renderMonthly(list);
  renderTable(list);
  renderTaxReport();
  if (els.monthlyTaxMonth.value) renderMonthlyTaxReport();
  syncHubFinanceSummary();
}

function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCSV() {
  if (!entries.length) return alert('There are no entries to export yet.');
  downloadCSV(`olipoly-financial-export-${todayISO()}.csv`, [
    ['Date','Type','Category','Tax Category','Revenue Amount','Sales Tax Collected','Shipping Charged','Tax Included','Sales Tax Rate','Shipping Cost','Material Cost','Packaging Cost','Labor Cost','Other Direct Cost','Title','Notes'],
    ...entries.map(e => [
      e.entry_date, e.type, e.category, e.tax_category || defaultTax(e.type, e.category),
      num(e.amount).toFixed(2), num(e.sales_tax_collected).toFixed(2), num(e.shipping_charged).toFixed(2), e.tax_included || 'no',
      num(e.sales_tax_rate).toFixed(2), num(e.shipping_cost).toFixed(2), num(e.material_cost).toFixed(2), num(e.packaging_cost).toFixed(2),
      num(e.labor_cost).toFixed(2), num(e.other_direct_cost).toFixed(2), e.title, e.notes || ''
    ])
  ]);
}

function exportTaxReport() {
  const year = els.taxYearFilter.value || currentYear();
  const s = scheduleCMap(year);

  downloadCSV(`olipoly-schedule-c-${year}.csv`, [
    ['Tax Year','Schedule C Line','Description','Amount','Notes'],
    [year,'Line 1','Gross receipts',num(s.grossReceipts).toFixed(2),'Sales + shipping income, excluding sales tax collected'],
    [year,'Not income','Sales tax collected',num(s.salesTaxCollected).toFixed(2),'Tracked separately from revenue'],
    [year,'Line 10','Commissions and fees',num(s.line10).toFixed(2),'Fees / marketplace fees'],
    [year,'Line 13','Depreciation / equipment bucket',num(s.line13).toFixed(2),'Equipment bucket from tracker'],
    [year,'Line 20b','Rent / booth fees',num(s.line20b).toFixed(2),'Event booth fees'],
    [year,'Line 21','Repairs and maintenance',num(s.line21).toFixed(2),'Currently not separately grouped'],
    [year,'Line 22','Supplies',num(s.line22).toFixed(2),'Materials + packaging + supplies'],
    [year,'Line 27a','Other expenses',num(s.line27a).toFixed(2),'Shipping + admin/setup + software/subscriptions + other'],
    [year,'Line 27a detail','Shipping / postage',num(s.otherBreakdown.shipping_out).toFixed(2),'Detail for Other expenses'],
    [year,'Line 27a detail','Admin / setup / software / other',num(s.otherBreakdown.admin_software_other).toFixed(2),'Detail for Other expenses'],
    [year,'Calculated','Total expenses',num(s.totalExpenses).toFixed(2),'Sum of grouped Schedule C expense lines'],
    [year,'Calculated','Estimated net profit',num(s.netProfit).toFixed(2),'Gross receipts minus grouped expenses']
  ]);
}

async function fetchEntries() {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase
    .from('financial_entries')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return setAuthMsg(`Could not load entries: ${error.message}`, true);
  hide(els.authMessage);
  entries = data || [];
  renderAll();
}

function startEdit(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  const isCapex = e.category === 'Equipment (CapEx)';
  customCategoryValue = BASE_CATEGORIES.includes(e.category) || isCapex ? '' : (e.category || '');
  els.formHeading.textContent = 'Edit Financial Entry';
  els.saveBtn.textContent = 'Update Entry';
  els.cancelEditBtn.classList.remove('hidden');
  [
    ['entryType','type'],['entryDate','entry_date'],['shippingCharged','shipping_charged'],['taxIncluded','tax_included'],['salesTaxRate','sales_tax_rate'],
    ['salesTaxCollected','sales_tax_collected'],['shippingCost','shipping_cost'],['materialCost','material_cost'],['packagingCost','packaging_cost'],
    ['laborCost','labor_cost'],['otherDirectCost','other_direct_cost'],['entryTitle','title'],['entryNotes','notes']
  ].forEach(([k, p]) => els[k].value = e[p] ?? '');
  els.entryAmount.value = (num(e.amount) + num(e.sales_tax_collected)) || '';
  els.netRevenuePreview.value = e.amount ?? '';
  els.entryCategory.value = isCapex ? 'Equipment' : (BASE_CATEGORIES.includes(e.category) ? e.category : 'Custom');
  els.capexToggle.checked = isCapex;
  els.taxCategory.value = e.tax_category || 'auto';
  updateEntryTypeHint();
  updateTaxPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  const { error } = await supabase.from('financial_entries').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) return setMsg(`Delete failed: ${error.message}`, true);
  setMsg('Entry deleted.');
  if (editingId === id) resetForm();
  await fetchEntries();
}

async function saveEntry(e) {
  e?.preventDefault?.();
  hide(els.formMessage);
  updateEntryTypeHint();

  if (!els.entryDate.value) return setMsg('Date is required.', true);
  if (!els.entryCategory.value) return setMsg('Category is required.', true);
  if (!els.entryTitle.value.trim()) return setMsg('Title is required.', true);
  if (els.entryAmount.value === '' || Number.isNaN(num(els.entryAmount.value))) return setMsg('Amount is required.', true);

  try {
    let category = els.entryCategory.value;
    const isCapexEquipment = category === 'Equipment' && els.capexToggle.checked;
    if (isCapexEquipment) category = 'Equipment (CapEx)';

    if (category === 'Custom') {
      if (!customCategoryValue) {
        const customInput = prompt('Enter custom category name:', customCategoryValue || '')?.trim();
        if (!customInput) return setMsg('Custom category is required.', true);
        customCategoryValue = customInput;
      }
      category = customCategoryValue;
    }

    const isIncome = els.entryType.value === 'income';
    const saleCosts = num(els.shippingCost.value) + num(els.materialCost.value) + num(els.packagingCost.value) + num(els.laborCost.value) + num(els.otherDirectCost.value);
    const suspiciousExpense = /material|filament|spool|fee|maintenance|booth|supplies/i.test(`${els.entryTitle.value} ${category}`);

    if (!isIncome && saleCosts > 0 && num(els.entryAmount.value) === 0) return setMsg('This looks like a sale cost breakdown. Switch Entry Type to Income or enter the expense amount in Base Amount.', true);
    if (!isIncome && isCapexEquipment && num(els.entryAmount.value) <= 0) return setMsg('Enter the full purchase amount for this Equipment asset.', true);
    if (isIncome && suspiciousExpense && num(els.shippingCharged.value) === 0 && saleCosts === 0) return setMsg('This may be a cost, not revenue. Bulk material purchases, fees, maintenance, booth costs, and supplies usually belong under Expense.', true);

    let amount = num(els.entryAmount.value);
    let salesTaxCollected = 0;
    if (isIncome && els.taxIncluded.value === 'yes') {
      if (num(els.salesTaxRate.value) <= 0) return setMsg('Enter a sales tax rate when tax-inclusive mode is on.', true);
      const x = computeTaxExclusive(amount, num(els.salesTaxRate.value));
      salesTaxCollected = x.tax;
      amount = x.net;
    }

    const firstIncomeDate = getFirstIncomeDate();
    let notes = els.entryNotes.value.trim();
    let taxCat = els.taxCategory.value === 'auto' ? defaultTax(els.entryType.value, category) : els.taxCategory.value;

    if (els.entryType.value === 'expense') {
      const entryDate = els.entryDate.value;
      if (!firstIncomeDate || entryDate < firstIncomeDate) {
        if (!notes.toLowerCase().includes('startup')) notes = `[Startup Expense] ${notes}`.trim();
        taxCat = 'other';
      }
    }

    const payload = {
      user_id: currentUser.id,
      type: els.entryType.value,
      entry_date: els.entryDate.value,
      category,
      tax_category: taxCat,
      title: els.entryTitle.value.trim(),
      notes,
      amount,
      shipping_charged: isIncome ? num(els.shippingCharged.value) : 0,
      tax_included: isIncome ? els.taxIncluded.value : 'no',
      sales_tax_rate: isIncome ? num(els.salesTaxRate.value) : 0,
      sales_tax_collected: isIncome ? salesTaxCollected : 0,
      shipping_cost: num(els.shippingCost.value),
      material_cost: num(els.materialCost.value),
      packaging_cost: num(els.packagingCost.value),
      labor_cost: num(els.laborCost.value),
      other_direct_cost: num(els.otherDirectCost.value),
      updated_at: new Date().toISOString()
    };

    const r = editingId
      ? await supabase.from('financial_entries').update(payload).eq('id', editingId).eq('user_id', currentUser.id)
      : await supabase.from('financial_entries').insert(payload);

    if (r.error) return setMsg(`Save failed: ${r.error.message}`, true);
    setMsg(editingId ? 'Entry updated.' : 'Entry saved.');
    resetForm();
    await fetchEntries();
  } catch (err) {
    setMsg(`Save failed: ${err?.message || err}`, true);
  }
}

async function login() {
  if (!els.emailInput.value || !els.passwordInput.value) return setAuthMsg('Enter your email and password.', true);
  setAuthMsg('Signing in...');
  const { error } = await supabase.auth.signInWithPassword({ email: els.emailInput.value.trim(), password: els.passwordInput.value });
  if (error) return setAuthMsg(`Login failed: ${error.message}`, true);
  hide(els.authMessage);
}

async function signup() {
  if (!els.emailInput.value || !els.passwordInput.value) return setAuthMsg('Enter an email and password to create your account.', true);
  setAuthMsg('Creating account...');
  const { error } = await supabase.auth.signUp({ email: els.emailInput.value.trim(), password: els.passwordInput.value });
  if (error) return setAuthMsg(`Signup failed: ${error.message}`, true);
  setAuthMsg('Account created. If email confirmation is enabled in Supabase, confirm your email before logging in.');
}

async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  setUI(false);
  entries = [];
  resetForm();
  renderAll();
  setAuthMsg('Logged out.');
}

async function init() {
  hide(els.authMessage);
  els.entryDate.value = todayISO();
  els.taxYearFilter.value = currentYear();
  els.monthlyTaxMonth.value = currentMonth();
  if (SUPABASE_URL.includes('PASTE_') || SUPABASE_ANON_KEY.includes('PASTE_')) {
    return setAuthMsg('Setup not finished yet. Add your Supabase URL and anon key in the code before using this page.', true);
  }
  updateEntryTypeHint();
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  setUI(!!currentUser);
  renderTaxReport();
  renderMonthlyTaxReport();
  if (currentUser) await fetchEntries();
  supabase.auth.onAuthStateChange(async (_, s) => {
    currentUser = s?.user || null;
    setUI(!!currentUser);
    if (currentUser) {
      hide(els.authMessage);
      await fetchEntries();
    } else {
      entries = [];
      renderAll();
    }
  });
}

[els.entryType, els.entryCategory, els.capexToggle, els.entryAmount, els.taxIncluded, els.salesTaxRate].forEach(el => {
  el.oninput = el.onchange = () => { updateEntryTypeHint(); updateTaxPreview(); };
});

els.passwordInput.classList.add('mask-password');
els.showPasswordToggle.onchange = () => els.passwordInput.classList.toggle('mask-password', !els.showPasswordToggle.checked);
els.loginBtn.onclick = login;
els.signupBtn.onclick = signup;
els.logoutBtn.onclick = logout;
els.refreshBtn.onclick = fetchEntries;
els.exportBtn.onclick = exportCSV;
els.taxExportBtn.onclick = exportTaxReport;
els.runTaxReportBtn.onclick = renderTaxReport;
els.monthlyTaxReportBtn.onclick = renderMonthlyTaxReport;
els.monthlyTaxMonth.oninput = renderMonthlyTaxReport;
els.saveBtn.onclick = () => els.entryForm.requestSubmit();
els.entryForm.onsubmit = saveEntry;
els.cancelEditBtn.onclick = resetForm;
els.clearFiltersBtn.onclick = () => {
  els.typeFilter.value = 'all';
  els.monthFilter.value = '';
  els.searchFilter.value = '';
  renderAll();
};
[els.typeFilter, els.monthFilter, els.searchFilter].forEach(el => el.oninput = renderAll);

init();
