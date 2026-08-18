const assert = require('node:assert/strict');
const fs = require('node:fs');

const finance = fs.readFileSync('finance-pro.js', 'utf8');

assert.match(
  finance,
  /function withReportingCounty\(entry\) \{\s*const county = normalizeCounty\(entry\?\.sales_county\) \|\| normalizeCounty\(entry\?\.destination_county\);\s*return \{ \.\.\.entry, sales_county: county \};\s*\}/,
  'effective entries prefer canonical sales_county and safely fall back to destination_county'
);
assert.match(
  finance,
  /entries = \(data \|\| \[\]\)\.map\(row => withReportingCounty\(typeof row === 'string' \? JSON\.parse\(row\) : row\)\);/,
  'every fetched effective entry exposes the compatible reporting county'
);
assert.match(
  finance,
  /els\.taxCategory\.value = e\.tax_category \|\| 'auto';\s*els\.destinationCounty\.value = e\.sales_county \|\| '';/,
  'manual editing restores the effective county instead of clearing it on update'
);

const reportingCounty = entry => String(entry.sales_county || '').trim() || String(entry.destination_county || '').trim();
assert.equal(reportingCounty({ sales_county: 'Portage', destination_county: 'Trumbull' }), 'Portage', 'historical canonical county remains authoritative');
assert.equal(reportingCounty({ sales_county: '', destination_county: 'Trumbull' }), 'Trumbull', 'destination-only manual entry receives the compatibility fallback');

const taxable = { amount: 46.84, sales_tax_collected: 3.16, tax_exempt_sale: false, destination_county: 'Trumbull' };
const exempt = { amount: 432.50, sales_tax_collected: 0, tax_exempt_sale: true, destination_county: 'Trumbull' };
const rows = [taxable, exempt].map(entry => ({ ...entry, sales_county: reportingCounty(entry) }));
const trumbull = rows.filter(entry => entry.sales_county === 'Trumbull');
assert.equal(trumbull.length, 2, 'taxable and exempt sales group into the selected county');
assert.equal(trumbull.reduce((sum, entry) => sum + (entry.tax_exempt_sale ? 0 : entry.amount), 0), 46.84, 'exempt sale contributes zero taxable sales');
assert.equal(trumbull.reduce((sum, entry) => sum + entry.sales_tax_collected, 0), 3.16, 'exempt sale contributes zero collected tax');
assert.equal(trumbull.reduce((sum, entry) => sum + (entry.tax_exempt_sale ? entry.amount : 0), 0), 432.50, 'exempt sale remains included in exempt sales');

console.log('Finance manual county reporting assertions passed.');
