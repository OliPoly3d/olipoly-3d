# ERP Visual Cohesion & Usability — Phase 2

## Scope and outcome

Phase 2 is a presentation-only consolidation of the internal OliPoly ERP. It extends the existing shared shell and `css/erp-ui.css`; it does not add a second theme, modify application commands, or change data authority. The visual direction is a warm neutral canvas, white operational surfaces, strong readable text, compact controls, quiet borders, restrained status color, and a consistent top identity/authentication/navigation area.

## 1. Page inventory

| Page | Purpose | Current shell | Main component types | Density | Readability / contrast issues found | Inconsistent components | Responsive concerns | Phase 2 treatment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hub.html` | ERP launchpad, pulse, attention, activity | Shared ERP shell | Search, quick links, metrics, tool groups | Medium/high | Dark destination tiles could inherit dark labels; footer and metadata were faint | Heavy tile treatment, oversized groups | Tool grids and top actions wrap tightly | Light compact launch cards, readable metadata, restrained hover elevation |
| `production-control.html` | Authoritative manufacturing workflow | Shared ERP shell | Lane board, job cards, metrics, collapsible panels, forms | Very high | Metadata had equal weight; nested dark surfaces and chips competed | Dense nested cards, many local button styles | Four lanes cannot safely stack into a very long mobile page | Two-column tablet lanes and horizontally scannable mobile lanes; quieter nested surfaces and stronger job hierarchy |
| `orders-admin.html` | Order fulfillment, payment, tracking | Shared ERP shell | Split list/detail, lifecycle, forms, summaries, daily buckets | Very high | One large form impression; weak secondary/control distinction | Tabs, lifecycle, summary cards, buttons | Split layout and lifecycle can compress | Compact surfaces, clear selected tabs/lifecycle, consistent controls; existing groups retained |
| `quote.html` | Customer commercial drafting and acceptance | Shared ERP shell | Customer/project forms, line items, totals, status, conversion | Very high | Legacy dark theme and nested cards reduced scanability | Buttons, helper text, summary treatments | Tables and commercial forms need safe overflow/stacking | Shared light forms, clear readonly vs disabled states, readable totals and status |
| `inventory-control.html` | Inventory availability, reservations, adjustments | Shared ERP shell | Snapshot, quick actions, tabs, material cards, tables, editor | Very high | Healthy inventory was as visually loud as exceptions | Cards, tabs, metadata, quick actions | Tables and command grids compress | Strong primary quantity text, subdued healthy metadata, warning tones reserved for risk |
| `customer-360.html` | Customer identity and related history | Shared ERP shell | Identity summary, metrics, quotes/orders/activity, states | Medium | Compact source markup inherited inconsistent spacing | Metrics, pills, history surfaces | Metrics/history need single-column fallback | Shared card, type, state and responsive primitives while preserving loading/empty/error distinctions |
| `product-recipes.html` | Reusable manufacturing recipes | Shared ERP shell | Search/filter, recipe cards, materials/settings, actions | Medium | Visually separate utility style and crowded metadata | Cards, controls, status/actions | Action rows wrap tightly | Shared utility cards, compact gaps, standard controls and metadata hierarchy |
| `campaign-manager.html` | Fundraiser campaign administration | Shared ERP shell | Campaign form/list, product assignment, status/actions | Medium/high | Page-specific surfaces and text hierarchy | Cards, form controls, actions | Two-column grid compresses | Shared utility surfaces, status colors, compact responsive grouping |
| `erp-handbook.html` | Operational handbook and workflow reference | Shared ERP shell | Navigation, editorial sections, callouts | Medium | Legacy chrome and faint reference copy | Reading cards, links, controls | Long content and nav need comfortable narrow measure | Cohesive shell/type/colors with editorial surface retained |
| `erp-knowledge-library.html` | Searchable internal knowledge library | Shared ERP shell | Search, document cards, categories, metadata | Medium | Document cards differed from recipes/campaigns | Search and article cards | Card grids compress | Shared document-card spacing, readable metadata and consistent controls |
| `finance-pro.html` | Authoritative finance application | Existing RC2 shared shell only | Finance-specific forms, tables, correction/reporting UI | High | Not audited for internal redesign by instruction | Intentional exception | Existing Finance behavior retained | **Excluded.** No Phase 2 stylesheet/runtime; no internal selectors changed |
| `quote-response.html` | Public customer quote response | Public/customer surface | Response/acceptance content | Low | Not an internal ERP page | Public design | Public responsive contract | Out of scope; deliberately unchanged |
| `archive/*` | Historical backups | No active shared shell | Legacy pages | N/A | Archived, not runtime | Historical only | N/A | Deliberately unchanged |

No separate internal upload or knowledge-file HTML runtime was discovered. Existing job/document asset areas embedded in Production, Orders, Quote, Customer 360, and Recipes inherit the shared operational surface without changing their hooks.

## 2. Visual problems found

- The shared layer had duplicate semantic token declarations and duplicate component rules, allowing later declarations to silently weaken disabled-state and focus behavior.
- The Hub explicitly retained a dark tile treatment, which made it vulnerable to dark-on-dark inherited label colors and kept the page visually heavy.
- Several legacy operational pages retained dark-theme surface assumptions. A global body color change alone did not cover deeply nested production, inventory, and order components.
- Important and secondary copy were frequently too close in weight, while truly secondary metadata could become too faint.
- Nested card borders and shadows made dense workflows feel busier than their information architecture required.
- Mobile behavior treated all tables and operational boards similarly; genuine tabular information needs overflow, while production lanes benefit from horizontal operational scanning.

## 3. Contrast audit

The shared light palette uses explicit opaque colors rather than opacity for meaningful text. Automated contrast assertions cover primary, secondary, muted, metadata, link, placeholder, disabled and inverse-action labels against the white surface. The principal combinations are:

| Use | Foreground | Background | Treatment |
| --- | --- | --- | --- |
| Primary text | `#202529` | `#ffffff` | High contrast for titles/body |
| Secondary text | `#454c51` | `#ffffff` | Readable labels/supporting body |
| Muted text | `#5d656a` | `#ffffff` | Still normal-text readable |
| Link | `#245b73` | `#ffffff` | Underlined when unclassed; stronger hover |
| Primary action | `#ffffff` | `#2e5c70` | Readable inverse label |
| Danger action | `#ffffff` | `#913b3b` | Distinct without dominating the page |
| Disabled text | `#555c62` | `#e6e3dd` | Opaque readable label plus cursor/surface cue |
| Placeholder | `#626a70` | `#ffffff` | Explicit `opacity: 1` |

Focus uses a visible three-pixel `#176b8c` outline with offset. Selected navigation and tabs use inverse text. Status tones use dark semantic text on pale semantic surfaces. Component borders use `--erp-border-strong` where an interactive boundary must remain apparent.

## 4. Shared tokens

`css/erp-ui.css` is the authoritative Phase 2 presentation layer. It consolidates tokens for canvas/surfaces, two border strengths, text hierarchy, links, four action/status meanings, focus, disabled state, status backgrounds, radii, shadows, spacing, font sizes, line height, control height and card padding. Compatibility aliases bridge established `--op-*` and older `--erp-*` consumers rather than forcing page-specific raw-color patches.

## 5. Component standards

- **Hierarchy:** compact page title, short description, section title, card title, field label, body, secondary body, metadata/helper text.
- **Cards:** one subtle border per meaningful group, ten-pixel radius, restrained shadow; nested surfaces lose extra elevation.
- **Buttons:** primary is dark teal/inverse; secondary and quiet are light/dark text; danger is dark red/inverse; unavailable actions remain opaque and readable.
- **Forms:** forty-pixel baseline controls; labels remain dark; placeholders are opaque; read-only values use a subtle surface and retain authoritative readability; disabled controls use a separate surface plus cursor.
- **Tables:** readable header surface, bottom row separators rather than boxed cells, compact padding, hover row, optional numeric alignment, overflow for truly tabular mobile content.
- **Badges:** reserved for status/classification/compact metadata; neutral and semantic pale surfaces with dark labels.
- **Empty states:** compact, dashed boundary, useful readable copy, no oversized minimum height.
- **Alerts:** existing alert/message containers receive shared typography, radius and semantic compatibility colors; native dialogs are not replaced.

## 6. Pages changed

All in-scope pages already load the canonical shared `erp-ui.css` and `erp-ui.js`. Phase 2 changes the shared stylesheet only, so Hub, Production, Orders, Quote, Inventory, Customer 360, Recipes, Knowledge, Handbook and Campaigns receive one coherent system without altering their IDs, inputs, data attributes, handlers or runtime functions.

## 7. Intentional exceptions

- Finance Pro internal UI is excluded.
- Public customer pages and generated Quote/Invoice/email/print documents are excluded from the `body.erp-ui` scope.
- Production lanes remain lanes; on narrow screens horizontal scrolling is preferred to destructive card stacking.
- Native `alert()`/confirm dialogs remain where already used because replacement would cross the presentation/function boundary.
- Existing page content/grouping is retained where changing markup could affect hooks; CSS reduces visual nesting instead.

## 8. Finance exclusion confirmation

`finance-pro.html` loads neither `css/erp-ui.css` nor `js/erp-ui.js`. Phase 2 contains no `finance-pro` selector and does not modify Finance HTML, forms, tables, reports, corrections, commands or colors. Finance remains linked from the shared navigation but its internal presentation is unchanged.

## 9. Responsive findings

- **1440 / 1280:** operational content uses the established maximum width; shell and navigation remain compact.
- **1024:** dense grids tighten; Production uses two scannable lane columns.
- **768:** identity/auth remain at the top, context copy collapses, primary nav scrolls horizontally, action rows wrap, genuine tables overflow.
- **390:** cards and forms use compact padding; grid-style form/summary groups fall to one column; Production lanes remain horizontally scannable at an operationally useful width.

The stylesheet includes explicit 1024, 760 and 420 pixel breakpoints, covering the requested representative widths without forcing desktop tables into unreadable stacked labels.

## 10. Accessibility findings

- Keyboard focus is never removed and receives an explicit visible replacement.
- Reduced-motion preferences collapse transitions and animations.
- Disabled and read-only states are visually distinct.
- Important secondary/footer/helper text uses an opaque, contrast-tested muted token.
- Selected navigation, tabs and lifecycle steps use readable inverse text.
- Color is supported by text/status labels already emitted by canonical adapters; no new status meaning is inferred in CSS.

## 11. Functional-freeze verification

The implementation changes CSS, tests, and this audit only. No HTML or JavaScript business runtime was modified. Source contracts protect critical Production, Orders, Quote and Inventory control IDs, workflow command attributes, canonical lifecycle adapter inclusion, top-level auth shell placement and Finance exclusion. No RPC, query, payload, migration, auth/session authority, cache/recovery authority, status semantics, command dispatch, form name, input ID, data attribute, event listener or button action was changed.

## 12. Tests added

Focused source-contract assertions now protect:

- the complete semantic token/scale set;
- shared scope, read-only styling, responsive breakpoints and reduced motion;
- Finance exclusion and absence of data/runtime APIs from the presentation layer;
- top-level identity/auth insertion order;
- workflow/status adapter presence and command-hook preservation.

These are structural contracts rather than pixel snapshots.

## 13. Full-suite result

Baseline before implementation: **162 passed, 0 failed**. Final full-suite outcome after adding three focused source-contract tests: **165 passed, 0 failed**.

## 14. Screenshots / artifacts

No Chromium/Chrome executable or Playwright package is available in this environment, so screenshots were not generated. Future review screenshots should be generated outside the repository so binary artifacts do not burden source control. They are review evidence only and are not a substitute for functional browser checks.

## 15. Manual browser checks required

At 1440, 1280, 1024, 768 and 390 pixels, verify the following. Browser claims must not be marked complete until performed in an authenticated environment with representative data.

| Page | Visual checks | Functional smoke check |
| --- | --- | --- |
| Hub | Search, launch cards, groups, footer, focus, nav wrapping | Navigate to each core destination |
| Production | Lane scan, job hierarchy, material warnings, forms, buttons | Run a permitted Production command |
| Orders | List/detail split, tabs, lifecycle, payment/fulfillment groups | Save an Order without changing lifecycle |
| Quote | Customer/project, line items, totals, accepted/read-only distinction | Edit/recalculate/save a draft interaction |
| Inventory | Material hierarchy, low stock, reservation, tables | Run a safe inventory interaction |
| Customer 360 | Identity/contact/history and loading/empty/error distinction | Load a known customer |
| Recipes | Search, cards, materials/settings, status/actions | Filter/open a recipe |
| Knowledge | Search, document cards, metadata, reading surface | Search/open an article |
| Handbook | Navigation, editorial measure, links | Follow workflow anchors |
| Campaigns | Campaign identity/status/dates/products/results/actions | Open an existing campaign |
| Finance | **Shell/link context only; internal UI unchanged** | Navigate in/out only |
| All | Contrast, keyboard focus, top auth/account placement, selected nav, mobile overflow, alerts and empty states | Sign in/out through canonical controls |

## 16. Remaining visual debt

- Some source pages contain extensive legacy inline presentation rules. The scoped shared layer safely overrides the most visible components, but deleting those rules should be a separate, page-by-page effort with before/after contract capture.
- Icon-like emoji remain in legacy page content. They were not expanded or made authoritative; replacing them should use an existing icon strategy in a separate visual-only milestone.
- Generated customer documents intentionally retain their own customer-facing design systems.

## 17. Deferred functional UX improvements

- Replacing native alert/confirm dialogs with in-app dialogs.
- Changing collapse defaults, interaction order, list virtualization or sticky behavior.
- Adding interactive lifecycle controls.
- Altering search/filter logic, new empty-state actions, or application loading/error behavior.
- Reorganizing form DOM where event delegation or persistence hooks could be affected.

These ideas cross the presentation boundary and require separate functional design and testing.

## Phase 2.1 — Visual regression and readability cleanup

Phase 2.1 is a focused presentation-only follow-up. The audit reviewed the rendered-source contracts and stylesheet cascade at the requested 1440, 1280, 1024, 768, and 390 pixel targets. Automated checks verify semantic contrast and responsive behavior without brittle pixel snapshots; authenticated browser review with representative live data remains required.

### Known issues fixed

| Page | Element / component | Problem | Severity | Fix applied | Shared token or page-specific? | Functionality impact | Visual review required? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production Control | P1S/P2S current-job and next-job `.machine-slot` blocks | A high-specificity legacy stylesheet kept near-black inner surfaces after the shared light-theme migration. | High | Applied the raised light surface, quiet border, primary heading, and readable muted metadata; adjacent slots use a divider rather than dark blocks. | Shared stylesheet, Production component selector | None; CSS only, with IDs, generated markup, data attributes, and lifecycle commands unchanged. | Yes—use populated P1S and P2S data at all target widths. |
| Production Control | Today View `.today-item` action panels | Nested operational cards retained old-theme visual weight and inconsistent text hierarchy. | High | Applied light raised surfaces, quiet borders, no nested shadow, and explicit primary/muted text semantics while retaining warning/status treatments. | Shared stylesheet, Production component selector | None. | Yes—review ready, warning, and danger examples. |
| Production Control | Printer load cards and inner load panels | Load details could still resolve to the legacy `#0c1628` background due to ID selector specificity. | High | Added an equally targeted shared-layer override using the light raised surface and semantic text tokens. | Shared stylesheet, Production component selector | None. | Yes—review assigned and “Needs printer selection” states. |
| Quote | Header `.topbar-actions.compact-actions` | Fixed three-column tracks plus nowrap labels made “Prepare Customer Email” collision/overflow prone. | High | Replaced the fixed action tracks in the final shared cascade with intrinsic flex items, wrapping, consistent gaps, normal label wrapping, and a one-control row at narrow widths. | Shared action component rule with Quote action-bar selector | None; all button IDs and handlers remain unchanged. | Yes—review desktop/tablet widths and every enabled/disabled action state. |
| ERP Handbook | Eyebrows, owner labels, table headings | Pale cyan inherited from the night theme had poor contrast on white surfaces. | High | Mapped editorial accents to the darker shared link/blue token. | Shared semantic token | None; content and interaction are unchanged. | Yes. |
| ERP Handbook | Branch labels and Watch-out callout text | Pale yellow/orange was difficult to read on the light warning surface. | High | Mapped warning copy to the darker shared warning token and retained the pale warning surface and border. | Shared semantic token | None. | Yes. |

### Similar issues found proactively

| Page(s) | Element / component | Problem | Severity | Fix applied | Shared token or page-specific? | Functionality impact | Visual review required? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hub, Production, Orders, Inventory, Recipes, Campaign Manager, Handbook, Knowledge Library | Common action rows (`.top-actions`, `.btn-row`, `.actions`, `.action-strip`, `.links`) | Page-local gaps and wrapping rules were inconsistent and some did not protect intrinsic width at intermediate laptop/tablet sizes. | Medium | Centralized wrapping, alignment, gap, minimum-width containment, and child max-width protection at all widths. | Shared component rule | None. | Yes—especially 1024 and 768 pixels. |
| Orders Admin and other status consumers | Informational status pills | Blue/in-progress statuses could fall through to either pale old-theme foregrounds or the neutral badge treatment. | Medium | Added an explicit dark-blue-on-light-info status rule for shared info and established in-progress/invoice-sent classes. | Shared semantic status rule | None; status mapping and labels are unchanged. | Yes—review populated Order status combinations. |
| Production Control | Current/next/load supporting copy | Removing dark panels exposed legacy text assumptions that could have produced weak or mismatched copy. | Medium | Explicitly mapped titles to primary and supporting labels to the tested muted token. | Shared stylesheet, Production component selector | None. | Yes. |
| All in-scope pages | Disabled/read-only fields, placeholders, footer/helper copy, table headers, selected navigation, empty states, nested cards | Cascade audit confirmed these remain protected by the Phase 2 shared opaque, contrast-tested tokens and component rules; no new one-off override was required. | Low | Retained and regression-tested the existing central rules. | Shared tokens/components | None. | Spot-check required. |

### Pages reviewed with no issue

The following in-scope pages were inspected for legacy dark surfaces, pale text, button/control collisions, weak status/navigation states, disabled/read-only legibility, table contrast, nested-card conflict, and horizontal overflow. No additional obvious Phase 2.1 defect requiring a page-specific change was found:

- `hub.html` (the common action-row hardening applies centrally; no Hub-specific override was required)
- `inventory-control.html`
- `customer-360.html`
- `product-recipes.html`
- `campaign-manager.html`
- `erp-knowledge-library.html`

`erp-knowledge.html` is not present. No separate internal file/document/upload page is present; the embedded Job Assets areas in Production, Orders, Customer 360, and Product Recipes were included in their owning-page audit. Public pages, archives, generated customer documents, print-only output, and customer quote response are outside the internal ERP scope.

`orders-admin.html` was reviewed as a priority operational page. Its actionable Phase 2.1 finding was the shared informational status treatment recorded above; no Orders-specific markup or runtime edit was needed. Production and Inventory warning/status colors remain semantic rather than being flattened into neutral colors.

### Shared token and component changes

- Added `--erp-editorial-accent` and `--erp-editorial-warning` as aliases of existing accessible semantic colors; no new raw palette colors were introduced.
- Added explicit shared info-status presentation.
- Hardened common action rows against wrapping and horizontal overflow.
- Added final-cascade light-surface protection for Production current/next job, Today View, and printer load components whose old selectors had higher specificity than the original migration rule.

### Page-specific changes

No page HTML or JavaScript was changed. Component-targeted selectors live in the shared stylesheet for Production, Quote, and Handbook because they correct legacy page structures while preserving all existing DOM and behavioral hooks.

### Automated protection added

Focused tests now guard the Production light-surface overrides, Quote intrinsic wrapping and long-label behavior, Handbook semantic contrast aliases, common action-row wrapping, informational statuses, critical Production and Quote control hooks, and continued Finance Pro exclusion.

Final Phase 2.1 automated result: **168 passed, 0 failed**. The increase from the trusted 165-test baseline is the three focused Phase 2.1 source-contract tests.

### Finance Pro and functional freeze

Finance Pro internal presentation remains excluded: `finance-pro.html` still loads neither `css/erp-ui.css` nor `js/erp-ui.js`, and no Finance file was edited. This cleanup changes CSS, source-contract tests, and this document only. It changes no business logic, workflow, RPC, handler, status authority, auth authority, inventory behavior, Quote behavior, Orders behavior, Production behavior, Finance behavior, or database migration.

### Manual visual checks still required

Use an authenticated environment with representative records at 1440, 1280, 1024, 768, and where practical 390 pixels:

1. Populate both P1S/P2S current and next jobs, Today View warnings/actions, and assigned/unassigned printer loads; confirm all operational interiors are light and status colors remain distinct.
2. Exercise every Quote header action state; confirm “Prepare Customer Email” wraps without clipping, controls do not overlap, and primary/secondary hierarchy is retained.
3. Read Handbook eyebrows, ownership table headings, branch labels, and Watch-out panels in normal and zoomed text settings.
4. Spot-check Orders and Inventory status chips, action bars, dense forms, disabled/read-only controls, tables, and narrow-width overflow.
5. Spot-check Hub, Customer 360, Recipes, Campaign Manager, and Knowledge Library action wrapping, helper/footer copy, cards, navigation, and keyboard focus.
6. Navigate to Finance Pro only to confirm the link boundary; do not treat its internal presentation as part of this visual review.

## 18. Focused commit hash

The focused implementation commit hash is reported in the final delivery and Pull Request. A Git commit cannot reliably embed its own hash because changing this file changes that hash.
