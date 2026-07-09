# ERP Bridge Pass 20 — Production Control Button/Lane Cleanup

## Purpose
This pass cleans up Production Control card behavior after the ERP bridge started working.

## Changes
- Removed duplicate Quote/Order ID display on production cards.
  - Cards now show a single combined chip like `Q-000006 • OP-000006`.
- Removed `Push to Quote` from cards once an OP/order exists or the quote has already been sent.
- Made bottom card buttons lifecycle-aware:
  - Estimate: Push to Quote / Cancel / Details
  - Quote Sent: Mark Declined / Revise-Resend Quote / Cancel / Details
  - Awaiting Actuals: Confirm Plan-Reserve / Cancel / Details
  - Ready or Queued: Start Print / Move Back / Cancel / Details
  - Printing: Move Back / Send to QC / Cancel / Details
  - QC: Move Back / QC Complete-Close / Details
- Changed `Move Back` from a blind move to `Queued` into a prompt with options:
  1. Awaiting Design / Actuals
  2. Ready to Print / Plan Confirmed
  3. Keep In Production / Rework Needed
- If moving back would release reserved material, the page asks for confirmation.

## Files
- production-control.html

## SQL
No SQL migration required.

## Test
1. Open a linked OP card in Production Control.
2. Confirm Q/OP appears once as a combined chip.
3. Confirm `Push to Quote` is not visible once OP exists.
4. Click `Move Back` from a ready/printing card and confirm the prompt appears.
5. Choose option 1, 2, or 3 and confirm the Orders Admin status still stays aligned.
