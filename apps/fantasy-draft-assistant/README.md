# Private Fantasy Draft Assistant — Phases 1–3

This isolated Vite/TypeScript application lives under `apps/fantasy-draft-assistant`; production output is the unadvertised `/draft-assistant/` route. No OliPoly public header, footer, sitemap, customer menu, ERP module, or production Supabase migration references it.

## Security and local setup

Create a **separate Supabase project**. Never use OliPoly ERP credentials or run these migrations against its database.

```bash
cd apps/fantasy-draft-assistant
cp .env.example .env.local
npm install
npm run dev
```

Set `VITE_DRAFT_SUPABASE_URL`, `VITE_DRAFT_SUPABASE_ANON_KEY`, and `VITE_DRAFT_ALLOWED_EMAIL`. Only the publishable anon key belongs in browser variables. With no Draft Supabase variables, the app shows an explicit orange **LOCAL DEVELOPMENT MODE** banner. Configured deployments require a magic-link session; RLS also requires the user in `draft_allowed_users`.

Apply to a fresh Draft Assistant project, in order:

1. `supabase/fantasy-draft-assistant/migrations/202608130001_foundation.sql`
2. `supabase/fantasy-draft-assistant/migrations/202608130002_league_setup.sql`
3. `supabase/fantasy-draft-assistant/migrations/202608130003_draft_events.sql`

After creating the private Auth user, insert its UUID into `draft_allowed_users` through the Draft project SQL editor. Anonymous roles have no policies. Policies are authenticated-only, allowlist-gated, and scoped through the owning League/Season.

## Architecture

`League` and `Season` are distinct. `SeasonSetup` contains reusable managers, season teams, flexible roster definitions, hard position limits, stable original draft slots, per-round current ownership, keepers, and reversible lock audit history. Seeds initialize only missing setup. IndexedDB schema v3 additively persists setups, sessions, append-only events, and discardable snapshots behind `DraftStore`.

**Draft events are authoritative; derived state and snapshots are rebuildable.** `createDraftPlan` uses actual round parity: odd rounds 1→12 and even rounds 12→1. RoboCop Rounds 1–3 project keeper setup records, not live events, so Round 4 starts at slot 12. Blank keeper cells remain blank; an incomplete start requires explicit administrative override.

Events use a session-local monotonically increasing sequence, not wall-clock ordering. Phase 5 can synchronize revisions and detect competing writes with unique `(session_id, sequence)`. `PICK_UNDONE` reverses without deletion. `PICK_EDITED` supersedes an older selection while keeping later picks and current position. Pause blocks picks and resume preserves position. Completion is derived from active live fills.

Temporary players have stable IDs, normalized names, positions, and nullable canonical IDs. Phase 6 can replace the fixture provider without changing the engine. Hard limits apply to combined keeper/live counts; FLEX and bench do not invent extra maxima. RoboCop IDP Utility provisionally accepts DL/LB/DB and requires confirmation before future valuation.

## Validation

```bash
npm run lint
npm test
npm run build
```

Tests cover seeds, keepers, snake parity, readiness, ownership, availability, undo, edit, pause/resume, reconstruction, IndexedDB reload, a complete 204-pick Believeland simulation, and keeper-aware RoboCop selections.

## Deferred

Phase 4+ is absent: final live-room UX, AI/OpenAI, rankings, feeds, ADP, projections, tiers, scarcity, return probability, news, queue, flags, intel, IDP valuation, advanced reconciliation, takeover, and ESPN synchronization.
