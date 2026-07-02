# OliPoly Engine v1.0 Readiness Report

Baseline reviewed: `olipoly-3d-main(40).zip`

## Executive assessment

OliPoly Engine is now in the stabilization phase, not the feature-building phase. The core modules exist and the major workflows are present. The highest-value work before v1.0 is reliability, consistency, documentation, and reducing surprise behavior.

Estimated readiness: **v0.95**

## Module grades

| Module | Grade | Notes |
|---|---:|---|
| Hub | A- | Strong command center and Search v2 behavior. Keep it as launcher/navigation for now. Hold Business Pulse for later. |
| Orders Admin | B+ | Very capable, but large and fragile. Search works after latest fix; keep changes isolated. Needs regression testing after every update. |
| Production Control | A- | Strong workflow coverage including cancel/archive. Some card readability and status consistency should remain part of polish passes. |
| Inventory Control | A- | Powerful and visually strong. Reorder policy is the right direction. Needs final wording/health-message cleanup and sync discipline. |
| Finance Pro | A- | Mature and useful. Sales tax/county/report logic is now high-value. Avoid major changes unless fixing specific bugs. |
| Quote Tool | A- | Good workflow foundation. Needs continued verification around Quote → Order handoff. |
| Customer 360 | B | Good v1 start. Further development intentionally postponed. |
| ERP Handbook / Knowledge Library | B+ | Present and useful. Needs updated current-state workflow documentation. |

## Critical before v1.0

1. **Freeze broad multi-page changes** unless the sprint is explicitly integration-related.
2. **Run workflow regression tests** after every release:
   - Quote → Order
   - Order → Production
   - Production closeout → Inventory
   - Production closeout / order payment → Finance
   - Finance reports
   - Hub search and module search
3. **Keep Search v2 architecture**:
   - Hub routes clean searches.
   - Modules own their own filtering.
   - Do not replace all module search logic at once.
4. **Internal pages should not be indexed.** This package adds `noindex, nofollow` to core private ERP pages that were missing it.

## Recommended next fixes

1. **Workflow audit sprint**
   - Verify each workflow with a real or test record.
   - Add notes where a manual step is still expected.

2. **UI consistency sprint**
   - Standard status badge colors.
   - Standard search banner style.
   - Standard Hub / Back / Refresh button placement.
   - Consistent empty states.

3. **Inventory finalization sprint**
   - Final wording for Auto / Specialty / Watch / Seasonal / Discontinued.
   - Confirm low stock prompts do not nag for intentional low materials.
   - Confirm mounted roll and reserved inventory behavior.

4. **Documentation sprint**
   - Update ERP Handbook with current backend workflow.
   - Add Search v2 guide.
   - Add Inventory sync / recovery guide.
   - Add Sales tax filing checklist.

## Do not touch for now

- Customer 360 expansion
- Business Pulse
- New AI-style recommendations
- Major shared JS refactor
- Public/customer-facing redesign

## Technical debt to monitor

- Large inline HTML/JS pages are powerful but fragile.
- Shared formatting/status/search helpers should eventually be extracted, but only after v1.0 is stable.
- Root-level historical sprint notes may eventually be moved to `/docs/internal/` or `/archive/` to keep the repository clean.

## Quality gate for v1.0

Before calling this v1.0, verify:

- No console syntax errors on core backend pages.
- Cloud sync does not loop or spam requests.
- Search works in Hub, Orders, Production, Inventory, Finance, and Quote.
- Orders Admin loads with dark/private styling.
- Inventory sync and local recovery are understandable.
- Finance Ohio sales tax filing summary matches known test entries.
- Production canceled jobs release inventory reservations.
- Track page displays only customer-safe information.

## Version recommendation

Current: **v0.95**

Target next checkpoint: **OliPoly Engine v1.0 - Stabilized Backend Foundation**
