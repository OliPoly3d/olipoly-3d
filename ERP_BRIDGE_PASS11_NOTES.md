# ERP Bridge Pass 11 — Payment Status Constraint Fix

## Why this patch exists
Pass 10 introduced `due_on_completion` as a stored `orders.payment_status` value for $0-deposit quotes.
Your Supabase table already has a check constraint named `orders_payment_status_check`, and that constraint does **not** allow `due_on_completion`.

That caused quote acceptance to fail with:

> new row for relation "orders" violates check constraint "orders_payment_status_check"

## Fix
This patch uses the existing allowed stored value:

- `unpaid`

for $0-deposit / due-at-completion orders.

The UI can still describe that situation as "Unpaid / Due on Completion", but the database stores a valid value.

## Files changed
- `quote.js`
- `orders-admin.html`
- `production-control.html` included unchanged for clean overwrite consistency

## Test
1. Create estimate in Production Control.
2. Push Quote.
3. Confirm quote/invoice numbers match Q-number.
4. Accept quote with $0 deposit.
5. Confirm order is created successfully.
6. Confirm Orders Admin payment shows unpaid/due-on-completion behavior, not Deposit Due.

## SQL
No SQL migration required.
