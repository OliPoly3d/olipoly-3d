# Fantasy Draft Assistant current state — Phase 4 completion

This note supersedes implementation-status claims in older phase/design documents. Those documents remain historical records and are not evidence that production services are deployed.

## Implemented repository behavior

- The deterministic, append-only draft engine is authoritative. IndexedDB remains the local-first store for setup, sessions, events, strategy, imports, and last-known-good player data. Undo and edit append superseding events; they do not rewrite history.
- Believeland uses its 12-team PPR, 17-round snake configuration. RoboCop uses Half-PPR, three keeper rounds, a Round 4 live start, current pick ownership, and two generic IDP starter slots eligible for DL/LB/DB.
- Automated FantasyPros/Sleeper normalization, validated compatible snapshots, manual FantasyPros overall/IDP CSV sources, and ESPN PPR300 reference imports are implemented. Imports require review and explicit activation.
- Shared player snapshots and shared FantasyPros ranking sources can be read across authenticated devices when the dedicated Fantasy Draft Assistant database materials and function are deployed. Live draft sessions/events remain local to one browser/device.
- Emergency backup/restore includes draft authority, local context, player snapshots, and ranking sources without authentication credentials.

## Ranking and bye authority

Ranking labels are not interchangeable. An active, league-compatible FantasyPros overall CSV is the offensive overall authority. Its IDP counterpart is a separate IDP scale. ESPN PPR300 is a disclosed reference on ESPN-specific surfaces. A normalized snapshot may supply overall rank only when backed by a comparable global source; position-pool `rank_ecr` supplies position rank/tier/ADP and cannot masquerade as cross-position ECR. Missing rank is valid. Fixture rank is used only when the whole fixture pool is active and is labeled **BASELINE FIXTURE RANKING**.

A bye week is shown only when explicitly supplied by a validated provider record, a supported FantasyPros/ESPN import, or an explicitly synthetic fixture. Missing real-player bye data displays as unavailable and contributes no recommendation penalty. A bounded overlap penalty applies only to equal known weeks.

## Failure behavior

Startup hydrates local last-known-good state first. A compatible newer shared snapshot may replace it atomically. Failed provider requests, persistence, validation, or rereads do not report activation and do not replace the prior snapshot. A real snapshot replaces the complete fixture pool; real and fixture players are never merged. Sleeper failure may make an otherwise valid FantasyPros snapshot partial, but cannot replace FantasyPros ranking authority. RoboCop activation requires the configured IDP dimension; an IDP failure cannot be treated as offensive ECR.

The generic IDP list is not a projection of RoboCop's custom scoring. IDP rank is displayed and evaluated separately from offensive overall rank. More granular CB/DE/DT/S eligibility or valuation must not be inferred from the two configured DL/LB/DB slots.

## Configuration-dependent behavior

Authentication/allowlist access, shared snapshot reads, automated FantasyPros refresh, AI responses, and scheduled refreshes work only when their dedicated migrations, Edge Functions, RLS, secrets, and optional Cron are correctly deployed in the Fantasy Draft Assistant Supabase project. Repository presence does not prove deployment. Provider display, retention, redistribution, account, and licensing rights require owner verification.

## Intentionally deferred

Realtime or multi-device draft-event synchronization, writer leases, conflict resolution, automatic device takeover, autonomous drafting, new providers, scraping, official NFL artwork, and deeper IDP projections remain deferred.

## Read-only production verification

Do not use the OliPoly ERP/Finance project.

1. In the dedicated Fantasy Draft Assistant project, inspect migration history for the files under `supabase/fantasy-draft-assistant/migrations/`; do not apply missing files without approval.
2. Confirm RLS permits only authenticated allowlisted reads and that no anonymous or broad write policy exists.
3. Confirm `draft-player-data-refresh` and `draft-assistant-ai` deployed hashes match the reviewed repository functions; do not redeploy during verification.
4. Confirm required secrets exist by name only. Never print values. Verify no server secret appears in runtime config, browser bundles, logs, or documentation.
5. Confirm any Cron invokes only `draft-player-data-refresh` with a server-side scheduler token and an approved cadence; do not create or change it.
6. Invoke a read-only compatible-snapshot query as an allowed user for 2026 PPR/offense-only and 2026 Half-PPR/IDP. Verify season, scoring format, `include_idp`, activation timestamp, version, validation summary, and provider diagnostics.
7. Inspect a Believeland refresh response: QB/RB/WR/TE coverage must pass, K/DST may be supplemental, and no position-pool rank may be exposed as overall ECR.
8. Inspect a RoboCop response: Half-PPR and `include_idp=true` must be present with valid IDP coverage and separate ranking classes.
9. Simulate provider and persistence failures in a non-production/test invocation and verify the prior snapshot remains newest/active and errors contain no credentials or raw sensitive provider payload.
10. On two authenticated browsers, verify shared player/ranking snapshots can be read while live picks do not appear on the second device. This confirms the intentional local-only boundary.

## Manual browser verification

At 1194×834 and nearby iPad Safari landscape viewport variants, verify no page-level horizontal overflow; all Draft/Pause/Resume/Undo/correction/backup controls remain reachable; cards and recent picks remain readable; conversation and overlays always close; the keyboard does not cover Send; privacy mode retains its unlock control; and offline/provider errors do not block local picks. Physical iPad Safari verification remains required before declaring draft-night readiness.
