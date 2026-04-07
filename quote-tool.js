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
  orderType: $('orderType'), shippingMode: $('shippingMode'), readySendBtn: $('readySendBtn'),
  demoBtn: $('demoBtn'), saveQuoteBtn: $('saveQuoteBtn'), copySummaryBtn: $('copySummaryBtn'), customerPdfBtn: $('customerPdfBtn'), printBtn: $('printBtn'), resetBtn: $('resetBtn'),
  quoteNumber: $('quoteNumber'), quoteDate: $('quoteDate'), validThrough: $('validThrough'), turnaround: $('turnaround'), quoteTitle: $('quoteTitle'), customerName: $('customerName'), qty: $('qty'), unitsPerItem: $('unitsPerItem'), presetSelect: $('presetSelect'), depositPercent: $('depositPercent'), quoteStatus: $('quoteStatus'), quoteNotes: $('quoteNotes'), customerNotes: $('customerNotes'), assumptions: $('assumptions'),
  filamentCount: $('filamentCount'), spoolWeight: $('spoolWeight'), filament1Cost: $('filament1Cost'), filament1Used: $('filament1Used'), filament2Cost: $('filament2Cost'), filament2Used: $('filament2Used'), filament3Cost: $('filament3Cost'), filament3Used: $('filament3Used'), filament4Cost: $('filament4Cost'), filament4Used: $('filament4Used'), simplePackaging: $('simplePackaging'), simpleShipping: $('simpleShipping'), simpleHardware: $('simpleHardware'), designHours: $('designHours'), designRate: $('designRate'), postHours: $('postHours'), postRate: $('postRate'), machineHours: $('machineHours'), machineRate: $('machineRate'), marketplacePercent: $('marketplacePercent'), simpleSummary: $('simpleSummary'), generateQuoteBtn: $('generateQuoteBtn'),
  advancedToggle: $('advancedToggle'), advancedToggleText: $('advancedToggleText'), advancedPanel: $('advancedPanel'), directItems: $('directItems'), overheadItems: $('overheadItems'), addDirectBtn: $('addDirectBtn'), addOverheadBtn: $('addOverheadBtn'), applyHelpersBtn: $('applyHelpersBtn'), tpl: $('lineItemTemplate'),
  batchName: $('batchName'), batchSku: $('batchSku'), batchUnits: $('batchUnits'), batchColors: $('batchColors'), batchRollWeight: $('batchRollWeight'), batchPriceTarget: $('batchPriceTarget'), batchFilament1Cost: $('batchFilament1Cost'), batchFilament1Used: $('batchFilament1Used'), batchFilament2Cost: $('batchFilament2Cost'), batchFilament2Used: $('batchFilament2Used'), batchFilament3Cost: $('batchFilament3Cost'), batchFilament3Used: $('batchFilament3Used'), batchFilament4Cost: $('batchFilament4Cost'), batchFilament4Used: $('batchFilament4Used'), batchPackaging: $('batchPackaging'), batchLabor: $('batchLabor'), batchOther: $('batchOther'), batchOverhead: $('batchOverhead'), batchSold: $('batchSold'), batchLocation: $('batchLocation'), applyBatchBtn: $('applyBatchBtn'),
  profitMode: $('profitMode'), suggestedMode: $('suggestedMode'), profitValue: $('profitValue'), discount: $('discount'), taxPreset: $('taxPreset'), salesTax: $('salesTax'), roundingMode: $('roundingMode'),
  sumPerItem: $('sumPerItem'), sumMargin: $('sumMargin'), sumBreakEven: $('sumBreakEven'), profitGuardrail: $('profitGuardrail'), quoteConfidence: $('quoteConfidence'), sumDirect: $('sumDirect'), sumOverhead: $('sumOverhead'), sumProfit: $('sumProfit'), sumDeposit: $('sumDeposit'), sumBalance: $('sumBalance'), sumQuote: $('sumQuote'),
  outDirect: $('outDirect'), outOverhead: $('outOverhead'), outBase: $('outBase'), outProfit: $('outProfit'), outPerItem: $('outPerItem'), outBreakEven: $('outBreakEven'), outMargin: $('outMargin'), outPreDiscount: $('outPreDiscount'), outDiscount: $('outDiscount'), outBeforeTax: $('outBeforeTax'), outRoundedBeforeTax: $('outRoundedBeforeTax'), outRoundingGain: $('outRoundingGain'), outTax: $('outTax'), outDeposit: $('outDeposit'), outBalance: $('outBalance'), outFinal: $('outFinal'),
  quoteSummary: $('quoteSummary'), profitWarning: $('profitWarning'), financeReadyView: $('financeReadyView'), copyFinanceBtn: $('copyFinanceBtn'), customerQuoteView: $('customerQuoteView'),
  batchUnitCost: $('batchUnitCost'), batchTotalCost: $('batchTotalCost'), batchUnitsOut: $('batchUnitsOut'), batchUnsoldValue: $('batchUnsoldValue'), materialUnitCost: $('materialUnitCost'), activePreset: $('activePreset'), batchSummary: $('batchSummary'), inventoryReadyView: $('inventoryReadyView'),
  savedQuotesSelect: $('savedQuotesSelect'), loadQuoteBtn: $('loadQuoteBtn'), deleteQuoteBtn: $('deleteQuoteBtn'), historySummary: $('historySummary'),
  pdfTitle: $('pdfTitle'), pdfSubtitle: $('pdfSubtitle'), pdfQuoteNumber: $('pdfQuoteNumber'), pdfQuoteDate: $('pdfQuoteDate'), pdfValidThrough: $('pdfValidThrough'), pdfTurnaround: $('pdfTurnaround'), pdfStatus: $('pdfStatus'), pdfCustomerName: $('pdfCustomerName'), pdfQty: $('pdfQty'), pdfPerItem: $('pdfPerItem'), pdfProject: $('pdfProject'), pdfSubtotal: $('pdfSubtotal'), pdfTax: $('pdfTax'), pdfTotal: $('pdfTotal'), pdfDeposit: $('pdfDeposit'), pdfBalance: $('pdfBalance'), pdfCustomerNotes: $('pdfCustomerNotes'), pdfAssumptions: $('pdfAssumptions')
};

const STORAGE_KEY = 'olipoly_quote_history_v2';
const PRESETS = {
  custom: { name: 'Custom' },
  small_print: { name: 'Small Print', profit: 35, deposit: 50, packaging: 1.25, grams: 60, machineRate: 1 },
  medium_print: { name: 'Medium Print', profit: 40, deposit: 50, packaging: 2, grams: 120, machineRate: 1.25 },
  custom_job: { name: 'Custom Job', profit: 60, deposit: 60, designLabor: 35, postLabor: 20, machineRate: 1.5 },
  bagg_accessory: { name: 'Bogg Accessory', profit: 45, deposit: 50, packaging: 1.5, grams: 90, machineRate: 1 },
  beach_toy: { name: 'Beach Toy', profit: 35, deposit: 50, packaging: 1.25, grams: 120, machineRate: 1 },
  name_sign: { name: 'Name Sign', profit: 55, deposit: 60, packaging: 3, grams: 180, designLabor: 40, machineRate: 2 }
};

function defaultAssumptions() {
  const t = els.orderType.value || 'custom';
  const ship = els.shippingMode.value || 'pickup';
  const shippingLine = ship === 'pickup'
    ? 'Local pickup is assumed unless otherwise noted.'
    : ship === 'delivery'
    ? 'Local delivery pricing is estimated from the current delivery assumption and may adjust if destination changes.'
    : ship === 'ship_customer_label'
    ? 'Customer-provided shipping label is assumed and outbound shipping cost is not included in this quote.'
    : 'Shipping, if applicable, is estimated and may adjust if final packaging size, weight, or destination changes.';
  if (t === 'craft_show') return `Pricing is for pre-made inventory or event stock currently available or planned for a batch run. Final color appearance may vary slightly by filament brand and print settings. Quantities available may change as inventory sells. ${shippingLine}`;
  if (t === 'business_bulk') return `Quote is based on the listed quantity, materials, and expected production approach. Final schedule, delivery timing, and any packaging or labeling requirements should be confirmed at approval. Material color and finish may vary slightly by filament brand and production batch. ${shippingLine}`;
  if (t === 'repeat') return `Quote is based on a prior or repeat-style item using current material, labor, and machine assumptions. Minor variation in color, finish, or packaging may occur depending on current stock and print settings. ${shippingLine}`;
  return `Quote includes one proof/review round, standard finishing unless noted, and the materials and colors listed in this quote. Final color appearance may vary slightly by filament brand and print settings. ${shippingLine} Custom orders begin after quote approval and any required deposit.`;
}

function applyShippingMode() {
  const mode = els.shippingMode.value || 'pickup';
  if (mode === 'pickup') {
    if (!num(els.simpleShipping.value)) els.simpleShipping.value = 0;
  } else if (mode === 'ship_customer_label') {
    els.simpleShipping.value = 0;
  }
  const shippingText = mode === 'pickup'
    ? 'Local pickup is assumed unless otherwise noted.'
    : mode === 'delivery'
    ? 'Local delivery pricing is assumed based on the current delivery estimate.'
    : mode === 'ship_customer_label'
    ? 'Customer-provided shipping label is assumed; no outbound shipping charge is included in this quote.'
    : 'Shipping is estimated and may adjust if final packaging size, weight, or destination changes.';
  if (els.customerNotes.value && !els.customerNotes.value.includes('pickup') && !els.customerNotes.value.includes('Shipping')) {
    els.customerNotes.value = `${els.customerNotes.value.trim()} ${shippingText}`.trim();
  }
}

function applyOrderType() {
  const t = els.orderType.value || 'custom';
  const isCraft = t === 'craft_show';
  const isBulk = t === 'business_bulk';
  const isRepeat = t === 'repeat';
  els.customerName.placeholder = isBulk ? 'Business / buyer name' : 'Optional';
  els.turnaround.placeholder = isCraft ? 'Example: Ready for event date / in stock' : isBulk ? 'Example: staged delivery / production window' : 'Example: 5–7 business days';
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
  if (isCraft && els.profitMode.value === 'percent' && num(els.profitValue.value) < 35) els.profitValue.value = 35;
  if (isBulk && els.profitMode.value === 'percent' && num(els.profitValue.value) < 25) els.profitValue.value = 25;
  applyShippingMode();
}

function applyTaxPreset() {
  const map = { portage:7.25, summit:6.75, cuyahoga:8, franklin:7.5, custom:null, out_of_state:0 };
  const val = map[els.taxPreset.value];
  if (val !== null && val !== undefined) els.salesTax.value = val.toFixed(2);
}

function toggleReadySend() {
  document.body.classList.toggle('ready-send');
  const on = document.body.classList.contains('ready-send');
  els.readySendBtn.textContent = `Ready to Send: ${on ? 'On' : 'Off'}`;
  if (on) {
    if (!els.customerNotes.value.trim()) els.customerNotes.value = 'Custom 3D printed item quoted from the specifications discussed.';
    if (!els.assumptions.value.trim()) els.assumptions.value = defaultAssumptions();
  }
}

function rowValue(row) { return num(row.querySelector('.item-amount').value); }
function totalOf(container) { return [...container.children].reduce((sum, row) => sum + rowValue(row), 0); }

function addItem(target, title, data = {}) {
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.line-title').textContent = title;
  node.querySelector('.item-label').value = data.label || '';
  node.querySelector('.item-type').value = data.type || 'per_order';
  node.querySelector('.item-amount').value = data.amount ?? 0;
  node.querySelector('.item-note').value = data.note || '';
  node.querySelectorAll('input,select').forEach(el => el.addEventListener('input', render));
  node.querySelector('.removeBtn').onclick = () => { node.remove(); render(); };
  target.appendChild(node);
}

function simpleMaterialTotal() {
  const count = Math.max(1, Math.min(4, num(els.filamentCount.value) || 1));
  const weight = Math.max(1, num(els.spoolWeight.value) || 1000);
  let total = 0;
  for (let i = 1; i <= count; i++) total += (num(els[`filament${i}Used`].value) / weight) * num(els[`filament${i}Cost`].value);
  return total;
}

function applySimpleInputs() {
  const labels = [...els.directItems.children];
  const overhead = [...els.overheadItems.children];
  const mat = simpleMaterialTotal();
  const colorCount = Math.max(1, Math.min(4, num(els.filamentCount.value) || 1));
  if (labels[0]) { labels[0].querySelector('.item-label').value = `Filament / Material (${colorCount} color${colorCount === 1 ? '' : 's'})`; labels[0].querySelector('.item-amount').value = mat.toFixed(2); }
  if (labels[1]) { labels[1].querySelector('.item-label').value = 'Packaging'; labels[1].querySelector('.item-amount').value = num(els.simplePackaging.value).toFixed(2); }
  if (labels[2]) { labels[2].querySelector('.item-label').value = 'Shipping'; labels[2].querySelector('.item-amount').value = num(els.simpleShipping.value).toFixed(2); }
  if (labels[3]) { labels[3].querySelector('.item-label').value = 'Hardware / Inserts / Magnets'; labels[3].querySelector('.item-amount').value = num(els.simpleHardware.value).toFixed(2); }
  if (overhead[0]) { overhead[0].querySelector('.item-label').value = 'Design Labor'; overhead[0].querySelector('.item-amount').value = (num(els.designHours.value) * num(els.designRate.value)).toFixed(2); }
  if (overhead[1]) { overhead[1].querySelector('.item-label').value = 'Machine Time'; overhead[1].querySelector('.item-amount').value = (num(els.machineHours.value) * num(els.machineRate.value)).toFixed(2); }
  if (overhead[2]) { overhead[2].querySelector('.item-label').value = 'Post-Process Labor'; overhead[2].querySelector('.item-amount').value = (num(els.postHours.value) * num(els.postRate.value)).toFixed(2); }
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
  for (let i = 1; i <= colors; i++) material += (num(els[`batchFilament${i}Used`].value) / weight) * num(els[`batchFilament${i}Cost`].value);
  const units = Math.max(1, num(els.batchUnits.value) || 1);
  const total = material + num(els.batchPackaging.value) + num(els.batchLabor.value) + num(els.batchOther.value) + num(els.batchOverhead.value);
  const sold = Math.min(units, Math.max(0, num(els.batchSold.value) || 0));
  const unit = total / units;
  const unsold = units - sold;
  const target = num(els.batchPriceTarget.value);
  return { units, total, unit, sold, unsold, unsoldValue: unsold * unit, soldCost: sold * unit, target, revenue: sold * target, profit: sold * target - sold * unit };
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
    `Notes: Customer: ${els.customerName.value || 'N/A'} | Quote #: ${els.quoteNumber.value || 'N/A'}`
  ].join('\n');
}

function fillCustomerPdf(total, beforeTax, tax, deposit, balance, perItem) {
  els.pdfTitle.textContent = els.quoteTitle.value.trim() || 'Customer Quote';
  els.pdfSubtitle.textContent = els.customerNotes.value.trim() || 'Custom 3D printing quote prepared for your order.';
  els.pdfQuoteNumber.textContent = els.quoteNumber.value || '—';
  els.pdfQuoteDate.textContent = els.quoteDate.value || '—';
  els.pdfValidThrough.textContent = els.validThrough.value || '—';
  els.pdfTurnaround.textContent = els.turnaround.value || '—';
  els.pdfStatus.textContent = (els.quoteStatus.value || 'pending').replace(/^./, m => m.toUpperCase());
  els.pdfCustomerName.textContent = els.customerName.value.trim() || '—';
  els.pdfQty.textContent = String(Math.max(1, num(els.qty.value) || 1));
  els.pdfPerItem.textContent = money(perItem);
  els.pdfProject.textContent = els.quoteTitle.value.trim() || '—';
  els.pdfSubtotal.textContent = money(beforeTax);
  els.pdfTax.textContent = money(tax);
  els.pdfTotal.textContent = money(total);
  els.pdfDeposit.textContent = money(deposit);
  els.pdfBalance.textContent = money(balance);
  els.pdfCustomerNotes.textContent = els.customerNotes.value.trim() || 'No customer-facing notes added yet.';
  els.pdfAssumptions.textContent = els.assumptions.value.trim() || 'No exclusions or assumptions added yet.';
  const checklist = ['☐ Quote approved'];
  if (num(els.depositPercent.value) > 0) checklist.push('☐ Deposit received');
  checklist.push('☐ Files/design confirmed');
  checklist.push('☐ Colors/materials confirmed');
  checklist.push(els.shippingMode.value === 'pickup' ? '☐ Pickup arranged' : '☐ Shipping method confirmed');
  const el = $('pdfChecklist');
  if (el) el.innerHTML = `<strong>Order Checklist</strong><br>${checklist.join('<br>')}`;
}

function renderBatch() {
  const b = batchValues();
  els.batchUnitCost.textContent = money(b.unit);
  els.batchTotalCost.textContent = money(b.total);
  els.batchUnitsOut.textContent = String(b.units);
  els.batchUnsoldValue.textContent = money(b.unsoldValue);
  els.batchSummary.textContent = `${els.batchName.value.trim() || 'This batch'}: ${b.units} total units at ${money(b.unit)} each. If you sell ${b.sold}, estimated COGS is ${money(b.soldCost)} and remaining unsold inventory value is ${money(b.unsoldValue)} across ${b.unsold} unit${b.unsold === 1 ? '' : 's'}.`;
  els.inventoryReadyView.textContent = `Inventory-ready output → Product: ${els.batchName.value || 'N/A'} | SKU: ${els.batchSku.value || 'N/A'} | Units made: ${b.units} | Unit cost: ${b.unit.toFixed(2)} | Units sold: ${b.sold} | Unsold units: ${b.unsold} | Unsold value: ${b.unsoldValue.toFixed(2)} | Target sell price each: ${b.target.toFixed(2)} | Estimated sold revenue: ${b.revenue.toFixed(2)} | Estimated sold profit: ${b.profit.toFixed(2)} | Location: ${els.batchLocation.value || 'N/A'}`;
}

function render() {
  applySimpleInputs();
  const materialTotal = simpleMaterialTotal();
  const machineTotal = num(els.machineHours.value) * num(els.machineRate.value);
  const designTotal = num(els.designHours.value) * num(els.designRate.value);
  const postTotal = num(els.postHours.value) * num(els.postRate.value);
  els.materialUnitCost.textContent = money(materialTotal / Math.max(1, num(els.qty.value) || 1));
  els.simpleSummary.textContent = `Simple inputs: ${money(materialTotal)} material, ${money(els.simplePackaging.value)} packaging, ${money(els.simpleShipping.value)} shipping, ${money(els.simpleHardware.value)} hardware, ${money(designTotal)} design labor, ${money(machineTotal)} machine time, ${money(postTotal)} post-process labor.`;
  const suggested = suggestedProfitPercent();
  if (suggested != null && els.profitMode.value === 'percent') els.profitValue.value = suggested;

  const direct = totalOf(els.directItems);
  let overhead = totalOf(els.overheadItems);
  overhead += (direct + overhead) * (num(els.marketplacePercent.value) / 100);
  const base = direct + overhead;
  const profit = els.profitMode.value === 'flat' ? num(els.profitValue.value) : base * (num(els.profitValue.value) / 100);
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
    sumDirect: direct, sumOverhead: overhead, sumProfit: actualProfit, sumDeposit: deposit, sumBalance: balance, sumQuote: finalQuote, sumPerItem: perItem, sumBreakEven: base,
    outDirect: direct, outOverhead: overhead, outBase: base, outProfit: actualProfit, outPerItem: perItem, outBreakEven: base, outPreDiscount: preDiscount,
    outBeforeTax: beforeTaxRaw, outRoundedBeforeTax: beforeTax, outRoundingGain: roundingGain, outTax: tax, outDeposit: deposit, outBalance: balance, outFinal: finalQuote
  };
  Object.entries(pairs).forEach(([k, v]) => { if (els[k]) els[k].textContent = money(v); });
  els.sumMargin.textContent = `${marginPct.toFixed(1)}%`;
  els.outMargin.textContent = `${marginPct.toFixed(1)}%`;
  els.outDiscount.textContent = `-${money(discount)}`;
  els.profitGuardrail.textContent = (actualProfit < 5 || marginPct < 25) ? 'Warning' : 'OK';
  els.activePreset.textContent = PRESETS[els.presetSelect.value]?.name || 'Custom';
  els.quoteSummary.textContent = `${els.quoteTitle.value.trim() || 'Untitled quote'}${els.customerName.value ? ` for ${els.customerName.value}` : ''}: ${qty} item${qty === 1 ? '' : 's'}, ${money(direct)} direct costs, ${money(overhead)} overhead, ${money(actualProfit)} actual profit, ${money(deposit)} deposit, ${money(balance)} balance, final quoted total ${money(finalQuote)}${num(els.salesTax.value) ? ' including tax' : ''}${roundingGain ? ` after ${money(roundingGain)} smart rounding` : ''}.`;
  els.profitWarning.textContent = actualProfit < 5 || marginPct < 25 ? `Warning: profit is ${money(actualProfit)} and margin is ${marginPct.toFixed(1)}%. Consider increasing price.` : 'No pricing warnings.';

  const issues = [];
  if (materialTotal <= 0) issues.push('No material entered');
  if (machineTotal <= 0) issues.push('No machine time entered');
  if (designTotal <= 0 && postTotal <= 0 && qty === 1) issues.push('No labor entered');
  if (els.shippingMode.value === 'ship_estimated' && num(els.simpleShipping.value) <= 0) issues.push('Shipping estimate missing');
  if (!els.quoteTitle.value.trim()) issues.push('Missing quote title');
  if (!els.turnaround.value.trim()) issues.push('Missing turnaround');
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
  if (issues.length) els.profitWarning.textContent = `${els.profitWarning.textContent === 'No pricing warnings.' ? '' : els.profitWarning.textContent + ' '}Check: ${issues.join(', ')}.`.trim();

  els.customerQuoteView.innerHTML = [
    `<div style="margin-bottom:12px;"><strong>${els.quoteTitle.value.trim() || 'Quote'}</strong></div>`,
    `<div style="margin-bottom:12px;">${els.quoteNumber.value ? `Quote #: ${els.quoteNumber.value}<br>` : ''}${els.quoteDate.value ? `Date: ${els.quoteDate.value}<br>` : ''}${els.validThrough.value ? `Valid Through: ${els.validThrough.value}<br>` : ''}${els.turnaround.value ? `Turnaround: ${els.turnaround.value}` : ''}</div>`,
    `<div style="margin-bottom:12px;">${els.customerName.value ? `Customer: ${els.customerName.value}<br>` : ''}Quantity: ${qty}</div>`,
    `<div style="margin-bottom:12px;">Subtotal: ${money(beforeTax)}${num(els.salesTax.value) ? `<br>Sales tax: ${money(tax)}` : ''}<br><strong>Total quote: ${money(finalQuote)}</strong></div>`,
    `<div style="margin-bottom:12px;">Deposit due: ${money(deposit)}<br>Balance due: ${money(balance)}</div>`,
    `<div style="margin-bottom:12px;">${els.customerNotes.value.trim() || 'No customer-facing notes added yet.'}</div>`,
    `<div style="margin-bottom:12px;">${els.assumptions.value.trim() || 'No exclusions or assumptions added yet.'}</div>`
  ].join('');

  fillCustomerPdf(finalQuote, beforeTax, tax, deposit, balance, perItem);
  els.financeReadyView.textContent = financeEntryText(finalQuote, beforeTax, tax);
  renderBatch();
}

function setPreset(name) {
  const p = PRESETS[name] || PRESETS.custom;
  if (p.profit != null) els.profitValue.value = p.profit;
  if (p.deposit != null) els.depositPercent.value = p.deposit;
  if (p.packaging != null) els.simplePackaging.value = p.packaging;
  if (p.grams != null) els.filament1Used.value = p.grams;
  if (p.designLabor != null) { els.designRate.value = p.designLabor; els.designHours.value = 1; }
  if (p.postLabor != null) { els.postRate.value = p.postLabor; els.postHours.value = 1; }
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
    quoteNumber: els.quoteNumber.value || `Q-${Date.now()}`,
    quoteDate: els.quoteDate.value, validThrough: els.validThrough.value, turnaround: els.turnaround.value,
    quoteTitle: els.quoteTitle.value, customerName: els.customerName.value, qty: els.qty.value, unitsPerItem: els.unitsPerItem.value,
    presetSelect: els.presetSelect.value, depositPercent: els.depositPercent.value, quoteStatus: els.quoteStatus.value,
    quoteNotes: els.quoteNotes.value, customerNotes: els.customerNotes.value, assumptions: els.assumptions.value,
    suggestedMode: els.suggestedMode.value, profitMode: els.profitMode.value, profitValue: els.profitValue.value, discount: els.discount.value,
    taxPreset: els.taxPreset.value, salesTax: els.salesTax.value, roundingMode: els.roundingMode.value,
    orderType: els.orderType.value, shippingMode: els.shippingMode.value,
    filamentCount: els.filamentCount.value, spoolWeight: els.spoolWeight.value,
    filament1Cost: els.filament1Cost.value, filament1Used: els.filament1Used.value,
    filament2Cost: els.filament2Cost.value, filament2Used: els.filament2Used.value,
    filament3Cost: els.filament3Cost.value, filament3Used: els.filament3Used.value,
    filament4Cost: els.filament4Cost.value, filament4Used: els.filament4Used.value,
    simplePackaging: els.simplePackaging.value, simpleShipping: els.simpleShipping.value, simpleHardware: els.simpleHardware.value,
    designHours: els.designHours.value, designRate: els.designRate.value, postHours: els.postHours.value, postRate: els.postRate.value,
    machineHours: els.machineHours.value, machineRate: els.machineRate.value, marketplacePercent: els.marketplacePercent.value,
    batchName: els.batchName.value, batchSku: els.batchSku.value, batchUnits: els.batchUnits.value, batchColors: els.batchColors.value,
    batchRollWeight: els.batchRollWeight.value, batchPriceTarget: els.batchPriceTarget.value,
    batchFilament1Cost: els.batchFilament1Cost.value, batchFilament1Used: els.batchFilament1Used.value,
    batchFilament2Cost: els.batchFilament2Cost.value, batchFilament2Used: els.batchFilament2Used.value,
    batchFilament3Cost: els.batchFilament3Cost.value, batchFilament3Used: els.batchFilament3Used.value,
    batchFilament4Cost: els.batchFilament4Cost.value, batchFilament4Used: els.batchFilament4Used.value,
    batchPackaging: els.batchPackaging.value, batchLabor: els.batchLabor.value, batchOther: els.batchOther.value, batchOverhead: els.batchOverhead.value,
    batchSold: els.batchSold.value, batchLocation: els.batchLocation.value,
    directItems: getRowsData(els.directItems), overheadItems: getRowsData(els.overheadItems), savedAt: new Date().toISOString()
  };
}

function readHistory() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function writeHistory(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); refreshHistoryUI(); }

function refreshHistoryUI() {
  const list = readHistory().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const current = els.savedQuotesSelect.value;
  els.savedQuotesSelect.innerHTML = '<option value="">Select a saved quote</option>' + list.map(q => `<option value="${q.quoteNumber}">${q.quoteNumber} — ${q.quoteTitle || 'Untitled'} (${q.quoteStatus})</option>`).join('');
  if (list.some(q => q.quoteNumber === current)) els.savedQuotesSelect.value = current;
  els.historySummary.textContent = list.length ? `${list.length} saved quote${list.length === 1 ? '' : 's'} in this browser. Latest: ${list[0].quoteNumber} — ${list[0].quoteTitle || 'Untitled'} (${list[0].quoteStatus}).` : 'No saved quotes yet.';
}

function saveQuote() {
  const snap = snapshotQuote();
  els.quoteNumber.value = snap.quoteNumber;
  const list = readHistory();
  const idx = list.findIndex(q => q.quoteNumber === snap.quoteNumber);
  if (idx >= 0) list[idx] = snap; else list.push(snap);
  writeHistory(list);
  els.savedQuotesSelect.value = snap.quoteNumber;
  els.saveQuoteBtn.textContent = 'Saved';
  setTimeout(() => els.saveQuoteBtn.textContent = 'Save Quote', 1200);
}

function loadQuote() {
  const id = els.savedQuotesSelect.value;
  if (!id) return;
  const q = readHistory().find(x => x.quoteNumber === id);
  if (!q) return;
  if (q.quoteStatus === 'accepted' && !window.confirm('This quote is marked accepted. Editing it may change the price after it was sent or approved. Continue loading it for editing?')) return;
  Object.entries(q).forEach(([k, v]) => { if (els[k] && typeof v !== 'object') els[k].value = v; });
  els.directItems.innerHTML = '';
  els.overheadItems.innerHTML = '';
  (q.directItems || []).forEach(item => addItem(els.directItems, 'Direct Cost', item));
  (q.overheadItems || []).forEach(item => addItem(els.overheadItems, 'Overhead Cost', item));
  render();
}

function deleteQuote() {
  const id = els.savedQuotesSelect.value;
  if (!id) return;
  writeHistory(readHistory().filter(q => q.quoteNumber !== id));
  els.savedQuotesSelect.value = '';
}

async function copySummary() {
  const text = `${els.quoteSummary.textContent}\n\n${els.customerQuoteView.innerText}`;
  try {
    await navigator.clipboard.writeText(text);
    els.copySummaryBtn.textContent = 'Copied';
    setTimeout(() => els.copySummaryBtn.textContent = 'Copy Summary', 1200);
  } catch {
    alert('Could not copy summary.');
  }
}

async function copyFinance() {
  try {
    await navigator.clipboard.writeText(els.financeReadyView.textContent);
    els.copyFinanceBtn.textContent = 'Copied';
    setTimeout(() => els.copyFinanceBtn.textContent = 'Copy Finance Entry', 1200);
  } catch {
    alert('Could not copy finance entry.');
  }
}

function generateCustomerPdf() { render(); window.print(); }

function seedDefaults() {
  addItem(els.directItems, 'Direct Cost', { label: 'Filament / Material', amount: 0 });
  addItem(els.directItems, 'Direct Cost', { label: 'Packaging', amount: 0 });
  addItem(els.directItems, 'Direct Cost', { label: 'Shipping', amount: 0 });
  addItem(els.directItems, 'Direct Cost', { label: 'Hardware / Inserts / Magnets', amount: 0 });
  addItem(els.overheadItems, 'Overhead Cost', { label: 'Design Labor', amount: 0 });
  addItem(els.overheadItems, 'Overhead Cost', { label: 'Machine Time', amount: 0 });
  addItem(els.overheadItems, 'Overhead Cost', { label: 'Post-Process Labor', amount: 0 });
  els.quoteDate.value = today();
  els.validThrough.value = addDays(today(), 14);
  if (!els.assumptions.value.trim()) els.assumptions.value = defaultAssumptions();
  render();
}

function resetPage() {
  ['quoteNumber','quoteTitle','customerName','quoteNotes','customerNotes','assumptions','batchName','batchSku','batchLocation','turnaround'].forEach(k => els[k].value = '');
  els.orderType.value = 'custom';
  els.shippingMode.value = 'pickup';
  els.quoteStatus.value = 'pending';
  els.quoteDate.value = today();
  els.validThrough.value = addDays(today(), 14);
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
  ['filament1Cost','filament1Used','filament2Cost','filament2Used','filament3Cost','filament3Used','filament4Cost','filament4Used','simplePackaging','simpleShipping','simpleHardware','designHours','designRate','postHours','postRate','machineHours','machineRate','marketplacePercent','batchFilament1Cost','batchFilament1Used','batchFilament2Cost','batchFilament2Used','batchFilament3Cost','batchFilament3Used','batchFilament4Cost','batchFilament4Used','batchPackaging','batchLabor','batchOther','batchOverhead','batchPriceTarget'].forEach(k => els[k].value = 0);
  els.filamentCount.value = 1;
  els.spoolWeight.value = 1000;
  els.batchRollWeight.value = 1000;
  els.batchColors.value = 1;
  els.batchUnits.value = 1;
  els.batchSold.value = 0;
  els.directItems.innerHTML = '';
  els.overheadItems.innerHTML = '';
  applyOrderType();
  applyTaxPreset();
  seedDefaults();
  refreshHistoryUI();
}

function loadDemo() {
  resetPage();
  els.quoteNumber.value = 'Q-1042';
  els.orderType.value = 'custom';
  els.shippingMode.value = 'ship_estimated';
  els.quoteTitle.value = 'Custom beach toy order';
  els.customerName.value = 'Sample Customer';
  els.turnaround.value = '5–7 business days';
  els.qty.value = 2;
  els.profitValue.value = 35;
  els.salesTax.value = 7.25;
  els.customerNotes.value = 'Includes 2 custom beach toys in selected colors. Shipping or pickup handled as arranged.';
  els.assumptions.value = defaultAssumptions();
  els.filamentCount.value = 2;
  els.filament1Cost.value = 20;
  els.filament1Used.value = 120;
  els.filament2Cost.value = 22;
  els.filament2Used.value = 35;
  els.simplePackaging.value = 1.25;
  els.simpleShipping.value = 4.5;
  els.simpleHardware.value = 0.75;
  els.designHours.value = 1;
  els.designRate.value = 6;
  els.machineHours.value = 1.5;
  els.machineRate.value = 1;
  els.postHours.value = 1;
  els.postRate.value = 2.25;
  render();
}

const renderIds = ['orderType','shippingMode','quoteNumber','quoteDate','validThrough','turnaround','quoteTitle','customerName','qty','unitsPerItem','quoteNotes','customerNotes','assumptions','quoteStatus','profitMode','profitValue','discount','taxPreset','salesTax','roundingMode','depositPercent','presetSelect','suggestedMode','filamentCount','spoolWeight','filament1Cost','filament1Used','filament2Cost','filament2Used','filament3Cost','filament3Used','filament4Cost','filament4Used','simplePackaging','simpleShipping','simpleHardware','designHours','designRate','postHours','postRate','machineHours','machineRate','marketplacePercent','batchName','batchSku','batchUnits','batchColors','batchRollWeight','batchPriceTarget','batchFilament1Cost','batchFilament1Used','batchFilament2Cost','batchFilament2Used','batchFilament3Cost','batchFilament3Used','batchFilament4Cost','batchFilament4Used','batchPackaging','batchLabor','batchOther','batchOverhead','batchSold','batchLocation'];
renderIds.forEach(id => {
  if (!els[id]) return;
  els[id].addEventListener('input', render);
  els[id].addEventListener('change', render);
});

els.presetSelect.onchange = () => setPreset(els.presetSelect.value);
els.orderType.onchange = () => { applyOrderType(); render(); };
els.shippingMode.onchange = () => { applyShippingMode(); render(); };
els.taxPreset.onchange = () => { applyTaxPreset(); render(); };
els.roundingMode.onchange = render;
els.advancedToggle.onclick = () => {
  const hidden = els.advancedPanel.classList.toggle('hidden');
  els.advancedToggleText.textContent = hidden ? 'Show details' : 'Hide details';
};
els.addDirectBtn.onclick = () => { addItem(els.directItems, 'Direct Cost', { label: 'New direct cost', amount: 0 }); render(); };
els.addOverheadBtn.onclick = () => { addItem(els.overheadItems, 'Overhead Cost', { label: 'New overhead cost', amount: 0 }); render(); };
els.applyHelpersBtn.onclick = () => { applySimpleInputs(); render(); };
els.applyBatchBtn.onclick = renderBatch;
els.generateQuoteBtn.onclick = render;
els.demoBtn.onclick = loadDemo;
els.saveQuoteBtn.onclick = saveQuote;
els.copySummaryBtn.onclick = copySummary;
els.copyFinanceBtn.onclick = copyFinance;
els.loadQuoteBtn.onclick = loadQuote;
els.deleteQuoteBtn.onclick = deleteQuote;
els.customerPdfBtn.onclick = generateCustomerPdf;
els.printBtn.onclick = () => window.print();
els.resetBtn.onclick = resetPage;
els.readySendBtn.onclick = () => { toggleReadySend(); render(); };

seedDefaults();
refreshHistoryUI();
