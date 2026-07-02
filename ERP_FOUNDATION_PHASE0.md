# OliPoly Engine ERP Foundation — Phase 0

## Purpose
Create one shared operating language for the private/backend ERP before adding deeper integrations. This phase is intentionally non-invasive: it documents conventions and the implementation sequence so future changes are safer.

## Private vs public visual language
- Public/customer pages: lighter premium OliPoly brand.
- Private/backend pages: dark command-center language, except Inventory may remain a lighter visual operations board when that improves scanability.
- Hub is the private front door and should prioritize actions over reporting.

## Core backend modules
- `hub.html` — private command center
- `orders-admin.html` — customer/order source of truth
- `production-control.html` — print/job source of truth
- `inventory-control.html` — materials/supplies/finished goods source of truth
- `finance-pro.html` + `finance-pro.js` — money/tax source of truth
- `quote.html` + `quote.js` — quote creation/acceptance bridge
- `erp-handbook.html` — operating manual
- `erp-knowledge-library.html` — troubleshooting/settings/process library

## Deep-link conventions
Use URL query parameters that do not require schema changes:

| Entity | Recommended parameter | Example |
|---|---|---|
| Order / OP | `?order=OP-1042` | `orders-admin.html?order=OP-1042` |
| Quote | `?quote=Q-1042` | `quote.html?quote=Q-1042` |
| Customer | `?customer=Smith` | `orders-admin.html?customer=Smith` |
| Material | `?material=PETG%20Black` | `inventory-control.html?material=PETG%20Black` |
| Category | `?category=Event%20Booth` | `finance-pro.html?category=Event%20Booth` |
| Search | `?q=Niles` | `hub.html?q=Niles` |

Rules:
1. Receiving pages should never fail if they do not understand a parameter.
2. Parameters should prefill filters/search only; they should not auto-save anything.
3. Links should be additive and safe.

## Hub attention language
Hub should translate details into action levels:

### Action required
- Specific, actionable, named when useful.
- Example: `Reorder PETG Black` or `3 materials need reorder`.

### Heads-up
- Summary wording, no technical policy names.
- Example: `Specialty inventory — 1 item below preferred stock. No action required.`

### FYI / healthy
- Only shown when there are no higher-priority items.
- Example: `Inventory healthy`.

## Inventory v2 policy wording
Inventory Control may store detailed policies such as `automatic`, `specialty`, `seasonal`, `watch`, `discontinued`, or snooze dates. Hub should translate those into calm language:

- automatic + low/out = reorder action
- specialty/watch/seasonal + low/out = heads-up only
- discontinued/snoozed = suppressed unless there is a sync/data issue

## Status language
Use the same end-state terms everywhere:

- Active / Open
- Waiting
- Scheduled
- Printing
- Post-print
- Delivery scheduled
- Closed
- Canceled
- Archived

Closed = completed successfully.  
Canceled = stopped, retained for history, should not remain in active queues.  
Archived = old/historical, retained but hidden by default.

## Risk policy for future sprints
Low-risk changes:
- Links
- URL filter handling
- Wording
- Visual consistency
- Hub attention summaries

Medium-risk changes:
- Cross-page localStorage summary formats
- Shared JS utilities loaded by multiple pages
- Refactoring repeated helpers

High-risk changes:
- Supabase schema changes
- Save/update payload changes
- Auth changes
- Inventory deduction/release logic
- Finance tax calculations

High-risk changes should be separate sprints with explicit test cases.

## Verification standard
Every integration sprint should include a short checklist:
- Page loads without console-breaking symptoms.
- Login still works where applicable.
- Existing records display.
- Save/edit/delete still works on touched modules.
- New links/filter params do not break normal page visits.
- Mobile layout remains usable.
