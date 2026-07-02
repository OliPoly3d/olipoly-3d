# ERP 1.0.1 Critical Fixes Notes

Baseline: `olipoly-3d-main(41).zip`

## Changes in this package

1. Updated `erp-handbook.html` so it matches the current backend architecture:
   - Hub is documented as a search/launcher and lightweight attention page.
   - Source modules remain the record of truth.
   - Old references to Action Queue, Executive Dashboard, Material Planner, Scheduler, and Data Health were removed or rewritten.
   - Added a Search v2 section explaining Hub routing and module-owned filtering.

2. Added quality-gate documentation:
   - `OLIPOLY_ENGINE_1_0_QUALITY_GATE.md`
   - `ERP_1_0_WORKFLOW_REGRESSION_CHECKLIST.md`

## What this package does not change

- No Supabase schema changes.
- No customer-facing redesign.
- No Customer 360 expansion.
- No Business Pulse work.
- No major shared-JS refactor.
- No changes to order, finance, production, inventory, or quote business logic.

## Recommended commit message

`ERP 1.0.1 critical documentation and quality gate`
