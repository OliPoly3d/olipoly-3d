-- Shared FantasyPros snapshots are immutable and coexist by offensive scoring and IDP mode.
create table if not exists public.draft_player_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  provider text not null,
  scoring_format text not null,
  include_idp boolean not null default false,
  snapshot_id text not null unique,
  snapshot jsonb not null,
  quality text not null,
  fetched_at timestamptz not null,
  activated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id)
);

alter table public.draft_player_data_snapshots
  add column if not exists include_idp boolean not null default false;

create index if not exists draft_player_snapshot_compatibility_latest_idx
  on public.draft_player_data_snapshots (season, scoring_format, include_idp, activated_at desc);

alter table public.draft_player_data_snapshots enable row level security;
alter table public.draft_player_data_snapshots force row level security;

grant select on public.draft_player_data_snapshots to authenticated;
revoke insert, update, delete on public.draft_player_data_snapshots from anon, authenticated;

drop policy if exists "allowed users read draft player snapshots" on public.draft_player_data_snapshots;
create policy "allowed users read draft player snapshots"
on public.draft_player_data_snapshots for select
to authenticated
using (exists (select 1 from public.draft_allowed_users where user_id = auth.uid()));
