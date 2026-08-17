-- Align the historically deployed snapshot table with both legacy and current writers.
-- Additive/backfill-only: existing snapshots are retained.
alter table public.draft_player_data_snapshots
  add column if not exists provider text,
  add column if not exists include_idp boolean,
  add column if not exists snapshot_id text,
  add column if not exists fetched_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists mode text,
  add column if not exists player_source text,
  add column if not exists ranking_source text,
  add column if not exists news_status text,
  add column if not exists freshness text,
  add column if not exists inserted_at timestamptz;

-- Production history has used both text and uuid primary keys. Give either
-- contract a server-generated value so the current writer does not guess its type.
do $$ begin
  if (select data_type='uuid' from information_schema.columns where table_schema='public' and table_name='draft_player_data_snapshots' and column_name='id') then
    alter table public.draft_player_data_snapshots alter column id set default gen_random_uuid();
  else
    alter table public.draft_player_data_snapshots alter column id set default md5(random()::text || clock_timestamp()::text);
  end if;
end $$;

update public.draft_player_data_snapshots set
  provider=coalesce(provider,'fantasypros'),
  include_idp=coalesce(include_idp,false),
  snapshot_id=coalesce(snapshot_id,id::text),
  created_at=coalesce(created_at,inserted_at,fetched_at,now()),
  fetched_at=coalesce(fetched_at,created_at,inserted_at,now()),
  activated_at=coalesce(activated_at,fetched_at,created_at,inserted_at,now()),
  inserted_at=coalesce(inserted_at,created_at,fetched_at,now()),
  mode=coalesce(mode,'CURRENT'),
  player_source=coalesce(player_source,'FantasyPros API'),
  ranking_source=coalesce(ranking_source,'FantasyPros ECR'),
  news_status=coalesce(news_status,'NOT PROVIDED'),
  freshness=coalesce(freshness,'UNKNOWN');

alter table public.draft_player_data_snapshots
  alter column provider set default 'fantasypros', alter column provider set not null,
  alter column include_idp set default false, alter column include_idp set not null,
  alter column snapshot_id set not null,
  alter column created_at set default now(), alter column created_at set not null,
  alter column fetched_at set default now(), alter column fetched_at set not null,
  alter column activated_at set default now(), alter column activated_at set not null,
  alter column inserted_at set default now(), alter column inserted_at set not null,
  alter column mode set default 'CURRENT', alter column mode set not null,
  alter column player_source set default 'FantasyPros API', alter column player_source set not null,
  alter column ranking_source set default 'FantasyPros ECR', alter column ranking_source set not null,
  alter column news_status set default 'NOT PROVIDED', alter column news_status set not null,
  alter column freshness set default 'UNKNOWN', alter column freshness set not null;

create unique index if not exists draft_player_snapshot_id_uidx on public.draft_player_data_snapshots(snapshot_id);
create index if not exists draft_player_snapshot_compatibility_latest_idx on public.draft_player_data_snapshots(season,scoring_format,include_idp,activated_at desc);

-- Canonical ESPN source authority. The PDF is deliberately not stored.
create table if not exists public.draft_espn_ranking_sources(
  league_id text not null,
  season integer not null check(season between 2000 and 2200),
  source_type text not null check(source_type='ESPN'),
  source_id text not null,
  scoring_format text not null check(scoring_format='PPR'),
  imported_at timestamptz not null,
  source_label text not null,
  document_label text not null,
  ranking_source jsonb not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(league_id,season,source_type)
);
create index if not exists draft_espn_ranking_source_latest_idx on public.draft_espn_ranking_sources(league_id,season,imported_at desc);
alter table public.draft_espn_ranking_sources enable row level security;
alter table public.draft_espn_ranking_sources force row level security;
revoke all on public.draft_espn_ranking_sources from public,anon;
grant select,insert,update,delete on public.draft_espn_ranking_sources to authenticated;
drop policy if exists "allowlisted users manage private ESPN sources" on public.draft_espn_ranking_sources;
create policy "allowlisted users manage private ESPN sources" on public.draft_espn_ranking_sources for all to authenticated
using(created_by=auth.uid() and exists(select 1 from public.draft_allowed_users where user_id=auth.uid()))
with check(created_by=auth.uid() and exists(select 1 from public.draft_allowed_users where user_id=auth.uid()));
