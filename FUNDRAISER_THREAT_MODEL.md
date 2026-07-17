# Fundraiser Manager Threat Model — Phase 1

## Protected assets

Organizer and buyer contact data, personalization text, internal/production notes, idempotency material, Order and Finance identifiers, settlement snapshots, audit actors, and private asset paths are confidential. Order identity, line snapshots, payout calculations, production projections, confirmation events, and finalized settlements require integrity. Public ordering availability must not weaken existing ERP availability.

## Trust boundaries

- Anonymous browser to a future narrow public read/submission RPC.
- Authenticated owner browser to owner-scoped commands.
- Fundraiser extension records to Orders, Production, Recipes, Finance, and Assets.
- Browser recovery storage to authoritative Supabase state.
- CSV/print output to an organizer or operator device.

## Threats and required controls

| Threat | Required control and test gate |
|---|---|
| Anonymous enumeration or ID substitution | No direct private-table grants; sanitized catalog RPC; opaque receipt token; test IDs/slugs across fundraiser and owner boundaries. |
| Duplicate Order after retry/lost response | Hash a high-entropy idempotency key; unique fundraiser/key constraint; one transaction returns the prior safe receipt; concurrency tests. |
| Cross-owner FK injection | Every command verifies `auth.uid()` owns parent fundraiser and referenced Order/Recipe/Asset/Finance row; composite constraints or guarded triggers where plain FKs cannot express ownership. |
| Client price/payout tampering | Ignore submitted monetary values; server reads current catalog and snapshots fixed-point terms transactionally. |
| Shadow authority | Extension tables store attribution/snapshots only; Orders, Production, Inventory and Finance commands remain within their owners. Contract tests prohibit fundraiser mutation of canonical workflow. |
| Settlement mutation or replay | Finalization is an owner command with current-state guard and idempotency; finalized header/lines reject update/delete; Finance evidence is concrete and validated. |
| Personalization/XSS/log leakage | Length limits, output encoding, no sensitive logs, owner-only production response, retention job approved before launch. |
| CSV formula injection | Prefix cells beginning with `=`, `+`, `-`, or `@`; quote according to RFC 4180; organizer export uses an explicit data allowlist. |
| Private asset disclosure | Keep `job-assets` private; owner-only signed URL; never return storage paths from public catalog. |
| Stale browser copy presented as remote | Remote failure displays an error/empty authoritative state; recovery records live in a separately labeled review flow and never auto-upload. |
| Abuse/oversized input | Server-side size, quantity, character and window validation plus an approved rate-limit/CAPTCHA strategy before public launch. |
| Broad security-definer privilege | Fixed `search_path`, fully qualified objects, non-login owner, explicit execute grants, revoked public defaults, and privilege inspection in staging. |

## Explicitly deferred

Organizer identity, invitations, delegated policies, public image derivatives, payment providers, email automation, and a marketplace are not trusted surfaces in Phase 1 and must not receive placeholder policies.
