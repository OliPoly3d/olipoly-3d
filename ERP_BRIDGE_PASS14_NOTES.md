# OliPoly ERP Bridge Pass 14

## Purpose
Fix quote acceptance failing on Supabase `orders_status_check`.

## Root cause
The Quote Tool was inserting newer/friendly Orders Admin status values such as `awaiting_production` / payment-related flow labels during order creation. The current Supabase `orders.status` check constraint allows the older controlled status list, including `awaiting_approval`.

## Fix
Quote acceptance now creates the Orders Admin row with:

```js
status: "awaiting_approval"
```

Payment status remains constraint-safe through the prior patch:

```js
payment_status: "unpaid" // when deposit is 0
payment_status: "deposit_due" // when deposit is required
```

## Expected result
Accepting a quote should now create the matching `OP-#####` order without an `orders_status_check` error. Production Control should still move to Awaiting Design / Actuals via the production back-sync path.

## Files included
- `quote.js`
- `js/quote.js`
- `quote.html` cache-bust update

## SQL
No migration needed.

## Test
1. Upload these files.
2. Hard refresh `quote.html`.
3. Load the saved test quote.
4. Accept/create order.
5. Confirm no check constraint error.
6. Confirm Orders Admin has the matching OP number.
7. Confirm Production Control lands in Awaiting Design / Actuals.
