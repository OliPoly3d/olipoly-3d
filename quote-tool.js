// ==========================
// BASIC HELPERS
// ==========================
const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;
const money = v =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(num(v));

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const d = new Date(dateStr || today());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ==========================
// ELEMENT MAP
// ==========================
const els = {
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

  qty: $('qty'),
  depositPercent: $('depositPercent'),

  profitMode: $('profitMode'),
  profitValue: $('profitValue'),
  discount: $('discount'),
  salesTax: $('salesTax'),
  roundingMode: $('roundingMode'),

  directItems: $('directItems'),
  overheadItems: $('overheadItems'),

  outFinal: $('outFinal'),
  outDeposit: $('outDeposit'),
  outBalance: $('outBalance'),
  outPerItem: $('outPerItem'),

  quoteSummary: $('quoteSummary'),

  customerPdfBtn: $('customerPdfBtn'),
  invoicePdfBtn: $('invoicePdfBtn'),
  saveQuoteBtn: $('saveQuoteBtn')
};

// ==========================
// CORE CALCULATION
// ==========================
function calculateTotals() {
  const direct = [...els.directItems.children].reduce(
    (sum, row) =>
      sum + num(row.querySelector('.item-amount')?.value),
    0
  );

  const overhead = [...els.overheadItems.children].reduce(
    (sum, row) =>
      sum + num(row.querySelector('.item-amount')?.value),
    0
  );

  const base = direct + overhead;

  let profit =
    els.profitMode.value === 'flat'
      ? num(els.profitValue.value)
      : base * (num(els.profitValue.value) / 100);

  const preDiscount = base + profit;

  const discount = Math.min(
    num(els.discount.value),
    preDiscount
  );

  const beforeTax = preDiscount - discount;

  const tax = beforeTax * (num(els.salesTax.value) / 100);

  let final = beforeTax + tax;

  // rounding
  const step = num(els.roundingMode.value);
  if (step > 0) {
    final = Math.round(final / step) * step;
  }

  const qty = Math.max(1, num(els.qty.value));

  const perItem = final / qty;
  const deposit = final * (num(els.depositPercent.value) / 100);
  const balance = final - deposit;

  return {
    direct,
    overhead,
    base,
    profit,
    final,
    perItem,
    deposit,
    balance,
    tax
  };
}

// ==========================
// RENDER
// ==========================
function render() {
  const r = calculateTotals();

  els.outFinal.textContent = money(r.final);
  els.outDeposit.textContent = money(r.deposit);
  els.outBalance.textContent = money(r.balance);
  els.outPerItem.textContent = money(r.perItem);

  els.quoteSummary.textContent =
    `${els.quoteTitle.value || 'Quote'}: ${money(r.final)} total, ${money(r.deposit)} deposit, ${money(r.balance)} balance.`;
}

// ==========================
// PDF GENERATION
// ==========================
function generatePdf(type) {
  render();
  window.print();
}

// ==========================
// SAVE (LOCAL ONLY)
// ==========================
function saveQuote() {
  const data = {
    quoteNumber: els.quoteNumber.value,
    title: els.quoteTitle.value,
    total: els.outFinal.textContent
  };

  localStorage.setItem(
    'last_quote',
    JSON.stringify(data)
  );

  alert('Quote saved locally');
}

// ==========================
// EVENT HOOKS
// ==========================
document.querySelectorAll('input, select').forEach(el => {
  el.addEventListener('input', render);
});

els.customerPdfBtn.onclick = () => generatePdf('quote');
els.invoicePdfBtn.onclick = () => generatePdf('invoice');
els.saveQuoteBtn.onclick = saveQuote;

// ==========================
// INIT
// ==========================
function init() {
  els.quoteDate.value = today();
  els.invoiceDate.value = today();
  els.validThrough.value = addDays(today(), 14);
  els.paymentDueDate.value = addDays(today(), 14);

  if (!els.quoteNumber.value) {
    els.quoteNumber.value =
      'Q-' + Date.now().toString().slice(-6);
  }

  if (!els.invoiceNumber.value) {
    els.invoiceNumber.value =
      els.quoteNumber.value.replace('Q', 'INV');
  }

  render();
}

init();
