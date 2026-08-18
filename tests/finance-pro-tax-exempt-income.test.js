const assert = require('node:assert/strict');
const fs = require('node:fs');

const finance = fs.readFileSync('finance-pro.js', 'utf8');

const preview = finance.match(/function updateTaxPreview\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.match(preview, /if \(els\.taxExemptSale\?\.value === 'yes'\) \{[\s\S]*els\.salesTaxRate\.value = '0';[\s\S]*els\.salesTaxCollected\.value = '0\.00';/, 'an exempt selection authoritatively keeps the rate and collected tax at zero');
assert.doesNotMatch(preview, /taxExemptSale[^\n]*\.value\s*=(?!=)/, 'tax preview never overwrites the user-selected exempt state');

const saveEntry = finance.slice(finance.indexOf('async function saveEntry(e) {'), finance.indexOf('function correctedRecordFromForm()'));
const countyValidation = saveEntry.indexOf("if (isIncome && !destinationCounty)");
const taxableRateValidation = saveEntry.indexOf("if (isIncome && !taxExemptSale && num(els.salesTaxRate.value) <= 0)");
assert.ok(countyValidation >= 0, 'all manual income entries require a destination county');
assert.ok(taxableRateValidation > countyValidation, 'county validation runs before taxable-rate validation');
assert.match(saveEntry, /if \(isIncome && !destinationCounty\) \{\s*return setMsg\('Destination county is required\.', true\);/, 'missing county produces the county-specific validation error');
assert.match(saveEntry, /if \(isIncome && !taxExemptSale && num\(els\.salesTaxRate\.value\) <= 0\) \{\s*return setMsg\('Sales tax rate is required for taxable sales\.', true\);/, 'only taxable income requires a positive rate');
assert.match(saveEntry, /if \(taxExemptSale\) \{\s*salesTaxCollected = 0;/, 'exempt income saves with zero collected tax');
assert.match(saveEntry, /sales_tax_rate: isIncome \? num\(els\.salesTaxRate\.value\) : 0/, 'the existing sales-tax-rate field remains the persistence contract');

assert.doesNotMatch(finance, /Tax Exempt Sale Helper V1|taxExemptSaleBound/, 'no competing tax-exempt helper or duplicate listeners remain');

console.log('Finance Pro tax-exempt manual income assertions passed.');
