const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('finance-pro.js', 'utf8');
const sql = fs.readFileSync('supabase/migrations/202608020002_repair_finance_correction_live_schema.sql', 'utf8');

assert.match(js, /correctionDirtyFields = new Set/);
assert.match(js, /p_changed_fields: changedFields/);
assert.match(js, /actualCorrectionChanges\(corrected\)/);
assert.match(js, /Change at least one field before creating a correction/);
assert.match(js, /changedFields\.includes\('sales_county'\)/);
assert.doesNotMatch(js, /if \(!taxExempt && !els\.correctionDestinationCounty\.value\)/);
assert.match(js, /overrideEnabled && \(!Number\.isFinite\(overrideAmount\)[\s\S]*!overrideReason\)/);
assert.match(js, /if \(els\.correctionTaxOverrideEnabled\.checked\) formRecord\.tax_override_reason/);
assert.match(js, /correctionDirtyFields\.has\('amount'\)[\s\S]*proposed\.sales_tax_collected = tax/);
assert.match(js, /correctionDirtyFields\.has\('sales_tax_rate'\)[\s\S]*proposed\.sales_tax_collected = tax/);
assert.match(js, /Customer\/order total:[\s\S]*Taxable subtotal:[\s\S]*Calculated tax:[\s\S]*Stored tax:/);
assert.match(js, /Taxable subtotal equals the full customer total while tax is also stored/);
assert.match(js, /Changed fields:[\s\S]*correctionFieldLabel/);
assert.match(js, /supabase\.rpc\(rpcName, rpcPayload\)/);
assert.doesNotMatch(js, /supabase\.rpc\(rpcName, rpcPayload\)[\s\S]*supabase\.rpc\(rpcName, rpcPayload\)/);
assert.match(sql, /v_proposed:=p_corrected_record;[\s\S]*jsonb_object_keys\(v_proposed\)[\s\S]*v_current->v_key is distinct from v_proposed->v_key/);
assert.match(sql, /v_kind:=case when exists[\s\S]*v_financial_keys/);
assert.match(sql, /if v_kind='metadata_only' then[\s\S]*v_corrected:=v_current\|\|v_proposed/);
assert.match(sql, /if not coalesce\(p_tax_override_enabled,false\) then v_corrected:=v_corrected-'tax_override_enabled'-'tax_override_reason'/);
assert.equal(+(20.50 * 6.5 / 100).toFixed(2), 1.33);

console.log('Change-dependent Finance correction assertions passed.');
