const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('finance-pro.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202608020001_effective_financial_entries_projection.sql', 'utf8');
const diagnostic = fs.readFileSync('supabase/verification/finance_effective_entry_trace.sql', 'utf8');

const original = { id:'original', sales_county:null, sales_tax_rate:null, amount:20.50, sales_tax_collected:1.33, shipping_charged:0, total:21.83 };
const receipts = [
  { created_at:'2026-08-01T10:00:00Z', status:'active', effective_record:{ sales_county:'Portage' } },
  { created_at:'2026-08-01T11:00:00Z', status:'voided', effective_record:{ sales_county:'Summit', sales_tax_rate:7.0 } },
  { created_at:'2026-08-01T12:00:00Z', status:'active', effective_record:{ ...original, sales_county:'Portage', sales_tax_rate:6.5 } }
];
const effective = receipts.filter(r => r.status !== 'voided').sort((a,b) => b.created_at.localeCompare(a.created_at))[0].effective_record;

assert.equal(original.sales_county, null, 'original remains unchanged');
assert.equal(original.sales_tax_rate, null, 'original rate remains unchanged');
assert.equal(effective.sales_county, 'Portage', 'county is overlaid');
assert.equal(effective.sales_tax_rate, 6.5, 'rate is overlaid');
assert.equal(effective.amount, 20.50, 'taxable sales carry forward');
assert.equal(effective.sales_tax_collected, 1.33, 'tax carries forward');
assert.equal(effective.total, 21.83, 'customer total carries forward');
assert.equal(+(effective.amount * effective.sales_tax_rate / 100).toFixed(2), 1.33, 'canonical tax reconciles');
assert.equal(receipts.filter(r => r.status !== 'voided').slice(-1).length, 1, 'effective projection contributes one transaction');
assert.equal(receipts.filter(r => r.status === 'voided')[0].effective_record.sales_county, 'Summit', 'voided correction is retained for audit but ignored');

assert.match(migration, /security invoker[\s\S]*root\.user_id = auth\.uid\(\)/i, 'resolver is owner scoped without bypassing RLS');
assert.match(migration, /order by r\.created_at desc, r\.command_identity desc[\s\S]*limit 1/i, 'latest deterministic active snapshot wins');
assert.match(migration, /correction_status', 'active'\) <> 'voided'/i, 'voided receipts are ignored');
assert.match(migration, /root\.correction_of_entry_id is null[\s\S]*root\.reversal_of_entry_id is null[\s\S]*root\.replacement_for_entry_id is null/i, 'correction ledger rows are not transactions');
assert.match(migration, /'report_transaction_count', 1/, 'each original contributes exactly one report transaction');
assert.match(migration, /'correction_history'[\s\S]*jsonb_agg[\s\S]*order by r\.created_at, r\.command_identity/, 'complete correction history remains available in authoritative order');
assert.doesNotMatch(migration, /update public\.financial_entries/i, 'resolver never mutates originals');
assert.doesNotMatch(migration, /grant update/i, 'resolver grants no update access');
assert.match(js, /supabase\.rpc\('get_effective_financial_entries'\)/, 'normal refresh fetches the server projection');
assert.doesNotMatch(js, /\.from\('financial_entries'\)\s*\.select\('\*'\)/, 'Finance Pro no longer loads raw rows for reporting');
assert.match(js, /function reportingEntries[\s\S]*report_transaction_count/, 'all reports consume one-row-per-original effective entries');
assert.match(js, /const list = filteredEntries\(\);[\s\S]*renderTable\(list\)[\s\S]*renderMonthlyTaxReport/, 'one refreshed array rerenders all visible consumers');
assert.match(js, /const taxableSubtotal = e\.tax_exempt_sale \? 0 : taxableSubtotalOf\(e\)/, 'filing taxable sales use the effective taxable subtotal');
assert.match(js, /const gross = taxableSubtotalOf\(e\) \+ num\(e\.shipping_charged\) \+ tax/, 'filing customer total reconciles without making tax taxable');
assert.match(js, /e\.is_corrected \? '<span class="type-pill">Corrected<\/span>'/, 'table shows corrected indicator');
assert.match(js, /Original Entry ID','Effective Entry ID','Metadata Correction ID'/, 'CSV keeps effective and audit identifiers');
assert.match(js, /Gross \/ Customer Total'[\s\S]*entry\.sales_county[\s\S]*entry\.sales_tax_rate[\s\S]*entry\.original_entry_id[\s\S]*entry\.effective_entry_id/, 'filing CSV uses effective tax values and preserves audit linkage');
assert.match(diagnostic, /original_county[\s\S]*corrected_county[\s\S]*effective_county/, 'diagnostic shows raw, corrected, and effective county');
assert.match(diagnostic, /original_rate[\s\S]*corrected_rate[\s\S]*effective_rate/, 'diagnostic shows raw, corrected, and effective rate');
assert.match(diagnostic, /effective_transaction_count/, 'diagnostic proves report count contribution');

console.log('Effective Finance reporting assertions passed.');
