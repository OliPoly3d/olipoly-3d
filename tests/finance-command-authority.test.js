const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const migrationPath = 'supabase/migrations/202607210005_authoritative_finance_posting_corrections.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const orders = fs.readFileSync('orders-admin.html', 'utf8');
const workflowSource = fs.readFileSync('js/workflow-status.js', 'utf8');
const financeDoc = fs.readFileSync('ERP_FINANCE_AUTHORITY_VERIFICATION.md', 'utf8');
const deployedDoc = fs.readFileSync('ERP_DEPLOYED_CONTRACT_INVENTORY.md', 'utf8');

assert.match(migration, /create or replace function public\.post_order_finance_income\(\s*p_order_id uuid,\s*p_order_number text,\s*p_expected_updated_at timestamptz,\s*p_correlation_id text\s*\)/i, 'Order posting command RPC must exist with immutable identity and Order UUID/number');
assert.match(migration, /create or replace function public\.append_finance_correction/i, 'append-only correction command RPC must exist');
for (const fn of ['post_order_finance_income', 'append_finance_correction']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public, pg_temp`, 'i'), `${fn} must be SECURITY DEFINER with fixed search_path`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*from public, anon`, 'i'), `${fn} must revoke PUBLIC/anon execution`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to authenticated, service_role`, 'i'), `${fn} must grant reviewed roles only`);
}
assert.match(migration, /v_actor uuid := auth\.uid\(\)/, 'commands must use authenticated owner identity');
assert.match(migration, /for update/g, 'commands must lock relevant Order and Finance rows');
assert.match(migration, /order_id uuid/);
assert.match(migration, /order_number text/);
assert.match(migration, /accepted_commercial_snapshot jsonb/);
assert.match(migration, /financial_entries_order_income_once[\s\S]*where finance_command = 'post_order_income'/i, 'duplicate Order income posting must be prevented');
assert.match(migration, /return jsonb_build_object\('idempotent', true/, 'valid retries return original result');
assert.match(migration, /Finance command identity is already used for another owner, Order, entry, or command/, 'identity collision must fail');
assert.match(migration, /source', 'accepted_order_snapshot_from_orders_not_mutable_quote_recalculation'/, 'accepted values must not be recalculated from Quote fields');
assert.doesNotMatch(migration, /from public\.quotes/i, 'Finance posting must not recalculate from mutable Quote rows');
assert.match(migration, /Correction entries cannot be reversed or corrected again/, 'correction chains must be blocked');
assert.match(migration, /Finance entry has already been reversed/, 'double reversal must be prevented');
assert.doesNotMatch(migration, /\n\s*update\s+public\.financial_entries\b/i, 'corrections must not update original Finance entries');
assert.doesNotMatch(migration, /\n\s*delete\s+from\s+public\.financial_entries\b/i, 'corrections must not delete Finance entries');
assert.match(migration, /revoke insert, update, delete on table public\.financial_entries from anon/i, 'anon mutations must be revoked');
assert.match(migration, /grant select, insert, update, delete on table public\.financial_entries to authenticated/i, 'manual Finance entry creation remains available temporarily');
assert.match(migration, /revoke update\(order_id, order_number, finance_command_id, finance_command, finance_command_owned, correction_of_entry_id, reversal_of_entry_id, posted_by, posted_at, correction_reason, accepted_commercial_snapshot\)/i, 'browser-direct mutation of command-owned columns must be blocked');
assert.match(migration, /update public\.orders[\s\S]*finance_pushed = true/, 'command atomically owns order finance_pushed mutation');
assert.match(migration, /Consolidated read-only JSONB verification query/, 'consolidated verification query must be included');

assert.match(orders, /postOrderToFinanceCommand/);
assert.match(workflowSource, /\/rest\/v1\/rpc\/post_order_finance_income/);
assert.doesNotMatch(orders, /method: 'POST',[\s\S]{0,180}\/rest\/v1\/financial_entries/, 'Orders Admin must not directly POST Order-derived Finance entries');
assert.doesNotMatch(orders, /finance_pushed:\s*true/, 'Orders Admin must not directly mutate finance_pushed');
assert.match(orders, /await postOrderToFinanceCommand\(currentOrder\)[\s\S]*await fetchOrders\(\)/, 'client waits for authoritative response before local refresh');

const memory = new Map();
const sandbox = { module: { exports: {} }, globalThis: { crypto: { randomUUID: () => 'stable-finance-id' }, localStorage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) } } };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(workflowSource, sandbox);
const workflow = sandbox.module.exports;
const first = workflow.financeOrderPostingRpcRequest({ id:'11111111-1111-1111-1111-111111111111', order_number:'OP-000123' }, '2026-07-21T00:00:00Z');
const second = workflow.financeOrderPostingRpcRequest({ id:'11111111-1111-1111-1111-111111111111', order_number:'OP-000123' }, '2026-07-21T00:00:00Z');
assert.equal(first.path, '/rest/v1/rpc/post_order_finance_income');
assert.equal(first.body.p_correlation_id, second.body.p_correlation_id, 'retry identity must be stable');
assert.throws(() => workflow.financeOrderPostingRpcRequest({ id:'x', order_number:'OP-1' }), /expected_updated_at/);
assert.equal(workflow.financeCorrectionRpcRequest('22222222-2222-2222-2222-222222222222', 'reverse', 10, 'customer refund').path, '/rest/v1/rpc/append_finance_correction');

assert.match(financeDoc, /74 rows: 22 income and 52 expense/);
assert.match(financeDoc, /Five craft-show income rows are duplicate candidates but are not proven duplicates/);
assert.match(financeDoc, /unresolved, not duplicates/i);
assert.match(deployedDoc, /`financial_entries` has 74 rows/);
assert.match(deployedDoc, /202607210005_authoritative_finance_posting_corrections\.sql/);

console.log('Finance command authority assertions passed.');
