# Phase 7 production data gate audit

Audit date: 2026-08-14

## Decision

**The Production Data Gate does not pass. Part B must not be implemented.**

The deployed client has no configured production player provider and no complete
current player snapshot that can replace its fixture pool. Adding an OpenAI layer
would therefore let the assistant reason over synthetic players and fixture
ranking values. The deterministic draft engine remains the only authority for
pick availability, but that does not make the underlying player pool production
data.

## Production trace before repair

1. `draft-assistant/index.html` loads the generated Vite client bundle.
2. Application startup calls `playerPool()` from `domain/seeds.ts`.
3. `playerPool()` returns keeper fixtures plus 240 `synthetic-*` records named
   `Test Player ###`.
4. `load()` reads an optional IndexedDB snapshot and calls
   `applySnapshot(playerPool(), snapshot)`.
5. `applySnapshot()` only overlays matching fixture records; it never creates a
   current player pool from snapshot records. Unmatched current players cannot
   reach the draft context.
6. Manual import maps ranking rows only to players already in that fixture pool.
   It cannot import a production player universe.
7. Automatic refresh has no configured provider. Even with a successful provider,
   `refreshPlayerData()` intentionally stops before merging provider data.
8. The recommendation engine receives `rebuildDraftState(ctx).available`, which
   correctly excludes deterministic picks/keepers, but scores remaining records
   with imported `currentBaselineRank` when present and fixture baseline values
   otherwise.
9. The Master Board renders `ctx.players`; its Available filter derives from the
   same deterministic `state.available` collection.

## Findings

### Player and ranking authority

- **Player source:** fixture seed pool, optionally decorated by a cached/manual
  ranking snapshot.
- **Ranking source:** per-player manual snapshot rank where a row maps; otherwise
  `baselineRank`/`baselineValue` from the fixture seed. This is a mixed ranking
  surface, not an isolated current snapshot.
- **Why fixtures are visible:** fixture data is unconditional application input,
  not merely a test or explicitly selected fallback.
- **Freshness:** imported rows carry timestamps and freshness, but fallback fixture
  ranks have no truthful timestamp. There is no pool-level production provenance.

### Availability

Drafted-player availability is correctly derived from deterministic draft events.
Recommendation candidates and the Available Master Board filter use that derived
state. Drafted players intentionally remain in All/Drafted board views and history.
This behavior should be retained, but it cannot by itself satisfy the data gate.

### Canonical mapping, refresh, and import

Canonical normalization handles names, team aliases, positions, and DST identities,
but the import matcher is anchored to fixture players. It therefore cannot validate
or activate a complete independent current player dataset. Refresh preserves the
last snapshot on failure, but no legal provider is configured and the success merge
path is deliberately unimplemented. Manual CSV/JSON preview, unmatched rows,
metadata, and explicit activation exist, but activation produces a partial overlay
rather than an isolated player pool.

## Blocking conditions

Before Part A can pass, a focused follow-up must provide all of the following:

1. A legal, configured production player provider or a documented full-player
   manual import contract.
2. Snapshot provenance that distinguishes current, cached current, manual import,
   fixture fallback, and development fixture modes.
3. Atomic pool selection where a valid current snapshot replaces—not decorates or
   mixes with—the fixture pool.
4. Complete canonical player/rank validation, including duplicate, team, position,
   DST, and IDP collision checks.
5. A successful provider normalization/validation/activation path.
6. Compact status and inspector UI that disclose player source, ranking source,
   timestamps, cache/staleness, news coverage, and fallback state.
7. Gate tests proving current-over-fixture precedence, isolation, provenance,
   cached offline behavior, and the existing drafted-player exclusions.

No SQL or schema migration is needed to resolve these blockers. No OpenAI code,
endpoint, client contract, or secret configuration was added during this audit.
