(function (root) {
  'use strict';
  const Finance = typeof module === 'object' && module.exports ? require('./finance-model.js') : root.OliPolyOpsFinance;
  // Preserve Finance Pro's known-category precedence over stale tax metadata.
  function expenseGroup(entry) {
    const category = String(entry.category || '').trim();
    return (Object.hasOwn(Finance.categories,category) ? Finance.categories[category] : '') || String(entry.tax_category || '').trim().replace(/^auto$/, '') || 'other';
  }
  function taxReference(category, group, year) {
    if (![2025,2026].includes(Number(year))) return 'Review the tax-year Schedule C';
    const references = {
      'Vehicle / Delivery Mileage':'Line 9 · vehicle expenses; retain trip records',
      'Machine Maintenance':'Line 21 · repairs; review capital improvements',
      'Printer Parts / Repairs':'Line 21 · repairs; review capital improvements',
      'Equipment':'Equipment review · depreciation / section 179 / expensing eligibility',
      'Equipment (CapEx)':'Equipment review · depreciation / section 179 / expensing eligibility',
      'Material':'COGS / supplies review · Part III or line 22; apply the chosen inventory method',
      'Packaging':'COGS / supplies review · Part III or line 22; avoid double counting',
      'Home Office':'Line 30 / Form 8829 or simplified method · eligibility and allocation review',
      'Advertising / Marketing':'Line 8 · advertising',
      'Office Supplies':'Line 18 / 22 · office expense or supplies review',
      'Utilities':'Line 25 · business utilities; home-office costs require separate allocation',
      'Internet / Phone':'Line 25 / Part V · business portion; review home and personal use',
      'R&D / Prototyping':'Research expense review · current-year treatment and eligibility'
    };
    const groups = {marketplace_fees:'Line 10 · commissions and fees',event_fees:'Line 20b · booth / business property rent review',shipping_out:'Part V / line 27b · postage',supplies:'Line 22 · supplies not in COGS',equipment_maintenance:'Equipment / repairs review · mixed legacy grouping',other:'Part V / line 27b · itemize eligible other expenses'};
    return (Object.hasOwn(references,category) ? references[category] : '') || (Object.hasOwn(groups,group) ? groups[group] : '') || 'Unmapped category · review tax treatment';
  }
  const moneyFields = ['productRevenue','shippingRevenue','revenue','expenses','profit','grossSales','taxableSales','exemptSales','taxCollected'];
  function storedCents(value, label) {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) throw new Error(`Review the recorded ${label}.`);
    return Math.round((amount + Number.EPSILON) * 100);
  }
  function bucket(name) {
    return {name,count:0,productRevenue:0,shippingRevenue:0,revenue:0,expenses:0,profit:0,grossSales:0,taxableSales:0,exemptSales:0,taxCollected:0};
  }
  function amounts(entry, warnings) {
    const result = bucket('');
    if (entry.type === 'expense') {
      result.expenses = storedCents(entry.amount,'expense amount') + storedCents(entry.shipping_cost,'postage cost');
      result.profit = -result.expenses;
      return result;
    }
    const snapshot = entry.accepted_commercial_snapshot?.accepted_commercial_breakdown || entry.accepted_commercial_snapshot?.invoice_totals || {};
    result.shippingRevenue = storedCents(entry.shipping_charged,'shipping revenue');
    const snapshotShipping = snapshot.shipping_in_taxable_subtotal === true ? Number(entry.shipping_charged || 0) : 0;
    const product = entry.amount ?? (snapshot.taxable_subtotal == null ? null : Number(snapshot.taxable_subtotal) - snapshotShipping);
    if (product == null) throw new Error(`Review the recorded sale amount for ${entry.order_number || entry.title || entry.id}.`);
    result.productRevenue = storedCents(product,'sale amount');
    result.revenue = result.productRevenue + result.shippingRevenue;
    result.grossSales = result.revenue;
    const exempt = entry.tax_exempt_sale === true;
    result.exemptSales = exempt ? result.revenue : 0;
    result.taxableSales = exempt ? 0 : result.revenue;
    if (entry.sales_tax_collected == null && snapshot.tax == null) warnings.push(`${entry.order_number || entry.title || entry.id} has no recorded sales tax amount.`);
    result.taxCollected = storedCents(entry.sales_tax_collected ?? snapshot.tax,'sales tax');
    result.profit = result.revenue;
    if (exempt && result.taxCollected !== 0) warnings.push(`${entry.order_number || entry.title || entry.id} is marked exempt and has recorded tax. Review its tax details.`);
    return result;
  }
  function add(target, values) {
    target.count += 1;
    moneyFields.forEach(field => { target[field] += values[field]; });
  }
  function dollars(row) {
    const result = {...row};
    moneyFields.forEach(field => { result[field] /= 100; });
    return result;
  }
  function period(year, half) {
    year = Number(year);
    if (!Number.isInteger(year) || year < 2000 || year > 9999 || !['all','H1','H2'].includes(half)) throw new Error('Choose a valid report year and period.');
    return {year,half,start:`${year}-${half === 'H2' ? '07' : '01'}-01`,end:`${year}-${half === 'H1' ? '06-30' : '12-31'}`};
  }
  function summarize(source, year, half = 'all', orders = []) {
    return aggregate(source,period(year,half),orders);
  }
  function summarizeRange(source,start,end,orders = []) {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    if (!valid(start) || !valid(end) || start>end || start.slice(0,4)!==end.slice(0,4)) throw Error('Choose a valid filing period within one calendar year.');
    const range=period(Number(start.slice(0,4)),'all');
    return aggregate(source,{...range,start,end,half:'custom'},orders);
  }
  function aggregate(source,range,orders) {
    const months = new Map(), counties = new Map(), categories = new Map(), expenses = [], mileage = [], total = bucket('Total'), warnings = [];
    const firstMonth = Number(range.start.slice(5,7));
    const lastMonth = Number(range.end.slice(5,7));
    for (let month = firstMonth; month <= lastMonth; month += 1) {
      const name = `${range.year}-${String(month).padStart(2,'0')}`;
      months.set(name,bucket(name));
    }
    const entries = source.filter(entry => Number(entry.report_transaction_count ?? 1) === 1 && ['income','expense'].includes(entry.type));
    for (const entry of entries) {
      const date = String(entry.entry_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) {
        warnings.push(`${entry.title || entry.id} has an invalid or missing date and needs review.`);
        continue;
      }
      if (date < range.start || date > range.end) continue;
      const values = amounts(entry,warnings);
      add(total,values);
      add(months.get(date.slice(0,7)),values);
      if (entry.type !== 'income') {
        const category = String(entry.category || '').trim() || 'Uncategorized';
        const group = expenseGroup(entry);
        const reference = taxReference(category,group,range.year);
        const key = JSON.stringify([category,group]);
        if (!categories.has(key)) categories.set(key,{name:category,group,reference,count:0,amount:0});
        const row = categories.get(key);
        row.count += 1; row.amount += values.expenses;
        const detail = {...entry,amount:values.expenses/100,report_group:group,tax_reference:reference,original_entry_id:entry.original_entry_id || entry.id,effective_entry_id:entry.effective_entry_id || entry.id};
        expenses.push(detail);
        if (category === 'Uncategorized' || !Object.hasOwn(Finance.categories,category)) warnings.push(`${entry.title || entry.id} uses ${category}; review its expense grouping (${group}).`);
        if (category === 'Vehicle / Delivery Mileage') {
          const miles = Number(entry.miles_driven), rate = Number(entry.mileage_rate);
          if (!Number.isFinite(miles) || miles <= 0 || !Number.isFinite(rate) || rate <= 0 || !entry.trip_purpose || !entry.trip_from || !entry.trip_to) warnings.push(`${entry.title || entry.id} needs complete mileage trip details.`);
          if (Number.isFinite(miles) && Number.isFinite(rate) && storedCents(miles*rate,'mileage calculation') !== values.expenses) warnings.push(`${entry.title || entry.id} mileage amount differs from its saved miles × rate; the report retains the posted amount.`);
          mileage.push({...detail,miles_driven:Number.isFinite(miles) ? miles : '',mileage_rate:Number.isFinite(rate) ? rate : ''});
        }
        continue;
      }
      const county = String(entry.sales_county || entry.destination_county || '').trim().replace(/\s+county$/i,'').replace(/\b\w/g,letter => letter.toUpperCase()) || 'Missing county';
      const rate = Number(entry.sales_tax_rate || 0);
      if (county === 'Missing county') warnings.push(`${entry.order_number || entry.title || entry.id} needs a sales county.`);
      if (!entry.tax_exempt_sale && (!Number.isFinite(rate) || rate <= 0)) warnings.push(`${entry.order_number || entry.title || entry.id} needs a recorded tax rate.`);
      const rateLabel = Number.isFinite(rate) ? rate : 0;
      const key = JSON.stringify([county,rateLabel]);
      if (!counties.has(key)) counties.set(key,{...bucket(county),rate:rateLabel});
      add(counties.get(key),values);
    }
    const postedOrders = new Set(entries.filter(entry => entry.type === 'income').flatMap(entry => [entry.order_id,entry.order_number]).filter(Boolean));
    const unpostedOrders = orders.filter(order => order.snapshot && !order.database?.financeEntryId && !postedOrders.has(order.database?.orderId) && !postedOrders.has(order.database?.orderNumber || order.reference)).map(order => {
      const totals = order.fulfillmentPlan?.totals || order.snapshot;
      const paid = (order.payments || []).reduce((sum,payment) => sum + storedCents(payment.amount,'payment'),0);
      const total = storedCents(totals.total,'order total');
      return {reference:order.database?.orderNumber || order.reference,title:order.title,fulfilled:!!order.fulfilled,total:total/100,paid:paid/100,balance:Math.max(0,total-paid)/100};
    });
    return {period:range,total:dollars(total),months:[...months.values()].map(dollars),counties:[...counties.values()].sort((a,b) => a.name.localeCompare(b.name) || a.rate-b.rate).map(dollars),categories:[...categories.values()].sort((a,b)=>a.name.localeCompare(b.name) || a.group.localeCompare(b.group)).map(row=>({...row,amount:row.amount/100})),expenses,mileage,warnings:[...new Set(warnings)],unpostedOrders};
  }
  const api = {summarize,summarizeRange};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsFinanceReports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
