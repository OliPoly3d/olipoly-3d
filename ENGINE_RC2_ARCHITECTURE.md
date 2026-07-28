# OliPoly Engine RC2 verified architecture


> **RC2.4 authority:** Campaign sale intent now uses the immutable staging contract in `ENGINE_RC2_4_CAMPAIGN_SUBMISSION_AUTHORITY.md`. It creates no downstream records; conversion and Niles migration remain RC2.5 and RC2.6.
This inventory describes the active private application paths inspected for RC2. It is maintenance guidance, not a new data contract. Public pages and generated customer documents are outside this shell and remain frozen.

## RC2.1 authority investigation

See [`ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md`](ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md) for the repository-evidence storage and campaign lifecycle investigation. It confirms `asset_records` plus exact-revision `asset_links` as the defined Job Assets metadata authority, with `job-assets` as the only defined private object bucket, but finds no automatic Quote-to-Order asset handoff or recipe file manifest. It also confirms that campaign authority currently ends at `campaigns`, `campaign_products`, and the public allowlisted reader: no authoritative campaign Order, Production, Finance, or Customer 360 relationship is implemented. Deployment state and bucket-policy drift remain unverified; RC2.1 makes no runtime, SQL, Storage, or public-page change.

## RC2.2 deployed storage verification

See [`ENGINE_RC2_2_DEPLOYED_STORAGE_VERIFICATION.md`](ENGINE_RC2_2_DEPLOYED_STORAGE_VERIFICATION.md) for the deployed-authority gate. The repository contract remains internally consistent, but this execution environment had no authorized live metadata connection or authenticated synthetic policy facility, and its minimal anonymous probe received no HTTP response. Deployed bucket, schema, RLS, grants, policies, aggregate objects, owner isolation, and MIME coverage therefore remain unverified. RC2.3 is blocked until a sanitized authorized evidence package confirms the private `job-assets` contract and no material drift.

## Page inventory and ownership

| Page | Purpose and owned entity | Display/edit authority | Primary and secondary actions | Entry, exit, context, and states | Runtime, files, auth, and documents |
|---|---|---|---|---|---|
| `hub.html` | Operations overview; no record authority | Displays existing business-pulse, printer, inventory, money, attention, and activity sources; edits only the existing local event-log controls | Review attention; open the owning tool, search, refresh, or clear activity | Enters every workflow; no required query context; event log uses `olipoly_erp_event_log_v1`; existing loading/empty/error renderers are retained | `erp-core`, `erp-reliability`, business pulse, and printer dashboard; private session behavior is inherited; no document output |
| `customer-360.html` | Customer identity history and navigation | Reads exact matched customer, quote, order, project, finance-link data; it does not edit adjacent records | Find exact identity; open Quote, Order, Finance, or job assets | `?search=` is the verified customer lookup; outgoing quote uses `?quote=`, order uses `?order=`; intentional no-match/empty state | Customer 360/status scripts plus job asset UI; Supabase reads and `sb_token`; asset links are displayed; no print output |
| `quote.html` | Quote and customer pricing | Quote fields, `calculateQuoteTotals()`, saved quote record, public token, and accepted commercial snapshot | Save quote; prepare email/preview/approval using existing controls | Loads `?quote=` and supports existing search aliases; links into accepted order where runtime data exists; retains validation/loading/error messaging | Active runtime is root `quote.js`; `js/quote.js` is not promoted; auth/pricing/polish scripts; reference-file URL field; quote/email/PDF renderers are frozen |
| `orders-admin.html` | Accepted order, customer service, fulfillment, and production linkage | Reads accepted snapshot/invoice authority and edits existing order service/fulfillment fields | Select/update order; use existing production, finance/payment, communication, and document actions | `?order=` is verified; production and public track/pay links retain established parameters; selected, empty, loading, auth, and error states remain | Inline order runtime, invoice authority, auth and job assets; active invoice renderer/snapshot retained; invoice, packing slip, traveler, label and email outputs are frozen |
| `production-control.html` | Production job and manufacturing execution | Production jobs, estimates, recipe reference, reservation requests, machine, actual usage, scrap, QC, and existing status command | Select job; perform the existing next valid transition | `?job=` and linked `?order=` are verified; links back to Orders use `?order=`; modal/queue/empty/error/auth states retained | Workflow persistence/command, inventory, recipe, printer and asset scripts; job assets exposed; print/traveler paths untouched |
| `inventory-control.html` | Inventory stock and authorized adjustment | Raw materials, spools, supplies, finished goods, reservations/consumption ledger and recovery sources | Review warnings; make authorized adjustment or use existing import/export/recovery controls | Production and Hub enter; no required query; local recovery keys remain; existing tabs, modal, empty, sync, and error states remain | Inline runtime, auth/core/reliability/upgrade; Supabase and browser recovery coexist under their existing contract; no document authority |
| `product-recipes.html` | Reusable product recipe | Recipe/revision/status and recipe-linked asset records | Find/create/revise recipe; repeat an existing completed workflow | `?recipe=` is the verified asset context; production handoff remains available; dialogs and notices retained | Authoritative persistence, record store, recipe model and job assets; authenticated writes through existing store; no print authority |
| `finance-pro.html` | Financial posting and reporting | Finance entries, payment-related postings, expenses, settings, tax-exempt state, reports | Review/post an entry; filter/export/report with existing controls | Existing search aliases include `?order=`, `?quote=`, `?customer=`; auth/loading/table/form errors retained | Auth, module runtime, reliability/upgrade; Finance remains ledger authority; no invoice reconstruction or customer-document rendering added |
| `campaign-manager.html` | Campaign and campaign-product configuration | `campaigns` and `campaign_products` through the active manager API | Select/save campaign; maintain existing product assignments | No established record query route was found, so RC2 does not invent one; list/form notice and auth errors retained | `js/campaign-manager.js` and auth; public fundraiser behavior and assets remain untouched; no reporting invented |
| `erp-handbook.html` | Operator instructions | Static verified operating guidance only | Follow the owning-page workflow; open owner links | Section anchors and search remain; no record context | Reliability script; no operational writes or documents |
| `erp-knowledge-library.html` | Architecture and maintenance knowledge | Static system contracts and troubleshooting references; saved favorites remain presentation state | Search verified knowledge before maintenance | Filters/search/favorites and article view retained | Inline knowledge data plus reliability; no workflow write or generated document |

All eleven pages use the screen-only `body.op-engine` layer, the existing Engine stylesheet, and `js/engine-shell.js`. The shell adds only navigation, page responsibility, and read-only query context; it does not replace page markup, IDs, handlers, script order, authentication, or record loading.

## Entity and authority map

| Value/entity | Verified authority and relationship |
|---|---|
| Customer identity | Exact customer/order/quote identity assembled by Customer 360 from its existing sources; quote owns quote customer fields. Similar names are not merged. |
| Quote totals, tax, deposit, balance | The single `calculateQuoteTotals()` quote path and its saved totals snapshot. RC2 does not calculate them. |
| Accepted terms and order total | Accepted quote snapshot consumed by Orders and invoice authority. Editable order fields do not recreate accepted components. |
| Amount paid/payment state | Existing Orders display and Finance posting/payment sources; Finance owns the ledger. No precedence changed. |
| Order | Orders Admin after acceptance; owns service, fulfillment, communication, completion, and production linkage. |
| Production quantity/material estimate | Production Control and its production job/snapshot fields. Quote only consumes the production suggestion/snapshot. |
| Actual use, scrap, machine, production status | Production Control workflow command and persistence modules. Inventory reservation/consumption is requested through existing commands. |
| Inventory | Inventory tables/RPC workflow and recovery contract. No browser-side reconciliation or legacy synchronization is added. |
| Fulfillment and tracking | Orders Admin owns fulfillment fields and existing public tracking link. Public lookup remains frozen. |
| Recipe | Product Recipes model/store; Production references it. Inventory and Orders do not redefine it. |
| Campaign/campaign product | `campaigns` and `campaign_products` through Campaign Manager. Public fundraiser reads remain frozen. |
| Financial entry/reporting | Finance Pro. Invoice customer documents consume invoice authority rather than creating a second ledger. |
| Customer-visible documents | Existing quote and Orders renderers plus accepted/invoice snapshots. Engine CSS is screen-only and does not target generated documents. |

## Workflow handoffs

- Customer 360 opens a quote with `quote.html?quote=<quote number>` and an accepted order with `orders-admin.html?order=<order number>`.
- Quote preserves its existing acceptance transaction and resulting order linkage. RC2 does not infer an order before the runtime supplies one.
- Orders opens Production with its existing order context. Production returns to fulfillment in Orders with `orders-admin.html?order=<order number>`.
- Orders may display payment state; Finance remains the place to post and report financial entries. Finance accepts its existing order/search context aliases.
- Production references inventory and recipes without taking ownership of stock or reusable specifications.
- Campaign Manager owns campaign products. Campaign-to-order reporting has no verified private deep-link identifier contract, so no speculative link was added.
- The shell displays only query parameters already present. It deliberately does not synthesize relationships or rewrite the URL.

## File and storage findings

- `js/job-asset-model.js` defines the active linked-record types and deep links for recipe, quote, order, production job, and customer assets. `js/job-assets-ui.js` infers those same established query parameters, requests signed access, and revises by retaining the original asset rather than deleting it.
- Job assets are read by Orders, Production, Customer 360, and Product Recipes. Product Recipes owns reusable recipe specifications; Production owns job instructions. These are references to storage-backed asset records, not browser file ownership.
- Quote retains its existing reference URL field. Campaign Manager retains configuration fields; no campaign bucket/path contract was found in its active runtime.
- Generated quote/order documents remain renderer-owned snapshots and are not placed under the Engine shell.
- Storage bucket naming, access level, replacement cleanup, and orphan policy are not completely expressed in the inspected UI. RC2 therefore makes no migration, bucket rename, delete, or access-policy change. A future decision must name the canonical bucket/path lifecycle and deletion owner before storage behavior changes.

## Active and duplicate source classification

- **Active authority:** root `quote.js` (loaded by `quote.html`), `js/invoice-authority.js`, `js/production-status-persistence.js`, production workflow command modules, inventory lifecycle modules, `finance-pro.js`, `js/customer-360.js`, product recipe and job asset models, and `js/campaign-manager.js`.
- **Active compatibility/shared reliability:** `js/erp-core.js`, `js/erp-reliability.js`, `assets/erp-upgrade.js`, and legacy page CSS underneath the authoritative screen-only Engine layer.
- **Inactive duplicate:** `js/quote.js` is not loaded by `quote.html`; it was inspected but not promoted or deleted.
- **Legacy but referenced:** page-local embedded CSS and inline operational runtimes remain because they contain active hooks and document render paths.
- **Requires architectural decision:** long-term removal of duplicate quote runtime and consolidation of embedded page CSS require a dedicated reachability and renderer audit; they are not safe RC2 removals.

## Status and safe-change contract

Production remains: Estimate, Waiting for Customer, Ready to Print, Printing, QC / Finishing, Ready for Pickup / Shipment, Closed. Needs Reprint returns to Ready to Print; Complete Print does not close the order. Inventory reservation and consumption follow the existing production commands. No status string, transition, RPC, schema, financial calculation, public URL, local-storage key, or document renderer changed in RC2.

## Maintenance and testing checklist

1. Confirm the change is private-page-only and Engine selectors remain inside `@media screen` and `body.op-engine`.
2. Preserve IDs, control names/types, data hooks, query aliases, script order, RPC strings, Supabase endpoints, local-storage keys, print targets, and public URLs.
3. Run the complete Node test suite, JavaScript syntax checks, inline-script parsing, local-reference and duplicate-ID validation, and `git diff --check`.
4. Inspect mobile widths 375, 430, and 768 pixels and operational widths 1280, 1440, and 1920 pixels with safe authenticated fixtures.
5. Never mutate live quotes, payments, production, inventory, campaigns, or files merely to validate presentation.

## RC2.3 authoritative asset lifecycle

RC2.3 establishes the shared private asset runtime and lifecycle documented in `ENGINE_RC2_3_AUTHORITATIVE_ASSET_LIFECYCLE.md`. Storage owns bytes, `asset_records` owns revisions, and `asset_links` owns exact-ID relationships. Entity pages use one metadata-driven browser; Quote acceptance reuses exact eligible revisions through an idempotent database trigger; recipe manifests pin exact revisions through `link_type`. No public URL, bucket scan, browser-only durable authority, or ordinary permanent-delete path is introduced.
