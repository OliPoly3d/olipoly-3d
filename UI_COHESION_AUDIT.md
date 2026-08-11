# OliPoly ERP UI Cohesion Audit

## Scope and compatibility baseline

This presentation-only milestone covers Hub, Production Control, Orders Admin, Quote, Inventory Control, Customer 360, Product Recipes, Campaign Manager, ERP Handbook, and ERP Knowledge Library. `erp-knowledge.html` is not present; the authoritative knowledge page is `erp-knowledge-library.html`. File/document experiences are embedded in operational pages through the existing job-assets UI; no standalone private upload page is linked from Hub. Finance Pro is intentionally excluded.

Before markup changes, the pages were searched for `getElementById`, `querySelector`, `querySelectorAll`, `dataset`, `data-action`, `onclick`, `addEventListener`, form IDs/names, and button IDs. Existing functional markup was retained. The only operational markup addition is the terminal Canceled lifecycle visual step in Orders Admin. The shared shell is additive and identifies its own elements with `data-erp-shell` and `data-erp-auth`, avoiding collisions with page IDs.

## Page audit

| Page | Previous theme/header/auth/nav | Forms, cards, tables, status | Duplication and shared opportunity | Sensitive selectors/actions |
|---|---|---|---|---|
| `hub.html` | Mixed light Engine theme; bespoke pill header; no visible auth; page-local links | Search, quick cards, metric cards and chips each styled locally | Repeated topbar, cards, buttons, spacing and typography | `hubSearch`, `searchResults`, pulse/activity IDs and refresh/clear buttons |
| `production-control.html` | Large pink/purple light treatment with several late override sheets; auth in a collapsible section below header; bespoke action nav | Dense nested cards, lanes and details; rounded gradient controls; status/action markup generated in JS | Extensive inline tokens/components duplicate Inventory and Quote; shared shell, surfaces, controls and status treatment | `jobForm`, auth IDs, backup IDs, `data-production-workflow-job`, `data-workflow-command` (`start_print`, `pass_qc`), QC modal controls |
| `orders-admin.html` | Dark/navy presentation; login buttons in header while credentials lived below it; page-specific workspace bar | Dense card-on-card summaries and dark timeline; large form/table surface | Repeated buttons/forms/cards; lifecycle had a separate rendering source | Save/paid/Finance/close IDs, list/filter IDs, `.timeline-step[data-step]`, auth IDs |
| `quote.html` | Pink/purple gradient and oversized rounded cards; bespoke header; no consistent auth location | Multi-section forms and summaries with many local variants | Tokens/forms/buttons/cards duplicate Production and Inventory | save, PDF, prepare-email and accept IDs; all line/pricing field IDs retained |
| `inventory-control.html` | Pink/purple gradients, glass panels and pill header; no top auth | Dense material cards, roll tables, snapshot metrics and adjustment modal | Near-duplicate Production tokens/header/forms/buttons | raw/supply/finished forms, adjustment modal IDs, lifecycle buttons and data hooks |
| `customer-360.html` | Heavy dark navy theme; compact bespoke header; no top auth | Dark nested profile cards and generated status text | Duplicated dark tokens and basic components | search controls, generated reorder `.reorder[data-order]`, customer content IDs |
| `product-recipes.html` | Separate pink library theme; bespoke header; no top auth | Clean but page-local table/filter/modal components | Duplicated form/table/button/card styles | create/repeat dialog IDs and `data-repeat`, `data-revise`, `data-toggle` |
| `campaign-manager.html` | Minimal but visually isolated Engine page; no top auth | Two-column cards, repeated product forms and review statuses | Local CSS duplicates controls/cards/list rows | campaign form IDs; `data-id`, `data-detail`, `data-review`, `data-convert` |
| `erp-handbook.html` | Bespoke light handbook header; no top auth | Readable panels/cards/table but separate hierarchy | Duplicate header/search/card/button styles | `search`, content section anchors, workflow step/detail hooks |
| `erp-knowledge-library.html` | Bespoke light knowledge header; no top auth | Search/filter/article cards with local category treatment | Duplicate documentation styles and navigation | `search`, `clearBtn`, `filters`, `articles`, `saved` |

## Shared visual system plan and result

`css/erp-ui.css` supplies a deliberately small cascade layer rather than rewriting page logic or rebuilding markup. It defines:

- Warm neutral background, white surfaces, charcoal text, restrained teal accent, muted semantic colors, and high-contrast borders.
- A 4–32px spacing scale, 10px operational radius, minimal shadow and consistent typography hierarchy.
- Primary, secondary/ghost, destructive and disabled buttons with visible keyboard focus.
- Inputs, selects and textareas with common borders/focus behavior.
- Cards, panels, tables, compact responsive table overflow, status chips, lifecycle steps, empty states and terminal state styling.
- Desktop, tablet, and reasonable mobile shell behavior.

`js/erp-ui.js` adds the same top app bar and compact horizontal navigation to every covered page. Authentication is always in the top-right `[data-erp-auth="top"]` container. It presents the existing stored user identity when available and delegates sign-out to the page's existing logout control; when signed out, it reveals/focuses existing credential UI or routes to Orders Admin sign-in. It does not implement or replace authentication.

## Orders lifecycle rendering defect

The top timeline previously read the disabled `#status` form control and defaulted unknown/stale values to Ready to Print. After close/Finance hydration, the authoritative record could be closed while that control still held an earlier stage. The renderer now finds the selected hydrated Order in `orders` by `activeId`, normalizes `order.status`, and uses the pure presentation mapper in `js/orders-lifecycle-visual.js`. Closed exclusively selects Closed and marks only preceding stages complete. Canceled exclusively selects a labeled terminal Canceled step and does not leave a manufacturing step highlighted.

## Button/action inventory and compatibility

- **Production:** Add/Clear/Save, Start Print, QC/Pass QC, reprint, Cancel, Sync/Repair, backup import/export, inventory reservation/usage, printer and PM actions. Existing IDs and `data-workflow-command` dispatch remain unchanged.
- **Orders:** Refresh, New, Save/quick Save, Copy Tracker, Mark Paid, Push to Finance/Push All, Close Order, filters/tabs, invoice/email/fulfillment actions. Existing handlers and IDs remain unchanged.
- **Quote:** Save/Update, PDF, Prepare Customer Email, Accept + Create Order, invoice/document and saved-quote actions. Existing pricing and workflow handlers remain unchanged.
- **Inventory:** Save raw material/supply/finished good, Add/Edit/Adjust, confirm/cancel adjustment, roll and reservation/usage actions. Existing forms, IDs, and mutation handlers remain unchanged.
- **Customers/Recipes/Campaign/Knowledge:** search/filter controls, repeat/revision/toggle, campaign product/review/conversion actions, and documentation search/filter hooks remain unchanged.

## Before/after and intentional limits

Before, internal pages mixed navy dark panels, pink/purple gradients, glass effects, large shadows, pill headers, and unrelated documentation themes. After, the same neutral foundation, top identity/auth location, section navigation, surface treatment, control geometry, contrast, and focus styling spans the operational and documentation pages while preserving their information architecture.

Existing inline CSS remains in place underneath the shared cascade to keep this migration safe and reviewable. It is now partly obsolete but was intentionally not mass-deleted in the same milestone. Page-specific complex layouts (Production lanes, Orders split workspace, Quote pricing layout, Inventory roll layout) remain intentionally specialized. Finance Pro was not redesigned. Live authenticated data behavior and deployment were not verified by static tests; manual browser tests must cover real session state, every action, horizontal table scrolling, and lifecycle hydration against Supabase.
