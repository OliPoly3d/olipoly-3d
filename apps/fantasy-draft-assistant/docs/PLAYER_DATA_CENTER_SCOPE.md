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

## 2026-08-26 production parser reliability scope

### Reproduction and root causes

The supplied production observations are the regression baseline: FantasyPros PPR 517, Half-PPR 882, IDP 192, ADP 382, bye 663, and Draft Sharks 80 unique articles. Those adapters already route by an explicit source card and were not replaced.

The ESPN Top 300 failure (279 accepted, missing D/ST ranks, and duplicate rank 1) had two independent causes: the row grammar did not accept every provider defense spelling and table parsing did not distinguish the unique 1–300 rank universe from the repeated legend example. The repair accepts `DST`, `D/ST`, and `DEF`, creates team-based DST identities, validates each of the four printed rank blocks, and excludes later duplicate-rank material. It does not encode player names, defense names, or the reported missing ranks.

The ESPN injury count of 44 equals pages 1 and 2 (18 + 26), which is evidence of page extraction truncation rather than a row grammar threshold. The shared browser extraction path now records the PDF page count, awaits pages 1 through `numPages` sequentially, reports page X of Y, and retains text-item counts for every page. Parsing continues across form-feed page boundaries without resetting team context. The exact 398-row production artifact remains a fixture-specific assertion to add when the complete sanitized 15-page extraction can be committed; 398 is deliberately not a permanent acceptance threshold.

Mike Clay returned zero because one universal position-leading row expression did not match the Excel PDF's player-leading, section-specific tables. Parsing now begins only after the Leaderboard / Projections divider, recognizes offense, IDP, kicker, and returner headings, applies separate schemas, normalizes ESPN/Clay team abbreviations while preserving the provider abbreviation, and labels returners supplemental-only. Return rows are reconciliation inputs and cannot independently activate a canonical player. Full 818 + 32 + 40 production counts require the complete sanitized guide extraction; small representative fixtures validate schemas without pretending to reproduce an unavailable document.

### Authority and consumer boundary

`source-authority.ts` is the typed source-to-consumer registry. Every composed field stores its authority category, scoring context, league compatibility, strength, allowed/prohibited consumers, freshness policy, transformation, validation confidence, and conflict behavior alongside its existing document/date provenance. Numeric presence never determines authority. ESPN remains an independent secondary ranking; ADP remains market context; Clay remains projection/opportunity/IDP projection; injury and bye remain factual; Draft Sharks remains bounded news.

The deterministic recommendation score is unchanged. Its existing terms are now also exposed as named component groups. Correlated source concepts do not gain new score terms merely because an additional source was imported: secondary ESPN confirmation, Clay projections, and opportunity are zero until a separately reviewed deterministic calculation consumes those fields. This fail-closed mapping prevents import volume from inflating recommendations while keeping the existing card ordering, Draft Fit, Cost of Waiting, and league philosophy intact. AI continues to receive deterministic results rather than uploaded documents and cannot rerank candidates.

### Verification and manual browser tests required

Run syntax/type checking, focused parser assertions, the complete Vitest suite, ESLint, the production build, and `git diff --check`. In a browser, upload the nine approved current-season files without activating them; verify all PDF pages report progress, diagnostics show pages processed equal page count, Top 300 reports 300/0/0, injury coverage shows the prior-versus-new count, Clay section counts are visible, unresolved supplemental identities remain excluded, and activation remains an explicit local action. Do not activate production data during this verification.
