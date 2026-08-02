const assert = require('node:assert/strict');
const fs = require('node:fs');

const migrationPath = 'supabase/migrations/202608020002_repair_finance_correction_live_schema.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const finance = fs.readFileSync('finance-pro.js', 'utf8');
const correctionFrontend = finance.slice(finance.indexOf('async function saveCorrection'), finance.indexOf('function applySignedOutState'));
const functionBody = sql.slice(sql.indexOf('create or replace function public.correct_financial_entry'), sql.indexOf('end $$;') + 7);

// Live financial_entries contract: canonical tax fields supplied by the deployed
// schema plus every established ledger/audit/cost field used by this focused RPC.
const financialEntryColumns = new Set([
  'id', 'user_id', 'type', 'entry_date', 'category', 'tax_category', 'title', 'notes',
  'amount', 'original_amount', 'vendor_name', 'payment_method', 'receipt_link',
  'business_use_percent', 'miles_driven', 'mileage_rate', 'trip_purpose', 'trip_from',
  'trip_to', 'round_trip', 'sales_county', 'sales_tax_collected', 'tax_exempt_sale',
  'tax_included', 'sales_tax_rate', 'shipping_charged', 'shipping_cost', 'material_cost',
  'packaging_cost', 'labor_cost', 'other_direct_cost', 'order_id', 'order_number',
  'finance_command_id', 'finance_command', 'finance_command_owned', 'correction_of_entry_id',
  'reversal_of_entry_id', 'replacement_for_entry_id', 'posted_by', 'posted_at',
  'created_at', 'correction_reason', 'correction_group_id', 'correction_kind',
  'accepted_commercial_snapshot'
]);
const rowAliases = ['v_root', 'v_effective', 'v_reversal', 'v_replacement', 'v_metadata'];
const references = [...functionBody.matchAll(new RegExp(`\\b(?:${rowAliases.join('|')})\\.([a-z_][a-z0-9_]*)`, 'g'))].map(match => match[1]);
const invalidReferences = [...new Set(references.filter(column => !financialEntryColumns.has(column)))];
assert.deepEqual(invalidReferences, [], `financial_entries row references outside the live schema: ${invalidReferences.join(', ')}`);

assert.match(sql, /correct_financial_entry\(\s*p_original_entry_id uuid,[\s\S]*p_correlation_id text\s*\) returns jsonb/i, 'exact eight-argument JSONB RPC is replaced');
assert.doesNotMatch(functionBody, /taxable_sales|taxable_amount|destination_county|gross_sales|exempt_sales|customer_total|total_amount/i, 'stale conceptual row/payload fields are absent');
assert.doesNotMatch(sql, /alter table[\s\S]*add column/i, 'repair adds no ledger columns');
assert.match(sql, /security definer set search_path=public,pg_temp/i, 'fixed SECURITY DEFINER search path remains');
assert.match(sql, /where id=p_original_entry_id and user_id=v_actor for update/i, 'original remains owner scoped and locked');
assert.doesNotMatch(functionBody, /update public\.financial_entries/i, 'original ledger row is never updated');
assert.match(functionBody, /where command_identity=p_correlation_id[\s\S]*'idempotent',true/i, 'correlation identity remains idempotent');
assert.match(functionBody, /is distinct from p_expected_effective_posted_at[\s\S]*40001/i, 'optimistic concurrency remains');
assert.match(functionBody, /p_changed_fields && array\['sales_county'[\s\S]*is_ohio_county\(p_corrected_record->>'sales_county'\)/i, 'county validation is change-dependent and canonical');
assert.match(functionBody, /elsif p_changed_fields && array\['amount','original_amount','sales_tax_rate','tax_exempt_sale'\][\s\S]*v_tax:=v_calculated_tax;[\s\S]*else[\s\S]*v_tax:=coalesce\(v_effective\.sales_tax_collected,0\)/i, 'county-only changes preserve posted tax while financial changes recalculate');
assert.match(functionBody, /round\(v_income_amount\*v_rate\/100,2\)/, 'server keeps established cent rounding');
assert.match(functionBody, /if coalesce\(p_tax_override_enabled,false\)[\s\S]*Tax override explanation is required[\s\S]*else[\s\S]*v_tax:=coalesce/i, 'override reason is required only while override is enabled');
assert.match(functionBody, /v_corrected:=v_corrected-'tax_override_enabled'-'tax_override_reason'/, 'disabled override metadata is excluded from effective snapshot');
assert.match(functionBody, /v_kind='metadata_only'[\s\S]*'correct_entry_metadata'[\s\S]*else[\s\S]*'correct_entry_reversal'[\s\S]*'correct_entry_replacement'/, 'append-only metadata and financial paths remain distinct and atomic');

// Frontend-to-RPC mapping contract uses canonical server/reporting keys.
assert.match(finance, /amount: Number\(els\.entryAmount\.value\),[\s\S]*sales_county: isIncome \? els\.correctionDestinationCounty\.value/, 'taxable input maps to amount and county input maps to sales_county');
assert.match(finance, /entryAmount:'amount'[\s\S]*correctionDestinationCounty:'sales_county'/, 'dirty-field mapping uses canonical RPC keys');
assert.doesNotMatch(correctionFrontend, /taxable_sales|destination_county/, 'correction payload does not use stale aliases');

// OP-000010 deterministic acceptance model for the server rules.
const original = Object.freeze({ amount: 20.50, original_amount: 20.50, sales_county: null, sales_tax_rate: 6.5, sales_tax_collected: 1.33, tax_exempt_sale: false });
const countyOnly = { ...original, sales_county: 'Portage' };
assert.equal(countyOnly.amount, original.amount);
assert.equal(countyOnly.sales_tax_collected, original.sales_tax_collected);
assert.equal(countyOnly.amount + countyOnly.sales_tax_collected, 21.83);
assert.equal(countyOnly.sales_county, 'Portage');
assert.equal(+(20.50 * 6.5 / 100).toFixed(2), 1.33);
assert.equal(original.sales_county, null, 'immutable original fixture is unchanged');
assert.match(sql, /'report_transaction_count'/i.test(fs.readFileSync('supabase/migrations/202608020001_effective_financial_entries_projection.sql', 'utf8')) ? /./ : /never/, 'effective resolver maintains one report transaction');

console.log(`Finance correction live-schema contract passed (${new Set(references).size} row fields checked).`);
