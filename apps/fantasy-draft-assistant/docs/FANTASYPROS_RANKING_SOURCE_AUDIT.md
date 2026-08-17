# FantasyPros real-position ranking-source audit

## Proven from repository fixtures and provider diagnostics

The representative successful ranking fixtures use a root-level `players` or `rankings` array. The list parser also supports `data.players` and `data.rankings`. Each fixture row for QB, RB, WR, and TE contains `player_id`, `rank_ecr`, `pos_rank`, `tier`, `rank_min`, `rank_max`, `rank_ave`, `rank_std`, `adp`, and `updated_at`. `rank_ecr` is the provider-supplied comparable offensive ECR in these fixtures; `pos_rank` is the separate position label (for example, `QB4`); `tier` and `adp` retain their provider values. No fixture exposes a separate ranking-type field, so the integration supplies `rankingClass` from the requested offense/IDP pool rather than claiming it came from FantasyPros.

The production evidence supplied for this milestone proves that `position=FLX` returned HTTP 200 with an empty root-level `players` array for both configured leagues. FLX is therefore not a usable authority for these refreshes and is no longer requested. This does not assert that FantasyPros can never return FLX data for another product, season, or account.

The original normalizer (commit `00f0c32`) populated `baselineRank` from the first positive value among `rank_ecr`, `ecr`, `overall_rank`, and `rank`. The repository does not contain the historical 513-player provider payload or persisted snapshot, so it cannot prove which alias was present in that particular response. Current representative fixtures prove `rank_ecr`; the corrected normalizer deliberately accepts only that proven ECR field and never uses array position.

## Policy and inference

QB, RB, WR, and TE are required because they form the core offensive draft universe and every successful representative fixture supplies `rank_ecr`. K and DST are supplemental because provider responses may legitimately be empty. IDP is required only when `includeIdp` is true. Its `rank_ecr` is retained as `idp.rank` and marked `rankingClass: IDP`; it is not copied to offensive `baselineRank`.

Rows merge deterministically by FantasyPros `player_id`. Offensive `rank_ecr` supplies `overallRank`/`baselineRank`. `pos_rank`, tier, and ADP come from the player's matching position pool. Range and average fields preserve `rank_min`, `rank_max`, `rank_ave`, and `rank_std`. First provider-supplied values win, so a duplicate position-list row cannot overwrite an established overall ECR.

A refresh is atomic: all four required offensive pools must be non-empty and contain at least one valid `rank_ecr`; IDP must be non-empty when requested. K/DST may be empty. The Edge Function returns per-pool request diagnostics and summary coverage counts for `overallEcr`, `positionRankOnly`, `missingComparableEcr`, and `idp`. Persistence is attempted only after normalization succeeds.

## Dashboard deployment

`supabase/fantasy-draft-assistant/functions/draft-player-data-refresh/index.ts` is the complete self-contained Dashboard source and has no repository-relative imports. In Supabase Dashboard, open **Edge Functions**, select `draft-player-data-refresh`, replace its source with the complete file, configure `FANTASYPROS_API_KEY`, `DRAFT_PLAYER_REFRESH_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, deploy, then invoke a PPR Believeland refresh and a HALF_PPR + IDP RoboCop refresh. Confirm the returned per-position diagnostics, rank coverage, and `persisted: true` before relying on the new snapshot.
