# ERP Bridge Pass 18 Notes

## Focus
Production Control lane routing now treats the linked Orders Admin status as authoritative once an OP number exists.

## Fixes
- If Orders Admin shows `in_production`, Production Control forces the card into `WIP / Printing`.
- If Orders Admin shows `production_complete`, `ready_for_pickup`, `shipped`, or `completed`, Production Control routes the card into `Complete / Handoff`.
- Early order statuses still keep the card in Pre-Production unless the production card has already been advanced.
- Quote # / OP # badges remain visible for verification.

## Test
1. Upload `production-control.html`.
2. Hard refresh Production Control.
3. Open OP-000006 in Orders Admin and confirm it says In Production.
4. Refresh Production Control.
5. The matching card should route to WIP / Printing and show Q/OP badges.

No SQL migration required.
