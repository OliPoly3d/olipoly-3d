(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const uid = () => root.crypto?.randomUUID?.() || `sample-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  function accepted(order, itemId) {
    return order.runs.filter(run => run.itemId === itemId && run.status === 'inspected').reduce((sum, run) => sum + run.accepted, 0);
  }
  function remaining(order, item) { return item.quantity - accepted(order, item.id); }
  function requirements(order) {
    const result = {};
    order.items.forEach(item => item.materials.forEach(material => {
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
  function balance(order) { return money((order.snapshot || totals(order)).total - paid(order)); }
  function progress(order) {
    if (order.fulfilled && balance(order) === 0) return 'closed';
    if (order.items.every(item => remaining(order, item) === 0)) return 'ready_for_fulfillment';
    if (order.runs.some(run => run.status === 'printing')) return 'printing';
    return 'ready_to_print';
  }
  function costs(state, order) {
    let material = 0;
    let hours = 0;
    order.runs.forEach(run => {
      if (run.status !== 'inspected') return;
      hours += run.hours;
      run.usage.forEach(usage => { material += usage.grams * usage.unitCost; });
    });
    const estimateMaterial = order.items.reduce((total, item) => total + item.quantity * item.materials.reduce((sum, m) => {
      const inventory = state.inventory.find(row => row.key === materialKey(m));
      return sum + m.grams_each * (inventory?.cost || 0);
    }, 0), 0);
    const estimatedHours = order.items.reduce((sum, item) => sum + item.quantity * item.hours_each, 0);
    const fees = order.payments.reduce((sum, p) => sum + p.fee, 0);
    const actual = money(material + hours * 0.53 + order.actualLabor * order.laborRate + order.otherCosts + fees);
    const estimated = money(estimateMaterial + estimatedHours * 0.53 + order.estimatedLabor * order.laborRate);
    const snapshot = order.snapshot || totals(order);
    const revenue = money(snapshot.total - snapshot.tax);
    return {material: money(material), hours, actual, estimated, revenue,
      estimatedProfit: money(revenue - estimated), actualProfit: money(revenue - actual),
      variance: money(estimated - actual), complete: order.fulfilled};
  }
  function saveDraft(state, draft) {
    const existing = state.orders.find(order => order.id === draft.id);
    if (existing?.snapshot) throw new Error('This sample has an accepted price. Create a new sample to explore different pricing.');
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
  function command(original, orderId, action) {
    const state = copy(original);
    const order = state.orders.find(row => row.id === orderId);
    if (!order) throw new Error('Open an existing sample order.');
    if (action.type === 'approve') {
      if (order.snapshot) throw new Error('This scope has already been approved.');
      if (!order.customer.trim() || !order.title.trim() || !order.items.length) throw new Error('Save the customer, project and items before recording approval.');
      if (!action.method) throw new Error('Select how the customer approved the work.');
      order.snapshot = totals(order);
      order.approval = action.method;
      order.approvedAt = new Date().toISOString();
      order.status = 'approved';
      order.estimateBaseline = costs(state, order).estimated;
    } else if (action.type === 'release') {
      if (!order.snapshot || order.released) throw new Error('Release an approved order once.');
      if (order.items.some(item => !item.materials.length || !item.hours_each || !item.materials.some(m => m.grams_each > 0))) {
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
      const item = order.items.find(row => row.id === action.itemId);
      if (!item) throw new Error('Select an item.');
      const quantity = number(action.quantity, 'Run quantity', true);
      const running = order.runs.filter(run => run.itemId === item.id && run.status === 'printing').reduce((sum, run) => sum + run.quantity, 0);
      if (!quantity || quantity > remaining(order, item) - running) throw new Error('Run quantity exceeds the number still needed.');
      const runMaterials = {};
      item.materials.forEach(m => {
        const key = materialKey(m);
        runMaterials[key] = (runMaterials[key] || 0) + m.grams_each * quantity;
      });
      Object.entries(runMaterials).forEach(([key, grams]) => {
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
      const item = order.items.find(row => row.id === run.itemId);
      const keys = [...new Set(item.materials.map(materialKey))];
      if (!Array.isArray(action.usage) || action.usage.length !== keys.length || new Set(action.usage.map(u => u.key)).size !== keys.length) throw new Error('Record each material once.');
      run.usage = action.usage.map(usage => {
        if (!keys.includes(usage.key)) throw new Error('Unexpected material.');
        const stock = state.inventory.find(row => row.key === usage.key);
        const grams = number(usage.grams, 'Consumed grams');
        if (!stock || grams > stock.grams) throw new Error('Consumption exceeds sample stock.');
        stock.grams = money(stock.grams - grams);
        return {key: usage.key, grams, unitCost: stock.cost};
      });
      Object.assign(run, {status: 'inspected', accepted: good, rejected,
        hours: number(action.hours, 'Actual print hours'), notes: String(action.notes || '')});
    } else if (action.type === 'pickup') {
      if (order.fulfilled || !order.released || order.items.some(item => remaining(order, item) > 0)) throw new Error('Inspect all required pieces before recording pickup.');
      order.fulfilled = true;
      order.fulfilledAt = new Date().toISOString();
    } else if (action.type === 'pay') {
      if (!order.snapshot) throw new Error('Record approval before receiving payment.');
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
  return {seed, totals, command, saveDraft, accepted, remaining, requirements, reserved, paid, balance, progress, costs, materialKey, copy, uid};
});
