# FantasyPros ranking-field authority audit

## Provider evidence

Successful `position=QB`, `RB`, `WR`, and `TE` rows contain `player_id`,
`rank_ecr`, `pos_rank`, `tier`, `rank_min`, `rank_max`, `rank_ave`, `rank_std`,
and `adp`. Production results show that `rank_ecr` resets to 1 in every
position response. It is therefore a position-relative expert consensus rank,
not a cross-position overall ECR. `pos_rank` is the explicit position rank
label (for example `QB4`). `rank_ave` is the experts' average rank within that
position pool; `rank_min`, `rank_max`, and `rank_std` describe that expert
distribution. `adp` is provider ADP and `tier` is provider tier.

The position calls expose no field proven comparable across QB, RB, WR, and TE.
`position=FLX` returned HTTP 200 with an empty `players` array for both configured
leagues, so it is not a usable overall authority. The repository also contains
no historical 513-player raw provider payload from which another current field
can be proven. The original normalizer (commit `00f0c32`) accepted `rank_ecr`,
`ecr`, `overall_rank`, or `rank`; field names alone do not prove their semantics.

## Current authority policy

Position responses supply `positionRank`, tier, ADP, and the expert distribution
fields. They never populate `baselineRank` or `overallRank` from `rank_ecr`, an
array index, pool concatenation, or a generic `rank` field. IDP `rank_ecr`
remains on the separate `idp.rank` scale.

When a prior activated snapshot has collision-free overall ranks, those ranks
remain the global authority while a refresh updates supplemental position data.
A prior snapshot whose ranks reset/collide is rejected as an overall authority.
Without a valid prior global snapshot, FantasyPros overall ECR and Draft Fit
delta are unavailable and render as `—`; positional metadata remains available.

Required QB/RB/WR/TE pools must still be non-empty, IDP remains required for an
IDP refresh, and K/DST remain supplemental. Refresh persistence remains atomic.

## Deployment

The browser normalizer and the self-contained Supabase Edge Function implement
the same policy. Deploy the static site for the Rankings rendering and ESPN
activation correction. Redeploy `draft-player-data-refresh` before the next
FantasyPros refresh. No database migration is required.
