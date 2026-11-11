(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const uid = () => root.crypto?.randomUUID?.() || `sample-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pickupAddress = '990 Aurora Hudson Rd, Aurora, OH 44202';
  const pickupQuoteNote = 'This quote is priced for customer pickup. If you choose shipping or local delivery, we’ll confirm the additional charge and updated total, including any applicable sales tax, before dispatch.';
  const fulfillmentMilestones = {
    pending: ['Ready · fulfillment to be arranged', 'Fulfilled'],
    pickup: ['Ready for pickup', 'Picked up'],
    shipping: ['Ready to ship', 'Shipped'],
    delivery: ['Ready for local delivery', 'Delivered']
  };
  function fulfillmentMethod(order) {
    return order.historicalCompletion?.method || (order.shipment ? 'shipping' : order.shippingDraft ? 'pending' : order.fulfillmentPlan?.method || (order.fulfilled ? 'pickup' : 'pending'));
  }
  function quoteFulfillmentNote(order) {
    if (order.preset === 'business' || order.customerNotes?.includes(pickupQuoteNote)) return '';
    if (!order.taxAddress || order.taxAddress === pickupAddress) return pickupQuoteNote;
    return 'Shipping and local delivery are billed separately if selected. We’ll confirm the charge and updated total, including any applicable sales tax, before dispatch.';
  }
  const materialKey = material => [material.material, material.color].join(' / ');
  function number(value, label, integer = false) {
    const n = Number(value);
    if (value === '' || !Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
      throw new Error(`${label} must be a nonnegative ${integer ? 'whole number' : 'number'}.`);
    }
    return n;
  }
  function seed() {
    return {version: 1, revision: 0, inventory: [
      {key: 'PETG / Black', grams: 2000, cost: 0.023},
      {key: 'PLA / White', grams: 1000, cost: 0.023},
      {key: 'PLA / Black', grams: 1500, cost: 0.023}
    ], orders: [{
      id: 'sample-mixed-order', reference: 'SAMPLE-001', customer: 'Sample customer',
      title: 'A small custom project', preset: 'individual', status: 'draft',
      evidence: 'Drawing', taxRate: 7, taxIncluded: true, taxExempt: false,
      county: 'Portage', designFee: 20, laborRate: 30,
      estimatedLabor: 0.5, actualLabor: 0, otherCosts: 0, terms: 'Payment at pickup',
      approval: '', released: false, fulfilled: false, payments: [], runs: [],
      items: [
        {id: 'blocks', description: 'Support blocks', quantity: 2, unit_price: 30, hours_each: 2,
          materials: [{material: 'PETG', color: 'Black', grams_each: 80}, {material: 'PLA', color: 'White', grams_each: 10}]},
        {id: 'tags', description: 'Personalized nameplates', quantity: 3, unit_price: 10, hours_each: 0.5,
          materials: [{material: 'PLA', color: 'Black', grams_each: 15}]}
      ]
    }]};
  }
  function totals(order) {
    const items = copy(order.items);
    if (Number(order.designFee)) items.push({id: 'design-charge', description: 'Design / preparation', quantity: 1, unit_price: Number(order.designFee)});
    return root.calculateQuoteTotals({lineItems: items, taxRate: order.taxRate,
      taxExempt: order.taxExempt, taxIncluded: order.taxIncluded, depositPercent: 0});
  }
  const stages = [
    ['request', 'New request'], ['quoting', 'Preparing quote'], ['awaiting', 'Awaiting approval'],
    ['approved', 'Quote approved'], ['queued', 'Queued for production'], ['printing', 'In progress'],
    ['ready', 'Ready for fulfillment'], ['label', 'Label purchased'], ['invoice', 'Awaiting invoice'], ['payment', 'Awaiting payment'], ['complete', 'Completed']
  ];
  function stage(order) {
    if (!order.snapshot) return order.quoteStage === 'request' ? 'request' : order.quoteStage === 'sent' ? 'awaiting' : 'quoting';
    if (order.fulfilled && order.poReview && !order.invoice) return 'invoice';
    if (order.fulfilled) return balance(order) === 0 ? 'complete' : 'payment';
    if (order.shipment) return 'label';
    if (!order.released) return 'approved';
    if (order.runs.some(run => run.status === 'printing')) return 'printing';
    if (order.items.every(item => remaining(order, item) === 0)) return 'ready';
    return 'queued';
  }
  function nextStep(order) {
    return {
      request: ['Review request', 'request'], quoting: ['Prepare quote', 'details'], awaiting: ['Review quote / approval', 'quote'],
      approved: ['Release to production', 'production'], queued: ['Start next run', 'production'], printing: ['Finish & inspect', 'production'],
      ready: ['Arrange fulfillment', 'pickup'], label: ['Record carrier handoff', 'pickup'],
      invoice: ['Review & issue invoice', 'invoice'], payment: ['Record payment', 'money'], complete: ['View receipt', 'receipt']
    }[stage(order)];
  }
  function queue(state, filter = 'open', search = '') {
    const query = search.trim().toLowerCase();
    return state.orders.filter(order => (filter === 'all' || (filter === 'open' ? stage(order) !== 'complete' : stage(order) === filter)) &&
      `${order.customer} ${order.title} ${order.reference} ${order.database?.quoteNumber || ''} ${order.database?.orderNumber || ''} ${order.intake?.contact || ''} ${order.intake?.summary || ''}`.toLowerCase().includes(query))
      .slice().sort((a, b) => {
        // Dated work first; undated work retains its existing insertion order.
        const dateA = a.intake?.neededBy || '9999-12-31';
        const dateB = b.intake?.neededBy || '9999-12-31';
        return dateA.localeCompare(dateB);
      });
  }
  function projectIdentity(order) {
    const primary = order.database?.orderNumber || order.reference;
    const quote = order.database?.quoteNumber;
    return {primary, legacyQuote: quote && quote !== primary ? quote : ''};
  }
  function productionQueue(state) {
    return queue(state, 'all').filter(order => order.snapshot && !order.fulfilled);
  }
  function newRequest() {
    const order = copy(seed().orders[0]);
    Object.assign(order, {id: uid(), reference: 'NEW REQUEST', customer: '', title: '', quoteStage: 'request',
      designFee: 0, estimatedLabor: 0, evidence: 'Idea / reference',
      intake: {source: 'Email / PO', contact: '', summary: '', neededBy: '', fileReference: '', materialPreference: 'Not decided'},
      taxAddress: pickupAddress, turnaround: '', validUntil: '', customerNotes: '', quoteHistory: []});
    order.items = [{id: uid(), description: 'Requested component', quantity: 1, unit_price: 0, hours_each: 0, materials: []}];
    return order;
  }
  function quoteCommand(original, orderId, action) {
    const state = copy(original);
    const current = state.orders.find(row => row.id === orderId);
    if (!current || current.snapshot) throw new Error('Open an unapproved request or quote.');
    const order = copy(current);
    if (action.type === 'prepare_quote') {
      if (order.quoteStage !== 'request') throw new Error('This request is already being quoted.');
      order.quoteStage = 'draft';
    } else if (action.type === 'send_quote') {
      if (order.quoteStage === 'request') throw new Error('Prepare the quote before marking it sent.');
      if (order.quoteStage === 'sent') throw new Error('This quote is already awaiting approval.');
      if (!order.customer.trim() || !order.title.trim()) throw new Error('Save the customer and project first.');
      const offer = {revision: (order.quoteHistory?.length || 0) + 1, sentAt: new Date().toISOString(),
        sharedVia: String(action.via || 'Email'), customer: order.customer, title: order.title,
        items: copy(order.items), totals: copy(totals(order)), terms: order.terms,
        turnaround: order.turnaround || '', validUntil: order.validUntil || '',
        customerNotes: order.customerNotes || '', fulfillmentNote: quoteFulfillmentNote(order), changeReason: order.revisionReason || ''};
      order.quoteHistory = [...(order.quoteHistory || []), offer];
      order.quoteOffer = offer;
      order.quoteStage = 'sent';
    } else if (action.type === 'revise_quote') {
      if (order.quoteStage !== 'sent') throw new Error('Only a sent quote needs a revision.');
      if (!String(action.reason || '').trim()) throw new Error('Record the reason for the revision.');
      order.quoteStage = 'draft'; order.revisionReason = String(action.reason).trim();
      delete order.quoteOffer;
    } else throw new Error('Unknown quote action.');
    saveDraft(state, order);
    state.revision += 1;
    return state;
  }
  function accepted(order, itemId) {
    return order.runs.filter(run => run.itemId === itemId && run.status === 'inspected').reduce((sum, run) => sum + run.accepted, 0);
  }
  function remaining(order, item) { return item.quantity - accepted(order, item.id); }
  function productionItems(order) { return order.productionPlan || order.items; }
  function costsReady(order) {
    return productionItems(order).every(item => Number(item.hours_each) > 0 && item.materials.some(material => Number(material.grams_each) > 0));
  }
  function requirements(order) {
    if (order.inventoryHandling?.mode === 'usage_only') return {};
    const result = {};
    productionItems(order).forEach(item => item.materials.forEach(material => {
      const key = materialKey(material);
      result[key] = (result[key] || 0) + remaining(order, item) * material.grams_each;
    }));
    return result;
  }
  function reserved(state, key, excludeId) {
    if (state.databaseMode) {
      const stock = state.inventory.find(row => row.key === key);
      const excluded = state.orders.find(order => order.id === excludeId);
      return Math.max(0, (stock?.reserved || 0) - (excluded?.reservedMaterials?.[key] || 0));
    }
    return state.orders.filter(order => order.released && !order.fulfilled && order.id !== excludeId)
      .reduce((sum, order) => sum + (requirements(order)[key] || 0), 0);
  }
  function paid(order) { return money(order.payments.reduce((sum, p) => sum + p.amount, 0)); }
  function currentTotals(order) { return order.fulfillmentPlan?.totals || order.snapshot || totals(order); }
  function balance(order) { return money(Math.max(0, currentTotals(order).total - paid(order))); }
  function fulfillmentPricing(order, action) {
    if (!order.snapshot) throw new Error('Approve the quote before adjusting fulfillment.');
    const rate = number(action.taxRate, 'Ohio sales tax rate');
    const fee = money(number(action.customerFee, 'Fulfillment charge'));
    if (rate > 20 || fee > 100000) throw new Error('Enter a valid tax rate and fulfillment charge.');
    if (action.method === 'pickup' && fee) throw new Error('Customer pickup has no separate fulfillment charge.');
    const mode = action.discountMode || 'none';
    if (!['none', 'round_down', 'fixed', 'percent'].includes(mode)) throw new Error('Choose a discount type.');
    const acceptedDiscount = order.snapshot.discount || 0;
    const calculate = discount => root.calculateQuoteTotals({
      lineItems: order.snapshot.lineItems, discount, customerShipping: fee,
      taxRate: rate, taxExempt: order.taxExempt
    });
    const base = calculate(acceptedDiscount);
    const productCents = Math.round(base.subtotal * 100);
    const value = ['fixed', 'percent'].includes(mode) ? number(action.discountValue, 'Discount value') : 0;
    let discountCents = 0;
    if (mode === 'fixed') discountCents = Math.round(money(value) * 100);
    if (mode === 'percent') {
      if (value > 100) throw new Error('Use a discount percentage from 0 to 100.');
      discountCents = Math.round(money(base.subtotal * value / 100) * 100);
    }
    if (mode === 'round_down') {
      const target = Math.floor(base.total);
      let low = 0, high = productCents;
      if (calculate(acceptedDiscount + high / 100).total > target) throw new Error('The item price is too low to round down to the next dollar.');
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (calculate(acceptedDiscount + mid / 100).total <= target) high = mid;
        else low = mid + 1;
      }
      if (calculate(acceptedDiscount + low / 100).total !== target) {
        throw new Error('This tax rate and item price skip the exact whole-dollar total. Choose a fixed discount to preview another amount.');
      }
      discountCents = low;
    }
    if (discountCents > productCents) throw new Error('The discount cannot exceed the remaining item price.');
    return {...calculate(money(acceptedDiscount + discountCents / 100)), fulfillmentDiscount: discountCents / 100};
  }
  function progress(order) {
    if (order.fulfilled && balance(order) === 0) return 'closed';
    if (order.items.every(item => remaining(order, item) === 0)) return 'ready_for_fulfillment';
    if (order.runs.some(run => run.status === 'printing')) return 'printing';
    return 'ready_to_print';
  }
  function estimatedItemCost(state, item) {
    const filament = item.materials.reduce((sum, material) => {
      const stock = state.inventory.find(row => row.key === materialKey(material));
      return sum + material.grams_each * (stock?.cost || 0);
    }, 0);
    return filament + item.hours_each * 0.53;
  }
  function costs(state, order) {
    let material = 0;
    let hours = 0;
    order.runs.forEach(run => {
      if (run.status !== 'inspected') return;
      hours += run.hours;
      run.usage.forEach(usage => { material += usage.materialCost ?? ((usage.grams || 0) * (usage.unitCost || 0)); });
    });
    const fees = order.payments.reduce((sum, p) => sum + p.fee, 0);
    const preparationHours = order.productionPrepHours || 0;
    const laborEstimate = order.productionPlan ? preparationHours + (order.productionRemainingHours || 0) : order.estimatedLabor;
    const postage = order.shipment?.postage || 0;
    const actual = money(material + hours * 0.53 + Math.max(order.actualLabor, preparationHours) * order.laborRate + order.otherCosts + fees + postage);
    const estimated = money(productionItems(order).reduce((sum, item) => sum + item.quantity * estimatedItemCost(state, item), 0) + laborEstimate * order.laborRate + order.otherCosts + fees);
    const snapshot = currentTotals(order);
    const revenue = money(snapshot.total - snapshot.tax);
    return {material: money(material), hours, actual, estimated, revenue, postage,
      estimatedProfit: money(revenue - estimated), actualProfit: money(revenue - actual),
      variance: money(estimated - actual), complete: order.fulfilled};
  }
  function saveDraft(state, draft) {
    const existing = state.orders.find(order => order.id === draft.id);
    if (existing?.snapshot) throw new Error('This sample has an accepted price. Create a new sample to explore different pricing.');
    if (existing?.quoteStage === 'sent' && draft.quoteStage === 'sent') throw new Error('Start a quote revision before editing a sent quote.');
    const items = root.OliPolyLineItems.normalize(draft.items);
    if (!items.length) throw new Error('Add at least one item.');
    if (!draft.customer.trim() || !draft.title.trim()) throw new Error('Enter a customer and project name.');
    if (draft.designFee < 0) throw new Error('Design charge must be nonnegative.');
    const order = {...copy(draft), items};
    ['designFee', 'laborRate', 'estimatedLabor'].forEach(name => {
      order[name] = number(order[name], name);
    });
    totals(order);
    if (existing) state.orders[state.orders.indexOf(existing)] = order;
    else state.orders.push(order);
    return state;
  }
  const poFields = {number:80, overrideReason:500, purchasingEmail:254, receivingEmail:254,
    receivingName:160, apEmail:254, shipTo:500, billTo:500, terms:120, evidence:500, county:50};
  function poReview(order, action) {
    if (order.preset !== 'business' || order.snapshot || order.quoteStage !== 'sent' || !order.quoteOffer) {
      throw new Error('Share the business quote before reviewing the PO.');
    }
    const review = {authorization:action.authorization, quoteRevision:order.quoteOffer.revision};
    for (const [field,limit] of Object.entries(poFields)) {
      review[field] = String(action[field] || '').trim();
      if (review[field].length > limit) throw new Error(`Shorten the PO field ${field}.`);
    }
    if (review.authorization === 'po') {
      if (!review.number) throw new Error('Enter the purchase order number.');
      review.overrideReason = '';
    } else if (review.authorization === 'override') {
      if (!review.overrideReason) throw new Error('Record why a PO is not required.');
      review.number = '';
    } else throw new Error('Choose a purchase order or an explicit PO override.');
    if (!review.terms || !review.county || !review.shipTo || !review.evidence) {
      throw new Error('Record accepted terms, the ship-to address, tax county, and review evidence.');
    }
    if (review.authorization === 'po' && !review.purchasingEmail) throw new Error('Enter the purchasing email.');
    for (const address of [review.purchasingEmail,review.receivingEmail,review.apEmail]) {
      if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Check the purchasing, receiving and AP email addresses.');
    }
    const taxRate = number(action.taxRate, 'Ohio tax rate');
    if (taxRate > 20 || money(taxRate) !== taxRate) throw new Error('Enter a valid Ohio tax rate.');
    if (!Array.isArray(action.quantities) || action.quantities.length !== order.quoteOffer.items.length) {
      throw new Error('Review the quantity of every quoted item.');
    }
    const items = order.quoteOffer.items.map((item,i) => {
      const quantity = number(action.quantities[i], 'Accepted quantity', true);
      return {...item,quantity,line_total:money(item.unit_price * quantity)};
    })
      .filter(item => item.quantity > 0);
    if (!items.length || items.some(item => item.quantity > 100000)) throw new Error('Enter an accepted quantity for at least one quoted item.');
    review.taxRate = taxRate;
    const snapshot = totals({...order,items,taxRate});
    return {review,items,snapshot};
  }
  function invoiceDueDate(terms, issueDate) {
    const date = new Date(issueDate + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime())) return '';
    const net = String(terms || '').match(/^net[\s_-]*(\d{1,3})(?:\b|$)/i);
    if (!net && !/^due (on|upon) receipt$/i.test(String(terms || '').trim())) return '';
    date.setUTCDate(date.getUTCDate() + (net ? Number(net[1]) : 0));
    return date.toISOString().slice(0,10);
  }
  function invoiceDetails(order, action) {
    const issueDate = String(action.issueDate || '');
    const dueDate = String(action.dueDate || '');
    const recipient = String(action.recipient || '').trim();
    const billTo = String(action.billTo || '').trim();
    const dateIsValid = value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(value + 'T12:00:00Z');
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
    };
    const today = new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
    const handoff = order.fulfilledAt ? new Date(order.fulfilledAt).toLocaleDateString('en-CA',{timeZone:'America/New_York'}) : '';
    if (!dateIsValid(issueDate) || issueDate > today || (handoff && issueDate < handoff) || !dateIsValid(dueDate) || dueDate < issueDate) {
      throw new Error('Use an issue date between handoff and today, and a due date on or after the issue date.');
    }
    if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('Enter the confirmed invoice recipient.');
    if (billTo.length > 500) throw new Error('Use up to 500 characters for the billing address.');
    const reference = projectIdentity(order).primary;
    return {number:`I-${reference.replace(/^(Q|OP)-/,'')}`,reference,issueDate,dueDate,recipient,billTo,
      customer:order.customer,title:order.title,poNumber:order.poReview?.number||'',terms:order.terms,
      shipTo:order.fulfillmentPlan?.address||order.poReview?.shipTo||'',
      totals:copy(currentTotals(order)),paid:paid(order),balance:balance(order)};
  }
  function command(original, orderId, action) {
    const state = copy(original);
    const order = state.orders.find(row => row.id === orderId);
    if (!order) throw new Error('Open an existing sample order.');
    if (action.type === 'po_review') {
      const {review,items,snapshot} = poReview(order,action);
      order.poReview = review;
      order.items = items;
      order.terms = review.terms;
      order.county = review.county;
      order.taxAddress = review.shipTo;
      order.taxRate = review.taxRate;
      order.snapshot = snapshot;
      order.approval = review.authorization === 'po' ? `Reviewed PO ${review.number}` : 'PO requirement overridden';
      order.approvedAt = new Date().toISOString();
      order.status = 'approved';
      order.estimateBaseline = costs(state,order).estimated;
    } else if (action.type === 'po_acknowledgment') {
      if (!order.poReview?.number || order.poAcknowledgment || action.confirmSent !== 'yes') {
        throw new Error('Confirm the PO acknowledgment was sent. It can only be recorded once.');
      }
      const reference = String(action.reference || '').trim();
      const message = String(action.message || '').trim();
      if (reference.length > 500 || !message || message.length > 8000) throw new Error('Record the message sent and an optional send reference.');
      order.poAcknowledgment = {recipient:order.poReview.purchasingEmail,reference,message,recordedAt:new Date().toISOString()};
    } else if (action.type === 'approve') {
      if (order.preset === 'business') throw new Error('Review the PO or record an explicit override before approving a business order.');
      if (order.snapshot) throw new Error('This scope has already been approved.');
      if (!order.customer.trim() || !order.title.trim() || !order.items.length) throw new Error('Save the customer, project and items before recording approval.');
      if (!action.method) throw new Error('Select how the customer approved the work.');
      if (order.quoteStage === 'request') throw new Error('Prepare the quote before recording approval.');
      order.snapshot = copy(order.quoteOffer?.totals || totals(order));
      order.approval = action.method;
      order.approvedAt = new Date().toISOString();
      order.status = 'approved';
      order.estimateBaseline = costs(state, order).estimated;
    } else if (action.type === 'production_plan') {
      if (!order.snapshot || order.released || order.runs.length) throw new Error('Prepare approved work before releasing it to production.');
      if (!Array.isArray(action.items) || action.items.length !== order.items.length) throw new Error('Prepare every approved item.');
      order.productionPrepHours = number(action.prepHours ?? order.productionPrepHours ?? 0, 'Design and preparation hours already spent');
      order.productionRemainingHours = number(action.remainingHours ?? order.productionRemainingHours ?? 0, 'Remaining hands-on hours');
      order.productionPlan = order.items.map((item, index) => {
        const proposed = action.items[index];
        if (!proposed || proposed.id !== item.id) throw new Error('Keep the approved item identities and order.');
        const hours = number(proposed.hours_each, 'Print hours per piece');
        if (!hours || !Array.isArray(proposed.materials) || !proposed.materials.length) throw new Error('Enter print time and filament for every item.');
        const materials = proposed.materials.map(material => {
          const grams = number(material.grams_each, 'Grams per piece');
          if (!state.inventory.some(stock => stock.key === materialKey(material))) throw new Error('Choose filament from inventory.');
          return {...copy(material), grams_each: grams};
        });
        if (!materials.some(material => material.grams_each > 0)) throw new Error('Enter positive filament consumption for every item.');
        return {...copy(item), hours_each: hours, materials};
      });
    } else if (action.type === 'inventory_handling') {
      if (!order.snapshot || order.released || order.runs.length || order.fulfilled) {
        throw new Error('Choose inventory handling before release.');
      }
      const mode = action.mode;
      const reason = String(action.reason || '').trim();
      if (!['track','usage_only'].includes(mode) || reason.length > 500 || (mode === 'usage_only' && !reason)) {
        throw new Error('Enter a reason for recording usage without changing stock.');
      }
      order.inventoryHandling = {mode, reason: mode === 'usage_only' ? reason : ''};
    } else if (action.type === 'historical_completion') {
      if (!order.snapshot || order.released || order.runs.length || order.fulfilled) {
        throw new Error('Record completed work from an approved order before production release.');
      }
      const method = action.method;
      const handoffDate = String(action.handoffDate || '');
      const date = new Date(handoffDate + 'T12:00:00Z');
      if (!['shipping','pickup','delivery'].includes(method) || !/^\d{4}-\d{2}-\d{2}$/.test(handoffDate) ||
          !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== handoffDate ||
          handoffDate > new Date().toLocaleDateString('en-CA', {timeZone:'America/New_York'})) {
        throw new Error('Enter the actual handoff method and a date on or before today.');
      }
      const details = {method, handoffDate};
      for (const [key, max] of Object.entries({carrier:40, service:80, tracking:60, notes:1000})) {
        details[key] = String(action[key] || '').trim();
        if (details[key].length > max) throw new Error('Shorten the shipment details or notes.');
      }
      if (method !== 'shipping') Object.assign(details, {carrier:'',service:'',tracking:''});
      const reason = String(action.reason || '').trim();
      if (!reason || reason.length > 500) throw new Error('Enter why stock should be left unchanged.');
      if (!Array.isArray(action.items) || action.items.length !== order.items.length) throw new Error('Record every approved item.');
      order.runs = order.items.map((item, index) => {
        const entered = action.items[index];
        const material = String(entered.material || '').trim();
        const grams = optionalActual(entered.grams, 'Filament used');
        const materialCost = optionalActual(entered.materialCost, 'Filament cost');
        const hours = optionalActual(entered.hours, 'Printer hours');
        if (material.length > 120 || (grams !== null && grams > 0 && !material)) throw new Error('Enter a material description for recorded grams.');
        const printer = entered.printer || 'Not recorded';
        if (!['P1S','P2S','Not recorded'].includes(printer)) throw new Error('Choose the printer used if known.');
        return {id:uid(), itemId:item.id, printer, quantity:item.quantity, status:'inspected',
          accepted:item.quantity, rejected:null, hours, usage:[{key:material, grams, materialCost}]};
      });
      order.inventoryHandling = {mode:'usage_only',reason};
      order.historicalCompletion = details;
      order.released = true;
      order.fulfilled = true;
      order.fulfilledAt = date.toISOString();
      order.status = progress(order);
    } else if (action.type === 'release') {
      if (!order.snapshot || order.released) throw new Error('Release an approved order once.');
      if (productionItems(order).some(item => !item.materials.length || !item.hours_each || !item.materials.some(m => m.grams_each > 0))) {
        throw new Error('Complete material and print-time estimates before releasing this sample to production.');
      }
      Object.entries(requirements(order)).forEach(([key, grams]) => {
        const inventory = state.inventory.find(row => row.key === key);
        if (!inventory || grams > inventory.grams - reserved(state, key)) throw new Error(`Not enough available ${key}.`);
      });
      order.released = true;
    } else if (action.type === 'start') {
      if (!order.released || order.fulfilled) throw new Error('Release the order before starting a run.');
      if (!['P1S', 'P2S'].includes(action.printer)) throw new Error('Choose a printer.');
      if (state.orders.some(o => o.runs.some(run => run.printer === action.printer && run.status === 'printing'))) throw new Error('That sample printer already has an active run.');
      const item = productionItems(order).find(row => row.id === action.itemId);
      if (!item) throw new Error('Select an item.');
      const quantity = number(action.quantity, 'Run quantity', true);
      const running = order.runs.filter(run => run.itemId === item.id && run.status === 'printing').reduce((sum, run) => sum + run.quantity, 0);
      if (!quantity || quantity > remaining(order, item) - running) throw new Error('Run quantity exceeds the number still needed.');
      const runMaterials = {};
      item.materials.forEach(m => {
        const key = materialKey(m);
        runMaterials[key] = (runMaterials[key] || 0) + m.grams_each * quantity;
      });
      if (order.inventoryHandling?.mode !== 'usage_only') Object.entries(runMaterials).forEach(([key, grams]) => {
        const stock = state.inventory.find(row => row.key === key);
        if (!stock || stock.grams - reserved(state, stock.key, order.id) < grams) throw new Error('This run exceeds available sample stock.');
      });
      order.runs.push({id: uid(), itemId: item.id, printer: action.printer, quantity,
        status: 'printing', plannedHours: quantity * item.hours_each});
    } else if (action.type === 'inspect') {
      const run = order.runs.find(row => row.id === action.runId);
      if (!run || run.status !== 'printing') throw new Error('This run has already been inspected.');
      const good = number(action.accepted, 'Accepted count', true);
      const rejected = number(action.rejected, 'Rejected count', true);
      if (good + rejected !== run.quantity) throw new Error('Accepted plus rejected must equal the run quantity.');
      const item = productionItems(order).find(row => row.id === run.itemId);
      const keys = [...new Set(item.materials.map(materialKey))];
      if (!Array.isArray(action.usage) || action.usage.length !== keys.length || new Set(action.usage.map(u => u.key)).size !== keys.length) throw new Error('Record each material once.');
      run.usage = action.usage.map(usage => {
        if (!keys.includes(usage.key)) throw new Error('Unexpected material.');
        const stock = state.inventory.find(row => row.key === usage.key);
        const grams = number(usage.grams, 'Consumed grams');
        if (order.inventoryHandling?.mode === 'usage_only') {
          if (usage.rolls?.length) throw new Error('Roll allocations are unavailable when recording usage only.');
          const materialCost = optionalActual(usage.materialCost, 'Filament cost');
          return {key: usage.key, grams, unitCost: stock?.cost || 0, materialCost};
        }
        if (!stock || grams > stock.grams) throw new Error('Consumption exceeds sample stock.');
        stock.grams = money(stock.grams - grams);
        const result = {key: usage.key, grams, unitCost: stock.cost};
        if (usage.rolls?.length) {
          result.rolls = usage.rolls.map(roll => ({raw_material_roll_id: String(roll.raw_material_roll_id), grams_used: number(roll.grams_used, 'Roll grams')}));
          const rollTotal = result.rolls.reduce((sum, roll) => sum + roll.grams_used, 0);
          if (Math.abs(rollTotal - grams) > 0.000001 || result.rolls.some(roll => roll.grams_used <= 0) || new Set(result.rolls.map(roll => roll.raw_material_roll_id)).size !== result.rolls.length) {
            throw new Error('Actual roll grams must add up to the material consumption without duplicate rolls.');
          }
        }
        return result;
      });
      Object.assign(run, {status: 'inspected', accepted: good, rejected,
        hours: number(action.hours, 'Actual print hours'), notes: String(action.notes || '')});
    } else if (action.type === 'fulfillment_plan') {
      if (order.fulfilled || order.shipment || !order.released || order.items.some(item => remaining(order, item) > 0)) {
        throw new Error('Choose fulfillment after QC and before label purchase or handoff.');
      }
      const method = action.method;
      const address = String(action.address || '').trim();
      const county = String(action.county || '').trim();
      const approval = String(action.approval || '').trim();
      if (!['pickup', 'shipping', 'delivery'].includes(method) || !address || address.length > 500 ||
          !county || county.length > 50 || approval.length > 500) {
        throw new Error('Choose a fulfillment method and enter its Ohio address and county.');
      }
      const revised = fulfillmentPricing(order, action);
      if (method === 'delivery' && revised.customerShipping > 0 && action.confirmDelivery !== 'yes') {
        throw new Error('Confirm the local delivery address and customer charge before publishing.');
      }
      const current = currentTotals(order);
      const taxChanged = county.toLowerCase() !== String(order.fulfillmentPlan?.county || order.county).toLowerCase() || revised.taxRate !== current.taxRate;
      const changed = taxChanged || revised.total !== current.total || revised.discount !== current.discount || revised.customerShipping !== current.customerShipping;
      if (changed && !approval) throw new Error('Record customer approval for the adjustment.');
      if (changed && order.payments.length) throw new Error('Payments are already recorded. Use the Finance correction workflow.');
      const discountMode = action.discountMode || 'none';
      const discountValue = ['fixed','percent'].includes(discountMode) ? Number(action.discountValue) : 0;
      const discountReason = String(action.discountReason || '').trim();
      if (discountReason.length > 500) throw new Error('Use up to 500 characters for the discount reason.');
      const plan = {method, address, county, approval, discountMode, discountValue, discountReason, totals: changed ? revised : current};
      if (method === 'shipping') order.shippingDraft = plan;
      else {
        delete order.shippingDraft;
        order.fulfillmentPlan = plan;
      }
    } else if (action.type === 'save_shipping_label' || action.type === 'ship') {
      if (order.fulfilled || !order.released || order.items.some(item => remaining(order, item) > 0)) {
        throw new Error('Pass QC on all pieces before shipping.');
      }
      if (action.type === 'save_shipping_label') {
        if (order.shipment) throw new Error('A label is already recorded for this order.');
        const plan = order.shippingDraft || order.fulfillmentPlan;
        if (plan && plan.method !== 'shipping') throw new Error('Choose carrier shipping before recording a label.');
        if (action.confirmDetails !== 'yes') throw new Error('Confirm the shipment details before publishing.');
        order.shipment = shippingLabel(action);
        if (plan && order.shipment.destination !== plan.address) {
          throw new Error('The label address must match the confirmed fulfillment address.');
        }
        if (order.shippingDraft) {
          order.fulfillmentPlan = order.shippingDraft;
          delete order.shippingDraft;
        }
      } else {
        if (!order.shipment) throw new Error('Record the purchased label first.');
        if (action.confirmHandoff !== 'yes') throw new Error('Confirm that the carrier has the package.');
        order.fulfilled = true;
        order.fulfilledAt = new Date().toISOString();
        order.shipment.handoffAt = order.fulfilledAt;
      }
    } else if (['pickup', 'deliver'].includes(action.type)) {
      if (order.shippingDraft) throw new Error('Confirm shipment details or change the fulfillment method first.');
      if (action.type === 'deliver' && fulfillmentMethod(order) !== 'delivery') throw new Error('Choose local delivery first.');
      if (action.type === 'pickup' && order.fulfillmentPlan && fulfillmentMethod(order) !== 'pickup') throw new Error('Choose customer pickup first.');
      if (order.shipment) throw new Error('This order has a shipping label. Record carrier handoff in Fulfillment.');
      if (order.fulfilled || !order.released || order.items.some(item => remaining(order, item) > 0)) throw new Error('Inspect all required pieces before recording pickup.');
      order.fulfilled = true;
      order.fulfilledAt = new Date().toISOString();
    } else if (action.type === 'issue_invoice') {
      if (order.preset !== 'business' || !order.snapshot || !order.fulfilled || order.invoice) {
        throw new Error('Issue a business invoice once, after final handoff.');
      }
      order.invoice = invoiceDetails(order,action);
    } else if (action.type === 'record_invoice_sent') {
      if (!order.invoice || order.invoiceDelivery || action.confirmSent !== 'yes') {
        throw new Error('Confirm the issued invoice was sent. This can only be recorded once.');
      }
      const reference = String(action.reference || '').trim();
      if (reference.length > 500) throw new Error('Use up to 500 characters for the send reference.');
      order.invoiceDelivery = {recipient:order.invoice.recipient,reference,recordedAt:new Date().toISOString()};
    } else if (action.type === 'pay') {
      if (!order.snapshot) throw new Error('Record approval before receiving payment.');
      if (order.shippingDraft) throw new Error('Confirm shipment details before recording payment.');
      const amount = money(number(action.amount, 'Payment amount'));
      const fee = money(number(action.fee, 'Processing fee'));
      if (!amount || amount > balance(order)) throw new Error('Enter an amount up to the remaining balance.');
      if (fee > amount) throw new Error('Fee exceeds the payment.');
      if (!['Cash', 'Check', 'ACH', 'Stripe', 'PayPal', 'Venmo'].includes(action.method)) throw new Error('Choose a payment method.');
      order.payments.push({id: uid(), amount, fee, method: action.method, reference: String(action.reference || ''), date: new Date().toISOString()});
    } else if (action.type === 'actuals') {
      order.actualLabor = number(action.hours, 'Hands-on hours');
      order.otherCosts = number(action.otherCosts, 'Other costs');
    } else throw new Error('Unknown preview action.');
    if (order.released) order.status = progress(order);
    state.revision += 1;
    return state;
  }
  function optionalActual(value, label) {
    if (value === '' || value == null) return null;
    const amount = number(value, label);
    if (amount > 1000000) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
    return money(amount);
  }
  function shippingLabel(action) {
    const label = {};
    const fields = {destination: 500, carrier: 40, service: 80, provider: 60, tracking: 60, purchaseRef: 100};
    for (const [name, limit] of Object.entries(fields)) {
      const value = String(action[name] ?? '').trim();
      if (!value || value.length > limit) throw new Error('Enter shipment details. Use N/A for an unavailable service, provider, tracking number or purchase reference.');
      label[name] = ['service','provider','tracking','purchaseRef'].includes(name) && /^n\/a$/i.test(value) ? null : value;
    }
    if (label.tracking && !/^[A-Za-z0-9][A-Za-z0-9 -]{2,59}$/.test(label.tracking)) throw new Error('Enter a valid tracking number or N/A.');
    for (const name of ['weightOz', 'lengthIn', 'widthIn', 'heightIn']) {
      if (action.packageNotApplicable === 'yes' && !action[name]) { label[name] = null; continue; }
      const value = number(action[name], 'Packed weight and dimensions');
      if (!value || value > 10000) throw new Error('Enter positive packed measurements or acknowledge unavailable measurements.');
      label[name] = value;
    }
    label.postage = money(number(action.postage, 'Actual postage'));
    if (label.postage > 100000) throw new Error('Enter the actual postage from the label receipt.');
    label.purchaseDate = action.noPurchase === 'yes' && !label.postage ? null : String(action.purchaseDate || '');
    if (label.purchaseDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(label.purchaseDate)) throw new Error('Enter the label purchase date.');
    if (action.noPurchase === 'yes' && label.postage) throw new Error('Enter $0 postage if there was no label purchase.');
    label.receiptUrl = String(action.receiptUrl || '').trim();
    if (label.receiptUrl && (!/^https:\/\/[^\s/]+(?:\/\S*)?$/i.test(label.receiptUrl) || label.receiptUrl.length > 1000)) {
      throw new Error('Enter an HTTPS receipt link.');
    }
    label.financeEntryId = String(action.financeEntryId || '').trim().toLowerCase();
    if (label.financeEntryId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(label.financeEntryId)) {
      throw new Error('Enter the existing Finance expense ID.');
    }
    return label;
  }
  return {seed, totals, poReview, invoiceDueDate, invoiceDetails, currentTotals, fulfillmentPricing, fulfillmentMethod, fulfillmentMilestones, pickupAddress, quoteFulfillmentNote, command, saveDraft, accepted, remaining, requirements, reserved, paid, balance, progress, costs, materialKey, copy, uid,
    stages, stage, nextStep, queue, projectIdentity, productionQueue, productionItems, costsReady, estimatedItemCost, newRequest, quoteCommand};
});
