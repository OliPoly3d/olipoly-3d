(function (root) {
  'use strict';
  const categories = {
    'Material':'materials', 'Packaging':'packaging', 'Shipping':'shipping_out',
    'Marketplace Fee':'marketplace_fees', 'Fees':'marketplace_fees',
    'Machine Maintenance':'equipment_maintenance', 'Printer Parts / Repairs':'equipment_maintenance',
    'Equipment':'equipment_maintenance', 'Equipment (CapEx)':'equipment_maintenance', 'Software / Subscriptions':'other',
    'Advertising / Marketing':'other', 'Domain / Website':'other',
    'Office Supplies':'supplies', 'Supplies':'supplies', 'Home Office':'other',
    'Utilities':'other', 'Internet / Phone':'other', 'Event Booth':'event_fees',
    'Admin / Setup':'other', 'R&D / Prototyping':'other', 'Vehicle / Delivery Mileage':'other'
  };
  const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function number(value, label, maximum) {
    const result = Number(value);
    if (value === '' || value == null || !Number.isFinite(result) || result < 0 || result > maximum) throw new Error(`Check ${label}.`);
    return result;
  }
  function expense(values) {
    if (!Object.hasOwn(categories, values.category)) throw new Error('Choose an expense category.');
    const date = String(values.entry_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Enter a valid date.');
    const entry = {type:'expense',entry_date:date,category:values.category,tax_category:categories[values.category]};
    for (const [name, limit] of Object.entries({title:180,vendor_name:180,payment_method:100,receipt_link:1000,notes:4000,trip_purpose:180,trip_from:120,trip_to:120})) {
      entry[name] = String(values[name] || '').trim();
      if (entry[name].length > limit) throw new Error(`Shorten ${name.replaceAll('_',' ')}.`);
    }
    if (!entry.title) throw new Error('Enter an expense description.');
    if (entry.receipt_link && !/^https:\/\/[^\s]+$/i.test(entry.receipt_link)) throw new Error('Use an HTTPS receipt link.');
    const mileage = entry.category === 'Vehicle / Delivery Mileage';
    entry.business_use_percent = mileage ? 100 : number(values.business_use_percent,'business use percentage',100);
    entry.miles_driven = mileage ? number(values.miles_driven,'total business miles',100000) : 0;
    entry.mileage_rate = mileage ? number(values.mileage_rate,'mileage rate',100) : 0;
    entry.round_trip = mileage && values.round_trip === 'yes';
    if (mileage && (!entry.miles_driven || !entry.mileage_rate || !entry.trip_purpose)) throw new Error('Enter miles, rate and trip purpose.');
    entry.original_amount = mileage ? cents(entry.miles_driven * entry.mileage_rate) : cents(number(values.original_amount,'purchase amount',999999999));
    if (!entry.original_amount) throw new Error('Enter a positive purchase or mileage amount.');
    entry.amount = cents(entry.original_amount * entry.business_use_percent / 100);
    if (!mileage) Object.assign(entry,{trip_purpose:'',trip_from:'',trip_to:''});
    return entry;
  }
  function csv(rows, fields = ['entry_date','type','category','title','amount','original_amount','business_use_percent','vendor_name','payment_method','receipt_link','miles_driven','mileage_rate','trip_purpose','trip_from','trip_to','round_trip','order_number','shipping_charged','sales_tax_collected','sales_county','notes','original_entry_id','effective_entry_id']) {
    const cell = value => {
      let text = String(value ?? '');
      if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"','""') + '"';
    };
    return [fields.map(cell),...rows.map(row => fields.map(name => cell(row[name])))].map(row => row.join(',')).join('\r\n');
  }
  const api = {expense,csv,categories};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsFinance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
