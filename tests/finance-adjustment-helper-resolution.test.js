const assert = require('node:assert/strict');
const fs = require('node:fs');

const path = 'supabase/migrations/202608020003_repair_finance_adjustment_helper_resolution.sql';
const sql = fs.readFileSync(path, 'utf8');
const postgresTest = fs.readFileSync('tests/sql/finance-adjustment-helper-postgres.test.sql', 'utf8');
const verification = fs.readFileSync('supabase/verification/finance_correction_helper_contract.sql', 'utf8');
const rpcStart = sql.indexOf('create or replace function public.correct_financial_entry');
const rpc = sql.slice(rpcStart, sql.indexOf('end $$;', rpcStart) + 7);

assert.match(sql, /create or replace function public\.finance_adjustment_value\(\s*p_adjustments jsonb,\s*p_key text\s*\) returns numeric\s*language plpgsql\s*immutable\s*security invoker\s*set search_path = pg_catalog, pg_temp/i, 'helper has one exact jsonb,text -> numeric contract');
assert.ok(sql.indexOf('create or replace function public.finance_adjustment_value') < rpcStart, 'helper dependency is declared before the correction RPC');
assert.equal((sql.match(/create or replace function public\.finance_adjustment_value/g) || []).length, 1, 'migration creates no arbitrary overload');
assert.match(sql, /revoke all on function public\.finance_adjustment_value\(jsonb,text\)[\s\S]*from public, anon, authenticated/i, 'helper is not directly browser executable');
assert.match(sql, /v_allowed_keys constant text\[\][\s\S]*'amount','original_amount','sales_tax_rate','sales_tax_collected'/, 'canonical numeric Finance keys are explicit');
assert.doesNotMatch(sql.slice(0, rpcStart), /taxable_sales/, 'helper has no stale taxable_sales key');
assert.match(sql, /Unknown Finance adjustment key:[\s\S]*errcode = '22023'/, 'unknown keys reject deterministically');

const calls = [...rpc.matchAll(/public\.finance_adjustment_value\(([^;]*?)\)/g)].map(match => match[0]);
assert.equal(calls.length, 13, 'all authoritative correction helper calls are inventoried');
for (const call of calls) {
  assert.match(call, /^public\.finance_adjustment_value\(p_corrected_record,'[a-z_]+'::text\)$/,
    `helper call has deterministic jsonb,text argument types: ${call}`);
  assert.doesNotMatch(call, /\bnull\b|\bcase\b/i, `helper call has no untyped NULL/CASE expression: ${call}`);
}
assert.doesNotMatch(rpc, /finance_adjustment_value\([^,]+,'[a-z_]+'\)/, 'no uncast string literal remains in authoritative RPC');
assert.doesNotMatch(rpc, /taxable_sales/, 'no stale taxable-sales dependency returns');
assert.doesNotMatch(rpc, /update public\.financial_entries/i, 'original ledger remains immutable');

assert.match(postgresTest, /\\ir \.\.\/\.\.\/supabase\/migrations\/202608020003_repair_finance_adjustment_helper_resolution\.sql/, 'representative PostgreSQL schema compiles the actual migration');
assert.match(postgresTest, /correct_financial_entry\([\s\S]*array\['sales_county'\]::text\[[\s\S]*false,[\s\S]*null::text/, 'PostgreSQL fixture executes county-only correction with override disabled');
assert.match(postgresTest, /correction_kind' <> 'metadata_only'[\s\S]*unexpected monetary correction[\s\S]*original mutated/, 'fixture asserts metadata-only, zero-duplication, immutable behavior');
assert.match(postgresTest, /finance_adjustment_value\('\{"gross_sales":1\}'::jsonb,'gross_sales'::text\)[\s\S]*sqlstate '22023'/, 'fixture executes unknown-key rejection');
assert.match(verification, /pg_get_functiondef[\s\S]*has_function_privilege[\s\S]*helper_overload_count/, 'deployment verification reports definitions, grants, and overload count');

console.log(`Finance adjustment helper resolution passed (${calls.length} explicitly typed calls).`);
