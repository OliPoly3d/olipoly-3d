-- Deploy manually before activating FantasyPros CSV imports. This widens the
-- existing private, league/season-scoped ranking authority without touching snapshots.
alter table public.draft_espn_ranking_sources drop constraint if exists draft_espn_ranking_sources_source_type_check;
alter table public.draft_espn_ranking_sources add constraint draft_espn_ranking_sources_source_type_check
  check(source_type in ('ESPN','FANTASYPROS_ALL','FANTASYPROS_IDP'));
alter table public.draft_espn_ranking_sources drop constraint if exists draft_espn_ranking_sources_scoring_format_check;
alter table public.draft_espn_ranking_sources add constraint draft_espn_ranking_sources_scoring_format_check
  check(scoring_format in ('STANDARD','HALF_PPR','PPR'));

comment on table public.draft_espn_ranking_sources is
  'Private canonical ranking JSON authorities, independently keyed by league, season, and source type.';
