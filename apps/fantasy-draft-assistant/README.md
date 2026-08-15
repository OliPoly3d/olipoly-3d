# Private Fantasy Draft Assistant — Phase 4A

Automated player-data provider setup, failure behavior, attribution, and the gated shared-storage proposal are documented in [docs/AUTOMATED_PLAYER_DATA.md](docs/AUTOMATED_PLAYER_DATA.md). Manual ranking import and truthful fixture fallback remain available until a real snapshot is activated.

This isolated Vite/TypeScript application lives under `apps/fantasy-draft-assistant`; production output is the unadvertised `/draft-assistant/` route. No OliPoly public header, footer, sitemap, customer menu, ERP module, or production Supabase migration references it.

## Security and local setup

Create a **separate Supabase project**. Never use OliPoly ERP credentials or run these migrations against its database.

```bash
cd apps/fantasy-draft-assistant
cp .env.example .env.local
npm install
npm run dev
```

Set `VITE_DRAFT_SUPABASE_URL` and `VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY`. Only the publishable key belongs in browser variables. With no Draft Supabase variables in the `local` environment, the app shows an explicit orange **LOCAL DEVELOPMENT MODE** banner. Production fails closed when configuration is incomplete. Configured deployments require a magic-link session and an authorized `draft_allowed_users` row.
Set `VITE_DRAFT_SUPABASE_URL`, `VITE_DRAFT_SUPABASE_ANON_KEY`, and `VITE_DRAFT_ALLOWED_EMAIL`. Only the publishable anon key belongs in browser variables. With no Draft Supabase variables, the app shows an explicit orange **LOCAL DEVELOPMENT MODE** banner. Configured deployments require a magic-link session; RLS also requires the user in `draft_allowed_users`.

Apply to a fresh Draft Assistant project, in order:

1. `supabase/fantasy-draft-assistant/migrations/202608130001_foundation.sql`
2. `supabase/fantasy-draft-assistant/migrations/202608130002_league_setup.sql`
3. `supabase/fantasy-draft-assistant/migrations/202608130003_draft_events.sql`
4. `supabase/fantasy-draft-assistant/migrations/202608130004_believeland_scoring_and_auth_support.sql`

After creating the private Auth user, insert its UUID into `draft_allowed_users` through the Draft project SQL editor. Anonymous roles have no policies. Policies are authenticated-only, allowlist-gated, and scoped through the owning League/Season.

## Architecture

`League` and `Season` are distinct. `SeasonSetup` contains reusable managers, season teams, flexible roster definitions, hard position limits, stable original draft slots, per-round current ownership, keepers, and reversible lock audit history. Seeds initialize only missing setup. IndexedDB schema v3 additively persists setups, sessions, append-only events, and discardable snapshots behind `DraftStore`.

**Draft events are authoritative; derived state and snapshots are rebuildable.** `createDraftPlan` uses actual round parity: odd rounds 1→12 and even rounds 12→1. RoboCop Rounds 1–3 project keeper setup records, not live events, so Round 4 starts at slot 12. Blank keeper cells remain blank; an incomplete start requires explicit administrative override.

Events use a session-local monotonically increasing sequence, not wall-clock ordering. Phase 5 can synchronize revisions and detect competing writes with unique `(session_id, sequence)`. `PICK_UNDONE` reverses without deletion. `PICK_EDITED` supersedes an older selection while keeping later picks and current position. Pause blocks picks and resume preserves position. Completion is derived from active live fills.

Temporary players have stable IDs, normalized names, positions, and nullable canonical IDs. Phase 6 can replace the fixture provider without changing the engine. Hard limits apply to combined keeper/live counts; FLEX and bench do not invent extra maxima. RoboCop IDP Utility provisionally accepts DL/LB/DB and requires confirmation before future valuation.

### Live Draft Room

`#/{league}/draft` is the iPad-first live cockpit described by
[`docs/DRAFT_ASSISTANT_DESIGN_SPEC.md`](docs/DRAFT_ASSISTANT_DESIGN_SPEC.md). It consumes the existing event-driven engine and keeps the current decision central: a switchable roster is on the left, three deterministic decision previews are in the center, and conversation is on the right. At narrower iPad widths, conversation becomes an explicit drawer rather than compressing the recommendations.

The manager selector changes only the inspected roster and provides a one-tap return to Rob's team. Position chips share a single semantic color mapping (QB blue, RB red, WR green, TE yellow, D/ST orange, K purple, and a consistent muted teal for current IDP fixtures) across rosters, recommendations, recent picks, details, and the Master Player Board.

The top bar derives round, slot, current pick owner, active/paused state, and distance to Rob's next owned pick from deterministic state. Draft Pulse rotates three explicitly marked demo observations. The recommendation cards use the typed `RecommendationViewModel` boundary and label every reason, confidence value, and Cost of Waiting statement as fixture preview content.

Depth remains deliberate: **All Players** opens a searchable/filterable Master Player Board; player taps open a detail sheet with disabled future-intelligence categories; and **Draft Board** uses `projectDraftBoard`, including RoboCop keeper rounds. Recent picks offer controlled historical correction through the existing `editPick` operation. Draft, Undo, Pause, and Resume call only existing deterministic engine operations.

Conversation uses a standard textarea for iPad dictation. Messages remain in the local session. When the authenticated server function passes its OpenAI health check, prompts receive server-side reasoning constrained by the deterministic recommendation and available-player context; otherwise the UI gives an explicit unconfigured/unavailable response.

## Validation

```bash
npm run lint
npm test
npm run build
```

The production build is tracked in `draft-assistant/`. Any change under
`apps/fantasy-draft-assistant/` that affects runtime behavior must rebuild and
commit that output. After committing the generated files, run
`npm run check:deployment`; it performs a clean production rebuild and fails if
the tracked deployment artifact differs from the current source.

Tests cover seeds, keepers, snake parity, readiness, ownership, availability, undo, edit, pause/resume, reconstruction, IndexedDB reload, a complete 204-pick Believeland simulation, and keeper-aware RoboCop selections.

## Deferred

Automated ranking/player/news providers, advanced reconciliation, takeover, and ESPN synchronization remain intentionally absent. Manual current-player/ranking import and the optional authenticated server-side AI endpoint are the only production activation paths in this milestone.

## Production Supabase authentication

The dedicated backend is the **Fantasy Draft Assistant** Supabase project `ffcjcepugnyhfkfezdlw` at `https://ffcjcepugnyhfkfezdlw.supabase.co`. Production hosting must set `VITE_DRAFT_SUPABASE_URL` and `VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY`; the publishable key belongs in deployment environment configuration and is intentionally not committed. Never substitute OliPoly ERP variables or any `service_role`, `sb_secret_*`, database, or OpenAI secret.

The app restores Supabase's persisted browser session, reads the user's own `draft_allowed_users` row under RLS, and admits only an authorized result. Other authenticated accounts see **Access not authorized**. Sign Out clears only Auth state and preserves IndexedDB. Auth and the allowlist smoke test are real; IndexedDB-to-cloud synchronization remains deferred to Phase 5.

Magic links redirect at runtime to `new URL(BASE_URL, window.location.origin)`, supporting the current `/draft-assistant/` route and future `https://draft.olipoly3d.com`. Configure outside Git:

- Current route deployment: exact HTTPS Site URL and exact `/draft-assistant/` redirect URL.
- Future Site URL: `https://draft.olipoly3d.com`
- Future redirect: `https://draft.olipoly3d.com/**`

The future subdomain requires external DNS and static-host routing; this repository does not change DNS.

## Authoritative Believeland 2026

Believeland is a private 12-team League Manager, Head-to-Head Points, Point Per Reception league with custom scoring. Its draft is Offline, snake, unscheduled, has no supplied timer, and has no keepers in 2026 or 2027. Lineup protection and auto-reactivation are off; the NFL player universe and ESPN undroppable list apply.

The roster is 16: 10 starters (QB 1, RB 2, WR 2, TE 1, RB/WR/TE FLEX 2, D/ST 1, K 1) plus Bench 6. IR 2 is separate. Maxima are QB 4, RB 8, WR 8, TE 3, D/ST 3, and K 3; DT, DE, LB, CB, S, P, and HC are zero.

Detailed rules are typed in `src/domain/scoring.ts` and persisted by `202608130004_believeland_scoring_and_auth_support.sql`. No 100–199 receiving bonus or rushing game-yardage bonus was supplied, so none exists. D/ST 18–21 and 22–27 points-allowed bands are `points: null, unresolved: true`; source confirmation is required. Overlapping ESPN return-TD categories must be de-duplicated by a future scoring engine.

## Runtime deployment configuration

The committed static site loads `/draft-assistant/config.js` before its module bundle. For a deployed build, edit `draft-assistant/config.js` (or its build source `apps/fantasy-draft-assistant/public/config.js`) using only this browser-readable shape:

```js
window.__DRAFT_ASSISTANT_CONFIG__ = Object.freeze({
  supabaseUrl: "https://ffcjcepugnyhfkfezdlw.supabase.co",
  supabasePublishableKey: "PASTE_THE_PUBLISHABLE_KEY_HERE"
});
```

The publishable key is designed for browser use with RLS; it is not a server secret. Never add `service_role`, `sb_secret_*`, database passwords, OpenAI keys, or any other server-side credential. Production prefers this runtime object and fails closed when it is absent, empty, or partial—even if stale `VITE_DRAFT_*` values were present at build time. Local development and tests continue to support `VITE_DRAFT_SUPABASE_URL` and `VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY`; unconfigured local builds retain explicit local-only mode.
# Deterministic draft intelligence

The live room uses the local, pure `src/intelligence/recommendation-engine.ts` service. It combines league-specific roster construction, legality, keeper state, positional supply, tier pressure, intervening-manager needs, actual next-owned-pick timing, Cost of Waiting, and bounded personal context. Recommendations are recalculated from authoritative draft history after every pick and are never authoritative stored state.

When no imported snapshot exists, the player-value boundary remains static fixture data (`baselineRank`, `baselineValue`, and `fixtureTier`) and is honestly shown as **BASELINE FIXTURE RANKING**. A confirmed CSV/JSON import now atomically replaces that pool; imported and synthetic players are never combined.

## Current player data (Phase 6)

Current rankings and player metadata enter the deterministic engine through normalized, versioned local snapshots. Open **LOAD CURRENT PLAYER DATA**, choose a CSV/JSON file, preview existing identity matches and new players, then confirm activation. Required columns are `player_name`, `team`, `position`, and `overall_rank`; optional columns are `position_rank`, `tier`, `adp`, `source`, and `updated_at`. The confirmed snapshot is cached in IndexedDB and becomes the entire active player pool. No automatic ranking, metadata, or news provider is currently populated.

### Draft Assistant AI deployment

The browser calls the authenticated Supabase Edge Function `draft-assistant-ai`. The UI reports **AI READY** only after that function validates its configured OpenAI model. Deploy it to the dedicated Fantasy Draft Assistant project and set server-side secrets (never browser/Vite configuration):

```sh
supabase secrets set --project-ref ffcjcepugnyhfkfezdlw OPENAI_API_KEY='<user-provided key>' OPENAI_MODEL='gpt-5-mini'
supabase functions deploy --project-ref ffcjcepugnyhfkfezdlw draft-assistant-ai
```

`OPENAI_API_KEY` is required. `OPENAI_MODEL` is optional and defaults server-side to `gpt-5-mini`. Supabase JWT verification must remain enabled; the existing allowlisted authenticated session supplies the function authorization token. Until deployment and secret configuration are both complete, production truthfully reports **AI UNAVAILABLE** or **AI UNCONFIGURED**.
