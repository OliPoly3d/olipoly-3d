const assert = require('node:assert/strict');
const fs = require('node:fs');

const historical = fs.readFileSync('supabase/migrations/202608010003_authoritative_order_finance_tax_metadata.sql','utf8');
const repair = fs.readFileSync('supabase/migrations/202608020004_restore_ohio_county_validator.sql','utf8');
const correction = fs.readFileSync('supabase/migrations/202608020003_repair_finance_adjustment_helper_resolution.sql','utf8');
const postgresTest = fs.readFileSync('tests/sql/finance-adjustment-helper-postgres.test.sql','utf8');
const verification = fs.readFileSync('supabase/verification/finance_ohio_county_contract.sql','utf8');

const definition = sql => sql.match(/create or replace function public\.is_ohio_county\(p_county text\)[\s\S]*?\$\$;/i)?.[0];
const counties = sql => [...definition(sql).matchAll(/'([A-Za-z ]+)'/g)].map(match => match[1]);
assert.ok(definition(historical), 'historical authoritative county helper exists');
assert.ok(definition(repair), 'focused repair restores the missing helper');
assert.deepEqual(counties(repair), counties(historical), 'repair reuses the authoritative county list exactly');
assert.equal(counties(repair).length, 88, 'canonical validator contains all 88 Ohio counties');
assert.equal(new Set(counties(repair)).size, 88, 'canonical county list has no duplicates');
assert.ok(counties(repair).includes('Portage') && counties(repair).includes('Summit'), 'acceptance counties are canonical');
assert.ok(!counties(repair).includes('FakeCounty'), 'invalid fixture is not canonical');
assert.match(repair, /returns boolean\s*language sql immutable set search_path=pg_catalog,pg_temp/i, 'helper is immutable with a fixed safe search path');
assert.match(repair, /revoke all on function public\.is_ohio_county\(text\) from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role;/i, 'historical narrow grants are preserved');
assert.doesNotMatch(repair, /alter table|update public\.financial_entries|taxable_sales/i, 'focused dependency repair changes no ledger schema, rows, or totals');
assert.match(correction, /public\.is_ohio_county\(p_corrected_record->>'sales_county'\)/, 'authoritative correction calls the restored exact signature');
assert.doesNotMatch(postgresTest.slice(0,postgresTest.indexOf('\\ir ../../supabase/migrations/202608020003')), /create (or replace )?function public\.is_ohio_county/i, 'PostgreSQL fixture does not mask the migration dependency with a stub');
assert.match(postgresTest, /202608020003_repair_finance_adjustment_helper_resolution\.sql[\s\S]*202608020004_restore_ohio_county_validator\.sql[\s\S]*correct_financial_entry\(/, 'PostgreSQL test deploys dependency then executes the real correction RPC');
for (const [county, expected] of [['Portage',true],['Summit',true],['FakeCounty',false]]) {
  assert.equal(counties(repair).includes(county), expected, `${county} validation expectation`);
  assert.match(verification, new RegExp(`select public\\.is_ohio_county\\('${county}'\\)`), `deployment SQL verifies ${county}`);
}
console.log('Finance Ohio county dependency contract passed (88 canonical counties).');
