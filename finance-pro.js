import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

const HUB_FINANCE_SUMMARY_KEY = 'olipoly_finance_dashboard_summary_v1';
const FINANCE_SETTINGS_KEY = 'olipoly_finance_settings_v1';

const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;
const money = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(v));
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();
const currentMonth = () => new Date().toISOString().slice(0, 7);
const dateOnly = d => new Date(d + 'T00:00:00');
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;' }[m]));
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
  'entryType','entryDate','entryCategory','taxCategory','entryAmount','shippingCharged','taxIncluded','taxExemptSale','destinationCounty','salesTaxRate','salesTaxCollected',
  'netRevenuePreview','shippingCost','materialCost','packagingCost','laborCost','otherDirectCost','entryTitle','entryNotes',
  'productRevenue','shippingRevenue','salesTaxCollectedTotal','totalCosts','netProfit','entryCount','monthlySummary','monthlyGrid',
  'tableWrap','typeFilter','monthFilter','searchFilter','clearFiltersBtn','taxYearFilter','runTaxReportBtn','taxReportWrap',
  'capexWrap','capexToggle','salesTaxFilingPeriod','monthlyTaxReportBtn','monthlyTaxOutput','salesTaxFilingExportBtn',
  'businessUsePercent','vendorName','paymentMethod','receiptLink','mileageWrap','milesDriven','mileageRate',
  'tripPurpose','tripFrom','tripTo','roundTripToggle',
  'defaultMileageRate','officeSqft','homeSqft','homeOfficePercent','saveSettingsBtn','settingsMessage'
];
const els = Object.fromEntries(ids.map(id => [id, $(id)]));

const BASE_CATEGORIES = [
  'Sale','Shipping','Sales Tax Collected','Material','Packaging','Marketplace Fee','Machine Maintenance',
  'Printer Parts / Repairs','Equipment','Admin / Setup','Software / Subscriptions',
  'Advertising / Marketing','Domain / Website','Office Supplies','Home Office',
  'Utilities','Internet / Phone','Vehicle / Delivery Mileage','Fees','Event Booth',
  'Supplies','R&D / Prototyping'
];

let supabase;
let currentUser = null;
let entries = [];
let editingId = null;
let customCategoryValue = '';
let authBusy = false;

// Finance Pro must only create one Supabase GoTrue client per page load.
// Recreating the client from auth-change events causes duplicate GoTrue clients,
// repeated /auth/v1/user calls, repeated financial_entries reads, and UI churn.
let financeClientCreated = false;
let entriesFetchPromise = null;
let authStateListenerInstalled = false;
let sharedAuthListenerInstalled = false;
let sharedAuthRefreshPromise = null;
let ignoreNextSharedAuthEventUntil = 0;
let settings = {
  defaultMileageRate: 0,
  officeSqft: 0,
  homeSqft: 0
};

const hide = el => el?.classList.add('hidden');
const show = el => el?.classList.remove('hidden');

const setPanel = (el, text, isError = false, palette = 'green') => {
  if (!el) return;
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
const setSettingsMsg = (t, e = false) => setPanel(els.settingsMessage, t, e, e ? 'red' : 'green');

const defaultTax = (type, cat) => type === 'income'
  ? (cat === 'Shipping' ? 'income_shipping' : 'income_sales')
  : ({
      Material:'materials',
      Packaging:'packaging',
      Shipping:'shipping_out',
      'Marketplace Fee':'marketplace_fees',
      'Machine Maintenance':'equipment_maintenance',
      'Printer Parts / Repairs':'equipment_maintenance',
      Equipment:'equipment_maintenance',
      'Equipment (CapEx)':'equipment_maintenance',
      'Admin / Setup':'other',
      'Software / Subscriptions':'other',
      'Advertising / Marketing':'other',
      'Domain / Website':'other',
      'Office Supplies':'supplies',
      'Home Office':'other',
      Utilities:'other',
      'Internet / Phone':'other',
      'Vehicle / Delivery Mileage':'other',
      Fees:'marketplace_fees',
      'Event Booth':'event_fees',
      Supplies:'supplies',
      'R&D / Prototyping':'other'
    })[cat] || 'other';

const resolvedTaxCategory = e => {
  const category = String(e?.category || '').trim();

  // Finance Pro tax reporting rule:
  // Category is authoritative for known/common categories.
  // Tax Category is only an override for unusual/manual cases.
  // This protects older records that were accidentally saved with tax_category = "other"
  // even though their visible category was Event Booth, Material, Shipping, etc.
  const categoryMap = {
    'Sale': 'income_sales',
    'Shipping': e?.type === 'income' ? 'income_shipping' : 'shipping_out',
    'Sales Tax Collected': 'income_sales',
    'Material': 'materials',
    'Packaging': 'packaging',
    'Marketplace Fee': 'marketplace_fees',
    'Fees': 'marketplace_fees',
    'Event Booth': 'event_fees',
    'Supplies': 'supplies',
    'Office Supplies': 'supplies',
    'Machine Maintenance': 'equipment_maintenance',
    'Printer Parts / Repairs': 'equipment_maintenance',
    'Equipment': 'equipment_maintenance',
    'Equipment (CapEx)': 'equipment_maintenance',
    'Admin / Setup': 'other',
    'Software / Subscriptions': 'other',
    'Advertising / Marketing': 'other',
    'Domain / Website': 'other',
    'Home Office': 'other',
    'Utilities': 'other',
    'Internet / Phone': 'other',
    'Vehicle / Delivery Mileage': 'other',
    'R&D / Prototyping': 'other'
  };

  if (category && categoryMap[category]) return categoryMap[category];

  const selected = String(e?.tax_category || '').trim();
  if (!selected || selected === 'auto') return defaultTax(e?.type, e?.category);
  return selected;
};
const expenseBucketAmount = e => num(e.amount) + num(e.shipping_cost);

const directCost = e => num(e.material_cost) + num(e.packaging_cost) + num(e.labor_cost) + num(e.other_direct_cost);
const visibleCost = e => (e.type === 'expense' ? num(e.amount) : 0) + num(e.shipping_cost) + directCost(e);
const isMileageCategory = category => category === 'Vehicle / Delivery Mileage';
const incomeSaleAmount = e => {
  if (!e || e.type !== 'income') return 0;
  const amount = num(e.amount);
  // Legacy tax-inclusive entries saved the sale as net revenue and the collected tax separately.
  // For your current OliPoly workflow, the Ohio filing/tables need the customer-facing taxable sale amount.
  return e.tax_included === 'yes' ? +(amount + num(e.sales_tax_collected)).toFixed(2) : amount;
};
const computedSalesTax = e => {
  if (!e || e.type !== 'income' || e.tax_exempt_sale) return 0;
  const taxable = incomeSaleAmount(e);
  const rate = num(e.sales_tax_rate);
  if (taxable > 0 && rate > 0) return +((taxable * rate) / 100).toFixed(2);
  return num(e.sales_tax_collected);
};

function computeTaxExclusive(total, rate) {
  if (!rate) return { tax: 0, net: total };
  const net = +(total / (1 + rate / 100)).toFixed(2);
  return { tax: +(total - net).toFixed(2), net };
}

function normalizeCounty(value) {
  return String(value || '').trim();
}

function filingPeriodOptions(baseYear = currentYear()) {
  return [baseYear - 1, baseYear, baseYear + 1].flatMap(year => ([
    { value: `${year}-H1`, label: `January–June ${year}`, start: `${year}-01-01`, end: `${year}-06-30`, due: `${year}-07-23` },
    { value: `${year}-H2`, label: `July–December ${year}`, start: `${year}-07-01`, end: `${year}-12-31`, due: `${year + 1}-01-23` }
  ]));
}

function currentFilingPeriodValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m <= 6 ? `${y}-H1` : `${y}-H2`;
}

function getSelectedFilingPeriod() {
  const opts = filingPeriodOptions();
  return opts.find(o => o.value === els.salesTaxFilingPeriod?.value) || opts.find(o => o.value === currentFilingPeriodValue()) || opts[0];
}

function populateFilingPeriodSelect() {
  if (!els.salesTaxFilingPeriod) return;
  const selected = els.salesTaxFilingPeriod.value || currentFilingPeriodValue();
  els.salesTaxFilingPeriod.innerHTML = filingPeriodOptions()
    .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join('');
  els.salesTaxFilingPeriod.value = selected;
}

function formatRate(rate) {
  return num(rate) ? `${num(rate).toFixed(2)}%` : '—';
}

function calculateHomeOfficePercent() {
  const office = num(els.officeSqft?.value);
  const home = num(els.homeSqft?.value);
  const pct = office > 0 && home > 0 ? +((office / home) * 100).toFixed(2) : 0;
  if (els.homeOfficePercent) els.homeOfficePercent.value = pct ? pct.toFixed(2) : '';
  return pct;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(FINANCE_SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    settings = {
      defaultMileageRate: num(parsed.defaultMileageRate),
      officeSqft: num(parsed.officeSqft),
      homeSqft: num(parsed.homeSqft)
    };
  } catch (err) {
    console.warn('Could not load finance settings:', err);
  }
}

function applySettingsToUI() {
  if (els.defaultMileageRate) els.defaultMileageRate.value = settings.defaultMileageRate ? settings.defaultMileageRate.toFixed(4) : '';
  if (els.officeSqft) els.officeSqft.value = settings.officeSqft || '';
  if (els.homeSqft) els.homeSqft.value = settings.homeSqft || '';
  calculateHomeOfficePercent();
}

function saveSettings() {
  settings = {
    defaultMileageRate: num(els.defaultMileageRate?.value),
    officeSqft: num(els.officeSqft?.value),
    homeSqft: num(els.homeSqft?.value)
  };
  try {
    localStorage.setItem(FINANCE_SETTINGS_KEY, JSON.stringify(settings));
    calculateHomeOfficePercent();
    setSettingsMsg('Defaults saved.');
    updateEntryTypeHint();
  } catch (err) {
    setSettingsMsg(`Could not save defaults: ${err?.message || err}`, true);
  }
}

function updateTaxPreview() {
  const saleAmount = num(els.entryAmount.value);
  const rate = num(els.salesTaxRate.value);
  if (els.entryType.value !== 'income') {
    els.salesTaxCollected.value = '';
    els.netRevenuePreview.value = '';
    if (els.taxIncluded) els.taxIncluded.value = 'no';
    return;
  }
  if (els.taxIncluded) els.taxIncluded.value = 'no';
  if (els.taxExemptSale?.value === 'yes') {
    els.salesTaxCollected.value = '';
    els.netRevenuePreview.value = saleAmount ? saleAmount.toFixed(2) : '';
    return;
  }
  const tax = saleAmount && rate ? +((saleAmount * rate) / 100).toFixed(2) : 0;
  els.salesTaxCollected.value = tax ? tax.toFixed(2) : '';
  els.netRevenuePreview.value = saleAmount ? saleAmount.toFixed(2) : '';
}


function updateExpenseHelpers() {
  const isIncome = els.entryType.value === 'income';
  const isMileage = !isIncome && isMileageCategory(els.entryCategory.value);

  els.mileageWrap.classList.toggle('hidden', !isMileage);

  if (isMileage) {
    els.businessUsePercent.value = '100';
    if (!els.mileageRate.value && num(settings.defaultMileageRate) > 0) {
      els.mileageRate.value = settings.defaultMileageRate.toFixed(4);
    }
    if (!els.tripFrom.value) els.tripFrom.value = 'Home workshop / office';
    const miles = num(els.milesDriven.value);
    const rate = num(els.mileageRate.value);
    els.entryAmount.value = miles && rate ? (miles * rate).toFixed(2) : '';
    els.entryAmount.readOnly = true;
    els.entryAmount.placeholder = 'Auto-calculated from miles × rate';
  } else {
    els.entryAmount.readOnly = false;
    els.entryAmount.placeholder = '0.00';
  }

  if (!isIncome && els.entryCategory.value === 'Home Office' && num(settings.officeSqft) > 0 && num(settings.homeSqft) > 0) {
    const pct = calculateHomeOfficePercent();
    if (!els.businessUsePercent.value || num(els.businessUsePercent.value) === 100) {
      els.businessUsePercent.value = pct ? pct.toFixed(2) : '100';
    }
  }
}

function updateEntryTypeHint() {
  els.capexWrap.classList.toggle('hidden', els.entryCategory.value !== 'Equipment');
  updateExpenseHelpers();

  if (els.entryType.value === 'income') {
    setPanel(
      els.entryTypeHint,
      'Income entry: enter the taxable sale amount before tax. Sales tax collected is calculated as sale amount × tax rate. Tax-exempt sales keep tax at $0.',
      false,
      'amber'
    );
  } else if (isMileageCategory(els.entryCategory.value)) {
    setPanel(
      els.entryTypeHint,
      'Mileage expense: enter miles, rate, trip purpose, and route details. Amount Entered becomes the deductible mileage amount automatically.',
      false,
      'amber'
    );
  } else if (els.entryCategory.value === 'Home Office') {
    setPanel(
      els.entryTypeHint,
      'Home office helper: save your workspace and home square footage above, then use this category with the suggested business-use percentage as a planning aid for shared home costs.',
      false,
      'amber'
    );
  } else {
    setPanel(
      els.entryTypeHint,
      'Expense entry: use Business Use % for shared expenses like internet, phone, utilities, or home-office style costs. The tracker will save only the deductible portion in Amount.',
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
  delete els.entryForm.dataset.saving;

  els.entryType.value = 'income';
  els.entryDate.value = todayISO();
  els.entryCategory.value = 'Sale';
  els.taxCategory.value = 'auto';
  els.taxIncluded.value = 'no';
  if (els.taxExemptSale) els.taxExemptSale.value = 'no';
  if (els.destinationCounty) els.destinationCounty.value = '';
  els.capexToggle.checked = false;
  els.businessUsePercent.value = '100';
  els.mileageRate.value = settings.defaultMileageRate ? settings.defaultMileageRate.toFixed(4) : '';

  [
    'shippingCharged','salesTaxRate','salesTaxCollected','netRevenuePreview',
    'shippingCost','materialCost','packagingCost','laborCost','otherDirectCost',
    'milesDriven','vendorName','paymentMethod','receiptLink','tripPurpose','tripFrom','tripTo'
  ].forEach(k => { if (els[k]) els[k].value = ''; });

  if (els.roundTripToggle) els.roundTripToggle.checked = false;

  els.formHeading.textContent = 'Add Financial Entry';
  els.saveBtn.textContent = 'Save Entry';
  els.saveBtn.disabled = false;
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
      if (search && !`${e.title} ${e.category} ${e.notes || ''} ${e.vendor_name || ''} ${e.trip_purpose || ''} ${e.trip_to || ''}`.toLowerCase().includes(search)) return false;
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
      pr += incomeSaleAmount(e);
      sr += num(e.shipping_charged);
      st += computedSalesTax(e);
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

  const months = {};
  list.forEach(e => {
    const k = e.entry_date.slice(0, 7);
    months[k] ??= { r: 0, t: 0, c: 0, o: 0 };
    if (e.type === 'income') {
      months[k].r += incomeSaleAmount(e) + num(e.shipping_charged);
      months[k].t += computedSalesTax(e);
      months[k].c += directCost(e);
      months[k].o += num(e.shipping_cost);
    } else {
      months[k].o += num(e.amount) + num(e.shipping_cost);
    }
  });

  els.monthlySummary.textContent = 'Latest visible months are summarized below.';
  els.monthlyGrid.innerHTML = Object.entries(months)
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

  els.tableWrap.innerHTML = `<table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Title</th>
        <th>Category</th>
        <th>Revenue / Expense</th>
        <th>County</th>
        <th>Tax Rate</th>
        <th>Tax</th>
        <th>Ship In</th>
        <th>Ship Out</th>
        <th>COGS</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${list.map(e => `
        <tr>
          <td>${e.entry_date}</td>
          <td><span class="type-pill ${e.type === 'income' ? 'type-income' : 'type-expense'}">${e.type}</span></td>
          <td>
            <strong>${escapeHtml(e.title)}</strong>
            ${e.vendor_name ? `<div style="margin-top:6px;color:var(--muted);font-size:.86rem;">Vendor: ${escapeHtml(e.vendor_name)}</div>` : ''}
            ${num(e.business_use_percent) && num(e.business_use_percent) !== 100 ? `<div style="margin-top:4px;color:var(--muted);font-size:.86rem;">Business use: ${num(e.business_use_percent).toFixed(2)}%</div>` : ''}
            ${num(e.miles_driven) ? `<div style="margin-top:4px;color:var(--muted);font-size:.86rem;">Mileage: ${num(e.miles_driven).toFixed(1)} mi @ ${num(e.mileage_rate).toFixed(4)}</div>` : ''}
            ${e.trip_purpose ? `<div style="margin-top:4px;color:var(--muted);font-size:.86rem;">Trip: ${escapeHtml(e.trip_purpose)}</div>` : ''}
            ${(e.trip_from || e.trip_to) ? `<div style="margin-top:4px;color:var(--muted);font-size:.86rem;">Route: ${escapeHtml(e.trip_from || '')}${e.trip_from && e.trip_to ? ' → ' : ''}${escapeHtml(e.trip_to || '')}${e.round_trip ? ' (round trip)' : ''}</div>` : ''}
            ${e.notes ? `<div style="margin-top:6px;color:var(--muted);font-size:.86rem;line-height:1.5;">${escapeHtml(e.notes)}</div>` : ''}
            ${e.receipt_link ? `<div style="margin-top:6px;font-size:.86rem;"><a href="${escapeHtml(e.receipt_link)}" target="_blank" rel="noopener noreferrer">Receipt</a></div>` : ''}
          </td>
          <td>${escapeHtml(e.category)}</td>
          <td>${money(e.type === 'income' ? incomeSaleAmount(e) : e.amount)}</td>
          <td>${e.type === 'income' ? escapeHtml(e.destination_county || '—') : '—'}</td>
          <td>${e.type === 'income' ? formatRate(e.sales_tax_rate) : '—'}</td>
          <td>${money(e.type === 'income' ? computedSalesTax(e) : e.sales_tax_collected)}</td>
          <td>${money(e.shipping_charged)}</td>
          <td>${money(e.shipping_cost)}</td>
          <td>${money(directCost(e))}</td>
          <td>
            <div class="mini-actions">
              <button class="btn-ghost" type="button" data-edit="${e.id}">Edit</button>
              <button class="btn-danger" type="button" data-delete="${e.id}">Delete</button>
            </div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;

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
        out.income_sales += incomeSaleAmount(e);
        out.income_shipping += num(e.shipping_charged);
        out.sales_tax_collected += computedSalesTax(e);
      } else {
        const k = resolvedTaxCategory(e);
        out[k] = (out[k] || 0) + expenseBucketAmount(e);
      }
    });

  return out;
}

function scheduleCBucketDetails(year) {
  const buckets = {};
  entries
    .filter(e => e.type === 'expense' && (!year || e.entry_date.startsWith(String(year))))
    .forEach(e => {
      const key = resolvedTaxCategory(e);
      buckets[key] ||= { total: 0, count: 0, categories: new Map() };
      buckets[key].total += expenseBucketAmount(e);
      buckets[key].count += 1;
      const cat = e.category || 'Uncategorized';
      buckets[key].categories.set(cat, (buckets[key].categories.get(cat) || 0) + expenseBucketAmount(e));
    });
  return buckets;
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

function salesTaxFilingSummary(period) {
  const start = dateOnly(period.start);
  const end = dateOnly(period.end);
  const included = entries.filter(e => {
    if (e.type !== 'income') return false;
    const d = dateOnly(e.entry_date || '1900-01-01');
    return d >= start && d <= end;
  });

  const summary = {
    period,
    entries: included,
    grossSales: 0,
    taxableSales: 0,
    exemptSales: 0,
    taxCollected: 0,
    countyRows: [],
    monthlyRows: [],
    warnings: []
  };

  const byCounty = {};
  const byMonth = {};

  included.forEach(e => {
    const county = normalizeCounty(e.destination_county);
    const gross = incomeSaleAmount(e) + num(e.shipping_charged);
    const tax = computedSalesTax(e);
    const rate = num(e.sales_tax_rate);
    const exempt = !!e.tax_exempt_sale;
    const taxable = exempt ? 0 : gross;

    summary.grossSales += gross;
    summary.exemptSales += exempt ? gross : 0;
    summary.taxableSales += taxable;
    summary.taxCollected += tax;

    if (!county) summary.warnings.push(`${e.entry_date || 'Undated'} ${e.title || 'income entry'} is missing destination county.`);
    if (!exempt && rate <= 0) summary.warnings.push(`${e.entry_date || 'Undated'} ${e.title || 'income entry'} is missing sales tax rate.`);

    const countyKey = county || 'Missing County';
    byCounty[countyKey] ||= { county: countyKey, taxableSales: 0, grossSales: 0, taxCollected: 0, rates: new Set(), count: 0 };
    byCounty[countyKey].grossSales += gross;
    byCounty[countyKey].taxableSales += taxable;
    byCounty[countyKey].taxCollected += tax;
    byCounty[countyKey].count += 1;
    if (rate > 0) byCounty[countyKey].rates.add(rate.toFixed(2));

    const month = (e.entry_date || '').slice(0, 7) || 'Unknown';
    byMonth[month] ||= { month, grossSales: 0, taxableSales: 0, taxCollected: 0, count: 0 };
    byMonth[month].grossSales += gross;
    byMonth[month].taxableSales += taxable;
    byMonth[month].taxCollected += tax;
    byMonth[month].count += 1;
  });

  summary.countyRows = Object.values(byCounty)
    .map(row => ({
      ...row,
      grossSales: +row.grossSales.toFixed(2),
      taxableSales: +row.taxableSales.toFixed(2),
      taxCollected: +row.taxCollected.toFixed(2),
      rates: [...row.rates].sort((a, b) => num(a) - num(b))
    }))
    .sort((a, b) => a.county.localeCompare(b.county));

  summary.monthlyRows = Object.values(byMonth)
    .map(row => ({
      ...row,
      grossSales: +row.grossSales.toFixed(2),
      taxableSales: +row.taxableSales.toFixed(2),
      taxCollected: +row.taxCollected.toFixed(2)
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  summary.countyRows.forEach(row => {
    if (row.rates.length > 1) summary.warnings.push(`${row.county} County has multiple tax rates: ${row.rates.map(r => `${r}%`).join(', ')}.`);
  });

  summary.grossSales = +summary.grossSales.toFixed(2);
  summary.exemptSales = +summary.exemptSales.toFixed(2);
  summary.taxableSales = +summary.taxableSales.toFixed(2);
  summary.taxCollected = +summary.taxCollected.toFixed(2);

  return summary;
}

function renderMonthlyTaxReport() {
  const period = getSelectedFilingPeriod();
  if (!period) {
    els.monthlyTaxOutput.textContent = 'Select a filing period first.';
    return;
  }

  const r = salesTaxFilingSummary(period);
  const countyRows = r.countyRows.length
    ? r.countyRows.map(row => `
        <tr>
          <td>${escapeHtml(row.county)}</td>
          <td>${row.count}</td>
          <td>${money(row.taxableSales)}</td>
          <td class="rate-stack">${row.rates.length ? row.rates.map(rate => `${escapeHtml(rate)}%`).join('<br>') : '—'}${row.rates.length > 1 ? '<small>review</small>' : ''}</td>
          <td>${money(row.taxCollected)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5">No income entries in this filing period.</td></tr>';

  const monthRows = r.monthlyRows.length
    ? r.monthlyRows.map(row => `
        <tr>
          <td>${escapeHtml(monthLabel(row.month))}</td>
          <td>${row.count}</td>
          <td>${money(row.grossSales)}</td>
          <td>${money(row.taxableSales)}</td>
          <td>${money(row.taxCollected)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5">No monthly data in this filing period.</td></tr>';

  const warnings = r.warnings.length
    ? `<div class="filing-warning"><strong>Review before filing:</strong><ul style="margin:8px 0 0 18px;padding:0;">${r.warnings.slice(0, 8).map(w => `<li>${escapeHtml(w)}</li>`).join('')}${r.warnings.length > 8 ? `<li>${r.warnings.length - 8} more warning(s).</li>` : ''}</ul></div>`
    : '<div class="filing-ok"><strong>Filing readiness check passed:</strong> all income entries in this period have county and non-exempt sales have a tax rate.</div>';

  els.monthlyTaxOutput.innerHTML = `
    <div class="filing-kicker">Ohio semiannual sales tax filing helper</div>
    <div><strong>Filing period:</strong> ${escapeHtml(period.label)} (${escapeHtml(period.start)} through ${escapeHtml(period.end)})</div>
    <div><strong>Standard Ohio due date:</strong> ${escapeHtml(new Date(period.due + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</div>
    <div class="filing-grid">
      <div class="filing-line"><strong>Gross sales</strong>${money(r.grossSales)}<span>Income sales + shipping charged, excluding sales tax collected.</span></div>
      <div class="filing-line"><strong>Taxable sales</strong>${money(r.taxableSales)}<span>Gross sales minus entries marked tax exempt.</span></div>
      <div class="filing-line"><strong>Exempt sales</strong>${money(r.exemptSales)}<span>Entries marked Tax Exempt Sale.</span></div>
      <div class="filing-line"><strong>Sales tax collected</strong>${money(r.taxCollected)}<span>Tracked separately from revenue.</span></div>
    </div>
    ${warnings}
    <h4 style="margin:18px 0 6px;">County Summary</h4>
    <div class="filing-table-wrap"><table class="filing-table">
      <thead><tr><th>County</th><th>Sales</th><th>Taxable Sales</th><th>Tax Rate(s)</th><th>Tax Collected</th></tr></thead>
      <tbody>${countyRows}</tbody>
    </table></div>
    <h4 style="margin:18px 0 6px;">Monthly Breakdown</h4>
    <div class="filing-table-wrap"><table class="filing-table">
      <thead><tr><th>Month</th><th>Sales</th><th>Gross Sales</th><th>Taxable Sales</th><th>Tax Collected</th></tr></thead>
      <tbody>${monthRows}</tbody>
    </table></div>
    <div class="note">Use the county summary for the county-by-county section in OH|TAX. The monthly breakdown is for your bookkeeping/reconciliation.</div>
  `;
}

function renderScheduleCBucketCheck(year) {
  const labels = {
    marketplace_fees: 'Line 10 – Commissions & fees',
    equipment_maintenance: 'Line 13 – Equipment / maintenance bucket',
    event_fees: 'Line 20b – Rent / booth fees',
    supplies: 'Line 22 – Supplies',
    materials: 'Line 22 detail – Materials',
    packaging: 'Line 22 detail – Packaging',
    shipping_out: 'Line 27a detail – Shipping / postage',
    other: 'Line 27a detail – Other'
  };
  const buckets = scheduleCBucketDetails(year);
  const rows = Object.entries(buckets)
    .sort((a, b) => (labels[a[0]] || a[0]).localeCompare(labels[b[0]] || b[0]))
    .map(([key, row]) => {
      const cats = [...row.categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, total]) => `${escapeHtml(cat)}: ${money(total)}`)
        .join('<br>');
      return `<tr><td>${escapeHtml(labels[key] || key)}</td><td>${row.count}</td><td>${money(row.total)}</td><td>${cats || '—'}</td></tr>`;
    })
    .join('');

  if (!rows) return '<div class="empty-state" style="margin-top:8px;">No expense entries found for this tax year.</div>';
  return `<div class="filing-table-wrap"><table class="filing-table"><thead><tr><th>Mapped Bucket</th><th>Entries</th><th>Total</th><th>Categories Included</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
      <div>Line 13 – Equipment / machine purchases bucket: ${money(s.line13)}</div>
      <div>Line 20b – Rent / booth fees: ${money(s.line20b)}</div>
      <div>Line 21 – Repairs & maintenance: ${money(s.line21)}</div>
      <div>Line 22 – Supplies: ${money(s.line22)}</div>
      <div>Line 27a – Other expenses: ${money(s.line27a)}</div>

      <div style="margin-left:14px;color:var(--muted);">• Shipping / postage: ${money(s.otherBreakdown.shipping_out)}</div>
      <div style="margin-left:14px;color:var(--muted);">• Admin / setup / software / other: ${money(s.otherBreakdown.admin_software_other)}</div>

      <div style="margin-top:8px;"><strong>Total Schedule C expenses:</strong> ${money(s.totalExpenses)}</div>
      <div><strong>Estimated net profit:</strong> ${money(s.netProfit)}</div>

      <div style="margin-top:14px;"><strong>Category mapping check</strong></div>
      ${renderScheduleCBucketCheck(year)}

      <div style="margin-top:10px;color:var(--muted);font-size:.9rem;line-height:1.55;">
        Per-sale material, packaging, labor, and other direct cost fields stay available for pricing and profit visibility only and are not deducted again here. This tracker groups equipment-related purchases into an equipment bucket for visibility, but your actual tax treatment can still follow your year-one expensing approach.
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
    return sum + incomeSaleAmount(e) + num(e.shipping_charged);
  }, 0);

  const expenseOf = list => list.reduce((sum, e) => sum + visibleCost(e), 0);

  const taxCollected = monthEntries.reduce((sum, e) => {
    if (e.type !== 'income') return sum;
    return sum + computedSalesTax(e);
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
  if (els.salesTaxFilingPeriod?.value) renderMonthlyTaxReport();
  syncHubFinanceSummary();
}

function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join(String.fromCharCode(10));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCSV() {
  if (!entries.length) return alert('There are no entries to export yet.');

  downloadCSV(`olipoly-financial-export-${todayISO()}.csv`, [
    [
      'Date','Type','Category','Tax Category','Deductible / Revenue Amount','Original Amount',
      'Destination County','Sales Tax Collected','Shipping Charged','Tax Included','Sales Tax Rate','Shipping Cost',
      'Material Cost','Packaging Cost','Labor Cost','Other Direct Cost','Vendor','Payment Method',
      'Receipt Link','Business Use %','Miles Driven','Mileage Rate','Trip Purpose','Trip From','Trip To','Round Trip','Title','Notes'
    ],
    ...entries.map(e => [
      e.entry_date,
      e.type,
      e.category,
      resolvedTaxCategory(e),
      num(e.type === 'income' ? incomeSaleAmount(e) : e.amount).toFixed(2),
      num(e.original_amount || e.amount).toFixed(2),
      e.destination_county || '',
      num(e.type === 'income' ? computedSalesTax(e) : e.sales_tax_collected).toFixed(2),
      num(e.shipping_charged).toFixed(2),
      e.tax_included || 'no',
      num(e.sales_tax_rate).toFixed(2),
      num(e.shipping_cost).toFixed(2),
      num(e.material_cost).toFixed(2),
      num(e.packaging_cost).toFixed(2),
      num(e.labor_cost).toFixed(2),
      num(e.other_direct_cost).toFixed(2),
      e.vendor_name || '',
      e.payment_method || '',
      e.receipt_link || '',
      num(e.business_use_percent || 100).toFixed(2),
      num(e.miles_driven).toFixed(2),
      num(e.mileage_rate).toFixed(4),
      e.trip_purpose || '',
      e.trip_from || '',
      e.trip_to || '',
      e.round_trip ? 'yes' : 'no',
      e.title,
      e.notes || ''
    ])
  ]);
}


function exportSalesTaxFilingCSV() {
  const period = getSelectedFilingPeriod();
  if (!period) return alert('Select a filing period first.');
  const r = salesTaxFilingSummary(period);
  const rows = [
    ['Section','Filing Period','Start Date','End Date','Due Date','County','Sales Count','Gross Sales','Taxable Sales','Exempt Sales','Tax Rate(s)','Tax Collected'],
    ['Totals',period.label,period.start,period.end,period.due,'',r.entries.length,r.grossSales.toFixed(2),r.taxableSales.toFixed(2),r.exemptSales.toFixed(2),'',r.taxCollected.toFixed(2)],
    ...r.countyRows.map(row => ['County Summary',period.label,period.start,period.end,period.due,row.county,row.count,row.grossSales.toFixed(2),row.taxableSales.toFixed(2),'',row.rates.map(rate => `${rate}%`).join(' | '),row.taxCollected.toFixed(2)]),
    ...r.monthlyRows.map(row => ['Monthly Breakdown',period.label,period.start,period.end,period.due,row.month,row.count,row.grossSales.toFixed(2),row.taxableSales.toFixed(2),'','',row.taxCollected.toFixed(2)])
  ];
  downloadCSV(`olipoly-ohio-sales-tax-${period.value}.csv`, rows);
}

function exportTaxReport() {
  const year = els.taxYearFilter.value || currentYear();
  const s = scheduleCMap(year);

  downloadCSV(`olipoly-schedule-c-${year}.csv`, [
    ['Tax Year','Schedule C Line','Description','Amount','Notes'],
    [year,'Line 1','Gross receipts',num(s.grossReceipts).toFixed(2),'Sales + shipping income, excluding sales tax collected'],
    [year,'Not income','Sales tax collected',num(s.salesTaxCollected).toFixed(2),'Tracked separately from revenue'],
    [year,'Line 10','Commissions and fees',num(s.line10).toFixed(2),'Fees / marketplace fees'],
    [year,'Line 13','Equipment / machine purchases bucket',num(s.line13).toFixed(2),'Equipment-related purchases grouped by the tracker; tax treatment may follow year-one expensing'],
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


function getSharedAuthSession() {
  try {
    return window.OliPolyAuth?.readSession?.() || null;
  } catch (_) {
    return null;
  }
}

function getSharedAuthToken() {
  try {
    return window.OliPolyAuth?.getToken?.() || getSharedAuthSession()?.access_token || localStorage.getItem('sb_token') || null;
  } catch (_) {
    return localStorage.getItem('sb_token') || null;
  }
}

function createFinanceClient() {
  if (supabase) return supabase;

  financeClientCreated = true;
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return supabase;
}

function writeSharedSessionFromFinance(session) {
  if (!session || !window.OliPolyAuth?.writeSession) return;
  ignoreNextSharedAuthEventUntil = Date.now() + 750;
  window.OliPolyAuth.writeSession(session);
}

async function adoptSharedAuthSession() {
  if (!supabase?.auth || !window.OliPolyAuth) return null;

  const shared = await window.OliPolyAuth.ensure?.();
  if (!shared?.access_token) return null;

  const { data: existingData } = await supabase.auth.getSession();
  const existing = existingData?.session || null;
  if (existing?.access_token === shared.access_token && existing?.user) return existing;

  if (shared.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: shared.access_token,
      refresh_token: shared.refresh_token
    });
    if (!error && data?.session) return data.session;
    console.warn('Finance Pro could not adopt shared Supabase session:', error);
  }

  const user = shared.user || await window.OliPolyAuth.getUser?.();
  return user ? { access_token: shared.access_token, user } : null;
}

async function resolveCurrentUser() {
  const adopted = await adoptSharedAuthSession();
  if (adopted?.user) return adopted.user;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    window.OliPolyAuth?.writeSession?.(session);
    return session.user;
  }

  const bridgeUser = await window.OliPolyAuth?.getUser?.();
  return bridgeUser || null;
}

async function fetchEntries() {
  if (!supabase || !currentUser) return;

  if (entriesFetchPromise) return entriesFetchPromise;

  entriesFetchPromise = (async () => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('financial_entries')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('entry_date', { ascending: false })
          .order('created_at', { ascending: false }),
        12000,
        'Loading financial entries'
      );

      if (error) {
        setAuthMsg(`Could not load entries: ${error.message}`, true);
        return;
      }

      hide(els.authMessage);
      entries = data || [];
      renderAll();
    } catch (err) {
      setAuthMsg(`Could not load entries: ${err?.message || err}`, true);
    } finally {
      entriesFetchPromise = null;
    }
  })();

  return entriesFetchPromise;
}

function startEdit(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;

  editingId = id;
  customCategoryValue = '';
  delete els.entryForm.dataset.saving;

  const isCapex = e.category === 'Equipment (CapEx)';
  customCategoryValue = BASE_CATEGORIES.includes(e.category) || isCapex ? '' : (e.category || '');

  els.formHeading.textContent = 'Edit Financial Entry';
  els.saveBtn.textContent = 'Update Entry';
  els.saveBtn.disabled = false;
  els.cancelEditBtn.classList.remove('hidden');

  [
    ['entryType','type'],
    ['entryDate','entry_date'],
    ['shippingCharged','shipping_charged'],
    ['taxIncluded','tax_included'],
    ['salesTaxRate','sales_tax_rate'],
    ['salesTaxCollected','sales_tax_collected'],
    ['shippingCost','shipping_cost'],
    ['materialCost','material_cost'],
    ['packagingCost','packaging_cost'],
    ['laborCost','labor_cost'],
    ['otherDirectCost','other_direct_cost'],
    ['entryTitle','title'],
    ['entryNotes','notes'],
    ['vendorName','vendor_name'],
    ['paymentMethod','payment_method'],
    ['receiptLink','receipt_link'],
    ['businessUsePercent','business_use_percent'],
    ['milesDriven','miles_driven'],
    ['mileageRate','mileage_rate'],
    ['tripPurpose','trip_purpose'],
    ['tripFrom','trip_from'],
    ['tripTo','trip_to']
  ].forEach(([k, p]) => { if (els[k]) els[k].value = e[p] ?? ''; });

  if (els.roundTripToggle) els.roundTripToggle.checked = !!e.round_trip;

  els.entryAmount.value = e.type === 'income'
    ? (incomeSaleAmount(e) || '')
    : (num(e.original_amount) || num(e.amount) || '');

  els.netRevenuePreview.value = e.type === 'income' ? (incomeSaleAmount(e) || '') : (e.amount ?? '');
  els.entryCategory.value = isCapex ? 'Equipment' : (BASE_CATEGORIES.includes(e.category) ? e.category : 'Custom');
  els.capexToggle.checked = isCapex;
  els.taxCategory.value = e.tax_category || 'auto';

  if (!els.businessUsePercent.value) els.businessUsePercent.value = '100';

  updateEntryTypeHint();
  updateTaxPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;

  try {
    const { error } = await withTimeout(
      supabase.from('financial_entries').delete().eq('id', id).eq('user_id', currentUser.id),
      12000,
      'Deleting entry'
    );

    if (error) return setMsg(`Delete failed: ${error.message}`, true);
    setMsg('Entry deleted.');
    if (editingId === id) resetForm();
    await fetchEntries();
  } catch (err) {
    setMsg(`Delete failed: ${err?.message || err}`, true);
  }
}

async function saveEntry(e) {
  e?.preventDefault?.();

  if (els.entryForm.dataset.saving === '1') return;

  hide(els.formMessage);
  updateEntryTypeHint();

  if (!els.entryDate.value) return setMsg('Date is required.', true);
  if (!els.entryCategory.value) return setMsg('Category is required.', true);
  if (!els.entryTitle.value.trim()) return setMsg('Title is required.', true);
  if (els.entryAmount.value === '' || Number.isNaN(Number(els.entryAmount.value))) return setMsg('Amount is required.', true);

  const wasEditing = !!editingId;

  els.entryForm.dataset.saving = '1';
  els.saveBtn.disabled = true;
  els.saveBtn.textContent = wasEditing ? 'Updating...' : 'Saving...';

  try {
    let category = els.entryCategory.value;
    const isCapexEquipment = category === 'Equipment' && els.capexToggle.checked;
    if (isCapexEquipment) category = 'Equipment (CapEx)';

    if (category === 'Custom') {
      if (!customCategoryValue) {
        const customInput = prompt('Enter custom category name:', customCategoryValue || '')?.trim();
        if (!customInput) {
          return setMsg('Custom category is required.', true);
        }
        customCategoryValue = customInput;
      }
      category = customCategoryValue;
    }

    const isIncome = els.entryType.value === 'income';
    const isMileage = !isIncome && isMileageCategory(category);
    const saleCosts =
      num(els.shippingCost.value) +
      num(els.materialCost.value) +
      num(els.packagingCost.value) +
      num(els.laborCost.value) +
      num(els.otherDirectCost.value);

    const suspiciousExpense = /material|filament|spool|fee|maintenance|booth|supplies/i.test(
      `${els.entryTitle.value} ${category}`
    );

    if (!isIncome && saleCosts > 0 && num(els.entryAmount.value) === 0) {
      return setMsg('This looks like a sale cost breakdown. Switch Entry Type to Income or enter the expense amount in Amount Entered.', true);
    }

    if (!isIncome && isCapexEquipment && num(els.entryAmount.value) <= 0) {
      return setMsg('Enter the full purchase amount for this Equipment asset.', true);
    }

    if (isIncome && suspiciousExpense && num(els.shippingCharged.value) === 0 && saleCosts === 0) {
      return setMsg('This may be a cost, not revenue. Bulk material purchases, fees, maintenance, booth costs, and supplies usually belong under Expense.', true);
    }

    let originalAmount = num(els.entryAmount.value);
    let amount = originalAmount;
    let salesTaxCollected = 0;
    let notes = els.entryNotes.value.trim();
    let taxCat = els.taxCategory.value === 'auto'
      ? defaultTax(els.entryType.value, category)
      : els.taxCategory.value;

    const destinationCounty = isIncome ? normalizeCounty(els.destinationCounty?.value) : '';

    if (isIncome && !destinationCounty) {
      return setMsg('Select a destination county for income/sale entries.', true);
    }

    const taxExemptSale = isIncome && els.taxExemptSale?.value === 'yes';

    if (isIncome && !taxExemptSale && num(els.salesTaxRate.value) <= 0) {
      return setMsg('Enter the sales tax rate for this income/sale entry so the filing report can audit rates by county.', true);
    }

    if (taxExemptSale) {
      salesTaxCollected = 0;
      amount = originalAmount;
      if (!notes.toLowerCase().includes('tax exempt')) notes = `[Tax Exempt Sale] ${notes}`.trim();
    } else if (isIncome) {
      salesTaxCollected = +((amount * num(els.salesTaxRate.value)) / 100).toFixed(2);
    }

    if (!isIncome) {
      if (isMileage) {
        const miles = num(els.milesDriven.value);
        const rate = num(els.mileageRate.value);
        if (miles <= 0) {
          return setMsg('Enter miles driven for a mileage entry.', true);
        }
        if (rate <= 0) {
          return setMsg('Enter a mileage rate for a mileage entry.', true);
        }
        if (!els.tripPurpose.value.trim()) {
          return setMsg('Enter a trip purpose for a mileage entry.', true);
        }
        originalAmount = +(miles * rate).toFixed(2);
        amount = originalAmount;
      } else {
        const businessUsePercent = Math.max(0, Math.min(100, num(els.businessUsePercent.value) || 100));
        if (businessUsePercent <= 0) {
          return setMsg('Business Use % must be greater than 0 for expense entries.', true);
        }
        amount = +(originalAmount * (businessUsePercent / 100)).toFixed(2);

        if (businessUsePercent < 100) {
          const adjustmentNote = `[Business-use adjusted from ${money(originalAmount)} at ${businessUsePercent.toFixed(2)}%]`;
          notes = notes ? `${adjustmentNote} ${notes}` : adjustmentNote;
        }
      }
    }

    const firstIncomeDate = getFirstIncomeDate();

    if (!isIncome) {
      const entryDate = els.entryDate.value;
      if (!firstIncomeDate || entryDate < firstIncomeDate) {
        if (!notes.toLowerCase().includes('startup')) notes = `[Startup Expense] ${notes}`.trim();
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
      original_amount: isIncome ? amount : originalAmount,
      vendor_name: els.vendorName.value.trim(),
      payment_method: els.paymentMethod.value || '',
      receipt_link: els.receiptLink.value.trim(),
      business_use_percent: isIncome ? 100 : Math.max(0, Math.min(100, num(els.businessUsePercent.value) || 100)),
      miles_driven: isMileage ? num(els.milesDriven.value) : 0,
      mileage_rate: isMileage ? num(els.mileageRate.value) : 0,
      trip_purpose: isMileage ? els.tripPurpose.value.trim() : '',
      trip_from: isMileage ? els.tripFrom.value.trim() : '',
      trip_to: isMileage ? els.tripTo.value.trim() : '',
      round_trip: isMileage ? !!els.roundTripToggle.checked : false,
      destination_county: destinationCounty,
      sales_tax_collected: salesTaxCollected,
      tax_exempt_sale: !!taxExemptSale,
      shipping_charged: isIncome ? num(els.shippingCharged.value) : 0,
      tax_included: 'no',
      sales_tax_rate: isIncome ? num(els.salesTaxRate.value) : 0,
      shipping_cost: num(els.shippingCost.value),
      material_cost: isIncome ? num(els.materialCost.value) : 0,
      packaging_cost: isIncome ? num(els.packagingCost.value) : 0,
      labor_cost: isIncome ? num(els.laborCost.value) : 0,
      other_direct_cost: isIncome ? num(els.otherDirectCost.value) : 0
    };

    const result = await withTimeout(
      wasEditing
        ? supabase.from('financial_entries').update(payload).eq('id', editingId).eq('user_id', currentUser.id)
        : supabase.from('financial_entries').insert(payload),
      12000,
      wasEditing ? 'Updating entry' : 'Saving entry'
    );

    if (result.error) throw result.error;

    setMsg(wasEditing ? 'Entry updated.' : 'Entry saved.');
    resetForm();
    await fetchEntries();
  } catch (err) {
    console.error('Finance entry save failed:', err);
    setMsg(`Save failed: ${err?.message || err}`, true);
  } finally {
    delete els.entryForm.dataset.saving;
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = editingId ? 'Update Entry' : 'Save Entry';
  }
}

function applySignedOutState(message = 'Sign in to your private tracker.') {
  currentUser = null;
  entries = [];
  editingId = null;
  authBusy = false;

  if (els.entryForm) delete els.entryForm.dataset.saving;
  if (els.saveBtn) {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = 'Save Entry';
  }

  setUI(false);
  renderAll();
  setAuthMsg(message, false);
}

async function safeLocalSignOut(timeoutMs = 2500) {
  if (!supabase?.auth) return;
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
  } catch (_) {
    // ignore local sign-out cleanup issues
  }
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  if (!els.emailInput.value || !els.passwordInput.value) {
    return setAuthMsg('Enter your email and password.', true);
  }

  setAuthMsg('Signing in...');

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: els.emailInput.value.trim(),
      password: els.passwordInput.value
    });

    if (error) return setAuthMsg(`Login failed: ${error.message}`, true);

    hide(els.authMessage);

    const { data } = await supabase.auth.getSession();
    if (data?.session) writeSharedSessionFromFinance(data.session);
    currentUser = data?.session?.user || null;
    setUI(!!currentUser);

    if (currentUser) await fetchEntries();
  } catch (err) {
    setAuthMsg(`Login failed: ${err?.message || err}`, true);
  }
}

async function signup() {
  if (!els.emailInput.value || !els.passwordInput.value) {
    return setAuthMsg('Enter an email and password to create your account.', true);
  }

  setAuthMsg('Creating account...');

  try {
    const { error, data } = await supabase.auth.signUp({
      email: els.emailInput.value.trim(),
      password: els.passwordInput.value
    });
    if (data?.session) writeSharedSessionFromFinance(data.session);

    if (error) return setAuthMsg(`Signup failed: ${error.message}`, true);

    setAuthMsg('Account created. If email confirmation is enabled in Supabase, confirm your email before logging in.');
  } catch (err) {
    setAuthMsg(`Signup failed: ${err?.message || err}`, true);
  }
}

async function logout() {
  try {
    if (window.OliPolyAuth) window.OliPolyAuth.clearSession();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Logout cleanup issue:', err);
  }

  currentUser = null;
  setUI(false);
  entries = [];
  resetForm();
  renderAll();
  setAuthMsg('Logged out.');
}

async function refreshFinanceAuthFromSharedSession() {
  if (sharedAuthRefreshPromise) return sharedAuthRefreshPromise;

  sharedAuthRefreshPromise = (async () => {
    try {
      currentUser = await resolveCurrentUser();
      setUI(!!currentUser);
      if (currentUser) {
        hide(els.authMessage);
        await fetchEntries();
      } else {
        entries = [];
        renderAll();
      }
    } catch (err) {
      console.warn('Finance Pro shared auth refresh failed:', err);
    } finally {
      sharedAuthRefreshPromise = null;
    }
  })();

  return sharedAuthRefreshPromise;
}

async function init() {
  hide(els.authMessage);
  loadSettings();
  applySettingsToUI();

  els.entryDate.value = todayISO();
  els.taxYearFilter.value = currentYear();
  populateFilingPeriodSelect();
  els.businessUsePercent.value = '100';

  if (SUPABASE_URL.includes('PASTE_') || SUPABASE_ANON_KEY.includes('PASTE_')) {
    return setAuthMsg('Setup not finished yet. Add your Supabase URL and anon key in the code before using this page.', true);
  }

  updateEntryTypeHint();

  createFinanceClient();

  try {
    currentUser = await resolveCurrentUser();
    setUI(!!currentUser);
  } catch (err) {
    console.warn('Finance Pro auth startup failed:', err);
    currentUser = null;
    setUI(false);
  }

  renderTaxReport();
  renderMonthlyTaxReport();

  if (currentUser) await fetchEntries();

  if (!authStateListenerInstalled) {
    authStateListenerInstalled = true;
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) writeSharedSessionFromFinance(session);
      currentUser = session?.user || null;
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

  if (!sharedAuthListenerInstalled) {
    sharedAuthListenerInstalled = true;
    window.addEventListener('olipoly-auth-changed', async () => {
      if (Date.now() < ignoreNextSharedAuthEventUntil) return;
      await refreshFinanceAuthFromSharedSession();
    });
  }
}

[
  els.entryType,
  els.entryCategory,
  els.capexToggle,
  els.entryAmount,
  els.taxIncluded,
  els.taxExemptSale,
  els.destinationCounty,
  els.salesTaxRate,
  els.businessUsePercent,
  els.milesDriven,
  els.mileageRate,
  els.defaultMileageRate,
  els.officeSqft,
  els.homeSqft
].filter(Boolean).forEach(el => {
  el.oninput = el.onchange = () => {
    if (el === els.officeSqft || el === els.homeSqft) calculateHomeOfficePercent();
    updateEntryTypeHint();
    updateTaxPreview();
  };
});

// ----------------------------
// SAFE EVENT WIRING
// ----------------------------
// This section is intentionally defensive: if one optional element is missing,
// the entire JS file should NOT crash and kill login/show-password.

if (els.passwordInput) els.passwordInput.classList.add('mask-password');

if (els.showPasswordToggle && els.passwordInput) {
  els.showPasswordToggle.addEventListener('change', () => {
    els.passwordInput.classList.toggle('mask-password', !els.showPasswordToggle.checked);
  });
}

if (els.passwordInput) {
  els.passwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      login();
    }
  });
}

if (els.loginBtn) els.loginBtn.addEventListener('click', login);
if (els.signupBtn) els.signupBtn.addEventListener('click', signup);
if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);
if (els.refreshBtn) els.refreshBtn.addEventListener('click', fetchEntries);
if (els.exportBtn) els.exportBtn.addEventListener('click', exportCSV);
if (els.taxExportBtn) els.taxExportBtn.addEventListener('click', exportTaxReport);
if (els.runTaxReportBtn) els.runTaxReportBtn.addEventListener('click', renderTaxReport);
if (els.monthlyTaxReportBtn) els.monthlyTaxReportBtn.addEventListener('click', renderMonthlyTaxReport);
if (els.salesTaxFilingPeriod) els.salesTaxFilingPeriod.addEventListener('change', renderMonthlyTaxReport);
if (els.salesTaxFilingExportBtn) els.salesTaxFilingExportBtn.addEventListener('click', exportSalesTaxFilingCSV);

/* Important: do NOT wire saveBtn.onclick to requestSubmit().
   The button is already type="submit" in the HTML. */
if (els.entryForm) els.entryForm.addEventListener('submit', saveEntry);
if (els.cancelEditBtn) els.cancelEditBtn.addEventListener('click', resetForm);
if (els.saveSettingsBtn) els.saveSettingsBtn.addEventListener('click', saveSettings);

if (els.clearFiltersBtn) {
  els.clearFiltersBtn.addEventListener('click', () => {
    if (els.typeFilter) els.typeFilter.value = 'all';
    if (els.monthFilter) els.monthFilter.value = '';
    if (els.searchFilter) els.searchFilter.value = '';
    renderAll();
  });
}

[els.typeFilter, els.monthFilter, els.searchFilter].filter(Boolean).forEach(el => {
  el.addEventListener('input', renderAll);
});

init();


/* === OliPoly Finance Pro Tax Exempt Sale Helper V1 === */
(function(){
  const $ = (id) => document.getElementById(id);
  function ensureField(){
    if ($("taxExemptSale")) return;
    const taxIncluded = $("taxIncluded");
    if (!taxIncluded) return;
    const parent = taxIncluded.closest("div") || taxIncluded.parentElement;
    parent?.insertAdjacentHTML("afterend", `
      <div>
        <label for="taxExemptSale">Tax Exempt Sale?</label>
        <select id="taxExemptSale">
          <option value="no">No</option>
          <option value="yes">Yes — Tax Exempt</option>
        </select>
      </div>
    `);
  }
  function sync(){
    const taxExempt = $("taxExemptSale")?.value === "yes";
    if (taxExempt) {
      if ($("salesTaxRate")) $("salesTaxRate").value = "0";
      if ($("salesTaxCollected")) $("salesTaxCollected").value = "";
      if ($("netRevenuePreview") && $("entryAmount")) $("netRevenuePreview").value = $("entryAmount").value || "";
    }
  }
  function bind(){
    ensureField();
    ["taxExemptSale","entryAmount","salesTaxRate"].forEach(id => {
      const el = $(id);
      if (!el || el.dataset.taxExemptSaleBound === "true") return;
      el.dataset.taxExemptSaleBound = "true";
      el.addEventListener("input", sync);
      el.addEventListener("change", sync);
    });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
  setTimeout(bind, 500);
  setTimeout(bind, 1500);
})();
