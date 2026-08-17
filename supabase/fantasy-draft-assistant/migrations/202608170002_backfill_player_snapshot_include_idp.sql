-- Existing shared snapshots predate the additive IDP compatibility dimension.
-- They were offense-only, so preserve them as compatible with non-IDP leagues.
alter table public.draft_player_data_snapshots
  add column if not exists include_idp boolean;

update public.draft_player_data_snapshots
set include_idp = false
where include_idp is null;

alter table public.draft_player_data_snapshots
  alter column include_idp set default false,
  alter column include_idp set not null;

-- Supports the browser's exact latest-compatible-snapshot lookup.
create index if not exists draft_player_snapshot_compatibility_latest_idx
  on public.draft_player_data_snapshots
  (season, scoring_format, include_idp, activated_at desc);
