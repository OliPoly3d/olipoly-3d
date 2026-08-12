# OliPoly Public Customer Experience — Phase 2

## Baseline and scope

- **PHASE2_BASELINE_COMMIT:** `0ca0981229dd419b2d87d83825dcedc964898312`
- This milestone changes version-controlled public HTML, one public CSS layer, tests, and this review guide only.
- It does not deploy, mutate a database, change Supabase configuration, change external providers, or modify ERP, Finance, Production, Orders, Inventory, migrations, or lifecycle authority.

## Implemented page authority model

| Page | Primary customer job |
| --- | --- |
| Home | Understand OliPoly and choose a path |
| Collections | Future home of OliPoly-designed, ready-to-request work |
| Studio | Conservatively presented proof of studio work |
| Creations | Customer-led custom projects and design help |
| Collaboration | Business and organization purchasing |
| Community | Schools, teams, groups, fundraisers, and community programs |
| Start Project | Final expectations and unchanged project-intake handoff |
| FAQ | Deeper supporting answers |
| About | Owner, local identity, and studio context |

## Page-by-page implementation

### Home

The first screen now plainly identifies OliPoly as a custom 3D-printing and design business in Aurora, Ohio while retaining “Ideas become real.” It surfaces the project CTA, design-help/quote-first context, local fulfillment cues, and intent-based routes without reproducing every child page.

### Collections

Collections is now an intentionally restrained future-facing page. It states that original OliPoly designs are in development, explicitly says there is no current public catalog/store, contains no product cards, prices, inventory, or ecommerce claims, and routes immediate custom needs to Creations and Start Project.

### Studio

Studio now identifies itself as selected OliPoly work and retains existing imagery without adding project stories, customer facts, or speculative categories. “Originals” and future-product taxonomy were removed. Captions that could overstate unverified context were removed. Owner curation remains deliberately outstanding.

### Creations

Creations owns customer-led work: descriptions, sketches, photos, STL/STEP files, physical or broken parts, personalization, functional needs, and individual prototypes. It says a finished model is unnecessary, explains design/CAD fee nuance and quote-first pricing drivers, and routes business purchasing and portfolio proof to their authorities.

### Collaboration

Collaboration now clearly addresses businesses, organizations, schools/teams acting as purchasers, and repeat buyers. It covers formal quotes, invoices, POs, tax-exempt support, vendor relationships, prototypes, small batches, branded work, and reorders by prior order number. It accurately states that no universal dollar or quantity minimum exists while avoiding guaranteed acceptance.

### Community

Community owns school, team, group, fundraiser, event, and community-program explanation. It explicitly makes products, price, deadline, personalization, payment, inventory, pickup, shipping, and fulfillment campaign-specific. Formal procurement routes to Collaboration.

### Start Project and Project Received

Start Project now places practical expectations immediately before the unchanged Tally form: acceptable starting materials, 1–2-business-day typical response, quote-first process, approximate 1–2-week post-approval timing, pricing drivers, design-fee nuance, special-supplies deposits, revisions, fulfillment, physical examples, and source-file expectations. Implementation-facing Tally wording was removed while the destination remains `https://tally.so/r/xX4vJk`.

Project Received confirms success, gives the typical response window, adds an actionable email address, recommends checking spam/junk, and succinctly explains the next step.

### About, FAQ, and Events

About identifies Rob as owner/operator and reinforces Aurora, Ohio without requiring a portrait. FAQ remains supporting content but now aligns its response, turnaround, Collections, deposit, and fulfillment answers with Phase 2 policy. Events retains its date-driven event implementation and current event information; the duplicative generic capabilities block was removed.

### Quote Response, Track, Pay, Fundraiser

Quote Response and Track retain their customer-facing runtime and hooks; navigation descriptors are the only Phase 2 change on those pages. Pay now says the accepted quote/order establishes the amount owed and instructs customers to enter the exact displayed amount when a provider requires manual entry. Stripe, PayPal, Venmo, public tracking, and provider links remain unchanged. Generic Fundraiser behavior and campaign-specific authority remain unchanged.

### Legal and design/IP language

Legal now carefully summarizes the owner-supplied business policy: customer-provided/pre-existing IP remains with the customer or appropriate owner; OliPoly-created original CAD/design work remains OliPoly’s unless otherwise agreed in writing; a finished object does not automatically transfer source files; source transfer may be negotiated; and portfolio usage can be addressed through written confidentiality/usage terms before quote acceptance. Start Project uses a shorter plain-language version.

## Navigation and shared presentation

Branded navigation labels remain, with concise descriptors in the expanded menu: Collections/OliPoly designs, Studio/Selected work, Create/Custom projects, Collaborate/Business & organizations, and Community/Schools, teams & fundraisers. The descriptor is hidden at narrow widths to prevent crowding.

The Phase 2 CSS layer standardizes page-intro hierarchy, readable content widths, routing grids, callouts, CTA grouping, mobile stacking, visible focus treatment, and reduced-motion behavior. It is linked only from Phase 2 authority pages and is not loaded by `niles.html` or operational pages.

## Lifecycle and customer language

Copy consistently treats submission as a **project request**, the proposed scope and price as a **quote**, accepted work as an **order**, and the accepted commercial state as authority for the **amount due**. Backend fields, RPC names, statuses, and workflow contracts were not renamed.

## Business policies surfaced

- Typical initial review: 1–2 business days, not guaranteed.
- Typical completion: approximately 1–2 weeks after quote approval, subject to design, quantity, material, and project requirements.
- Pricing drivers without a public fixed price list.
- Normal versus substantial CAD/design assistance.
- Aurora pickup, U.S. shipping, and limited local delivery by arrangement.
- Flexible changes after approval, with possible price/timing/scope effects and updated approval.
- No universal minimum dollar amount or quantity.
- Physical-example assessment with arranged local drop-off or mailing.
- No universal deposit; disclosed special-material/supply deposit may apply and becomes non-refundable once supplies are ordered.
- Previous OliPoly order numbers can help locate reorders.
- Accepted quote/order amount authority and manual-entry payment guidance.

## Accessibility and responsive behavior

- Existing skip links and semantic main/section landmarks remain.
- New sections use labelled heading relationships and one visible page heading.
- Focus-visible treatment is reinforced for links, buttons, and inputs.
- Reduced-motion users receive non-animated revealed content and no forced smooth scrolling.
- Routing grids, policy grids, split sections, and CTA rows stack at narrow widths.
- Navigation descriptors are removed at mobile width rather than forcing cramped wrapping.

## Functional preservation and Niles verification

- Tally URL and embedded destination are unchanged.
- Project Received remains a retained, active, noindex page.
- Quote token/query, quote public RPC, accept/decline/change-request behavior remain unchanged.
- Track/Pay lookup and provider hooks remain unchanged.
- Generic fundraiser RPC implementation remains unchanged.
- No ERP/Finance/Production/Orders/Inventory/runtime-authority file is modified.
- Retired public branches were not restored.
- **Niles SHA-256 before:** `e09e36606edb816d5d1e2f09c1390f7c1f517ccf5af2f788adbb2f3f0973a279`
- **Niles SHA-256 after:** `e09e36606edb816d5d1e2f09c1390f7c1f517ccf5af2f788adbb2f3f0973a279`

## Automated tests

Pre-change trusted baseline: `node --test tests/*.test.js` — 176 passed, 0 failed.

Phase 2 adds focused contract coverage for retained pages, Niles bytes, Tally destination, Project Received, Quote Response hooks, Track/Pay hooks, payment providers, fundraiser RPC hooks, page authority, timing/fulfillment policies, payment authority, and retired-branch containment.

## Manual browser checks required

No deployment is part of this milestone. Before deployment, manually review each row in current Chrome, Safari, Firefox, and a keyboard-only pass where available.

| Width | Required checks |
| --- | --- |
| ~390 px | Menu open/close/focus, first-screen identity and CTA, path-card stacking, long policy copy, Tally iframe/fallback link, Project Received actions, Track lookup/results, Pay amount instructions, footer wrapping |
| ~768 px | Navigation overlay, two-to-one-column transitions, button wrapping, Studio image flow, FAQ details, event content |
| ~1024 px | Hero balance, path scanability, split-layout widths, Tally handoff, task-page results and payment controls |
| 1280 px+ | Editorial whitespace, content line lengths, visual hierarchy, Studio conservatism, Collections intentional restraint |

Also submit a non-production test request only when approved for manual integration testing, verify its redirect to Project Received, exercise a test quote response flow, perform a non-mutating order lookup, and verify payment-provider instructions without completing payment.

## Owner review flags

- **Collections:** Confirm the restrained future-facing presentation feels intentional rather than empty.
- **Studio:** Identify which actual completed projects/images should ultimately remain and supply verified project context.
- **Home:** Confirm first-screen business identity remains premium rather than generic.
- **Creations:** Confirm custom-work examples and STL/STEP/physical-part language match actual capabilities.
- **Collaboration:** Confirm business purchasing, PO, tax-exempt, vendor, and reorder language matches operating practice.
- **Community:** Confirm campaign/program wording does not overpromise.
- **Start Project:** Confirm timing, pricing, design-fee, supplies-deposit, fulfillment, and change expectations match actual practice.
- **Legal:** Obtain counsel review of IP/source-file/portfolio-use and non-refundable special-material deposit language.
- **Pay:** Manually verify amount-due/manual-entry instructions against each live provider.

## Content and imagery awaiting owner curation

Studio imagery is retained conservatively but still needs an owner-led verification pass, selection decisions, and accurate project context. Collections intentionally uses no catalog imagery. No new image was generated, moved, or classified as customer work.

## Legal review recommended

Counsel should review the plain-language ownership distinction, source-file negotiation, portfolio imagery/confidentiality timing, and non-refundable project-specific supplies deposit before those policies are treated as final legal terms. Phase 2 intentionally adds no warranties, indemnities, assignments, or statutory claims.

## Deferred Phase 3 opportunities

- Owner-curated Studio project selection, verified captions, and context.
- Owner-confirmed Collections launch content when real repeatable designs exist.
- Post-deployment usability and accessibility testing with real devices and assistive technology.
- Analytics-informed navigation refinement without expanding the public surface.
- Counsel-approved refinement of legal policy copy.
