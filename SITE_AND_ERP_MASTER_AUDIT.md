# OliPoly 3D Site and ERP Master Audit

**Audit date:** 2026-08-11

**Repository basis:** current branch state at audit start

**Scope:** static public site, private browser ERP, repository migrations, tests, documentation, and assets

**Change policy:** audit documentation only; no application, content, style, or schema changes

## Method and confidence

This is a repository-level defensive audit. It included all 50 tracked HTML entry points, JavaScript/CSS dependency inspection, navigation/link analysis, copy and metadata review, migration/RLS/RPC inspection, browser-storage inventory, static asset sizing, and automated-test inventory. Existing release evidence was cross-checked rather than treated as proof of the deployed database. No offensive security testing, production writes, destructive commands, or schema changes were performed.

The audit distinguishes:

- **BROKEN:** repository evidence shows the intended path cannot work as presented.
- **RISKY:** it may work, but authority, security, recovery, or failure behavior can cause material harm.
- **INCONSISTENT / OUTDATED:** competing patterns or retained historical behavior increase confusion/debt.
- **POLISH OPPORTUNITY / OPTIONAL ENHANCEMENT:** valuable but not a correctness issue.
- **WORKING WELL / LEAVE ALONE:** coherent implementation with evidence and no proportionate reason to change.

Runtime-dependent items are marked **UNKNOWN** where authenticated database state, mail/payment configuration, deployed migrations, or real-device rendering could not be verified. “Working/current” means supported by coherent code and regression tests, not a claim of production verification.

---

## 1. Executive Summary

OliPoly is substantially more capable than a typical small-business static site: the public experience has a coherent modern editorial family, local landing pages, project intake, public quote response, tracking, payment handoff, and campaign intake; the ERP has explicit domain contracts, command-oriented workflow RPCs, immutable commercial snapshots, inventory reservation/consumption, append-only finance corrections, asset lifecycle controls, and unusually strong workflow regression coverage.

The central concern is not missing ambition but **accumulated implementation layers**. Current shared shells coexist with legacy frames; ERP pages combine large inline programs with shared modules; authentication exists in two copies plus embedded fallbacks; status normalization occurs in several modules; and the migration history repeatedly repairs or overloads the same command surfaces. The intended ownership model is good, but the browser implementation still exposes enough parallel paths and fallback state to make maintenance risky.

The public site’s strongest pages (`index`, `collections`, `studio`, `creations`, `collaboration`, `community`, `about`, `faq`) share a distinctive editorial system. The portfolio/SEO microsite family (`showcase`, project-story pages, local landing pages) uses a visibly older shell and can feel like a second website. That split weakens brand continuity and creates duplicate navigation/content patterns. The site answers most visitor questions, but exact turnaround, indicative pricing, material boundaries, repeat-order instructions, and corporate approval/PO expectations are scattered or noncommittal.

No repository evidence establishes a committed service-role secret. Browser-visible Supabase **anon** keys are expected for Supabase, but safety depends completely on deployed RLS and RPC grants. The strongest security design is the movement of sensitive mutations into narrowly named `SECURITY DEFINER` commands with receipts and owner checks. The largest residual security risk is configuration drift across a long repair migration chain and broad client-side reads/direct writes that must remain protected by deployed policies.

### Top-level health

| Area | Health | Evidence-based conclusion |
|---|---|---|
| Public brand | **KEEP + POLISH** | Strong core editorial family; legacy-frame portfolio/local pages fragment the experience. |
| Public conversion | **IMPROVE** | Start, track, pay, business, and community paths exist; reassurance and measurable conversion are weak. |
| ERP workflow | **KEEP + HARDEN** | Authority model and command tests are strong; UI/runtime duplication and migration drift remain risky. |
| ERP visual system | **IMPROVE / CONSOLIDATE** | `engine-shell` + `erp-ui` succeed on most pages, but older CSS, inline styles, and Finance-specific treatment persist. |
| Data architecture | **KEEP + SIMPLIFY CAREFULLY** | Snapshots, receipts, inventory transactions, and finance corrections are sound; compatibility fields/functions are extensive. |
| Security | **VERIFY DEPLOYMENT** | Repository hardening is thoughtful; actual RLS/grants and migration parity are deployment facts, not statically provable. |
| Tests | **WORKING WELL** | 90+ files strongly cover ERP commands; public forms, accessibility, responsive behavior, and browser E2E are under-covered. |
| Documentation | **CONSOLIDATE** | Excellent recent domain docs coexist with many sprint/pass notes and no root README/deployment runbook. |

---

## 2. Overall Product Health

### Working well / leave alone

1. Explicit ownership boundaries in `AGENTS.md`, `DOMAIN_CONTRACTS.md`, and `ERP_1_0_WORKFLOW_MAP.md` are appropriate for the business.
2. Quote totals have a dedicated `quote-pricing.js` and focused unification tests.
3. Accepted quote snapshots, workflow command receipts, stale-version checks, and idempotency keys are proportionate reliability mechanisms—not over-engineering.
4. Inventory reservation through QC consumption and reprint/cancel semantics have dedicated migrations and tests.
5. Finance’s effective-entry projection and append-only correction approach protect auditability.
6. Public primary pages use one clear “Start a project” motif and expose Track/Pay in the footer.
7. Local SEO pages target real service areas without requiring a new application stack.

### Highest concern

1. **HIGH — deployed authority unknown:** repository migrations cannot prove production RLS/grants match the intended final state.
2. **HIGH — oversized page programs:** `orders-admin.html` and `production-control.html` contain thousands of lines, large inline JS/CSS, and page-specific workflow/auth/persistence behavior.
3. **HIGH — browser resurrection:** several ERP flows retain local caches/drafts/transfer objects; safeguards exist, but scattered fallback code makes “cloud wins after hydration” hard to reason about globally.
4. **MEDIUM — dual UI generations:** public editorial pages and RC5 legacy-frame pages differ in shell, navigation, typography, and image treatment.
5. **MEDIUM — public operational dependencies:** start-project uses an external intake link, Niles uses Tally/payment links, and payment depends on order RPC/configuration; failures cross systems without unified telemetry.

---

## 3. Complete Site Map

### Shared dependency families

- **Public editorial (PE):** `assets/css/home-v1.css`, page CSS where applicable, `rc2-customer-v1.css`, `rc3-editorial.css`, `assets/js/home-v1.js`.
- **Public legacy frame (PL):** `assets/erp-upgrade.css`, `assets/public-mobile.css`, `assets/css/rc5-legacy-frame.css`, matching scripts.
- **ERP current shell (ES):** `assets/css/engine-rc1.css`, `css/erp-ui.css`, `js/engine-shell.js`, `js/erp-ui.js`, plus domain modules.
- **ERP compatibility (EC):** `erp-core`, `erp-reliability`, `erp-polish`, `erp-upgrade`, substantial inline page code, and root/`js` auth variants.

“Linked” means referenced by another repository HTML page; it does not prove placement in every primary nav. “Active” is inferred from current links, sitemap, current scripts/tests, and non-archive placement.

### Public and customer-facing pages

| File | Purpose / audience | Primary actions | Dependencies | Linked / state / disposition |
|---|---|---|---|---|
| `index.html` | Brand homepage; all prospects | choose project path, start, track, pay | PE | heavily linked; active; **KEEP + POLISH** |
| `collections.html` | Repeatable/personal product inspiration | explore types, start project | PE + collections CSS | nav-linked; active; **KEEP + POLISH** |
| `creations.html` | Custom idea entry/inspiration | learn inputs, start | PE + creations CSS | nav-linked; active; **KEEP + POLISH** |
| `studio.html` | Services/process/originals | understand capability, start | PE + studio CSS | nav-linked; active; **KEEP + POLISH** |
| `collaboration.html` | Business/PO prospects | review capability, begin conversation | PE + collaboration CSS | nav-linked; active; **IMPROVE copy/detail** |
| `community.html` | Schools, teams, fundraisers | start community project, see events | PE | nav-linked; active; **IMPROVE campaign bridge** |
| `about.html` | Trust, studio identity | learn business, start/contact | PE + about CSS | nav-linked; active; **IMPROVE credibility** |
| `faq.html` | Pre-sale objections and logistics | browse answers, ask/start | PE + utility CSS | heavily linked; active; **KEEP + POLISH** |
| `legal.html` | Policies/accessibility | review policies, contact | PE + utility CSS | footer-linked; active; **professional review** |
| `events.html` | Local pop-ups/events | directions, request event/project | mixed PE + upgrade | widely linked; active; **KEEP + POLISH** |
| `start-project.html` | Project-intake gateway | open external form or email | PE | heavily linked; active; **IMPROVE resilience/measurement** |
| `project-received.html` | Intake confirmation | home, track, submit another | PL | linked from intake expectation; active; **KEEP + POLISH** |
| `track.html` | Public order-status projection | look up order, view/pay | PE plus workflow/public scripts | heavily linked; active; **KEEP + HARDEN** |
| `pay.html` | Invoice/order payment handoff | load order, choose payment method | PE plus inline Supabase/RPC | widely linked; active; **KEEP + HARDEN** |
| `quote-response.html` | Public quote view/accept/change request | review, accept or request change | PL + public RPC | token/link entry; active; **KEEP + HARDEN** |
| `showcase.html` | Portfolio hub | browse stories, start | PL | widely linked; active; **CONSOLIDATE shell** |
| `real-solutions.html` | Functional-project story | learn, start | PL | linked; active; **CONSOLIDATE shell** |
| `branded-details.html` | Corporate/branded story | learn, start | PL | linked; active; **CONSOLIDATE shell** |
| `eye-catching-work.html` | Decorative/display story | learn, start | PL | linked; active; **CONSOLIDATE shell** |
| `designed-before-printing.html` | Design/process story | learn, start | PL + large video | linked; active; **OPTIMIZE media** |
| `finished-pieces.html` | Finishing story | learn, start | PL | linked; active; **CONSOLIDATE shell** |
| `raw-to-refined.html` | Post-processing story | learn, start | PL + video | linked; active; **OPTIMIZE media** |
| `from-imagination.html` | Custom creative story | learn, start | PL | linked; active; **CONSOLIDATE shell** |
| `northeast-ohio-3d-printing.html` | Regional SEO/community hub | choose locality, start | PL | linked/sitemap; active; **KEEP + POLISH** |
| `custom-3d-printing-aurora-ohio.html` | Aurora local landing | view local proof, start | PL | linked/sitemap; active; **KEEP + POLISH** |
| `custom-3d-printing-chagrin-falls-ohio.html`, `custom-3d-printing-hudson-ohio.html`, `custom-3d-printing-niles-ohio.html`, `custom-3d-printing-solon-ohio.html`, `custom-3d-printing-streetsboro-ohio.html`, `custom-3d-printing-twinsburg-ohio.html` | Local service landings | view locality copy, start | PL | linked/sitemap; active; **KEEP + POLISH; check uniqueness** |

### Campaign / temporary pages

| File | Purpose / audience | Primary actions | Dependencies | Linked / state / disposition |
|---|---|---|---|---|
| `niles.html` | Niles Dragons bag-tag campaign | choose variant, personalize via Tally, pay | RC5 frame + external Tally/payment | one inbound campaign/local link; apparently active-specific; **INVESTIGATE sunset/data retention** |
| `fundraiser.html` | Generic database-configured campaign intake | select products, fulfillment/payment, submit | campaign CSS, auth constants, `fundraiser-intake.js`, public RPCs | no static inbound link; slug/config-dependent; **ACTIVE BUT ORPHANED by design or oversight—confirm** |

### Private ERP

| File | Purpose / audience | Primary actions | Dependencies | Linked / state / disposition |
|---|---|---|---|---|
| `hub.html` | Operator launchpad/business pulse | navigate, review attention/activity/printers | ES + EC + inline dashboard | active; **KEEP + POLISH** |
| `production-control.html` | authoritative estimate/manufacturing | estimate, handoff, assign, execute, QC/reprint/cancel | ES + many production/inventory modules + huge inline program | active/critical; **IMPROVE carefully** |
| `quote.html` | customer pricing and quote presentation | load production snapshot, price, send/save | ES + pricing/handoff/document/assets + root `quote.js` | active/critical; title says “Lite” (outdated); **IMPROVE carefully** |
| `orders-admin.html` | accepted-order fulfillment | communicate, metadata, fulfillment, payment, close, documents | ES + order/finance/assets modules + huge inline program | active/critical; **IMPROVE carefully** |
| `inventory-control.html` | inventory authority | manage rolls/materials, adjustments, reservation visibility | ES + EC + large inline program | active/critical; **IMPROVE carefully** |
| `finance-pro.html` | finance ledger/reporting/corrections | authenticate, post/correct/report/export | Finance-specific CSS/JS + ES | active/critical; **KEEP distinct + targeted polish** |
| `customer-360.html` | customer aggregation/reorder | search, review history, launch reorder | ES + customer/assets modules + direct REST reads | active; **IMPROVE error states/performance** |
| `product-recipes.html` | recipe/product knowledge | create/revise/activate, attach assets | ES + authoritative store/model/assets | active; **KEEP + POLISH** |
| `campaign-manager.html` | campaign configuration/submissions/orders | configure, manage products/submissions, convert | ES + campaign manager JS | active; **KEEP + HARDEN** |
| `erp-handbook.html` | operator documentation | browse procedures | ES + inline content | active; **CONSOLIDATE content source** |
| `erp-knowledge-library.html` | searchable operator knowledge | filter/favorite/recent | ES + local preference storage | active; **CONSOLIDATE with handbook** |

### Admin / diagnostic / utility / legacy

| File(s) | Classification | Evidence / recommendation |
|---|---|---|
| `archive/admin.html` | LEGACY / POSSIBLY UNUSED | localStorage-only order admin; archive scope; **REMOVE/RETIRE candidate after retention check**. |
| `archive/quote-tool.html`, `archive/quote-lite-backup.html`, `archive/quote-backup.html` | LEGACY | old quote implementations and duplicated pricing/storage; retained backups; **move out of deploy artifact, do not revive**. |
| `archive/index2.html`, `archive/index3.html` | LEGACY | old public home variants; **remove from deploy artifact after visual/reference check**. |
| `erp-handbook.html`, `erp-knowledge-library.html` | UTILITY (private) | operator documentation, not business authority. |
| `quote-response.html`, `project-received.html` | UTILITY (public) | task/confirmation pages intentionally absent from top nav. |
| Repository scripts and DB audit markdown | ADMIN / DIAGNOSTIC (non-page) | introspection and authenticated trace are command-line tools; keep outside public deployment. |

### Orphan/reachability findings

- `fundraiser.html` has no static inbound HTML link. It may intentionally be reached by campaign-specific URL/query; confirm that generated links exist and document the contract.
- Token/context pages (`quote-response.html`, `project-received.html`) appropriately have little inbound navigation.
- Archive pages should not be web-deployed merely because they are tracked.
- There is no `create.html` or `collaborate.html`; current equivalents are `creations.html` and `collaboration.html`. Old external bookmarks should be checked before adding redirects.
- There is no separate `erp-knowledge.html`; the current entry is `erp-knowledge-library.html`.

---

## 4. Public Website Assessment

### Information architecture

| Visitor question | Answerability | Finding |
|---|---|---|
| What does OliPoly do? | **Clear** | Homepage establishes ideas becoming real and branches into collections, creations, community, collaboration. |
| What can I order? | **Mostly clear** | Collections/showcase provide examples, but a concise capability/material/size boundary is absent. |
| Can OliPoly design custom work? | **Clear** | Creations and process stories explicitly accept photos, sketches, broken parts, and incomplete ideas. |
| Replacement/functional parts? | **Clear** | Mentioned across collections, collaboration, FAQ, and real-solutions content. |
| Business / PO / tax exempt? | **Mostly clear** | Collaboration, FAQ, start, pay mention them; exact onboarding/document expectations are fragmented. |
| How do I start? | **Clear** | Persistent CTA reaches `start-project.html`; external-form dependency should be clearer before leaving. |
| Cost? | **Weak** | Custom quote model is understandable, but there are few indicative ranges/minimums or cost drivers. |
| Turnaround? | **Weak** | Copy avoids a useful normal range and escalation path for deadlines. |
| Materials? | **Partial** | FAQ/process references material considerations but lacks a scannable current material/capability guide. |
| Location/service area/contact? | **Mostly clear** | Aurora and Northeast Ohio appear repeatedly; email is clear, but business identity/service-radius details could be stronger. |
| Track/pay? | **Clear** | Footer links are consistent and prominent enough. |

### Public page families

- **WORKING WELL:** editorial pages use consistent navigation, restrained headlines, purposeful imagery, and a recurring footer.
- **INCONSISTENT:** showcase, case-study, local landing, confirmation, and quote-response pages use the RC5 legacy frame and upgrade/mobile layers. The shift is perceptible in navigation vocabulary, layout density, card geometry, and typography.
- **POLISH:** `events.html` combines old upgrade assets with the newer editorial system, increasing cascade risk.
- **RISKY:** customer-critical `track.html` and `pay.html` mix editorial presentation with inline application logic and older upgrade/mobile scripts.

### Unnecessary/consolidation opportunities

Do not remove valuable SEO/story URLs. Consolidate their **shell**, not their content. The seven case-study pages can share one presentation template/style contract while preserving descriptive URLs. Local pages should remain individual only where content and proof are genuinely location-specific; templated near-duplicates should be reviewed for search/customer value.

---

## 5. ERP Assessment

### Ownership and workflow clarity

The documented model is coherent: Production estimates and executes; Quote owns customer pricing; acceptance creates Orders; Orders owns fulfillment/payment tracking; Inventory owns stock transactions; Finance owns accounting. Page names and Hub links mostly reflect this. `orders-admin.html` correctly disables the lifecycle status as “command controlled,” an important misuse prevention pattern.

Ambiguity remains where:

- production and order pages both render lifecycle controls/status and include compatibility normalizers;
- Orders contains product/catalog and production-profile fields that overlap Recipe/Production responsibility;
- multiple pages can display finance/payment information even when mutation authority is RPC-controlled;
- Customer 360 assembles broad reads and reorder drafts but does not visibly distinguish cached absence from authoritative emptiness;
- “Quote Tool Lite” is obsolete naming for the single authoritative Quote experience.

### Shared light shell

**Succeeding:** Hub, Production, Quote, Orders, Inventory, Customer 360, Recipes, Campaign Manager, Handbook, and Knowledge include `engine-shell`/`erp-ui` and gain consistent top navigation, auth gate, spacing tokens, buttons, and high-level surfaces.

**Older treatment remains:** Finance intentionally retains its specialized form/report density and `erp-upgrade`; Production, Orders, and Inventory layer old `erp-core`, `erp-reliability`, page styles, and inline rules beneath/above the new shell. That increases cascade specificity and can produce page-specific contrast/modal/table behavior.

### Auth/session UX by page

| Pages | Assessment |
|---|---|
| Hub, Quote, Customer 360, Recipes, Campaigns, Handbook, Knowledge | Shared shell is the intended top auth boundary; confirm every blocked page shows the same identity/logout state after bootstrap. |
| Production, Orders, Inventory | Shared shell coexists with embedded/manual token/login/logout paths; highest inconsistency and stale-session risk. |
| Finance Pro | Uses Supabase client auth plus shared shell and its own login controls; functionally special but should present one visible session state. |

Session tokens are persisted in localStorage in both root and `js/` auth copies. This is a common static-client tradeoff, but XSS impact is therefore high; CSP, output escaping, and avoiding unsafe HTML are important. Expiry refresh exists, yet several pages independently fall back to `sb_token`, so logout/session-expiry behavior is not guaranteed to be uniform.

---

## 6. Visual / Brand Assessment

### Public

- **Logo/mascot:** brand assets and Poly/bee cues create personality, but variants and legacy frames should be inventoried before standardizing usage. Mascot use should support reassurance/process, not decorate every conversion step.
- **Typography/hierarchy:** the editorial family has strong large headings and generous whitespace. Story/local pages are more utilitarian and feel like a separate generation.
- **Color/gradients/cards/buttons:** core pages are cohesive; legacy upgrade CSS introduces older dark/glow/gradient assumptions and different buttons/cards.
- **Imagery:** real project imagery is a major trust asset. Mixed backgrounds, renders, compressed/uncompressed variants, and repeated assets reduce premium consistency.
- **Premium/trust:** strongest when a real artifact and a specific outcome appear together; weakest where poetic copy lacks operational proof.

### ERP

- The light design system improves scanability and establishes a shared top shell.
- Production/Orders remain visually dense because they expose many distinct workflows on one document, not merely because of color choices.
- Status colors need a single semantic contract; text labels are generally present and should remain mandatory.
- Native `alert`, `confirm`, and `prompt` interrupt the new visual system and are poor for nuanced destructive/conflict feedback.
- Finance should not be forced into identical card density; align shell/auth/error semantics and tokens while retaining reporting-specific layout.

---

## 7. Content Assessment

### Public copy

**Strengths:** “Ideas become real,” “Start with what you have,” and the examples of a photo/sketch/broken part reduce intimidation. “Small studio” language is human and proportionate. Business, community, PO, tax-exempt, pickup, and replacement-part themes are present.

**Rewrite targets (do not rewrite in this audit):**

1. **Homepage/service cards — POLISH:** some short, poetic phrases require visitors to infer concrete capabilities. Pair emotion with one direct factual sentence.
2. **Collaboration — IMPROVE:** add a tighter statement of business buying flow, repeatability, file handling, PO/tax-exempt documentation, quantities, and response expectations.
3. **Community — IMPROVE:** distinguish custom community projects from an active fundraiser campaign and explain organizer/customer responsibilities.
4. **FAQ — POLISH:** make price drivers, ordinary lead-time framing, revision/approval, materials/limitations, pickup/shipping, and customer-supplied IP easier to scan.
5. **Start Project — IMPROVE:** disclose what the external form asks for, approximate completion time, file constraints, privacy expectation, and what happens next.
6. **About — IMPROVE:** add verifiable credibility signals: operator/business identity, Aurora service context, in-house workflow, and real experience without unsupported superlatives.
7. **Track/Pay/Quote Response — HIGH VALUE:** standardize order/quote/invoice terminology, expired/invalid link language, network retry guidance, and contact fallback.
8. **Local pages — INVESTIGATE:** verify each contains meaningful local proof rather than swapped place names; avoid claims that cannot be maintained.
9. **Legal — PROFESSIONAL REVIEW:** readable structure exists, but policy completeness/consistency needs qualified review.

### ERP copy

- “command controlled” is excellent operator guidance and should become standard wherever derived/immutable fields appear.
- “Quote Tool Lite,” older statuses (`completed`, `ready_for_pickup`, `waiting_customer`), and multiple “push to Finance/close” phrasings reveal historical models.
- Raw backend details still reach some page message setters; operator-facing errors should map known codes to action, retain a support/reference ID, and hide raw payloads behind diagnostics.
- Help copy is abundant but distributed between page text, Handbook, Knowledge, and numerous notes; operators need one maintained source.

---

## 8. User Journey Assessment

### A. First-time custom customer

`index → collections/creations/studio → start-project → external form → project-received`

- **Working:** multiple inspiration paths converge on one start gateway; low-pressure language accepts incomplete ideas.
- **Risk/dead end:** form submission lives outside the repository; redirect to confirmation, upload limits, failure recovery, and abandonment cannot be established here.
- **Missing reassurance:** response time, ordinary process milestones, privacy for uploaded designs, indicative cost drivers, and revision/approval expectations.
- **Mobile:** editorial CSS includes mobile treatment, but the external form is outside local control and requires device testing.

### B. Repeat customer

`footer/email or track → contact/reorder`; internally Customer 360 can seed a quote draft.

- **Gap:** no explicit customer-facing “reorder this” route or instructions about using the previous order number.
- **Opportunity:** clarify that replying/emailing with the prior number is sufficient; do not build an account portal unless demand supports it.

### C. Corporate / PO customer

`collaboration/FAQ → start-project → quote → PO/invoice`

- **Working:** business support, PO, invoice, tax exemption, and repeatability are mentioned; backend supports business metadata.
- **Gap:** public pre-intake does not present a crisp checklist or explain approval/deposit/Net terms eligibility.
- **Risk:** vague expectations can create manual back-and-forth despite strong backend capability.

### D. Community/fundraiser

`community/local page → niles or generated fundraiser URL → select → payment instruction → submit`

- **Working:** generic campaign intake has idempotency/session-attempt handling; Niles has concrete variants/prices.
- **Confusion:** `fundraiser.html` is statically orphaned, while `niles.html` remains a bespoke Tally/payment flow. Two customer paths are therefore live/retained.
- **Risk:** payment-before/after-submission order and organizer reconciliation need explicit campaign-specific instructions and test evidence.

### E. Track an order

`footer/direct → track → public lookup → status/balance/payment`

- **Working:** clear task page and public projection/RPC model.
- **Risk:** lookup privacy depends on unguessable identifiers/RPC response minimization; invalid, unavailable, and network states must be distinguishable.

### F. Pay

`footer, tracker, invoice → pay → load order → external payment method`

- **Working:** supports card/Apple Pay, PayPal, Venmo and business questions.
- **Risk:** payment links and exact balances are configuration/data dependent; external success does not itself prove authoritative ERP payment posting. Reconciliation language and fallback contact should be explicit.

### ERP lifecycle trace

| Transition | Intended owner | Assessment |
|---|---|---|
| Estimate → Waiting for Customer | Production → Quote handoff | Dedicated handoff modules/RPCs and tests; duplicated root/`js` quote artifacts increase drift risk. |
| Quote → Accepted Quote | Quote/public response RPC | Snapshot and public command authority are strong; public token/expiry/error UX needs live verification. |
| Accepted → Order | acceptance command/database | Correct authoritative boundary; idempotency and lock tests are strong. |
| Ready to Print → Printing → QC | Production commands | Command dispatcher, stale version, single-dispatch and attempt tests are strong. |
| QC → Ready for Fulfillment | Production + Inventory atomic effect | Inventory consume/release semantics are well-covered and should not be casually refactored. |
| Fulfillment → Paid → Finance → Closed | Orders commands + Finance | Recent migrations explicitly repair payment/close/finalization; this is high-value but deployment-sensitive. |
| Needs Reprint | Production + Inventory | Compatibility mappings and attempt preservation exist; legacy standalone production requires operator clarity. |

---

## 9. Functionality Assessment

| Function | Classification | Evidence / principal caveat |
|---|---|---|
| Public project intake | **WORKING BUT FRAGILE / UNKNOWN runtime** | Clear gateway; external form and redirect/config not locally testable. |
| Public quote response | **WORKING BUT HIGH-RISK** | Purpose-built public RPC and snapshot tests; token/RLS/deployment critical. |
| Public tracking | **WORKING BUT HIGH-RISK** | Projection-oriented migration and workflow mapping; privacy/error behavior requires live verification. |
| Public payment links | **WORKING BUT FRAGILE** | Multiple provider links; reconciliation and provider configuration external. |
| Generic campaign ordering | **CURRENT but INCOMPLETE discoverability** | manager/intake/migrations/tests exist; public entry is orphaned. |
| Niles ordering | **LEGACY/SPECIAL CASE** | bespoke Tally/payment path alongside generic engine. |
| Uploads/assets | **CURRENT / HIGH-RISK** | private asset lifecycle/model/UI and migrations; validation/storage policy must be verified live. |
| Authentication | **WORKING BUT DUPLICATED** | shared auth/shell plus root copy and embedded fallbacks. |
| Production | **CURRENT / HIGH-RISK criticality** | strongest automated coverage; huge page and repair chain. |
| Quote | **CURRENT / DUPLICATION RISK** | authoritative pricing module/tests; root and `js/quote.js` plus archived versions. |
| Orders | **CURRENT / HIGH-RISK criticality** | fulfillment/payment/close command tests; very large inline implementation. |
| Inventory | **CURRENT / HIGH-RISK criticality** | transaction lifecycle and authority tests; local fallback keys remain. |
| Finance | **CURRENT / HIGH-RISK criticality** | append-only correction/effective projection tests; auth/UI special case and schema parity essential. |
| Customer 360 | **WORKING BUT FRAGILE** | direct broad REST reads, 1000-row limits, silent catch-to-empty. |
| Product recipes | **CURRENT** | model, revision migration, persistence and asset support. |
| Knowledge/Handbook | **DUPLICATED content channel** | two browser pages plus markdown handbook. |
| Files/documents | **CURRENT but distributed** | job assets, invoice/packing/labels/print windows; duplicate print implementations. |
| Reporting/business pulse | **WORKING BUT CACHE-DEPENDENT** | modules/tests; Hub summaries may reflect saved browser summaries. |
| Backup/export/recovery | **WORKING BUT FRAGILE** | reliability snapshots/exports and health panel; browser-local scope. |
| Sync/repair | **HIGH-RISK / operator-controlled** | many explicit repair migrations and linkage tools; should remain exceptional and auditable. |
| Diagnostics | **CURRENT but fragmented** | introspection audit/trace scripts and many pass notes; no single operator runbook. |

---

## 10. Architecture Assessment

### Safe presentation consolidation

1. One public header/footer/mobile-menu implementation for both PE and PL families.
2. One ERP top shell/auth identity/logout presentation.
3. Shared primitives for buttons, fields, cards, tables, status chips, alerts, modal/dialog, empty/loading states.
4. Shared document/print shell; retain invoice/packing/label content modules.
5. One error-code-to-user-message layer and one non-blocking notification pattern.
6. One source for Handbook/Knowledge content with generated views if both browsing modes remain useful.

These are **LOW to MEDIUM business risk** if done without changing domain commands.

### High-risk business-logic consolidation

1. Quote pricing/snapshot creation across root `quote.js`, `js/quote.js`, page inline code, and archive implementations.
2. Production/order status normalizers across `workflow-status`, `erp-core`, Hub, Customer 360, and page code.
3. Auth/session refresh across two auth files and embedded page fallbacks.
4. Inventory reservation/attempt consumption/QC behavior.
5. Payment, finance posting, correction, and order closing.
6. Production-to-Quote and acceptance-to-Order handoffs.

These should be consolidated only behind existing behavior tests and deployed-contract verification. Do not “clean up” compatibility mappings until live legacy rows are classified.

### Proportionate target architecture

Keep the static multi-page application and Supabase. Move toward small shared browser modules and narrow RPC commands—not a framework migration, microservices, or an event platform. The immediate architectural objective is one runtime path per business command and one presentation shell per audience.

---

## 11. Database / Data Assessment

### Working well

- Quote acceptance produces an immutable commercial snapshot rather than recalculating downstream.
- Workflow and payment command receipt tables support idempotency.
- Expected-version/`updated_at` arguments expose stale conflicts instead of blind last-write-wins.
- Inventory reservations and attempt consumption receipts establish transactional authority.
- Finance corrections are append-oriented with an effective projection.
- Public tracking is designed as a reduced projection rather than direct order-table exposure.

### Risk/complexity

1. **Migration accumulation:** over 50 dated migrations in less than a month repeatedly replace/repair the same workflow functions, overload signatures, grants, triggers, locks, tax metadata, and legacy lifecycle behavior.
2. **Signature compatibility:** text/UUID overloads and parameter-default compatibility make the deployed winning function signature difficult to infer without introspection.
3. **Identity history:** production quote/order linkage required multiple repairs and a survivor-tree reconciliation; legacy standalone rows remain a special class.
4. **Status history:** canonical five-stage statuses coexist with legacy values and mappings. Defaulting unknown values to `ready_to_print` is operationally dangerous if used outside display-only compatibility.
5. **Payload duplication:** `job_payload` and copied snapshot/metadata fields are useful at handoffs, but need documented field authority to prevent accidental downstream edits/recalculation.
6. **Final-state uncertainty:** migration files define intent; only authenticated introspection can prove installed function bodies, grants, policies, triggers, and constraints.

### Recommendation

Do not squash or destructively rewrite production history. Produce a read-only “effective schema contract” from a known-good deployed database, compare it in release checks, then mark superseded functions/fields as deprecated with observed-use evidence before any retirement migration.

---

## 12. Security Assessment

### Critical

No confirmed committed service-role credential was found in the reviewed patterns. If a live service-role token is ever found, rotate it immediately and remove it from history; this audit intentionally records no values.

### High

1. **Deployed RLS/grant parity unknown.** Numerous `SECURITY DEFINER` functions and grants are safe only if final `search_path`, ownership checks, public execute revocations, and table policies match the latest intended migration.
2. **Public RPC boundary.** Quote response, tracking, pay, and fundraiser intake accept unauthenticated input. They require rate limiting/abuse monitoring, minimized responses, unguessable/expiring references, input length/type validation, and no raw error leakage.
3. **Stored token + XSS impact.** Access/refresh tokens live in localStorage and pages render dynamic HTML extensively. Escaping helpers are common, but one injection flaw could expose sessions.
4. **File lifecycle.** Client asset upload/archive/restore is high impact; validate MIME, extension, size, object path ownership, bucket privacy, signed URL expiry, and authorization server-side.
5. **Financial/inventory authority.** Browser UI must never be the authority for payment, finance posting, stock consumption, correction, or deletion. Recent RPC migrations move correctly in this direction; verify direct mutation grants are absent.

### Medium

- Root `olipoly-auth.js` and `js/olipoly-auth.js`, plus embedded auth fallbacks, can drift.
- Customer 360 fetches broad tables up to 1,000 rows; RLS is the only tenant/owner boundary and excess data increases exposure.
- Native/raw error propagation can reveal PostgreSQL function/table detail.
- Public pages do not show evidence of a site-wide Content Security Policy; inline scripts make a strong CSP harder.
- Archive HTML contains obsolete local admin/quote implementations and should not be deployed publicly.

### Low

- Browser-visible Supabase anon keys are not secrets by themselves; label them accurately and rely on RLS/RPC policy.
- Diagnostic scripts correctly request secrets at runtime and state that they do not print them.

### Required defensive verification (non-offensive)

Run the repository’s read-only introspection against staging/production with authorized credentials; verify final RLS, grants, function owner/search path, anonymous RPC response shape, storage bucket policies, and migration IDs. Record only policy metadata, never tokens/customer data.

---

## 13. Performance Assessment

| Priority | Finding | Impact / action |
|---|---|---|
| High | 12 MB and 4.9 MB videos; many 2–3.5 MB PNG/JPG assets | Encode responsive poster/video variants, lazy-load below fold, serve WebP/AVIF where useful, preserve originals outside delivery path. |
| High | Orders/Production pages contain roughly 292 KB/239 KB inline script plus many modules/styles | Parse/compile cost and maintainability; extract behavior by tested domain, not a rewrite. |
| High | Customer 360 fetches four broad `select=*` datasets up to 1,000 rows | Replace with customer-scoped projection/query and explicit error/loading state. |
| Medium | Multiple CSS generations load on single pages | Extra bytes and cascade work; remove only after visual contract tests. |
| Medium | Repeated auth/bootstrap/direct REST logic | Consolidate token/session fetch and page data loaders; measure before adding caching. |
| Medium | Large PNG duplicates/variants | Hash/dimension/use-site inventory, then responsive derivatives and deploy allowlist. |
| Low | Only two `setInterval` sites found | Polling is not a repository-wide concern; inspect those sites rather than adding infrastructure. |

No performance telemetry is evident. Useful measures: public LCP/CLS/INP by page family; intake CTA and completion; ERP boot-to-usable, request count, command latency/conflict rate, and asset upload failure rate. Prefer privacy-conscious first-party/server logs before third-party tooling.

---

## 14. Accessibility Assessment

### Working/present

- Core public pages expose skip links and generally one H1.
- Forms commonly use labels; status text usually accompanies colors.
- Confirmation focus is explicitly moved in generic fundraiser intake.
- Shared ERP shell creates a path to consistent focus/auth behavior.

### Gaps requiring browser/assistive verification

1. **Keyboard/focus:** custom mobile menus, modals, print windows, and dense ERP dialogs need focus trap/return and Escape behavior checks.
2. **Native dialogs:** `alert/confirm/prompt` are accessible inconsistently and provide poor context; migrate gradually to a shared dialog for nontrivial actions.
3. **Headings:** Orders and Quote contain multiple H1 elements; verify hidden print/document H1s do not pollute the accessibility tree.
4. **Contrast:** layered legacy/current CSS and muted text/status colors need automated and manual AA checks in all states.
5. **Tables:** ensure captions/headers, horizontal-scroll affordance, and row action names; avoid converting operational tables into unreadable cards blindly.
6. **Dynamic updates:** loaders, errors, saved state, conflict notices, and auth expiry need appropriate live-region behavior.
7. **Images/video:** audit meaningful alt text, decorative empty alt, captions/transcripts, autoplay/motion, and controls.
8. **Touch targets:** mobile nav, filter chips, icon actions, and campaign options should target approximately 44×44 CSS pixels.

---

## 15. Mobile Assessment

### Public

Mobile intent is clear through shared responsive styles and dedicated `public-mobile` compatibility assets. Risk concentrates at the boundary between families and on task pages with embedded application panels. Verify at 320, 375, 768, and 1024 CSS px:

- menu open/close, focus, body scroll lock, and no clipped CTA;
- gallery image aspect/crop and video download behavior;
- track/pay/quote response error and payment rows;
- Niles option/payment lists and external Tally viewport;
- long local names, email addresses, policy anchors, and footer columns.

### ERP

Desktop-first is proportionate. Tablet/mobile must still allow emergency lookup/action without overlapping controls. Highest risk: Orders/Production/Inventory wide tables, multi-column forms, sticky action bars, print controls, and modals. Provide intentional horizontal table containers and prioritize read-only summary before edit forms. Do not spend P1 effort making every financial report phone-native.

**Limitation:** this audit did not claim live browser/device verification; repository CSS and markup were inspected. Manual viewport checks remain required.

---

## 16. SEO Assessment

### Working well

- `sitemap.xml`, `robots.txt`, canonical tags on newer local/story pages, descriptive titles/descriptions, OG on many newer pages, one H1 on most public pages, and seven named local landings are present.
- Regional/custom-printing, prototype, replacement, gifts, business, and community subjects naturally exist in copy.

### Inconsistencies

- Core editorial pages generally lack canonical URLs and Open Graph metadata, while newer PL pages include them.
- `project-received` and `quote-response` should be explicitly `noindex`; confirm sensitive/task URLs are absent from sitemap and caches.
- `robots.txt` disallows six ERP pages but omits Customer 360, Recipes, Campaign Manager, Handbook, and Knowledge. Robots is not access control, but all private/utility pages should consistently use `noindex` and auth.
- Sitemap omits showcase/story pages and Chagrin Falls was added while Niles campaign/local relationships remain confusing; define an intentional inclusion policy.
- No clear LocalBusiness structured data was identified in the inspected entry-point metadata.
- Local page content uniqueness and actual local proof need human review to avoid doorway-like repetition.
- Image filenames are descriptive in places, but alt semantics and generated derivatives require a complete use-site check.

### Local SEO opportunity

Use verifiable business name/location/service area, contact method, real project examples, capability boundaries, and consistent canonical/OG data. Connect regional hub → locality → relevant project proof → start form. Avoid adding cities without real service relevance or unique helpful content.

---

## 17. Conversion / Trust Assessment

### Trust assets already present

- Real project photos and process stories.
- Aurora/Northeast Ohio identity.
- Dedicated business, PO, tax-exempt, community/fundraiser, tracking, payment, FAQ, and policy content.
- Human contact email and small-studio positioning.

### Likely submission blockers

1. No concise price/lead-time framing before an external form.
2. Limited named business/operator credibility and review/testimonial evidence.
3. Unclear upload privacy and customer-design/IP handling at the moment of submission.
4. External-form transition without strong visual/context continuity.
5. Business buyer expectations scattered across Collaboration, FAQ, Start, Pay, and Legal.
6. No obvious customer-facing reorder shortcut.
7. Two fundraiser implementations create uncertainty about the current process.
8. Payment-provider links may feel manual without explicit security/reconciliation explanation.

Useful measurement: page → start CTA; start → external form open; form completion webhook/confirmation; source/local/campaign attribution; track lookup success/failure; pay method selection; campaign view → submit. Collect minimum necessary data and document retention/privacy.

---

## 18. Error Handling Assessment

Static inspection found approximately 75 `alert()` calls, 36 `console.error` sites, and multiple empty/swallowing catches across application and archive files. Counts are indicators, not all defects.

### Problems

- Customer 360 converts network/read failures to empty arrays, making “no history” indistinguishable from “could not load.”
- Several fetch helpers throw backend `message/error` strings that can reach UI verbatim.
- Native dialogs dominate complex Orders/Production actions and label-print setup.
- Console-only failures leave operators uncertain whether a command committed.
- External intake/payment failures do not share an end-to-end correlation ID.

### Coherent strategy

1. Define user-safe categories: validation, authentication expired, authorization denied, offline/network, stale conflict, business-rule rejection, dependency unavailable, unknown.
2. Every mutation shows pending, confirmed success with authoritative identifier/version, or persistent failure with retry/refresh/contact action.
3. Never retry non-idempotent commands unless an idempotency key/receipt proves safety.
4. Map known PostgreSQL/RPC codes to plain language; put sanitized diagnostic code/correlation ID in “Details.”
5. Distinguish empty data from load failure and stale cached data.
6. Centralize toast/banner/dialog visuals after semantics are defined.

---

## 19. Browser Cache / Recovery Assessment

| Key/pattern | Classification | Risk / authority rule |
|---|---|---|
| `olipoly_auth_session_v1`, `sb_token`, `sb_refresh_token`, `sb_user` | CACHE / session credential | Not business authority; duplicated readers can cause stale UX. |
| ERP reliability snapshot/dismiss/last-export keys | RECOVERY ONLY / health | Must never auto-overwrite hydrated cloud rows; show timestamp/source before restore. |
| `olipoly_erp_event_log_v1` | AUDIT (browser-local only) | Useful UX history, not durable business audit. |
| `olipoly_workflow_command:*` | CACHE/idempotency aid | Must correspond to server receipt/version; safe cleanup policy needed. |
| `olipoly_workflow_draft_v1`, quote draft, reorder draft | RECOVERY ONLY | Clear after authoritative save/hydration; prompt before replacing newer server data. |
| `olipoly_transfer` | LEGACY handoff | One-time Quote→Order style transfer; remove only after proving current command path supersedes it. |
| local quote lists / production jobs / raw material inventory / spool pool | LEGACY or RECOVERY UNKNOWN | Highest resurrection risk where fallback loaders can render/write old business data. |
| Finance settings and Hub finance summary | SETTINGS / CACHE | Summary needs age/source label; cannot drive accounting. |
| knowledge favorites/recent | USER PREFERENCE | Low risk. |
| fundraiser attempt key (sessionStorage) | IDEMPOTENCY CACHE | Appropriate; cleared on confirmed submission. |
| finance correction session key | IDEMPOTENCY CACHE | Appropriate if backed by receipt. |

Conceptual safety is strongest in newer authoritative-persistence/recovery composition tests. It is not globally obvious because page-specific fallback code still reads legacy inventory/job/quote keys. Establish one invariant: **after successful authenticated hydration, legacy/local business arrays are read-only recovery evidence and cannot enter a normal save payload without an explicit restore confirmation and version check.**

---

## 20. Test Coverage Assessment

### Inventory by domain

| Domain | Coverage assessment |
|---|---|
| Production | **STRONG:** workflow, hydration, persistence, attempts, locks, QC atomicity, cancel/reprint, identity, reservations, evidence, dispatch. |
| Quote | **STRONG:** totals, acceptance authority/runtime/snapshot, handoff, customer flow, email formatting, order unification. |
| Orders | **STRONG:** actions, auth bootstrap, save authority, metadata, payment/finance, close/finalization, lifecycle repairs. |
| Inventory | **STRONG:** lifecycle, browser authority, reservations, consumption/timeout/locking. |
| Finance | **STRONG contract-level:** corrections, effective reporting, tax metadata, append-only authority, live-schema alignment. |
| Auth/security | **MODERATE:** public access hardening, auth layout/bootstrap, accepted snapshot; weak browser session-expiry/logout E2E. |
| Campaigns | **GOOD contract-level:** manager, submission, conversion, generic intake, Niles decision. |
| Persistence | **STRONG:** authoritative persistence, recovery, single fetch, transfer/handoff contracts. |
| Public forms/tracking/pay | **WEAK:** limited/no full browser tests for external intake, tracking states, payment links, quote response accessibility. |
| UI/accessibility/responsive | **WEAK-MODERATE:** UI cohesion/contrast and customer journey static contracts; no clear real-browser keyboard/mobile/visual suite. |

Many tests inspect source strings, migration text, or function shape. These are valuable regression contracts but can be brittle: harmless formatting/refactoring can fail while deployed integration can still be broken. Preserve focused pure-function tests, but add a small behavior-oriented browser suite and staging RPC smoke suite for the handful of critical journeys.

---

## 21. Documentation Assessment

| Documentation | Classification | Finding |
|---|---|---|
| `AGENTS.md`, `DOMAIN_CONTRACTS.md`, `SHARED_SERVICES.md` | **CURRENT** | Clear ownership and cross-domain rules. |
| `ERP_1_0_WORKFLOW_MAP.md`, `ERP_1_0_HANDBOOK.md` | **CURRENT / valuable** | Strong lifecycle/operator narrative. |
| `ERP_1_0_RELEASE_CANDIDATE_AUDIT.md` and checklists | **CURRENT evidence, deployment-sensitive** | Useful release scripts; not proof of current deployment. |
| Migration notes/bridge pass files | **DUPLICATED / historical** | Valuable archaeology, poor primary documentation. |
| Root README | **MISSING** | No concise setup, architecture map, local serving, test, deployment, environment, migration-order, and rollback entry point. |
| Deployment runbook | **MISSING/fragmented** | Needs static hosting + Supabase migration verification + secrets handling + smoke/rollback. |
| Migration effective-state docs | **MISSING** | Chronology exists; final function/policy contract is hard to derive. |
| ERP Handbook vs browser Handbook vs Knowledge | **DUPLICATED** | Choose one maintained source and generated/linked presentation. |
| Public content inventory/ownership | **MISSING** | No maintenance owner/cadence for events, local pages, policies, campaign sunset. |

---

## 22. Legacy / Dead Code Assessment

| Candidate | Confidence | Cleanup risk | Evidence / next proof |
|---|---:|---:|---|
| `archive/*` HTML/JS | High | Low-Medium | Explicit archive and old local storage paths; verify not hosted/bookmarked, then exclude from deploy/delete in a later PR. |
| Root `quote.js` vs `js/quote.js` | High duplication | High | Near-parallel quote implementations; determine loaded production file and diff behavior before consolidation. |
| Root vs `js/olipoly-auth.js` | High duplication | High | Both persist same token/session keys; establish one import path with auth E2E first. |
| Embedded auth block in Production | High | High | Reimplements session refresh/getUser and coexists with shared/root scripts. |
| Legacy local business arrays | Medium-High | High | quote/job/inventory/spool keys retained; classify real browser data before removal. |
| `olipoly_transfer` | Medium | High | compatibility handoff consumed by Orders; prove all current Quote saves use authoritative handoff. |
| Duplicate status maps | High | High | `workflow-status`, `erp-core`, Hub, Customer 360 and pages map legacy values. Consolidate only after data classification. |
| Duplicate print-window helpers | High | Medium | shared `document-theme` and page-local implementations coexist. |
| `erp-upgrade`/RC5 legacy public frame | High | Medium | retained on story/local/task pages; visual shell migration can be staged safely. |
| Bespoke `niles.html` flow | Medium | Medium-High | generic fundraiser engine exists, but active campaign/payment records may require retention. |
| Old sprint/pass markdown | High historical | Low | archive/index them rather than delete evidence indiscriminately. |

No dead event handler should be removed based on text search alone. Instrument/trace actual entry points, then delete a coherent path with regression tests.

---

## 23. Keep / Improve / Remove Matrix

| System/component | Decision | Reason |
|---|---|---|
| Core public editorial pages | **KEEP + POLISH** | Distinctive, coherent, understandable. |
| Showcase/case-study content | **KEEP; CONSOLIDATE shell** | Valuable proof/SEO; visual implementation is split. |
| Local landing content | **KEEP + INVESTIGATE uniqueness** | Real local discovery value if claims/proof remain specific. |
| Start-project gateway | **IMPROVE** | Good low-friction copy; external dependency/reassurance/measurement weak. |
| Track/Pay/Quote response | **KEEP + HARDEN** | Essential customer self-service; privacy/error/reconciliation critical. |
| Niles bespoke campaign | **INVESTIGATE / RETIRE CANDIDATE after campaign** | Special-case path duplicates generic intake. |
| Generic fundraiser engine | **KEEP + IMPROVE discoverability** | Appropriate reusable campaign capability. |
| ERP Hub | **KEEP + POLISH** | Useful operational orientation; cache freshness must be visible. |
| Production Control | **KEEP + IMPROVE carefully** | Authoritative, capable, overly monolithic. |
| Quote | **KEEP + rename/polish; consolidate runtime** | One pricing system exists conceptually; implementation copies remain. |
| Orders Admin | **KEEP + IMPROVE carefully** | Broad required fulfillment capability; monolithic and dialog-heavy. |
| Inventory Control | **KEEP + HARDEN** | Correct authority; local fallback and large page need containment. |
| Finance Pro | **KEEP AS SPECIALIZED + targeted polish** | Do not force public/ERP card redesign; protect append-only model. |
| Customer 360 | **KEEP + IMPROVE** | High operator value; broad reads/silent failures/scale risk. |
| Product Recipes/assets | **KEEP + POLISH** | Supports repeatability and file ownership. |
| Handbook + Knowledge | **CONSOLIDATE** | Useful content, multiple maintenance surfaces. |
| Shared shell/UI modules | **KEEP + EXTEND cautiously** | Current lighter direction succeeds. |
| Archive pages | **REMOVE FROM DEPLOY / RETIRE CANDIDATE** | Obsolete and potentially confusing; retain history in Git. |
| Compatibility migrations/maps | **INVESTIGATE, then retire surgically** | Presently protect real legacy data; premature deletion is high risk. |

---

## 24. P0 / P1 / P2 / P3 Roadmap

| Order | Priority | Problem / affected system | Impact | Effort | Change risk | Dependencies |
|---:|---|---|---|---|---|---|
| 1 | P0 | Verify deployed RLS, grants, RPC bodies/search paths, storage policies, migration parity | Prevent unauthorized data/commands and false release confidence | Medium | Low (read-only) | authorized staging/prod introspection |
| 2 | P0 | Prove payment→finance→close and QC→inventory atomic workflows against deployed schema | Prevent financial/inventory correctness loss | Medium | Medium | test records, migration parity, backup/rollback |
| 3 | P0 | Enforce/verify local recovery cannot overwrite hydrated cloud state | Prevent resurrected orders/jobs/inventory | Medium | High | persistence key inventory, multi-device tests |
| 4 | P1 | Unify auth runtime/session UX across ERP | Reduce expiry/logout/XSS-adjacent drift and operator lockout | Medium | High | auth behavior tests, CSP plan |
| 5 | P1 | Establish one canonical status/command adapter | Reduce wrong transitions/default-to-ready behavior | Medium | High | legacy row classification, deployed contract |
| 6 | P1 | Harden public quote/track/pay/fundraiser errors, privacy, idempotency and reconciliation | Protect customer trust and reduce support burden | Medium | Medium | public RPC verification, provider config |
| 7 | P1 | Clarify and instrument project intake/business/fundraiser journeys | Improve qualified submissions and diagnose abandonment | Medium | Low | privacy decision, external form/webhook access |
| 8 | P1 | Contain Production/Orders monoliths domain-by-domain | Reduce regression rate and duplicate handlers | Large | High | tests, runtime trace, no visual redesign |
| 9 | P2 | Consolidate public PE/PL shell | Brand consistency, accessibility, maintainability | Medium | Low-Medium | visual baselines, URL preservation |
| 10 | P2 | Optimize high-weight images/video | Faster mobile conversion and lower bandwidth | Medium | Low | asset use map, image pipeline |
| 11 | P2 | Replace silent/native error patterns incrementally | Clear operator/customer recovery | Medium | Medium | error taxonomy/component |
| 12 | P2 | Consolidate Handbook/Knowledge and documentation index | Reduce stale operational guidance | Small-Medium | Low | content owner |
| 13 | P2 | Complete canonical/OG/noindex/robots/sitemap policy | Better discoverability and private-page hygiene | Small | Low | public URL policy |
| 14 | P2 | Customer 360 scoped projection/query | Faster load, clearer errors, reduced exposure | Medium | Medium | schema/RPC design, migration later |
| 15 | P3 | Testimonials/reviews and additional real project proof | Trust enhancement | Small-Medium | Low | customer permission/authentic content |
| 16 | P3 | First-party lightweight analytics dashboards | Ongoing decision visibility | Medium | Low-Medium | privacy/retention policy |

---

## 25. Quick Wins

All are proposed, not implemented, and should be separate focused changes where appropriate.

1. Rename public/operator title “Quote Tool Lite” to the current single Quote terminology.
2. Add canonical and consistent Open Graph metadata to core editorial pages.
3. Add `noindex` to all ERP/task-response pages and align `robots.txt` coverage (without treating it as security).
4. Document `fundraiser.html` URL/query contract and link it from Campaign Manager preview; do not put every campaign in global nav.
5. Add a “reordering?” sentence to Start/Track directing customers to include their prior order number.
6. Add a concise “what happens next” and expected response window to Start Project.
7. Add file/privacy reassurance immediately before the external intake handoff.
8. Standardize Quote / Order / Invoice labels on Track, Pay, and Quote Response.
9. Distinguish empty, loading, offline, unauthorized, and failed states in Customer 360.
10. Add visible cache timestamp/source labels to Hub summaries.
11. Add captions/posters/lazy loading and responsive derivatives for the two largest videos first.
12. Create an asset-use report (hash, dimensions, references) before deleting anything.
13. Add one accessibility smoke test for menu, focus, dialog, form errors, Track, and Start.
14. Add one browser smoke test for invalid/expired quote and tracking references.
15. Index historical pass notes from one documentation page and label them historical.
16. Add a root README that points to authoritative docs/tests/deployment procedure.
17. Replace raw backend messages on one customer-critical page with mapped safe categories.
18. Add explicit manual-browser test matrices at 320/375/768/1024 and desktop ERP widths.
19. Add service-area/business identity facts consistently in footer/schema where verified.
20. Confirm archive paths are excluded from hosting/deployment.

---

## 26. Big Rocks

1. **Deployment authority verification gate:** automated read-only comparison of expected versus deployed RLS/RPC/storage contracts.
2. **ERP runtime-path simplification:** one auth module, one status adapter, one command dispatch path, with legacy behavior isolated and measured.
3. **Production/Orders modular containment:** extract tested slices (documents, communication, metadata, catalog, rendering) without changing workflow authority.
4. **Public customer journey unification:** one branded shell and coherent Start→confirmation, Quote, Track, Pay, business, and fundraiser expectations.
5. **Authoritative recovery model:** one documented storage registry and explicit restore workflow that cannot silently supersede cloud state.
6. **Behavior-level critical journey suite:** small real-browser + staging RPC coverage for retail, PO, reprint, cancellation, payment/finance close, campaign submission, and session expiry.
7. **Operational observability:** sanitized command receipts/failure categories, stale conflicts, finance/inventory failures, auth issues, and recovery mode visibility.
8. **Asset/content governance:** optimized delivery assets, one usage manifest, campaign sunset rules, and ownership/review cadence for events/local/legal content.

---

## 27. Suggested Implementation Sequence

1. **Evidence first:** deploy-state introspection, backup/rollback confirmation, storage policy verification, and real workflow smoke tests.
2. **Correctness containment:** formalize browser storage registry/cloud-wins invariant; centralize error categories and command outcome handling.
3. **Auth/status foundations:** consolidate only after capturing current behavior and legacy data distribution.
4. **Customer-critical polish:** Quote Response, Track, Pay, Start, business/fundraiser guidance, metadata/noindex, and low-risk accessibility.
5. **Presentation consolidation:** migrate legacy-frame public pages to the editorial shell using screenshots/visual checks without rewriting content.
6. **Monolith reduction:** extract one non-authoritative slice at a time; documents/formatters before lifecycle commands.
7. **Performance/assets:** optimize referenced large media, then remove proven duplicates/obsolete deployment artifacts.
8. **Documentation/observability:** make the new steady-state supportable; archive historical notes and adopt minimal measurement.

Each milestone should end with syntax checks, relevant assertions, `git diff --check`, and explicitly listed manual browser checks. Stop between coherent PRs.

---

## 28. Areas That Should NOT Be Changed

1. Do not split the static site/ERP into microservices or introduce Kubernetes/event infrastructure.
2. Do not migrate frameworks merely to gain components; first consolidate existing HTML/CSS/JS modules.
3. Do not merge Public and ERP visual design into one aesthetic. Share brand/accessibility primitives, not density or purpose.
4. Do not make Finance look identical to general ERP at the expense of financial scanability.
5. Do not reimplement manufacturing estimates in Quote or customer totals outside `calculateQuoteTotals()`/the accepted snapshot.
6. Do not let Orders, Finance, or browser recovery recalculate manufacturing truth.
7. Do not weaken command receipts, immutable snapshots, version conflicts, inventory attempt receipts, or append-only finance corrections as “complexity cleanup.”
8. Do not delete legacy status/signature compatibility until deployed rows/callers are classified and observed unused.
9. Do not expose service credentials, customer data, private assets, or raw diagnostics in client/reporting output.
10. Do not remove descriptive story/local URLs solely to reduce page count; consolidate presentation while preserving useful content and redirects where evidence supports them.
11. Do not automate destructive schema changes or assume migrations are deployed.

---

## 29. Open Questions / Unknowns

1. Which commit and migration IDs are currently deployed to production, and are all 2026-08-11 repairs applied in order?
2. What are the live RLS policies, grants, function owners/search paths, and storage bucket policies?
3. Which tracked archive/root files are included by the production hosting deploy?
4. Does the external project form reliably redirect to `project-received.html`, and what upload/retention/privacy controls does it use?
5. How are payment-provider confirmations reconciled to Orders and Finance, and who resolves mismatches/refunds?
6. Is Niles still accepting orders? If closed, what customer-facing close state and data-retention rule applies?
7. How are generic fundraiser URLs generated/distributed, and is `fundraiser.html` intentionally absent from static navigation?
8. Which legacy localStorage keys still exist on real operator browsers, and when were they last written?
9. Are legacy standalone production rows still active, and how many need compatibility mappings?
10. Are local landing-page claims and events reviewed on a schedule by a named content owner?
11. What normal lead-time/price-driver language can the business support without creating an inaccurate promise?
12. Are customer testimonials/project photos cleared for marketing use and location-specific claims?
13. What browser/device matrix do operators actually use, especially tablets in production?
14. Are auth signup controls intentionally available in Finance, or should accounts be provisioned only administratively?
15. What retention/export/restore procedure is actually used for ERP recovery snapshots and uploaded job assets?
16. Which diagnostics are safe for operators versus developers, and where should sanitized correlation IDs be retained?

---

## Appendix A — Business-process gaps supported by repository evidence

| Process | Evidence-backed status/gap |
|---|---|
| Customer approval | Quote response and accepted snapshot exist; revision/change-request UX and expiry policy need clearer public/operator guidance. |
| Deposit/balance/payment | Retail deposit/balance documented and payment command exists; external-provider reconciliation remains an operational unknown. |
| PO/tax-exempt/Net terms | Backend and Handbook support them; public checklist/eligibility expectations are scattered. |
| Reorders | Customer 360 seeds a reorder quote draft; no clear customer-facing reorder path. |
| Refunds/corrections | Finance correction mechanisms and policy text exist; customer communication/approval procedure is not centralized. |
| Failed print/reprint | Strong workflow/inventory evidence; operator distinction between QC issue, scrap, and legacy failed status remains terminology-heavy. |
| Material substitution | Recipe/material systems exist; explicit customer reapproval rule is not prominent in public/handbook flow. |
| Shipping/pickup | Orders has messages, labels, tracker statuses; pickup confirmation/proof and shipping exception procedure are not clearly centralized. |
| Customer communication | Numerous email templates/actions exist in Orders; communication event authority/history is less clear than workflow command authority. |
| Inventory purchasing | Reorder points/attention are represented; purchasing/receiving workflow is not a clearly owned end-to-end module. |
| Machine maintenance/capacity | printer dashboard and maintenance event categorization exist; capacity scheduling/maintenance procedure appears lightweight rather than authoritative. |
| Quote expiration | quote lifecycle exists; consistent expiry duration, expired-link behavior, and re-quote procedure are not clearly established in public copy. |

## Appendix B — Asset inventory summary

- Tracked assets include more than 130 PNGs, 15 JPGs, 11 WebPs, 7 PDFs, and 6 MP4s.
- Largest delivery candidates include a 12 MB process video, a 4.9 MB video, several 2–3.5 MB PNG/JPG project images, and a 3.4 MB W-9 PDF.
- `plain-mockup1.png` exists both at repository root and under `images/` at the same approximate size, a high-confidence duplicate candidate pending hash/reference check.
- Multiple logo/favicon variants, campaign/product images, originals/optimized media, and print photos need a generated manifest before cleanup.
- Keep source-quality originals outside the web-delivery allowlist; derive responsive assets reproducibly; never delete solely by filename similarity.

## Appendix C — Audit limitations and manual checks required

- No claim is made that production Supabase, payment providers, email, Tally, or hosting configuration was live-verified.
- No authenticated production write or offensive security test was performed.
- No claim is made that browser rendering, WCAG AA, keyboard flow, or responsive layouts passed; source was reviewed and manual tests are specified.
- Recommended manual public checks: all nav/footer links; Start external handoff/confirmation; Quote valid/invalid/expired/change/accept; Track success/not-found/offline; Pay configured/unconfigured/provider return; generic/Niles campaign; 320/375/768/1024 widths; keyboard/screen-reader basics.
- Recommended manual ERP checks: auth/login/logout/expiry on every page; two-tab stale conflict; two-device command idempotency; estimate→quote→accept→order→production→QC→fulfillment→payment→finance→close; reprint/cancel; stock shortage; file upload/archive/restore; business PO/tax-exempt; recovery snapshot export/restore with newer cloud data.
