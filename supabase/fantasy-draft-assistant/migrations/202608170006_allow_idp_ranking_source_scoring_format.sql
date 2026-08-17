-- FantasyPros IDP ranks are a defensive authority, not an offensive scoring format.
-- Replacing this check preserves every existing row while allowing that authority
-- to retain its explicit IDP classification during shared persistence.
alter table public.draft_espn_ranking_sources
  drop constraint if exists draft_espn_ranking_sources_scoring_format_check;

alter table public.draft_espn_ranking_sources
  add constraint draft_espn_ranking_sources_scoring_format_check
  check (scoring_format in ('STANDARD', 'HALF_PPR', 'PPR', 'IDP'));
