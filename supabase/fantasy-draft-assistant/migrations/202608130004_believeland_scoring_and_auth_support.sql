-- Apply only to the separate Fantasy Draft Assistant Supabase project.
create table public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  category text not null check (category in ('passing','rushing','receiving','kicking','defense','miscellaneous')),
  rule_key text not null,
  label text not null,
  points numeric,
  increment_value numeric,
  minimum_value numeric,
  maximum_value numeric,
  unresolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (season_id, category, rule_key),
  check (not unresolved or points is null)
);
create index scoring_rules_season_id_idx on public.scoring_rules(season_id);
alter table public.scoring_rules enable row level security;
create policy "private owner scoring_rules" on public.scoring_rules
for all to authenticated
using (exists (
  select 1 from public.seasons s
  join public.leagues l on l.id=s.league_id
  join public.draft_allowed_users a on a.user_id=(select auth.uid())
  where s.id=scoring_rules.season_id and l.owner_id=(select auth.uid())
))
with check (exists (
  select 1 from public.seasons s
  join public.leagues l on l.id=s.league_id
  join public.draft_allowed_users a on a.user_id=(select auth.uid())
  where s.id=scoring_rules.season_id and l.owner_id=(select auth.uid())
));
