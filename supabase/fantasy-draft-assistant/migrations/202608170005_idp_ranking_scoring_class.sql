-- FantasyPros IDP rankings are independent of offensive reception scoring.
-- Keep the existing column and admit the explicit IDP ranking class rather than
-- falsely storing STANDARD, HALF_PPR, or PPR for an IDP source.
alter table public.draft_espn_ranking_sources
  drop constraint if exists draft_espn_ranking_sources_scoring_format_check;

alter table public.draft_espn_ranking_sources
  add constraint draft_espn_ranking_sources_scoring_format_check
  check(scoring_format in ('STANDARD','HALF_PPR','PPR','IDP'));
