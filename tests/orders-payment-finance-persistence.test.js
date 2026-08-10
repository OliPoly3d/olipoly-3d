const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const admin = fs.readFileSync('orders-admin.html', 'utf8');
const workflowSource = fs.readFileSync('js/workflow-status.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202608100001_authoritative_order_payment_command.sql', 'utf8');

const sandbox = { globalThis: {}, module: { exports: {} }, exports: {} };
vm.runInNewContext(workflowSource, sandbox);
const workflow = sandbox.module.exports;
const order = {id:'11111111-1111-1111-1111-111111111111', order_number:'OP-000189', updated_at:'2026-08-10T00:00:00Z'};
const request = workflow.markOrderPaidRpcRequest(order, order.updated_at);

assert.strictEqual(request.path, '/rest/v1/rpc/mark_order_paid', 'Mark Paid uses the authoritative payment RPC');
assert.deepStrictEqual(Object.keys(request.body).sort(), ['p_correlation_id','p_expected_updated_at','p_order_id'], 'payment payload contains identity, concurrency version, and Order ID only');
assert.match(admin, /const paymentRequestsInFlight = new Set\(\)/, 'duplicate payment clicks are guarded');
assert.match(admin, /paymentRequestsInFlight\.has\(order\.id\)/, 'only one payment request can be active per Order');
assert.match(admin, /const authoritative = Array\.isArray\(result\.data\)[\s\S]*authoritative\.payment_status !== 'paid'[\s\S]*orders = orders\.map[\s\S]*loadIntoForm/, 'detail and list state update only from the authoritative response');
assert.match(admin, /Payment \(command controlled\)[\s\S]*select id="paymentStatus" disabled aria-readonly="true"/, 'payment dropdown cannot fake a protected payment edit');
assert.doesNotMatch(admin.match(/const ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS[\s\S]*?\];/)[0], /payment_status|balance_amount|paid_date/, 'normal Save excludes canonical payment fields');
assert.match(admin, /Cannot push to Finance: this Order is still marked Unpaid\./, 'unpaid Finance preflight is explicit');
assert.match(admin, /financePostRequestsInFlight\.has\(requestKey\)/, 'Finance duplicate dispatch remains guarded');

assert.match(migration, /auth\.uid\(\)[\s\S]*Authenticated order owner is required/, 'payment RPC requires authentication');
assert.match(migration, /where id=p_order_id and user_id=v_actor for update/, 'payment RPC locks the owner-scoped Order');
assert.match(migration, /updated_at is distinct from p_expected_updated_at[\s\S]*errcode='40001'/, 'payment RPC enforces optimistic concurrency');
assert.match(migration, /payment_status='paid', balance_amount=0, paid_date=coalesce\(paid_date,v_now::date\), updated_at=v_now/, 'canonical payment fields persist while existing totals and paid date are preserved');
assert.match(migration, /order_payment_command_receipts[\s\S]*command_identity text primary key/, 'payment command has an idempotency receipt');
assert.match(migration, /return next v_order/, 'payment command returns the authoritative Order row');
assert.match(migration, /FINANCE_PAYMENT_INCOMPLETE: Order is still marked Unpaid/, 'Finance authority rejects unpaid Orders server-side');
assert.match(migration, /revoke all on table public\.order_payment_command_receipts from public, anon, authenticated/, 'receipt writes are not exposed to browser roles');
assert.doesNotMatch(migration, /grant update[\s\S]*payment_status/, 'migration does not restore direct protected-field UPDATE grants');

console.log('Orders payment persistence and Finance eligibility contract passed.');
