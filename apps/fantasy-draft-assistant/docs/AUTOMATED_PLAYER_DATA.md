# Automated NFL player data

## Provider architecture

FantasyPros Public API v2 is the primary provider. The server-only `draft-player-data-refresh` Edge Function reads `FANTASYPROS_API_KEY` and calls these official endpoints under `https://api.fantasypros.com/public/v2/json`:

- `GET /nfl/players`
- `GET /nfl/2026/consensus-rankings?scoring=PPR&position=FLX` (PPR offense; `HALF` and `STD` are used for Half-PPR and Standard)
- the same rankings endpoint with `position=ALL&include_idp=true` for an IDP league
- `GET /nfl/news`
- `GET /nfl/injuries`

The key is sent only in the `x-api-key` request header. It is never accepted from, returned to, or bundled for the browser. Provider calls use the documented JSON API; there is no webpage scraping.

The adapter converts provider responses into Phase 6 `PlayerIntelligence` and `PlayerDataSnapshot` records before the app or deterministic recommendation engine sees them. FantasyPros stable player IDs anchor canonical IDs. Normalized name/team/position matching is used only to attach Sleeper metadata when an explicit FantasyPros cross-reference is unavailable and the complete identity agrees.

Sleeper's official `GET https://api.sleeper.app/v1/players/nfl` endpoint supplies secondary identity, team, active, and injury signals. It never replaces FantasyPros ECR, ADP, news, or an existing FantasyPros injury. A Sleeper failure yields an honest `PARTIAL` snapshot; a FantasyPros failure rejects the whole refresh and preserves the previous local snapshot.

## Ranking and context rules

- FantasyPros PPR ECR is baseline market value for Believeland. The deterministic engine continues to model Believeland's custom scoring, roster construction, and scarcity; the source label does not imply ECR models every custom bonus.
- ECR, position rank, tier, ADP, rank spread, and standard deviation are retained when supplied.
- IDP positions map to normalized DL/LB/DB families. IDP ranking values are typed as `IDP`, retained separately from offensive ECR, and marked with a limitation because a generic IDP list may not reproduce RoboCop's exact scoring or position structure.
- FantasyPros news retains only a bounded headline, concise summary, source/reference, timestamps, category, source class, confidence, and materiality. Full article bodies and player image URLs are not ingested.
- Injury records retain designation, practice status, body area/description, source time, and fetch time. Expected return dates are never inferred.
- News is not converted into strong role claims with keywords. Facts remain available to the existing AI packet; structured role interpretation stays absent unless a future reliable rule/source is approved.
- Material-change records require an OUT/IR/suspended transition, team change, or ECR movement of at least 12 places. Minor movement creates no notification record.

FantasyPros attribution appears in the compact data inspector as `FANTASYPROS`, `FANTASYPROS ECR`, and `FantasyPros API`. Deployment owners must confirm their API plan's current display, retention, and redistribution terms. FantasyPros/Sportradar player images are deliberately excluded.

## Runtime, cache, and fallback

Startup remains local-first: IndexedDB supplies the last good snapshot immediately. An authenticated **REFRESH PLAYER DATA** action invokes the Edge Function and atomically activates the returned normalized snapshot only after validation. A failed request leaves the prior real snapshot untouched. Manual CSV/JSON import remains available.

Authority order is automated current snapshot, cached real snapshot, manual real import, then fixture fallback. `selectPlayerPool` selects one complete authority, so Test Players are never mixed into a real snapshot. The deterministic recommendation engine remains provider-agnostic and deterministic.

Automatic cross-device startup reads the newest shared snapshot matching season, offensive scoring format, and IDP mode. The Edge Function inserts each validated snapshot with its compatibility metadata using the server-only service role; failed refreshes do not alter prior rows.

## Required secrets and deployment

Set Edge Function secrets (never Vite/client variables):

- `FANTASYPROS_API_KEY` — required provider credential.
- `DRAFT_PLAYER_REFRESH_TOKEN` — high-entropy token for a scheduled server invocation.
- Supabase-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY` — used to authenticate manual callers and enforce `draft_allowed_users`.

Recommended cadence after storage approval is players daily, rankings every three hours, and news/injuries hourly. The current combined function fetches all datasets in one request; schedule it no more than hourly initially, then split dataset cadence only if provider plan limits and operational need support it.

## Shared snapshot storage

One shared/global table is the smallest durable design. It is not user-owned and is keyed by season, provider, scoring configuration, and IDP mode.

Table: `public.draft_player_data_snapshots`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Immutable row identity |
| `season` | `integer not null` | NFL season |
| `provider` | `text not null` | `fantasypros` |
| `scoring_format` | `text not null` | PPR/other approved baseline |
| `include_idp` | `boolean not null default false` | Separates offensive and IDP configurations |
| `snapshot_id` | `text not null unique` | Normalized deterministic snapshot identity |
| `snapshot` | `jsonb not null` | Validated normalized snapshot, never raw provider payload |
| `quality` | `text not null` | COMPLETE/PARTIAL/STALE |
| `fetched_at` | `timestamptz not null` | Coherent fetch time |
| `activated_at` | `timestamptz not null default now()` | Activation time |
| `created_by` | `uuid null references auth.users(id)` | Manual audit; null for scheduler |

Constraints/indexes: quality/scoring allow-list checks; unique `(season, provider, scoring_format, include_idp, snapshot_id)`; descending lookup index on `(season, provider, scoring_format, include_idp, activated_at)`.

Security:

1. Enable and force RLS.
2. Grant `SELECT` only to `authenticated`.
3. A select policy permits rows only when `auth.uid()` exists in `draft_allowed_users`.
4. Grant no browser `INSERT`, `UPDATE`, or `DELETE`; the Edge Function writes with its server-only service role after full validation.
5. Keep immutable history and read the newest activated row. A failed transaction inserts/activates nothing, preserving the prior good row.

Migration `202608170001_player_snapshot_compatibility.sql` creates or upgrades the table and its read policy. After that reviewed migration is applied, the Edge Function inserts each validated snapshot in one statement and the browser queries the newest row for its exact season, offensive scoring format, and IDP mode. The app loads local data first, asynchronously compares timestamps, caches a newer compatible server snapshot, and recomputes recommendations.

## Proposed Cron setup (not applied)

After table approval, create a Dashboard-managed hourly job for the Edge Function. Store the scheduler token in Supabase Vault / the supported Dashboard secret facility and send it as `x-refresh-token`; do not put the token, service-role key, or provider key in SQL or the job URL. The function reads `FANTASYPROS_API_KEY` only from its environment. Review FantasyPros plan limits before enabling or increasing cadence.

Manual deployment actions after approval will be: apply the reviewed migration; set the two Edge secrets; deploy `draft-player-data-refresh`; invoke once and inspect its summary; configure the hourly Dashboard Cron; verify an authenticated allowed user receives the shared snapshot; and verify an unauthorized user cannot read or refresh it.
