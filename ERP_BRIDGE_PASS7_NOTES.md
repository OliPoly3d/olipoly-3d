# ERP Bridge Pass 7 — Estimate Q-number prefill fix

## Why this pass exists
When starting a new Production Control estimate from the top Add Order/Add Job button, the Quote # field was not visibly pre-populating. The save handler would still assign a Q-number before saving, but the form did not show it immediately, which made the workflow feel wrong.

## What changed
- Added `maybeAssignQuoteNumberForNewEstimate()`.
- Clicking the top Add Order/Add Job button now opens the job editor in `estimate` mode and immediately requests the next cloud Q-number.
- Clicking the hero add button does the same.
- Changing Production Status to `Estimate Mode` on a new unsaved form also assigns a Q-number if one is missing.
- Existing/editing jobs are not renumbered.
- The existing save-time Q-number protection remains in place as a fallback.

## Important behavior
A Q-number is now burned/reserved when you intentionally start a new estimate from the add button. If you later cancel/void that estimate, the Q-number is not reused. That matches the ERP numbering decision.

## No SQL migration
No database change is required for this pass.
