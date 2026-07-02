# OliPoly Engine Backend Roadmap

## Current phase
The frontend/customer-facing website is stable enough to pause major changes. Backend work should focus on integration, consistency, and reliability.

## v1.0 target
A cohesive private ERP where Hub, Orders, Production, Inventory, Finance, Quote, Handbook, and Knowledge Library feel like one application.

## Phase 0 — Foundation
- Define private/public visual separation.
- Define deep-link parameter conventions.
- Define status and attention wording.
- Define risk levels for future changes.

## Sprint 1 — Safe integration
- Add deep-link/search params where practical.
- Improve Hub attention language.
- Connect module navigation without changing data models.

## Sprint 2 — Universal search preparation
- Normalize what fields each module exposes to search.
- Make Hub search smarter without querying private databases directly unless intentionally added later.

## Sprint 3 — Customer 360 design
- Design a customer-oriented view before coding.
- Pull together orders, quotes, production, and finance references.

## Sprint 4 — Business Pulse
- Daily operating briefing: quotes, unpaid orders, inventory actions, production queue, finance health.

## Guardrails
- No surprise schema changes.
- No mixed infrastructure + feature changes in the same sprint.
- No customer-facing changes unless explicitly requested.
- Every sprint gets a verification checklist.
