const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;
const money = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(v));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const d = new Date(dateStr || today());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const els = {
  orderType: $('orderType'),
  shippingMode: $('shippingMode'),
  readySendBtn: $('readySendBtn'),
  professionalMode: $('professionalMode'),
  invoiceType: $('invoiceType'),
  invoicePdfBtn: $('invoicePdfBtn'),
  modeHint: $('modeHint'),

  demoBtn: $('demoBtn'),
  saveQuoteBtn: $('saveQuoteBtn'),
  copySummaryBtn: $('copySummaryBtn'),
  customerPdfBtn: $('customerPdfBtn'),
  printBtn: $('printBtn'),
  resetBtn: $('resetBtn'),

  quoteNumber: $('quoteNumber'),
  invoiceNumber: $('invoiceNumber'),
  quoteDate: $('quoteDate'),
  invoiceDate: $('invoiceDate'),
  validThrough: $('validThrough'),
  paymentDueDate: $('paymentDueDate'),
  turnaround: $('turnaround'),
  quoteTitle: $('quoteTitle'),
  customerName: $('customerName'),
  customerEmail: $('customerEmail'),
  companyName: $('companyName'),
  contactName: $('contactName'),
  poNumber: $('poNumber'),
  qty: $('qty'),
  unitsPerItem: $('unitsPerItem'),
  presetSelect: $('presetSelect'),
  depositPercent: $('depositPercent'),
  quoteStatus: $('quoteStatus'),
  quoteNotes: $('quoteNotes'),
  customerNotes: $('customerNotes'),
  assumptions: $('assumptions'),
  invoiceNotes: $('invoiceNotes'),
  paymentTerms: $('paymentTerms'),

  filamentCount: $('filamentCount'),
  spoolWeight: $('spoolWeight'),
  filament1Cost: $('filament1Cost'),
  filament1Used: $('filament1Used'),
  filament2Cost: $('filament2Cost'),
  filament2Used: $('filament2Used'),
  filament3Cost: $('filament3Cost'),
  filament3Used: $('filament3Used'),
  filament4Cost: $('filament4Cost'),
  filament4Used: $('filament4Used'),
  simplePackaging: $('simplePackaging'),
  simpleShipping: $('simpleShipping'),
  simpleHardware: $('simpleHardware'),
  designHours: $('designHours'),
  designRate: $('designRate'),
  postHours: $('postHours'),
  postRate: $('postRate'),
  machineHours: $('machineHours'),
  machineRate: $('machineRate'),
  marketplacePercent: $('marketplacePercent'),
  simpleSummary: $('simpleSummary'),
  generateQuoteBtn: $('generateQuoteBtn'),
  missingInputsNotice: $('missingInputsNotice'),

  advancedToggle: $('advancedToggle'),
  advancedToggleText: $('advancedToggleText'),
  advancedPanel: $('advancedPanel'),
  directItems: $('directItems'),
  overheadItems: $('overheadItems'),
  addDirectBtn: $('addDirectBtn'),
  addOverheadBtn: $('addOverheadBtn'),
  applyHelpersBtn: $('applyHelpersBtn'),
  tpl: $('lineItemTemplate'),

  batchName: $('batchName'),
  batchSku: $('batchSku'),
  batchUnits: $('batchUnits'),
  batchColors: $('batchColors'),
  batchRollWeight: $('batchRollWeight'),
  batchPriceTarget: $('batchPriceTarget'),
  batchFilament1Cost: $('batchFilament1Cost'),
  batchFilament1Used: $('batchFilament1Used'),
  batchFilament2Cost: $('batchFilament2Cost'),
  batchFilament2Used: $('batchFilament2Used'),
  batchFilament3Cost: $('batchFilament3Cost'),
  batchFilament3Used: $('batchFilament3Used'),
  batchFilament4Cost: $('batchFilament4Cost'),
  batchFilament4Used: $('batchFilament4Used'),
  batchPackaging: $('batchPackaging'),
  batchLabor: $('batchLabor'),
  batchOther: $('batchOther'),
  batchOverhead: $('batchOverhead'),
  batchSold: $('batchSold'),
  batchLocation: $('batchLocation'),
  applyBatchBtn: $('applyBatchBtn'),

  profitMode: $('profitMode'),
  suggestedMode: $('suggestedMode'),
  profitValue: $('profitValue'),
  discount: $('discount'),
  taxPreset: $('taxPreset'),
  salesTax: $('salesTax'),
  roundingMode: $('roundingMode'),

  sumPerItem: $('sumPerItem'),
  sumMargin: $('sumMargin'),
  sumBreakEven: $('sumBreakEven'),
  profitGuardrail: $('profitGuardrail'),
  quoteConfidence: $('quoteConfidence'),
  sumDirect: $('sumDirect'),
  sumOverhead: $('sumOverhead'),
  sumProfit: $('sumProfit'),
  sumDeposit: $('sumDeposit'),
  sumBalance: $('sumBalance'),
  sumQuote: $('sumQuote'),

  outDirect: $('outDirect'),
  outOverhead: $('outOverhead'),
  outBase: $('outBase'),
  outProfit: $('outProfit'),
  outPerItem: $('outPerItem'),
  outBreakEven: $('outBreakEven'),
  outMargin: $('outMargin'),
  outPreDiscount: $('outPreDiscount'),
  outDiscount: $('outDiscount'),
  outBeforeTax: $('outBeforeTax'),
  outRoundedBeforeTax: $('outRoundedBeforeTax'),
  outRoundingGain: $('outRoundingGain'),
  outTax: $('outTax'),
  outDeposit: $('outDeposit'),
  outBalance: $('outBalance'),
  outFinal: $('outFinal'),

  quoteSummary: $('quoteSummary'),
  profitWarning: $('profitWarning'),
  financeReadyView: $('financeReadyView'),
  copyFinanceBtn: $('copyFinanceBtn'),
  customerQuoteView: $('customerQuoteView'),

  batchUnitCost: $('batchUnitCost'),
  batchTotalCost: $('batchTotalCost'),
  batchUnitsOut: $('batchUnitsOut'),
  batchUnsoldValue: $('batchUnsoldValue'),
  materialUnitCost: $('materialUnitCost'),
  activePreset: $('activePreset'),
  batchSummary: $('batchSummary'),
  inventoryReadyView: $('inventoryReadyView'),

  savedQuotesSelect: $('savedQuotesSelect'),
  loadQuoteBtn: $('loadQuoteBtn'),
  deleteQuoteBtn: $('deleteQuoteBtn'),
  historySummary: $('historySummary'),

  pdfSheet: $('pdfSheet'),
  pdfCard: $('pdfCard'),
  pdfDocType: $('pdfDocType'),
  pdfBrandSub: $('pdfBrandSub'),
  pdfTitle: $('pdfTitle'),
  pdfSubtitle: $('pdfSubtitle'),
  pdfQuoteNumber: $('pdfQuoteNumber'),
  pdfInvoiceNumber: $('pdfInvoiceNumber'),
  pdfQuoteDate: $('pdfQuoteDate'),
  pdfValidThrough: $('pdfValidThrough'),
  pdfPaymentDueDate: $('pdfPaymentDueDate'),
  pdfTurnaround: $('pdfTurnaround'),
  pdfStatus: $('pdfStatus'),
  pdfCustomerName: $('pdfCustomerName'),
  pdfCompanyName: $('pdfCompanyName'),
  pdfContactName: $('pdfContactName'),
  pdfPoNumber: $('pdfPoNumber'),
  pdfQty: $('pdfQty'),
  pdfPerItem: $('pdfPerItem'),
  pdfProject: $('pdfProject'),
  pdfSubtotal: $('pdfSubtotal'),
  pdfTax: $('pdfTax'),
  pdfTotal: $('pdfTotal'),
  pdfDeposit: $('pdfDeposit'),
  pdfBalance: $('pdfBalance'),
  pdfInvoiceAmount: $('pdfInvoiceAmount'),
  pdfCustomerNotes: $('pdfCustomerNotes'),
  pdfAssumptions: $('pdfAssumptions'),
  pdfInvoiceTerms: $('pdfInvoiceTerms')
};

const STORAGE_KEY = 'olipoly_quote_history_v3';

const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

const PRESETS = {
  custom: { name: 'Custom' },
  small_print: { name: 'Small Print', profit: 35, deposit: 50, packaging: 1.25, grams: 60, machineRate: 1 },
  medium_print: { name: 'Medium Print', profit: 40, deposit: 50, packaging: 2, grams: 120, machineRate: 1.25 },
  custom_job: { name: 'Custom Job', profit: 60, deposit: 60, designLabor: 35, postLabor: 20, machineRate: 1.5 },
  bagg_accessory: { name: 'Bogg Accessory', profit: 45, deposit: 50, packaging: 1.5, grams: 90, machineRate: 1 },
  beach_toy: { name: 'Beach Toy', profit: 35, deposit: 50, packaging: 1.25, grams: 120, machineRate: 1 },
  name_sign: { name: 'Name Sign', profit: 55, deposit: 60, packaging: 3, grams: 180, designLabor: 40, machineRate: 2 }
};

function getSbToken() {
  return localStorage.getItem('sb_token') || null;
}

async function sbApi(path, options = {}) {
  const token = getSbToken();
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => null);
  return { ok: res.ok, data, error: !res.ok ? data : null };
}

async function getCurrentSbUser() {
  if (!getSbToken()) return null;
  const { data, error } = await sbApi('/auth/v1/user');
  return error || !data ? null : data;
}

function textMoneyToNumber(text) {
  return Number(String(text || '').replace(/[^0-9.-]/g, '')) || 0;
}

function quoteShippingModeToFulfillment(mode) {
  if (mode === 'pickup') return 'pickup';
  if (mode === 'delivery') return 'delivery';
  return 'shipping';
}

function padQuoteNumber(n) {
  return String(n).padStart(6, '0');
}

function formatQuoteNumber(n) {
  return `Q-${padQuoteNumber(n)}`;
}

function formatInvoiceNumber(n) {
  return `INV-${padQuoteNumber(n)}`;
}

async function fetchNextServerNumber() {
  const res = await sbApi('/rest/v1/rpc/next_quote_invoice_number', {
    method: 'POST',
    body: JSON.stringify({})
  });

  if (res.error || res.data == null) {
    throw new Error(res.error?.message || 'Could not get next document number from Supabase.');
  }

  return Number(res.data);
}

async function ensureDocumentNumbers(force = false) {
  const needQuote = force || !els.quoteNumber.value.trim();
  const needInvoice = force || !els.invoiceNumber.value.trim();

  if (!needQuote && !needInvoice) return;

  const nextNum = await fetchNextServerNumber();

  if (needQuote) els.quoteNumber.value = formatQuoteNumber(nextNum);
  if (needInvoice) els.invoiceNumber.value = formatInvoiceNumber(nextNum);
}

function clearMissingHighlights() {
  document.querySelectorAll('.field-missing').forEach(el => el.classList.remove('field-missing'));
}

function simpleMaterialTotal() {
  const count = Math.max(1, Math.min(4, num(els.filamentCount.value) || 1));
  const weight = Math.max(1, num(els.spoolWeight.value) || 1000);
  let total = 0;

  for (let i = 1; i <= count; i++) {
    total += (num(els[`filament${i}Used`].value) / weight) * num(els[`filament${i}Cost`].value);
  }
  return total;
}

function getMissingIssues() {
  const issues = [];
  const materialTotal = simpleMaterialTotal();
  const machineTotal = num(els.machineHours.value) * num(els.machineRate.value);
  const designTotal = num(els.designHours.value) * num(els.designRate.value);
  const postTotal = num(els.postHours.value) * num(els.postRate.value);
  const qty = Math.max(1, num(els.qty.value) || 1);

  if (materialTotal <= 0) issues.push('No material entered');
  if (machineTotal <= 0) issues.push('No machine time entered');
  if (designTotal <= 0 && postTotal <= 0 && qty === 1) issues.push('No labor entered');
  if (els.shippingMode.value === 'ship_estimated' && num(els.simpleShipping.value) <= 0) issues.push('Shipping estimate missing');
  if (!els.quoteTitle.value.trim()) issues.push('Missing quote title');
  if (!els.turnaround.value.trim()) issues.push('Missing turnaround');

  return issues;
}

function applyMissingHighlights(issues) {
  clearMissingHighlights();
  if (!issues.length) return;

  const map = {
    'Missing quote title': ['quoteTitle'],
    'Missing turnaround': ['turnaround'],
    'No material entered': ['filament1Used'],
    'No machine time entered': ['machineHours'],
    'No labor entered': ['designHours', 'postHours'],
    'Shipping estimate missing': ['simpleShipping']
  };

  issues.forEach(issue => {
    (map[issue] || []).forEach(id => {
      if (els[id]) els[id].classList.add('field-missing');
    });
  });
}

function showMissingInputsNotice(issues) {
  if (!els.missingInputsNotice) return;

  if (!issues.length) {
    els.missingInputsNotice.classList.add('hidden');
    els.missingInputsNotice.innerHTML = '';
    return;
  }

  els.missingInputsNotice.classList.remove('hidden');
  els.missingInputsNotice.innerHTML = `
    <strong style="display:block;margin-bottom:6px;">Missing inputs to review:</strong>
    ${issues.map(x => `• ${x}`).join('<br>')}
  `;
}

function alertMissingInputsIfNeeded(issues) {
  if (!issues.length) return;
  alert(`Quote still has missing inputs:\n\n- ${issues.join('\n- ')}`);
}

function buildAcceptedQuoteOrderPayload(userId) {
  const total = textMoneyToNumber(els.outFinal.textContent);
  const deposit = textMoneyToNumber(els.outDeposit.textContent);
  const balance = textMoneyToNumber(els.outBalance.textContent);
  const depositRequired = deposit > 0;

  return {
    user_id: userId,
    order_number: els.quoteNumber.value.trim(),
    order_date: els.quoteDate.value || today(),
    customer_name: (els.companyName.value || els.customerName.value).trim() || null,
    customer_email: els.customerEmail.value.trim() || null,
    order_title: els.quoteTitle.value.trim() || 'Quoted Project',
    quantity: Math.max(1, num(els.qty.value) || 1),
    order_total: total,
    deposit_amount: deposit,
    balance_amount: balance,
    status: depositRequired ? 'awaiting_deposit' : 'in_design',
    payment_status: depositRequired ? 'deposit_due' : 'unpaid',
    fulfillment: quoteShippingModeToFulfillment(els.shippingMode.value || 'pickup'),
    tracking_number: null,
    payment_link: null,
    internal_notes: [
      `Created automatically from accepted quote ${els.quoteNumber.value.trim() || ''}`.trim(),
      els.quoteNotes.value.trim(),
      els.assumptions.value.trim(),
      els.poNumber.value.trim() ? `PO #: ${els.poNumber.value.trim()}` : '',
      els.invoiceNumber.value.trim() ? `Invoice #: ${els.invoiceNumber.value.trim()}` : ''
    ].filter(Boolean).join('\n\n'),
    public_status_text: 'Your quote has been accepted and your order has been created.',
    public_next_step: depositRequired
      ? 'Next step: submit your deposit so production can begin.'
      : 'Next step: we are preparing your order for production.',
    shipping_or_pickup_note:
      els.shippingMode.value === 'pickup'
        ? 'Pickup details will be shared as your order progresses.'
        : els.shippingMode.value === 'delivery'
          ? 'Delivery details will be shared as your order progresses.'
          : 'Shipping details and tracking will be added once available.'
  };
}

function buildAcceptedQuotePublicTrackingPayload(orderPayload) {
  return {
    order_number: orderPayload.order_number,
    user_id: orderPayload.user_id,
    order_title: orderPayload.order_title || null,
    status: orderPayload.status,
    payment_status: orderPayload.payment_status,
    public_status_text: orderPayload.public_status_text || null,
    public_next_step: orderPayload.public_next_step || null,
    shipping_or_pickup_note: orderPayload.shipping_or_pickup_note || null,
    tracking_number: orderPayload.tracking_number || null,
    payment_link: orderPayload.payment_link || null
  };
}

async function syncAcceptedQuoteToOrders() {
  if (els.quoteStatus.value !== 'accepted') return;

  const quoteNumber = els.quoteNumber.value.trim();
  const quoteTitle = els.quoteTitle.value.trim();

  if (!quoteNumber) throw new Error('Quote number is required before creating an order.');
  if (!quoteTitle) throw new Error('Quote title is required before creating an order.');

  const user = await getCurrentSbUser();
  if (!user) {
    throw new Error('You must be logged into orders-admin.html in this same browser first.');
  }

  const orderPayload = buildAcceptedQuoteOrderPayload(user.id);

  const orderRes = await sbApi('/rest/v1/orders?on_conflict=order_number', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(orderPayload)
  });

  if (orderRes.error) {
    throw new Error(orderRes.error.message || JSON.stringify(orderRes.error) || 'Could not create or update the order.');
  }

  const publicRes = await sbApi('/rest/v1/order_tracking_public?on_conflict=order_number', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(buildAcceptedQuotePublicTrackingPayload(orderPayload))
  });

  if (publicRes.error) {
    throw new Error(publicRes.error.message || JSON.stringify(publicRes.error) || 'Order saved, but public tracking sync failed.');
  }

  return { order: orderRes.data, public: publicRes.data };
}

function defaultAssumptions() {
  const t = els.orderType.value || 'custom';
  const ship = els.shippingMode.value || 'pickup';

  const shippingLine =
    ship === 'pickup'
      ? 'Local pickup is assumed unless otherwise noted.'
      : ship === 'delivery'
        ? 'Local delivery pricing is estimated from the current delivery assumption and may adjust if destination changes.'
        : ship === 'ship_customer_label'
          ? 'Customer-provided shipping label is assumed and outbound shipping cost is not included in this quote.'
          : 'Shipping, if applicable, is estimated and may adjust if final packaging size, weight, or destination changes.';

  if (t === 'craft_show') {
    return `Pricing is for pre-made inventory or event stock currently available or planned for a batch run. Final color appearance may vary slightly by filament brand and print settings. Quantities available may change as inventory sells. ${shippingLine}`;
  }
  if (t === 'business_bulk') {
    return `Quote is based on the listed quantity, materials, and expected production approach. Final schedule, delivery timing, and any packaging or labeling requirements should be confirmed at approval. Material color and finish may vary slightly by filament brand and production batch. ${shippingLine}`;
  }
  if (t === 'repeat') {
    return `Quote is based on a prior or repeat-style item using current material, labor, and machine assumptions. Minor variation in color, finish, or packaging may occur depending on current stock and print settings. ${shippingLine}`;
  }
  return `Quote includes one proof/review round, standard finishing unless noted, and the materials and colors listed in this quote. Final color appearance may vary slightly by filament brand and print settings. ${shippingLine} Custom orders begin after quote approval and any required deposit.`;
}

function paymentTermsText() {
  const map = {
    due_on_receipt: 'Payment due on receipt of invoice.',
    deposit_to_start: 'Deposit is required before production begins. Remaining balance is due before delivery or pickup unless otherwise arranged.',
    due_on_completion: 'Payment is due upon project completion, before pickup, delivery, or shipment.',
    net_15: 'Payment is due within 15 days of invoice date.',
    net_30: 'Payment is due within 30 days of invoice date.'
  };
  return map[els.paymentTerms.value] || 'Payment due on receipt of invoice.';
}

function applyShippingMode() {
  const mode = els.shippingMode.value || 'pickup';
  if (mode === 'pickup') {
    if (!num(els.simpleShipping.value)) els.simpleShipping.value = 0;
  } else if (mode === 'ship_customer_label') {
    els.simpleShipping.value = 0;
  }
}

function applyProfessionalMode() {
  const on = els.professionalMode.value === 'on';
  document.body.classList.toggle('professional-docs', on);
  document.querySelectorAll('.professional-only').forEach(el => el.classList.toggle('hidden', !on));

  els.modeHint.textContent = on
    ? 'Professional / Bulk Client Mode is on. Quote PDFs use more formal company wording, and invoice PDFs are available for deposit, final, or full billing.'
    : 'Standard mode is best for regular customer quotes. Turn on Professional / Bulk Client Mode when you want a more formal quote PDF and company-style invoice.';

  if (on) {
    if (!els.companyName.value.trim() && els.customerName.value.trim()) {
      els.companyName.value = els.customerName.value.trim();
    }
    if (!els.customerNotes.value.trim()) {
      els.customerNotes.value = 'Quote prepared for a business or multi-unit order based on the specifications discussed.';
    }
    if (!els.invoiceNotes.value.trim()) {
      els.invoiceNotes.value = 'Please reference the invoice number with payment or internal approval.';
    }
  }
}

function applyOrderType() {
  const t = els.orderType.value || 'custom';
  const isCraft = t === 'craft_show';
  const isBulk = t === 'business_bulk';
  const isRepeat = t === 'repeat';

  els.customerName.placeholder = isBulk ? 'Buyer / requestor name' : 'Optional';

  if (isBulk) els.professionalMode.value = 'on';

  if (isCraft) els.depositPercent.value = 0;
  else if (isRepeat) els.depositPercent.value = 25;
  else if (isBulk) els.depositPercent.value = 50;
  else if (!num(els.depositPercent.value)) els.depositPercent.value = 50;

  if (isCraft && els.shippingMode.value === 'ship_estimated') els.shippingMode.value = 'pickup';
  if (isCraft && els.quoteStatus.value === 'pending') els.quoteStatus.value = 'accepted';

  if (!els.customerNotes.value.trim()) {
    els.customerNotes.value = isCraft
      ? 'Pre-made inventory item prepared for sale. Pricing reflects finished stock on hand unless otherwise noted.'
      : isBulk
        ? 'Quote prepared for a business / multi-unit order. Final schedule and delivery details can be confirmed at approval.'
        : isRepeat
          ? 'Quote prepared from a prior or repeat-style order with current materials and labor assumptions.'
          : 'Custom 3D printed item quoted from the specifications discussed.';
  }

  if (!els.assumptions.value.trim()) els.assumptions.value = defaultAssumptions();

  if (isCraft && els.profitMode.value === 'percent' && num(els.profitValue.value) < 35) {
    els.profitValue.value = 35;
  }
  if (isBulk && els.profitMode.value === 'percent' && num(els.profitValue.value) < 25) {
    els.profitValue.value = 25;
  }

  applyProfessionalMode();
  applyShippingMode();
}

function applyTaxPreset() {
  const map = {
    portage: 7.25,
    summit: 6.75,
    cuyahoga: 8,
    franklin: 7.5,
    custom: null,
    out_of_state: 0
  };
  const val = map[els.taxPreset.value];
  if (val !== null && val !== undefined) els.salesTax.value = val.toFixed(2);
}

function toggleReadySend() {
  document.body.classList.toggle('ready-send');
  const on = document.body.classList.contains('ready-send');
  els.readySendBtn.textContent = `Ready to Send: ${on ? 'On' : 'Off'}`;

  if (on) {
    if (!els.customerNotes.value.trim()) {
      els.customerNotes.value = 'Custom 3D printed item quoted from the specifications discussed.';
    }
    if (!els.assumptions.value.trim()) {
      els.assumptions.value = defaultAssumptions();
    }
  }
}

const rowValue = row => num(row.querySelector('.item-amount').value);
const totalOf = container => [...container.children].reduce((sum, row) => sum + rowValue(row), 0);

function addItem(target, title, data = {}) {
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.line-title').textContent = title;
  node.querySelector('.item-label').value = data.label || '';
  node.querySelector('.item-type').value = data.type || 'per_order';
  node.querySelector('.item-amount').value = data.amount ?? 0;
  node.querySelector('.item-note').value = data.note || '';

  node.querySelectorAll('input,select').forEach(el => el.addEventListener('input', render));
  node.querySelector('.removeBtn').onclick = () => {
    node.remove();
    render();
  };

  target.appendChild(node);
}

function applySimpleInputs() {
  const labels = [...els.directItems.children];
  const overhead = [...els.overheadItems.children];
  const mat = simpleMaterialTotal();
  const colorCount = Math.max(1, Math.min(4, num(els.filamentCount.value) || 1));

  if (labels[0]) {
    labels[0].querySelector('.item-label').value = `Filament / Material (${colorCount} color${colorCount === 1 ? '' : 's'})`;
    labels[0].querySelector('.item-amount').value = mat.toFixed(2);
  }
  if (labels[1]) {
    labels[1].querySelector('.item-label').value = 'Packaging';
    labels[1].querySelector('.item-amount').value = num(els.simplePackaging.value).toFixed(2);
  }
  if (labels[2]) {
    labels[2].querySelector('.item-label').value = 'Shipping';
    labels[2].querySelector('.item-amount').value = num(els.simpleShipping.value).toFixed(2);
  }
  if (labels[3]) {
    labels[3].querySelector('.item-label').value = 'Hardware / Inserts / Magnets';
    labels[3].querySelector('.item-amount').value = num(els.simpleHardware.value).toFixed(2);
  }

  if (overhead[0]) {
    overhead[0].querySelector('.item-label').value = 'Design Labor';
    overhead[0].querySelector('.item-amount').value = (num(els.designHours.value) * num(els.designRate.value)).toFixed(2);
  }
  if (overhead[1]) {
    overhead[1].querySelector('.item-label').value = 'Machine Time';
    overhead[1].querySelector('.item-amount').value = (num(els.machineHours.value) * num(els.machineRate.value)).toFixed(2);
  }
  if (overhead[2]) {
    overhead[2].querySelector('.item-label').value = 'Post-Process Labor';
    overhead[2].querySelector('.item-amount').value = (num(els.postHours.value) * num(els.postRate.value)).toFixed(2);
  }
}

function suggestedProfitPercent() {
  if (els.suggestedMode.value === 'off') return null;

  const aggressive = els.suggestedMode.value === 'aggressive';
  const preset = els.presetSelect.value;
  let pct = 35;

  if (preset === 'medium_print' || preset === 'beach_toy' || preset === 'bagg_accessory') pct = 40;
  if (preset === 'name_sign' || preset === 'custom_job' || num(els.designHours.value) || num(els.postHours.value)) pct = 55;
  if (num(els.qty.value) >= 10) pct -= 5;
  if (aggressive) pct += 10;

  return Math.max(20, pct);
}

function batchValues() {
  const colors = Math.max(1, Math.min(4, num(els.batchColors.value) || 1));
  const weight = Math.max(1, num(els.batchRollWeight.value) || 1000);
  let material = 0;

  for (let i = 1; i <= colors; i++) {
    material += (num(els[`batchFilament${i}Used`].value) / weight) * num(els[`batchFilament${i}Cost`].value);
  }

  const units = Math.max(1, num(els.batchUnits.value) || 1);
  const total = material + num(els.batchPackaging.value) + num(els.batchLabor.value) + num(els.batchOther.value) + num(els.batchOverhead.value);
  const sold = Math.min(units, Math.max(0, num(els.batchSold.value) || 0));
  const unit = total / units;
  const unsold = units - sold;
  const target = num(els.batchPriceTarget.value);

  return {
    units,
    total,
    unit,
    sold,
    unsold,
    unsoldValue: unsold * unit,
    soldCost: sold * unit,
    target,
    revenue: sold * target,
    profit: sold * target - sold * unit
  };
}

function financeEntryText(finalQuote, beforeTax, tax) {
  const rows = [...els.directItems.children];
  const byName = key => {
    const row = rows.find(r => (r.querySelector('.item-label').value || '').toLowerCase().includes(key));
    return row ? rowValue(row) : 0;
  };

  return [
    'Type: Income',
    'Category: Sale',
    `Title: ${els.quoteTitle.value.trim() || 'Accepted Quote'}`,
    `Base Amount: ${beforeTax.toFixed(2)}`,
    'Shipping Charged: 0.00',
    'Amount Includes Sales Tax?: No',
    `Sales Tax Collected: ${tax.toFixed(2)}`,
    `Material Cost: ${byName('filament').toFixed(2)}`,
    `Packaging Cost: ${byName('packaging').toFixed(2)}`,
    'Labor Cost: 0.00',
    `Other Direct Cost: ${(totalOf(els.overheadItems) + byName('hardware')).toFixed(2)}`,
    `Shipping Cost You Paid: ${byName('shipping').toFixed(2)}`,
    `Customer Total Paid: ${finalQuote.toFixed(2)}`,
    `Notes: Customer: ${els.customerName.value || els.companyName.value || 'N/A'} | Quote #: ${els.quoteNumber.value || 'N/A'}${els.invoiceNumber.value ? ` | Invoice #: ${els.invoiceNumber.value}` : ''}`
  ].join('\n');
}

function invoiceAmount(total, deposit, balance) {
  if (els.invoiceType.value === 'deposit') return deposit;
  if (els.invoiceType.value === 'final') return balance;
  return total;
}

function documentClientName() {
  return els.professionalMode.value === 'on'
    ? (els.companyName.value.trim() || els.customerName.value.trim() || '—')
    : (els.customerName.value.trim() || els.companyName.value.trim() || '—');
}

function fillPdf(mode, total, beforeTax, tax, deposit, balance, perItem) {
  const isInvoice = mode === 'invoice';
  const professional = els.professionalMode.value === 'on';

  els.pdfCard.classList.toggle('professional-look', professional);
  els.pdfDocType.textContent = isInvoice ? 'Invoice' : professional ? 'Professional Quote' : 'Quote';
  els.pdfBrandSub.textContent = isInvoice
    ? 'Invoice and payment document'
    : professional
      ? 'Professional business quote'
      : 'Custom 3D printing quote';

  els.pdfTitle.textContent = isInvoice
    ? (professional ? 'Professional Invoice' : 'Invoice')
    : (professional ? 'Professional Quote' : (els.quoteTitle.value.trim() || 'Customer Quote'));

  els.pdfSubtitle.textContent = isInvoice
    ? (
        els.invoiceType.value === 'deposit'
          ? 'Deposit request for approved work.'
          : els.invoiceType.value === 'final'
            ? 'Final balance invoice for completed or approved work.'
            : 'Full invoice for the quoted order.'
      )
    : (professional
        ? 'Formal quote prepared for review and approval.'
        : (els.customerNotes.value.trim() || 'A polished customer-ready quote for your order.'));

  els.pdfQuoteNumber.textContent = els.quoteNumber.value || '—';
  els.pdfInvoiceNumber.textContent = els.invoiceNumber.value || '—';
  els.pdfQuoteDate.textContent = isInvoice ? (els.invoiceDate.value || els.quoteDate.value || '—') : (els.quoteDate.value || '—');
  els.pdfValidThrough.textContent = els.validThrough.value || '—';
  els.pdfPaymentDueDate.textContent = els.paymentDueDate.value || '—';
  els.pdfTurnaround.textContent = els.turnaround.value || '—';
  els.pdfStatus.textContent = (els.quoteStatus.value || 'pending').replace(/^./, m => m.toUpperCase());
  els.pdfCustomerName.textContent = documentClientName();
  els.pdfCompanyName.textContent = els.companyName.value.trim() || '—';
  els.pdfContactName.textContent = els.contactName.value.trim() || els.customerName.value.trim() || '—';
  els.pdfPoNumber.textContent = els.poNumber.value.trim() || '—';
  els.pdfQty.textContent = String(Math.max(1, num(els.qty.value) || 1));
  els.pdfPerItem.textContent = money(perItem);
  els.pdfProject.textContent = els.quoteTitle.value.trim() || '—';
  els.pdfSubtotal.textContent = money(beforeTax);
  els.pdfTax.textContent = money(tax);
  els.pdfTotal.textContent = money(total);
  els.pdfDeposit.textContent = money(deposit);
  els.pdfBalance.textContent = money(balance);
  els.pdfInvoiceAmount.textContent = money(invoiceAmount(total, deposit, balance));

  els.pdfCustomerNotes.textContent = isInvoice
    ? (els.invoiceNotes.value.trim() || 'Please remit payment according to the terms listed below.')
    : (els.customerNotes.value.trim() || 'No customer-facing notes added yet.');

  els.pdfAssumptions.textContent = isInvoice
    ? (professional
        ? `Project reference: ${els.quoteTitle.value.trim() || 'Quoted project'}${els.poNumber.value.trim() ? ` | PO #: ${els.poNumber.value.trim()}` : ''}`
        : `Project reference: ${els.quoteTitle.value.trim() || 'Quoted project'}`)
    : (els.assumptions.value.trim() || 'No exclusions or assumptions added yet.');

  els.pdfInvoiceTerms.innerHTML =
    `<strong>Payment Terms</strong><br>${paymentTermsText()}` +
    `${els.customerEmail.value.trim() ? `<br>Billing contact: ${els.customerEmail.value.trim()}` : ''}` +
    `${els.invoiceNotes.value.trim() ? `<br><br>${els.invoiceNotes.value.trim()}` : ''}`;

  document.querySelectorAll('.quote-only').forEach(el => el.classList.toggle('hidden', isInvoice));
  document.querySelectorAll('.invoice-only').forEach(el => el.classList.toggle('hidden', !isInvoice));
  document.querySelectorAll('.professional-row').forEach(el => el.classList.toggle('hidden', !professional));

  const checklist = ['☐ Quote approved'];
  if (num(els.depositPercent.value) > 0) checklist.push('☐ Deposit received');
  checklist.push('☐ Files/design confirmed');
  checklist.push('☐ Colors/materials confirmed');
  checklist.push(els.shippingMode.value === 'pickup' ? '☐ Pickup arranged' : '☐ Shipping method confirmed');

  $('pdfChecklist').innerHTML = `<strong>Order Checklist</strong><br>${checklist.join('<br>')}`;
}

function renderBatch() {
  const b = batchValues();

  els.batchUnitCost.textContent = money(b.unit);
  els.batchTotalCost.textContent = money(b.total);
  els.batchUnitsOut.textContent = String(b.units);
  els.batchUnsoldValue.textContent = money(b.unsoldValue);

  els.batchSummary.textContent =
    `${els.batchName.value.trim() || 'This batch'}: ${b.units} total units at ${money(b.unit)} each. If you sell ${b.sold}, estimated COGS is ${money(b.soldCost)} and remaining unsold inventory value is ${money(b.unsoldValue)} across ${b.unsold} unit${b.unsold === 1 ? '' : 's'}.`;

  els.inventoryReadyView.textContent =
    `Inventory-ready output → Product: ${els.batchName.value || 'N/A'} | SKU: ${els.batchSku.value || 'N/A'} | Units made: ${b.units} | Unit cost: ${b.unit.toFixed(2)} | Units sold: ${b.sold} | Unsold units: ${b.unsold} | Unsold value: ${b.unsoldValue.toFixed(2)} | Target sell price each: ${b.target.toFixed(2)} | Estimated sold revenue: ${b.revenue.toFixed(2)} | Estimated sold profit: ${b.profit.toFixed(2)} | Location: ${els.batchLocation.value || 'N/A'}`;
}

function render() {
  applySimpleInputs();
  applyProfessionalMode();

  const materialTotal = simpleMaterialTotal();
  const machineTotal = num(els.machineHours.value) * num(els.machineRate.value);
  const designTotal = num(els.designHours.value) * num(els.designRate.value);
  const postTotal = num(els.postHours.value) * num(els.postRate.value);

  els.materialUnitCost.textContent = money(materialTotal / Math.max(1, num(els.qty.value) || 1));
  els.simpleSummary.textContent =
    `Simple inputs: ${money(materialTotal)} material, ${money(els.simplePackaging.value)} packaging, ${money(els.simpleShipping.value)} shipping, ${money(els.simpleHardware.value)} hardware, ${money(designTotal)} design labor, ${money(machineTotal)} machine time, ${money(postTotal)} post-process labor.`;

  const suggested = suggestedProfitPercent();
  if (suggested != null && els.profitMode.value === 'percent') {
    els.profitValue.value = suggested;
  }

  const direct = totalOf(els.directItems);
  let overhead = totalOf(els.overheadItems);
  overhead += (direct + overhead) * (num(els.marketplacePercent.value) / 100);

  const base = direct + overhead;
  const profit = els.profitMode.value === 'flat'
    ? num(els.profitValue.value)
    : base * (num(els.profitValue.value) / 100);

  const preDiscount = base + profit;
  const discount = Math.min(num(els.discount.value), preDiscount);
  const beforeTaxRaw = Math.max(0, preDiscount - discount);
  const taxRate = num(els.salesTax.value) / 100;
  const finalRaw = beforeTaxRaw * (1 + taxRate);
  const roundingStep = num(els.roundingMode.value);

  let finalQuote = roundingStep > 0 ? Math.round(finalRaw / roundingStep) * roundingStep : finalRaw;

  const minTotal = (Math.max(1, num(els.qty.value) || 1) === 1) ? 20 : 30;
  if (finalQuote < minTotal) finalQuote = minTotal;

  const beforeTax = taxRate > 0 ? finalQuote / (1 + taxRate) : finalQuote;
  const tax = finalQuote - beforeTax;
  const roundingGain = finalQuote - finalRaw;
  const actualProfit = profit + roundingGain;
  const qty = Math.max(1, num(els.qty.value) || 1);
  const perItem = finalQuote / qty;
  const marginPct = finalQuote ? (actualProfit / finalQuote) * 100 : 0;
  const deposit = finalQuote * (num(els.depositPercent.value) / 100);
  const balance = finalQuote - deposit;

  const pairs = {
    sumDirect: direct,
    sumOverhead: overhead,
    sumProfit: actualProfit,
    sumDeposit: deposit,
    sumBalance: balance,
    sumQuote: finalQuote,
    sumPerItem: perItem,
    sumBreakEven: base,
    outDirect: direct,
    outOverhead: overhead,
    outBase: base,
    outProfit: actualProfit,
    outPerItem: perItem,
    outBreakEven: base,
    outPreDiscount: preDiscount,
    outBeforeTax: beforeTaxRaw,
    outRoundedBeforeTax: beforeTax,
    outRoundingGain: roundingGain,
    outTax: tax,
    outDeposit: deposit,
    outBalance: balance,
    outFinal: finalQuote
  };

  Object.entries(pairs).forEach(([k, v]) => {
    if (els[k]) els[k].textContent = money(v);
  });

  els.sumMargin.textContent = `${marginPct.toFixed(1)}%`;
  els.outMargin.textContent = `${marginPct.toFixed(1)}%`;
  els.outDiscount.textContent = `-${money(discount)}`;
  els.profitGuardrail.textContent = (actualProfit < 5 || marginPct < 25) ? 'Warning' : 'OK';
  els.activePreset.textContent = PRESETS[els.presetSelect.value]?.name || 'Custom';

  els.quoteSummary.textContent =
    `${els.quoteTitle.value.trim() || 'Untitled quote'}${documentClientName() !== '—' ? ` for ${documentClientName()}` : ''}: ${qty} item${qty === 1 ? '' : 's'}, ${money(direct)} direct costs, ${money(overhead)} overhead, ${money(actualProfit)} actual profit, ${money(deposit)} deposit, ${money(balance)} balance, final quoted total ${money(finalQuote)}${num(els.salesTax.value) ? ' including tax' : ''}${roundingGain ? ` after ${money(roundingGain)} smart rounding` : ''}.`;

  els.profitWarning.textContent =
    actualProfit < 5 || marginPct < 25
      ? `Warning: profit is ${money(actualProfit)} and margin is ${marginPct.toFixed(1)}%. Consider increasing price.`
      : 'No pricing warnings.';

  const issues = getMissingIssues();
  applyMissingHighlights(issues);
  showMissingInputsNotice(issues);

  let confidenceText = 'Ready';
  let confidenceClass = 'confidence-ok';

  if (issues.length >= 3 || actualProfit < 0 || marginPct < 15) {
    confidenceText = 'Risky Quote';
    confidenceClass = 'confidence-risk';
  } else if (issues.length > 0 || actualProfit < 5 || marginPct < 25) {
    confidenceText = 'Missing Inputs';
    confidenceClass = 'confidence-warn';
  }

  els.quoteConfidence.textContent = confidenceText;
  els.quoteConfidence.className = confidenceClass;

  if (issues.length) {
    els.profitWarning.textContent =
      `${els.profitWarning.textContent === 'No pricing warnings.' ? '' : els.profitWarning.textContent + ' '}Check: ${issues.join(', ')}.`.trim();
  }

  els.customerQuoteView.innerHTML = [
    `<div style="margin-bottom:12px;"><strong>${els.professionalMode.value === 'on' ? 'Professional Quote' : (els.quoteTitle.value.trim() || 'Quote')}</strong></div>`,
    `<div style="margin-bottom:12px;">${els.quoteNumber.value ? `Quote #: ${els.quoteNumber.value}<br>` : ''}${els.invoiceNumber.value && els.professionalMode.value === 'on' ? `Reference invoice #: ${els.invoiceNumber.value}<br>` : ''}${els.quoteDate.value ? `Date: ${els.quoteDate.value}<br>` : ''}${els.validThrough.value ? `Valid Through: ${els.validThrough.value}<br>` : ''}${els.turnaround.value ? `Turnaround: ${els.turnaround.value}` : ''}</div>`,
    `<div style="margin-bottom:12px;">${documentClientName() !== '—' ? `Client: ${documentClientName()}<br>` : ''}Quantity: ${qty}</div>`,
    `<div style="margin-bottom:12px;">Subtotal: ${money(beforeTax)}${num(els.salesTax.value) ? `<br>Sales tax: ${money(tax)}` : ''}<br><strong>Total quote: ${money(finalQuote)}</strong></div>`,
    `<div style="margin-bottom:12px;">Deposit due: ${money(deposit)}<br>Balance due: ${money(balance)}</div>`,
    `<div style="margin-bottom:12px;">${els.customerNotes.value.trim() || 'No customer-facing notes added yet.'}</div>`,
    `<div style="margin-bottom:12px;">${els.assumptions.value.trim() || 'No exclusions or assumptions added yet.'}</div>`
  ].join('');

  fillPdf('quote', finalQuote, beforeTax, tax, deposit, balance, perItem);
  els.financeReadyView.textContent = financeEntryText(finalQuote, beforeTax, tax);
  renderBatch();
}

function setPreset(name) {
  const p = PRESETS[name] || PRESETS.custom;

  if (p.profit != null) els.profitValue.value = p.profit;
  if (p.deposit != null) els.depositPercent.value = p.deposit;
  if (p.packaging != null) els.simplePackaging.value = p.packaging;
  if (p.grams != null) els.filament1Used.value = p.grams;

  if (p.designLabor != null) {
    els.designRate.value = p.designLabor;
    els.designHours.value = 1;
  }
  if (p.postLabor != null) {
    els.postRate.value = p.postLabor;
    els.postHours.value = 1;
  }
  if (p.machineRate != null) els.machineRate.value = p.machineRate;
  if (p.machineRate != null && !num(els.machineHours.value)) els.machineHours.value = 1;

  render();
}

function getRowsData(container) {
  return [...container.children].map(row => ({
    label: row.querySelector('.item-label').value,
    type: row.querySelector('.item-type').value,
    amount: num(row.querySelector('.item-amount').value),
    note: row.querySelector('.item-note').value
  }));
}

function snapshotQuote() {
  return {
    quoteNumber: els.quoteNumber.value,
    invoiceNumber: els.invoiceNumber.value,
    quoteDate: els.quoteDate.value,
    invoiceDate: els.invoiceDate.value,
    validThrough: els.validThrough.value,
    paymentDueDate: els.paymentDueDate.value,
    turnaround: els.turnaround.value,
    quoteTitle: els.quoteTitle.value,
    customerName: els.customerName.value,
    customerEmail: els.customerEmail.value,
    companyName: els.companyName.value,
    contactName: els.contactName.value,
    poNumber: els.poNumber.value,
    qty: els.qty.value,
    unitsPerItem: els.unitsPerItem.value,
    professionalMode: els.professionalMode.value,
    invoiceType: els.invoiceType.value,
    paymentTerms: els.paymentTerms.value,
    presetSelect: els.presetSelect.value,
    depositPercent: els.depositPercent.value,
    quoteStatus: els.quoteStatus.value,
    quoteNotes: els.quoteNotes.value,
    customerNotes: els.customerNotes.value,
    assumptions: els.assumptions.value,
    invoiceNotes: els.invoiceNotes.value,
    suggestedMode: els.suggestedMode.value,
    profitMode: els.profitMode.value,
    profitValue: els.profitValue.value,
    discount: els.discount.value,
    taxPreset: els.taxPreset.value,
    salesTax: els.salesTax.value,
    roundingMode: els.roundingMode.value,
    orderType: els.orderType.value,
    shippingMode: els.shippingMode.value,
    filamentCount: els.filamentCount.value,
    spoolWeight: els.spoolWeight.value,
    filament1Cost: els.filament1Cost.value,
    filament1Used: els.filament1Used.value,
    filament2Cost: els.filament2Cost.value,
    filament2Used: els.filament2Used.value,
    filament3Cost: els.filament3Cost.value,
    filament3Used: els.filament3Used.value,
    filament4Cost: els.filament4Cost.value,
    filament4Used: els.filament4Used.value,
    simplePackaging: els.simplePackaging.value,
    simpleShipping: els.simpleShipping.value,
    simpleHardware: els.simpleHardware.value,
    designHours: els.designHours.value,
    designRate: els.designRate.value,
    postHours: els.postHours.value,
    postRate: els.postRate.value,
    machineHours: els.machineHours.value,
    machineRate: els.machineRate.value,
    marketplacePercent: els.marketplacePercent.value,
    batchName: els.batchName.value,
    batchSku: els.batchSku.value,
    batchUnits: els.batchUnits.value,
    batchColors: els.batchColors.value,
    batchRollWeight: els.batchRollWeight.value,
    batchPriceTarget: els.batchPriceTarget.value,
    batchFilament1Cost: els.batchFilament1Cost.value,
    batchFilament1Used: els.batchFilament1Used.value,
    batchFilament2Cost: els.batchFilament2Cost.value,
    batchFilament2Used: els.batchFilament2Used.value,
    batchFilament3Cost: els.batchFilament3Cost.value,
    batchFilament3Used: els.batchFilament3Used.value,
    batchFilament4Cost: els.batchFilament4Cost.value,
    batchFilament4Used: els.batchFilament4Used.value,
    batchPackaging: els.batchPackaging.value,
    batchLabor: els.batchLabor.value,
    batchOther: els.batchOther.value,
    batchOverhead: els.batchOverhead.value,
    batchSold: els.batchSold.value,
    batchLocation: els.batchLocation.value,
    directItems: getRowsData(els.directItems),
    overheadItems: getRowsData(els.overheadItems),
    savedAt: new Date().toISOString()
  };
}

const readHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeHistory = list => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  refreshHistoryUI();
};

function refreshHistoryUI() {
  const list = readHistory().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const current = els.savedQuotesSelect.value;

  els.savedQuotesSelect.innerHTML =
    '<option value="">Select a saved quote</option>' +
    list.map(q => `<option value="${q.quoteNumber}">${q.quoteNumber} — ${q.quoteTitle || 'Untitled'} (${q.quoteStatus})</option>`).join('');

  if (list.some(q => q.quoteNumber === current)) {
    els.savedQuotesSelect.value = current;
  }

  els.historySummary.textContent = list.length
    ? `${list.length} saved quote${list.length === 1 ? '' : 's'} in this browser. Latest: ${list[0].quoteNumber} — ${list[0].quoteTitle || 'Untitled'} (${list[0].quoteStatus}).`
    : 'No saved quotes yet.';
}

async function saveQuote() {
  const snap = snapshotQuote();

  const list = readHistory();
  const idx = list.findIndex(q => q.quoteNumber === snap.quoteNumber);
  if (idx >= 0) list[idx] = snap;
  else list.push(snap);

  writeHistory(list);
  els.savedQuotesSelect.value = snap.quoteNumber;

  try {
    if (els.quoteStatus.value === 'accepted') {
      await syncAcceptedQuoteToOrders();
      els.saveQuoteBtn.textContent = 'Saved + Synced';
      alert(`Accepted quote synced to orders as ${els.quoteNumber.value.trim()}.`);
    } else {
      els.saveQuoteBtn.textContent = 'Saved';
    }
  } catch (err) {
    alert(err.message || 'Quote saved, but order sync failed.');
    els.saveQuoteBtn.textContent = 'Saved / Sync Error';
  }

  setTimeout(() => {
    els.saveQuoteBtn.textContent = 'Save Quote';
  }, 1400);
}

function loadQuote() {
  const id = els.savedQuotesSelect.value;
  if (!id) return;

  const q = readHistory().find(x => x.quoteNumber === id);
  if (!q) return;

  if (
    q.quoteStatus === 'accepted' &&
    !window.confirm('This quote is marked accepted. Editing it may change the price after it was sent or approved. Continue loading it for editing?')
  ) {
    return;
  }

  Object.entries(q).forEach(([k, v]) => {
    if (els[k] && typeof v !== 'object') els[k].value = v;
  });

  els.directItems.innerHTML = '';
  els.overheadItems.innerHTML = '';

  (q.directItems || []).forEach(item => addItem(els.directItems, 'Direct Cost', item));
  (q.overheadItems || []).forEach(item => addItem(els.overheadItems, 'Overhead Cost', item));

  clearMissingHighlights();
  render();
}

function deleteQuote() {
  const id = els.savedQuotesSelect.value;
  if (!id) return;
  writeHistory(readHistory().filter(q => q.quoteNumber !== id));
  els.savedQuotesSelect.value = '';
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(`${els.quoteSummary.textContent}\n\n${els.customerQuoteView.innerText}`);
    els.copySummaryBtn.textContent = 'Copied';
    setTimeout(() => {
      els.copySummaryBtn.textContent = 'Copy Summary';
    }, 1200);
  } catch {
    alert('Could not copy summary.');
  }
}

async function copyFinance() {
  try {
    await navigator.clipboard.writeText(els.financeReadyView.textContent);
    els.copyFinanceBtn.textContent = 'Copied';
    setTimeout(() => {
      els.copyFinanceBtn.textContent = 'Copy Finance Entry';
    }, 1200);
  } catch {
    alert('Could not copy finance entry.');
  }
}

function generateCustomerPdf() {
  render();
  fillPdf(
    'quote',
    textMoneyToNumber(els.outFinal.textContent),
    textMoneyToNumber(els.outRoundedBeforeTax.textContent),
    textMoneyToNumber(els.outTax.textContent),
    textMoneyToNumber(els.outDeposit.textContent),
    textMoneyToNumber(els.outBalance.textContent),
    textMoneyToNumber(els.outPerItem.textContent)
  );
  window.print();
}

function generateInvoicePdf() {
  render();
  fillPdf(
    'invoice',
    textMoneyToNumber(els.outFinal.textContent),
    textMoneyToNumber(els.outRoundedBeforeTax.textContent),
    textMoneyToNumber(els.outTax.textContent),
    textMoneyToNumber(els.outDeposit.textContent),
    textMoneyToNumber(els.outBalance.textContent),
    textMoneyToNumber(els.outPerItem.textContent)
  );
  window.print();
}

async function seedDefaults() {
  if (!els.directItems.children.length) {
    addItem(els.directItems, 'Direct Cost', { label: 'Filament / Material', amount: 0 });
    addItem(els.directItems, 'Direct Cost', { label: 'Packaging', amount: 0 });
    addItem(els.directItems, 'Direct Cost', { label: 'Shipping', amount: 0 });
    addItem(els.directItems, 'Direct Cost', { label: 'Hardware / Inserts / Magnets', amount: 0 });
  }

  if (!els.overheadItems.children.length) {
    addItem(els.overheadItems, 'Overhead Cost', { label: 'Design Labor', amount: 0 });
    addItem(els.overheadItems, 'Overhead Cost', { label: 'Machine Time', amount: 0 });
    addItem(els.overheadItems, 'Overhead Cost', { label: 'Post-Process Labor', amount: 0 });
  }

  if (!els.quoteDate.value) els.quoteDate.value = today();
  if (!els.invoiceDate.value) els.invoiceDate.value = today();
  if (!els.validThrough.value) els.validThrough.value = addDays(today(), 14);
  if (!els.paymentDueDate.value) els.paymentDueDate.value = addDays(today(), 14);
  if (!els.assumptions.value.trim()) els.assumptions.value = defaultAssumptions();

  await ensureDocumentNumbers();
  render();
}

async function resetPage() {
  [
    'quoteNumber',
    'invoiceNumber',
    'quoteTitle',
    'customerName',
    'customerEmail',
    'companyName',
    'contactName',
    'poNumber',
    'quoteNotes',
    'customerNotes',
    'assumptions',
    'invoiceNotes',
    'batchName',
    'batchSku',
    'batchLocation',
    'turnaround'
  ].forEach(k => {
    els[k].value = '';
  });

  els.orderType.value = 'custom';
  els.shippingMode.value = 'pickup';
  els.quoteStatus.value = 'pending';
  els.quoteDate.value = today();
  els.invoiceDate.value = today();
  els.validThrough.value = addDays(today(), 14);
  els.paymentDueDate.value = addDays(today(), 14);
  els.qty.value = 1;
  els.unitsPerItem.value = 1;
  els.presetSelect.value = 'custom';
  els.depositPercent.value = 50;
  els.profitMode.value = 'percent';
  els.profitValue.value = 30;
  els.discount.value = 0;
  els.taxPreset.value = 'portage';
  els.salesTax.value = 7.25;
  els.roundingMode.value = 'none';
  els.suggestedMode.value = 'off';
  els.professionalMode.value = 'off';
  els.invoiceType.value = 'deposit';
  els.paymentTerms.value = 'deposit_to_start';

  [
    'filament1Cost', 'filament1Used', 'filament2Cost', 'filament2Used',
    'filament3Cost', 'filament3Used', 'filament4Cost', 'filament4Used',
    'simplePackaging', 'simpleShipping', 'simpleHardware',
    'designHours', 'designRate', 'postHours', 'postRate',
    'machineHours', 'machineRate', 'marketplacePercent',
    'batchFilament1Cost', 'batchFilament1Used', 'batchFilament2Cost', 'batchFilament2Used',
    'batchFilament3Cost', 'batchFilament3Used', 'batchFilament4Cost', 'batchFilament4Used',
    'batchPackaging', 'batchLabor', 'batchOther', 'batchOverhead', 'batchPriceTarget'
  ].forEach(k => {
    els[k].value = 0;
  });

  els.filamentCount.value = 1;
  els.spoolWeight.value = 1000;
  els.batchRollWeight.value = 1000;
  els.batchColors.value = 1;
  els.batchUnits.value = 1;
  els.batchSold.value = 0;
  els.directItems.innerHTML = '';
  els.overheadItems.innerHTML = '';

  clearMissingHighlights();
  showMissingInputsNotice([]);
  applyOrderType();
  applyTaxPreset();
  refreshHistoryUI();
  await ensureDocumentNumbers(true);
  await seedDefaults();
}

async function loadDemo() {
  await resetPage();

  els.quoteNumber.value = 'Q-001042';
  els.invoiceNumber.value = 'INV-001042';
  els.professionalMode.value = 'on';
  els.invoiceType.value = 'deposit';
  els.orderType.value = 'business_bulk';
  els.shippingMode.value = 'ship_estimated';
  els.quoteTitle.value = '3200-piece branded PETG spacer order';
  els.companyName.value = 'Sample Manufacturing Co.';
  els.contactName.value = 'Dana Morris';
  els.customerName.value = 'Dana Morris';
  els.customerEmail.value = 'purchasing@example.com';
  els.poNumber.value = 'PO-88214';
  els.turnaround.value = '2–3 production weeks after approval';
  els.qty.value = 3200;
  els.profitValue.value = 25;
  els.salesTax.value = 0;
  els.taxPreset.value = 'out_of_state';
  els.depositPercent.value = 50;
  els.customerNotes.value = 'Quote includes production of the listed quantity using the discussed geometry and material assumptions. Packaging and delivery timing to be confirmed at award.';
  els.invoiceNotes.value = 'Please reference the invoice number and PO number with remittance.';
  els.assumptions.value = defaultAssumptions();

  els.filamentCount.value = 1;
  els.filament1Cost.value = 23;
  els.filament1Used.value = 5120;
  els.simplePackaging.value = 40;
  els.simpleShipping.value = 0;
  els.simpleHardware.value = 0;
  els.designHours.value = 1;
  els.designRate.value = 75;
  els.machineHours.value = 192;
  els.machineRate.value = 3.75;
  els.postHours.value = 4;
  els.postRate.value = 20;

  render();
}

const renderIds = [
  'orderType',
  'shippingMode',
  'quoteNumber',
  'invoiceNumber',
  'quoteDate',
  'invoiceDate',
  'validThrough',
  'paymentDueDate',
  'turnaround',
  'quoteTitle',
  'customerName',
  'customerEmail',
  'companyName',
  'contactName',
  'poNumber',
  'qty',
  'unitsPerItem',
  'quoteNotes',
  'customerNotes',
  'assumptions',
  'quoteStatus',
  'profitMode',
  'profitValue',
  'discount',
  'taxPreset',
  'salesTax',
  'roundingMode',
  'depositPercent',
  'presetSelect',
  'suggestedMode',
  'filamentCount',
  'spoolWeight',
  'filament1Cost',
  'filament1Used',
  'filament2Cost',
  'filament2Used',
  'filament3Cost',
  'filament3Used',
  'filament4Cost',
  'filament4Used',
  'simplePackaging',
  'simpleShipping',
  'simpleHardware',
  'designHours',
  'designRate',
  'postHours',
  'postRate',
  'machineHours',
  'machineRate',
  'marketplacePercent',
  'batchName',
  'batchSku',
  'batchUnits',
  'batchColors',
  'batchRollWeight',
  'batchPriceTarget',
  'batchFilament1Cost',
  'batchFilament1Used',
  'batchFilament2Cost',
  'batchFilament2Used',
  'batchFilament3Cost',
  'batchFilament3Used',
  'batchFilament4Cost',
  'batchFilament4Used',
  'batchPackaging',
  'batchLabor',
  'batchOther',
  'batchOverhead',
  'batchSold',
  'batchLocation',
  'professionalMode',
  'invoiceType',
  'paymentTerms',
  'invoiceNotes'
];

renderIds.forEach(id => {
  if (!els[id]) return;
  els[id].addEventListener('input', render);
  els[id].addEventListener('change', render);
});

els.presetSelect.onchange = () => setPreset(els.presetSelect.value);

els.orderType.onchange = () => {
  applyOrderType();
  render();
};

els.shippingMode.onchange = () => {
  applyShippingMode();
  render();
};

els.taxPreset.onchange = () => {
  applyTaxPreset();
  render();
};

els.professionalMode.onchange = () => {
  applyProfessionalMode();
  render();
};

els.invoiceType.onchange = render;

els.quoteStatus.addEventListener('change', () => {
  if (els.quoteStatus.value === 'accepted') {
    alert('When you click Save Quote, this accepted quote will also create or update an order and public tracker entry.');
  }
});

els.advancedToggle.onclick = () => {
  const hidden = els.advancedPanel.classList.toggle('hidden');
  els.advancedToggleText.textContent = hidden ? 'Show details' : 'Hide details';
};

els.addDirectBtn.onclick = () => {
  addItem(els.directItems, 'Direct Cost', { label: 'New direct cost', amount: 0 });
  render();
};

els.addOverheadBtn.onclick = () => {
  addItem(els.overheadItems, 'Overhead Cost', { label: 'New overhead cost', amount: 0 });
  render();
};

els.applyHelpersBtn.onclick = () => {
  applySimpleInputs();
  render();
};

els.applyBatchBtn.onclick = renderBatch;

els.generateQuoteBtn.onclick = () => {
  render();
  const issues = getMissingIssues();
  showMissingInputsNotice(issues);
  if (issues.length) alertMissingInputsIfNeeded(issues);
};

els.demoBtn.onclick = () => loadDemo();
els.saveQuoteBtn.onclick = () => saveQuote();
els.copySummaryBtn.onclick = copySummary;
els.copyFinanceBtn.onclick = copyFinance;
els.loadQuoteBtn.onclick = loadQuote;
els.deleteQuoteBtn.onclick = deleteQuote;
els.customerPdfBtn.onclick = generateCustomerPdf;
els.invoicePdfBtn.onclick = generateInvoicePdf;
els.printBtn.onclick = () => window.print();
els.resetBtn.onclick = () => resetPage();
els.readySendBtn.onclick = () => {
  toggleReadySend();
  render();
};

(async () => {
  try {
    await seedDefaults();
    refreshHistoryUI();
  } catch (err) {
    console.error(err);
    alert('Quote tool loaded, but automatic quote/invoice numbering could not be fetched from Supabase. Check your Supabase SQL function and permissions.');
    refreshHistoryUI();
    render();
  }
})();
