(function (root) {
  'use strict';
  const numeric = ['amount','original_amount','business_use_percent','miles_driven','mileage_rate','sales_tax_rate','sales_tax_collected','shipping_charged','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost'];
  const texts = {entry_date:10,category:100,tax_category:100,title:180,vendor_name:180,payment_method:100,receipt_link:1000,notes:4000,sales_county:50,trip_purpose:180,trip_from:120,trip_to:120,tax_exempt_reason:500};
  const booleans = ['tax_exempt_sale','round_trip','exemption_certificate_on_file'];
  const financial = new Set(['type',...numeric,'tax_exempt_sale']);
  function baseline(entry) {
    const record = {type:entry.type};
    for (const key of [...numeric,...Object.keys(texts),...booleans]) {
      if (entry[key] !== undefined) record[key] = entry[key];
    }
    if (entry.type === 'income') {
      record.original_amount = entry.amount;
      record.sales_county = entry.sales_county || entry.destination_county || '';
      record.tax_exempt_reason = entry.tax_exempt_reason ?? entry.accepted_commercial_snapshot?.tax_exempt_reason ?? '';
      record.exemption_certificate_on_file = entry.exemption_certificate_on_file ?? entry.accepted_commercial_snapshot?.exemption_certificate_on_file ?? false;
    }
    return record;
  }
  function changedKeys(original, next) {
    return Object.keys(next).filter(key => {
      if (numeric.includes(key)) return Number(original[key] ?? 0) !== Number(next[key] ?? 0);
      return String(original[key] ?? '') !== String(next[key] ?? '');
    });
  }
  function prepare(entry, values, dirty) {
    const original = baseline(entry), next = {...original};
    for (const key of dirty) {
      if (numeric.includes(key)) {
        const value = Number(values[key]);
        const maximum = key === 'business_use_percent' ? 100 : key === 'sales_tax_rate' ? 20 : key === 'mileage_rate' ? 100 : key === 'miles_driven' ? 100000 : 999999999;
        if (values[key] === '' || !Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`Check ${key.replaceAll('_',' ')}.`);
        next[key] = Math.round((value + Number.EPSILON) * (key === 'mileage_rate' ? 10000 : 100)) / (key === 'mileage_rate' ? 10000 : 100);
      } else if (Object.hasOwn(texts,key)) {
        const value = String(values[key] || '').trim();
        if (value.length > texts[key]) throw new Error(`Shorten ${key.replaceAll('_',' ')}.`);
        if (['title','category'].includes(key) && !value) throw new Error(`Enter ${key}.`);
        if (key === 'receipt_link' && value && !/^https:\/\/[^\s]+$/i.test(value)) throw new Error('Use an HTTPS receipt link.');
        if (key === 'entry_date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw new Error('Enter a valid date.');
        next[key] = value;
      } else if (booleans.includes(key)) next[key] = values[key] === true || values[key] === 'yes';
    }
    const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
    const changed = () => changedKeys(original,next);
    if (entry.type === 'expense') {
      const mileage = next.category === 'Vehicle / Delivery Mileage';
      if (!mileage && changed().includes('category') && original.category === 'Vehicle / Delivery Mileage') {
        Object.assign(next,{miles_driven:0,mileage_rate:0,trip_purpose:'',trip_from:'',trip_to:'',round_trip:false});
      }
      if (mileage && changed().some(key => ['miles_driven','mileage_rate','category'].includes(key))) {
        if (!(Number(next.miles_driven)>0 && Number(next.mileage_rate)>0) || !String(next.trip_purpose || '').trim()) throw new Error('Enter total miles, rate and trip purpose.');
        next.original_amount = round(Number(next.miles_driven) * Number(next.mileage_rate));
        next.amount = round(next.original_amount * Number(next.business_use_percent ?? 100) / 100);
      } else if (changed().some(key => ['original_amount','business_use_percent'].includes(key))) {
        next.amount = round(Number(next.original_amount) * Number(next.business_use_percent ?? 100) / 100);
      }
    } else {
      if (changed().includes('amount')) next.original_amount = next.amount;
      if (changed().includes('tax_exempt_sale') && next.tax_exempt_sale) next.sales_tax_rate = 0;
      const taxChanges = changed().some(key => ['amount','original_amount','sales_tax_rate','tax_exempt_sale','shipping_charged'].includes(key));
      const taxableShipping = entry.accepted_commercial_snapshot?.accepted_commercial_breakdown?.shipping_in_taxable_subtotal === true;
      if (taxChanges && (next.tax_exempt_sale || next.sales_county)) {
        const base = Number(next.amount || 0) + (taxableShipping ? Number(next.shipping_charged || 0) : 0);
        if (changed().some(key => ['amount','original_amount','sales_tax_rate','tax_exempt_sale'].includes(key)) || taxableShipping) {
          next.sales_tax_collected = next.tax_exempt_sale ? 0 : root.calculateSalesTax(base,Number(next.sales_tax_rate || 0));
        }
      }
      if (taxChanges && !next.tax_exempt_sale && Number(next.amount)>0 && !next.sales_county) throw new Error('Enter the sales county for this correction.');
      if ((taxChanges || changed().includes('tax_exempt_reason')) && next.tax_exempt_sale && !String(next.tax_exempt_reason || '').trim()) throw new Error('Enter the exemption reason.');
    }
    const override = entry.type === 'income' && (values.overrideEnabled === true || values.overrideEnabled === 'yes');
    let overrideReason = '';
    if (override) {
      const tax = Number(values.overrideAmount);
      overrideReason = String(values.overrideReason || '').trim();
      if (values.overrideAmount === '' || !Number.isFinite(tax) || tax < 0 || !overrideReason || overrideReason.length>500) throw new Error('Enter actual tax and explain the tax override.');
      next.sales_tax_collected = round(tax);
      original.tax_override_enabled = entry.tax_override_enabled;
      original.tax_override_reason = entry.tax_override_reason;
      next.tax_override_enabled = true;
      next.tax_override_reason = overrideReason;
    }
    const keys = changed();
    if (!keys.length) throw new Error('Change at least one field.');
    const reason = String(values.reason || '').trim();
    if (reason.length < 3 || reason.length > 500) throw new Error('Enter a correction reason between 3 and 500 characters.');
    const stamp = entry.effective_version_at || entry.posted_at || entry.created_at;
    if (!stamp) throw new Error('Refresh the record before correcting it.');
    return {params:{p_original_entry_id:entry.original_entry_id || entry.id,p_corrected_record:next,p_changed_fields:keys,p_reason:reason,p_expected_effective_posted_at:stamp,p_tax_override_enabled:override,p_tax_override_reason:override ? overrideReason : null},
      changes:keys.map(key => ({field:key,old:original[key],new:next[key]})),kind:keys.some(key => financial.has(key)) ? 'reversal_replacement' : 'metadata_only'};
  }
  const api = {baseline,prepare};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsFinanceCorrections = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
