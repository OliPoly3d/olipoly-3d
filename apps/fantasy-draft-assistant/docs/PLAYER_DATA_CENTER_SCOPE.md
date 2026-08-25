# Player Data Center — inspection, migration implications, and scope

Date: 2026-08-25  
Branch basis: repository HEAD `3fd6363`. The checkout has no configured Git remote or local `main` ref, so that merged default-branch commit is the newest available basis.

## Inspection

- **Instructions:** `/workspace/olipoly-3d/AGENTS.md` applies. There is no deeper project instruction file outside dependencies.
- **Navigation and league homes:** `src/main.ts` owns a hash router and global shell. The root route currently renders only Believeland and RoboCop cards. `league-dashboard.ts` renders league-local Rankings/Data controls.
- **Existing imports:** league-scoped FantasyPros overall/IDP CSV and ESPN PPR300 PDF workflows live in `main.ts`. The FantasyPros adapter already has reconciliation, preview, safety comparison, activation, serialization, and overall-vs-position validation. The ESPN adapter already uses PDF.js, printed ranks, internal dates, reconciliation, and serialization. A generic manual CSV importer also exists in `player-data.ts`.
- **Automated refresh:** the dashboard calls `refreshLeaguePlayerData`, which invokes the authenticated `draft-player-data-refresh` Edge Function through `CloudGateway`. `automated-player-data.ts` contains reusable normalization, not an acceptable continuing import mechanism under the new manual policy.
- **Parsing:** CSV parsing exists but assumes narrow headers in the current adapters. ESPN Top 300 text extraction exists. No Mike Clay parser exists. No approved inert ESPN-injury or Draft Sharks HTML adapter exists.
- **Composition and overlays:** `PlayerIntelligence` is the canonical rich player record. `applySnapshot` preserves an existing bye when an incoming sparse record omits it. `applyRankingAuthorities` overlays league-local FantasyPros and ESPN sources onto draft players. The recommendation engine reads those overlay fields plus injury, role, news, bye, roster state, and league philosophy.
- **Canonical identity:** provider-neutral IDs, normalized names/teams/positions, canonical candidate matching, aliases, and explicit ambiguous/unmatched states already exist. This remains the sole identity architecture.
- **IndexedDB:** schema version 7 has setup/session/event/draft snapshot/context stores plus league-keyed player data and ranking-source stores. Data Center snapshots, import drafts, and activation state need additive stores and therefore an IndexedDB version bump. Existing stores must not be cleared.
- **Cloud, authentication, and RLS assumptions:** authenticated Supabase reads exist for shared `draft_player_data_snapshots`; league ranking sources use authenticated table operations. Refresh and AI use authenticated Edge Functions. The frontend has only a publishable key. Existing SQL migrations define RLS for draft tables. There is no current global manual composite snapshot write contract.
- **Draft versioning:** recommendation requests can carry a snapshot ID, but `DraftSession` does not pin one. An additive optional `playerDataSnapshotId` is required. Sessions with picks must retain it unless explicitly upgraded.
- **News/injuries and timestamps:** current intelligence models support source, class, update/publication times, injury, availability, and news. They lack the complete requested per-field provenance and Draft Sharks article metadata. Existing freshness has only FRESH/AGING/STALE/UNKNOWN.
- **League selection:** current player and ranking snapshots are selected per league. PPR/Half-PPR and IDP compatibility checks exist, but the sources are not one global package.
- **Generated output:** the Vite build writes directly to repository `draft-assistant/`; `check:deployment` requires the committed artifact to match a clean build.
- **Tests/migrations:** Vitest covers parsers, reconciliation, composition, persistence, cloud boundaries, recommendations, dashboards, accessibility strings, and builds. Existing draft-related relational migrations are present; production migration application is out of scope.

## Understanding and decisions

### Reuse

Reuse PDF.js extraction, canonical IDs and candidate matching, rich player intelligence, sparse-value preservation, source serialization patterns, IndexedDB local-first behavior, snapshot compatibility validation, authenticated cloud reads, and recommendation inputs. Extend rather than replace those boundaries.

### Retire after replacement works

Retire league-local upload/replace controls and the dashboard automated refresh action. League pages become read-only consumers. Keep legacy records readable and labeled `LEGACY LEAGUE IMPORT`; never let them supersede a newer global activation.

### Migration implications

An **additive IndexedDB migration is required** for global snapshots and draft import sessions. No existing object store is deleted or rewritten. `DraftSession.playerDataSnapshotId` is optional for backward compatibility and is populated when a session is created or safely loaded without picks.

A **relational migration is not included in this milestone**. Existing cloud tables do not express an atomic global multi-source package with rollback and field provenance. Inventing that contract would exceed the safe scope and would require an authenticated RPC plus reviewed RLS. The first implementation is authoritative locally and explicitly reports that global Data Center activations are device-local. Existing authenticated shared reads remain unchanged as legacy fallback; production is not written.

No secure general web-research backend is present. The authenticated AI function is contextual drafting assistance, not an attributed live-news research service. Loaded Draft Sharks news is supported locally; live news is shown as unavailable with direct source links.

## Proposed coherent implementation scope

This PR will deliver a functional local-first Data Center foundation:

1. Central source manifest, field authority, freshness policy, source instructions, and league compatibility.
2. Flexible semantic header discovery and approved FantasyPros PPR, Half-PPR, IDP, ADP, and dynamic bye-sheet CSV adapters.
3. ESPN Top 300 reuse plus Mike Clay text adapter; first-class ESPN Print/Save as PDF injuries adapter and inert Draft Sharks HTML adapter; NFL card remains explicitly awaiting a validated sample.
4. Non-destructive field composition with provenance, coverage/conflict reporting, deterministic content IDs, atomic IndexedDB activation, previous-snapshot rollback, and locally saved import drafts.
5. A global, accessible `PLAYER DATA CENTER` route with source cards, multi-file/source-directed upload, validation/mapping preview, activation, limitations, help, and rollback.
6. League read-only consumer panels and removal of league activation/automated-refresh controls only after the global route is wired.
7. Optional draft-session pinning without altering draft events, keepers, owners, order, roster rules, chronology, or philosophies.
8. Focused and regression tests plus committed generated deployment output.

The absence of real source files means adapters are validated with small synthetic layout fixtures. NFL official injury parsing remains disabled until an actual sample is supplied. This PR will not add scraping, ranking APIs, credentials, background refresh, production writes, or a second canonical player system.
