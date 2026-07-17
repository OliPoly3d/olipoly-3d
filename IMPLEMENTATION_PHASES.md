# Fundraiser Manager Implementation Phases

Each phase is a separate, focused milestone/PR with its own review, tests, manual browser plan, and stop decision. This specification PR is Phase 0 only.

## Phase 0 — Specification (this PR)

- Approve authority boundaries, workflows, proposed model, RLS, reporting, wireframes, migration/test strategy, risks, and open questions.
- Deliver documentation only. No UI, SQL, migration, schema application, or ERP workflow modification.

**Exit:** business owner and ERP maintainers resolve blocking architecture questions.

## Phase 1 — Deployed-contract discovery and decisions

- Inventory actual Supabase Orders/customer/Production/Inventory/Finance/Recipe/Asset schemas, RLS, grants, RPCs, triggers, and event contracts.
- Decide direct fundraiser-sale Order creation, recipe revision identity, tax/refund/rounding/fee policy, retention, public receipt, fulfillment, and Finance allocation.
- Produce threat model, data dictionary, API contract, query plan, and migration review draft—still no production UI.

**Stop:** if an authoritative stable ID or idempotent Orders path cannot be established.

## Phase 2 — Staging schema foundation

- Write reviewed migration SQL for fundraiser/catalog and owner RLS, then Order extensions/idempotent submission in separately reviewable steps.
- Add automated schema, constraint, ownership, rollback, and transaction tests in ephemeral/staging Supabase.
- Do not apply automatically or modify existing workflows.

**Exit:** owner isolation, idempotency, integrity, and ERP regression proven.

## Phase 3 — Owner management MVP

- Build owner-only fundraiser list/setup/catalog against remote authority behind a disabled feature flag.
- Reuse existing ERP design system and Recipe/Asset selectors.
- Add status guards, audit presentation, conflict handling, responsive/accessibility tests.

**Not included:** public ordering, organizer access, production mutation, settlement posting.

## Phase 4 — Public ordering and Orders integration

- Build sanitized public catalog and one idempotent submission path.
- Create/return authoritative Orders via approved contract; integrate Customer 360/Orders Admin read links.
- Security, concurrency, abuse/rate-limit, PII, lost-response, and multi-device testing are release gates.

## Phase 5 — Production/read integration

- Add owner rollups and deep links by design/recipe/item/customer.
- Request/link work only through Production Control; show milestone projections.
- Validate existing Inventory reservation/consumption/cancel/reprint lifecycle unchanged.

## Phase 6 — Finance, reporting, and settlement

- Implement Finance allocation reads/links, payment confirmation audit, fixed calculation library, dashboards, safe CSV, and immutable settlement snapshots.
- PDF/print consumes snapshot. Validate Order/Finance equality and adjustment policy.

## Phase 7 — Pilot and launch

- Run staging acceptance, backup/restore and rollback rehearsal.
- Pilot with controlled test data, then separately approve a dry-run Niles mapping/import if needed.
- Monitor duplicates, submission errors, RLS denials, totals variance, orphan links, query latency, and outstanding reconciliation before general enablement.

## Deferred phases

- Organizer portal/invitations and delegated RLS.
- Payment processor/webhook integration.
- Advanced batch planning if owned and modeled by Production Control.
- Additional organizations/currencies only after accounting rules are approved.

## Risks and controls

| Risk | Control |
|---|---|
| Shadow Orders/customers/ledger | FK extensions and authoritative service contracts only |
| Duplicate public sale | Transactional idempotency and unique constraints |
| Price/settlement drift | Immutable line and settlement snapshots; one shared pure calculation contract |
| PII/personalization leak | Public allowlist, RLS denial, private Assets, export controls |
| Production/Inventory regression | Read/link integration and full ERP lifecycle regression |
| Cross-fundraiser mixing | UUID scoping, composite uniqueness, owner/fundraiser-first queries/tests |
| Organizer confirmation mistaken for receipt | Separate confirmation and Finance evidence concepts |
| Legacy Niles ambiguity | Dry-run mapping, exception report, no automatic import |

## Blocking open questions

1. What are the deployed customer/organization and Orders primary keys and line-item capabilities?
2. What approved contract creates a direct-sale fundraiser Order without a fake Quote?
3. Which Production evidence defines “Programmed,” and how are batch quantities linked to Orders?
4. Which concrete Finance tables/entries represent organizer remittance and allocation?
5. How do tax, discounts, card fees, refunds, cancellations, rounding, overpayment, and write-offs affect proceeds?
6. What contact/personalization retention period and organizer-export consent rules apply?
7. Are public item images approved derivatives or private owner-only Assets?
8. What rate limiting/CAPTCHA and receipt-token behavior is acceptable for public ordering?
