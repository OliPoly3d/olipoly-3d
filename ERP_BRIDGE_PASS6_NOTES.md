# OliPoly ERP Bridge Pass 6

## Purpose

This pass updates the navigation/reporting layer and handbook documentation after the ERP Bridge architecture change.

## Files included

- `hub.html`
- `erp-handbook.html`
- `ERP_BRIDGE_PASS6_NOTES.md`

## Hub changes

- Updates Hub copy so Production Control is presented as the ERP starting point.
- Adds an ERP Flow Map quick card linking to `erp-handbook.html#workflow`.
- Updates Production, Quote, Orders, and Finance descriptions to match the new architecture.
- Adjusts Hub attention/pulse wording around quote follow-up and accepted jobs needing actuals.
- Keeps Hub lightweight; no new Supabase migration required.

## Handbook changes

- Replaces the older static handbook with an interactive click-through ERP workflow map.
- Adds visual/Visio-style lifecycle map with clickable steps and decision branches.
- Documents:
  - Production Control as source of truth for estimates/Q numbers/production.
  - Quote Tool as the customer-facing publisher.
  - Orders Admin as fulfillment/tracker/payment/Finance handoff.
  - Inventory reservation and consumption timing.
  - Finance Pro separation from gram-level inventory.
  - Declined/void/revision/cancellation rollback rules.
  - ERP 1.0 release candidate test path.

## Does Hub need this to function?

No. The ERP bridge can function without Hub being updated.

But Hub should be updated for a seamless operating experience because it is the command center and its labels/attention cards should match the new workflow.

## SQL

No SQL migration required for Pass 6.

## Testing

1. Open `hub.html`.
2. Confirm the new ERP Flow Map quick card opens the Handbook flow section.
3. Confirm quick cards still open Production, Orders, Inventory, Finance.
4. Open `erp-handbook.html`.
5. Click through every lifecycle box.
6. Test search terms: `declined`, `reserve`, `finance`, `rollback`, `actuals`.
