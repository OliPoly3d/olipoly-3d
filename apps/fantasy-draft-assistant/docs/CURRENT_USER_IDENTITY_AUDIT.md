# Current-user identity audit

## Root cause

`userTeamId()` read `settings.metadata.userManagerId`, but silently fell back to
`managers[0]` and then `teams[0]`. Older IndexedDB setup snapshots predated the
metadata field, so hydration kept those snapshots instead of the corrected seed.
That selected Brandon Whipkey in Believeland and Corey Huffman in RoboCop. The
RoboCop manager array is franchise ordering, not draft ordering, which made the
first-team fallback look like pick ownership even though Corey actually has base
slot 6. The roster viewer was already stored per league (`roster-team-${slug}`),
but it accepted stale or cross-league IDs without validation.

There is no Supabase/auth-to-manager mapping and no global persisted team ID.
Supabase is used for shared player/ranking data; IndexedDB stores league setup and
draft state. Draft session and roster-view localStorage keys are league-specific.

## Consumer trace

The Draft Room, league dashboard, next-owned-pick countdown, on-clock/next alerts,
roster `(You)` label, recommendation engine, positional needs, Draft Fit, Best Pick,
cost-of-waiting analysis, assistant draft-slot context, and ranking workspace all
receive the result of the same `userTeamId(setup)` call. Pick ownership and traded
picks are resolved independently by the draft plan. The queue is a player-interest
surface and has no separate manager identity.

## Correction

The application now has explicit season-scoped stable manager/team assignments.
RoboCop 2026 maps `manager-robocop-6` to `team-robocop-6` (Drake’s Chuba), whose
unchanged base-order entry is slot 8. Believeland 2026 maps its existing Rob
franchise (`manager-believeland-8` / `team-believeland-8`) without touching draft
order. Hydration repairs only stale identity metadata, preserving all teams, slots,
ownership, and history. Invalid cross-league roster-view values fall back safely to
the current league’s assigned team; valid user-selected opponent views remain.
