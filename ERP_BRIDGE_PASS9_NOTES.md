# ERP Bridge Pass 9

Fixes Production Control → Quote Tool cost handoff.

## Issue fixed
Quote Tool was loading the linked Q-number, but the Detailed Output section still showed local/manual quote values instead of the Production Control estimate costs.

## Changes
- Production Control now includes internal estimate cost fields in the quote draft:
  - material cost
  - machine hours/rate/cost
  - design hours/rate/cost
  - post/supply/packaging/shipping
  - direct cost
  - overhead cost
  - break-even
- Quote Tool now applies those values to the existing calculator inputs and re-applies the Detailed Output display after legacy quote rendering runs.

## Expected
From Production Control estimate `Q-00001`:
- Quote Tool shows `Q-00001`
- Invoice shows `INV-00001`
- Detailed Output shows Production Control direct/overhead/break-even values instead of `$0.00`/wrong manual-only values.

## SQL
No SQL migration required.
