import { describe, expect, it } from 'vitest';
import { createDraftPlan, editPick, makePick, rebuildDraftState, startDraft, undoLastPick } from './engine';
import type { DraftPlayer, SeasonSetup } from './models';
import { seedSetup } from './seeds';
import { runRecommendationEngine } from '../intelligence/recommendation-engine';
import { emptyPhilosophy, userContext } from './user-context';

const positions = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
const players: DraftPlayer[] = Array.from({ length: 504 }, (_, index) => ({
  id: `current:nfl:fixture-${index + 1}`,
  canonicalPlayerId: `nfl:fixture-${index + 1}`,
  displayName: `Current Fixture Prospect ${index + 1}`,
  normalizedName: `current fixture prospect ${index + 1}`,
  position: positions[index % positions.length],
  nflTeam: 'FA',
  currentBaselineRank: index + 1,
  currentTier: Math.floor(index / 12) + 1,
}));

function setup(): SeasonSetup {
  const base = seedSetup('believeland');
  const draftSlots = [...base.draftSlots].reverse().map((item, index) => ({ ...item, slot: index + 1 }));
  return {
    ...base,
    draft: { ...base.draft, rounds: 15, liveStartRound: 1, keeperCount: 0 },
    draftSlots,
    ownership: [
      { seasonId: base.season.id, round: 2, slot: 11, originalTeamId: draftSlots[10].originalTeamId, currentTeamId: draftSlots[11].originalTeamId },
      { seasonId: base.season.id, round: 2, slot: 12, originalTeamId: draftSlots[11].originalTeamId, currentTeamId: draftSlots[11].originalTeamId },
    ],
    positionLimits: base.positionLimits.map(limit => ({ ...limit, maximum: null })),
  };
}

describe('12-team, 15-round draft-night torture pass', () => {
  it('preserves every chronological snake slot, ownership, availability, recommendation, and final state', () => {
    const league = setup();
    const plan = createDraftPlan(league);
    expect(plan).toHaveLength(180);
    for (let index = 0; index < plan.length; index++) {
      const pick = plan[index];
      expect(pick).toMatchObject({ round: Math.floor(index / 12) + 1, pickInRound: index % 12 + 1, overallPick: index + 1, sequence: index + 1 });
      expect(pick.slot).toBe(pick.round % 2 === 0 ? 12 - pick.pickInRound + 1 : pick.pickInRound);
      expect(pick.currentTeamId).toBe(league.ownership.find(item => item.round === pick.round && item.slot === pick.slot)?.currentTeamId ?? pick.originalTeamId);
      if ((index + 1) % 12 === 0 && index < 179) expect(plan[index + 1]).toMatchObject({ round: pick.round + 1, pickInRound: 1, overallPick: pick.overallPick + 1 });
    }
    // The ownership overrides produce consecutive picks without changing slot identity.
    expect(plan[12].currentTeamId).toBe(plan[13].currentTeamId);

    let context = startDraft(league, players);
    const recommendationTimes: Record<number, number> = {};
    const checkpoints = new Map<number, string>();
    for (let index = 0; index < 180; index++) {
      const before = rebuildDraftState(context);
      expect(before.available).toHaveLength(504 - index);
      expect(before.current?.overallPick).toBe(index + 1);
      const started = performance.now();
      const intelligence = runRecommendationEngine({ setup: league, context, state: before, userTeamId: league.teams[0].id, userContext: userContext(emptyPhilosophy(league.league.id, league.season.id), [], [], []) });
      if ([0, 89, 179].includes(index)) recommendationTimes[index + 1] = performance.now() - started;
      expect(intelligence.recommendations.every(item => before.available.some(player => player.id === item.playerId))).toBe(true);
      context = makePick(context, players[index].id, `action-${index + 1}`);
      const after = rebuildDraftState(context);
      expect(after.available).toHaveLength(503 - index);
      expect(after.activePicks.filter(item => item.player.id === players[index].id)).toHaveLength(1);
      if ([1, 12, 13, 75, 179, 180].includes(index + 1)) checkpoints.set(index + 1, JSON.stringify(context.events));
    }
    const state = rebuildDraftState(context);
    expect(state.status).toBe('COMPLETED');
    expect(state.current).toBeNull();
    expect(state.remaining).toBe(0);
    expect(state.activePicks).toHaveLength(180);
    expect(new Set(state.activePicks.map(item => item.player.canonicalPlayerId))).toHaveProperty('size', 180);
    expect(Object.values(state.rosters).flatMap(roster => roster.live)).toHaveLength(180);
    expect(context.events.filter(event => event.type === 'DRAFT_COMPLETED')).toHaveLength(1);
    expect(checkpoints.size).toBe(6);
    expect(Math.max(...Object.values(recommendationTimes))).toBeLessThan(250);
  });

  it('is idempotent for duplicate actions and deterministically repairs undo/edit around a turn', () => {
    let context = startDraft(setup(), players);
    context = makePick(context, players[0].id, 'double-tap');
    const duplicate = makePick(context, players[0].id, 'double-tap');
    expect(duplicate.events).toHaveLength(context.events.length);
    for (let index = 1; index < 13; index++) context = makePick(context, players[index].id, `pick-${index}`);
    expect(rebuildDraftState(context).current).toMatchObject({ round: 2, pickInRound: 2, overallPick: 14 });
    context = undoLastPick(context);
    expect(rebuildDraftState(context).current).toMatchObject({ round: 2, pickInRound: 1, overallPick: 13 });
    expect(rebuildDraftState(context).available.some(player => player.id === players[12].id)).toBe(true);
    const replacement = players[100];
    context = makePick(context, players[12].id, 'replacement-turn');
    const eventId = rebuildDraftState(context).activePicks.at(-1)!.eventId;
    context = editPick(context, eventId, replacement.id);
    const repaired = rebuildDraftState(context);
    expect(repaired.available.some(player => player.id === players[12].id)).toBe(true);
    expect(repaired.available.some(player => player.id === replacement.id)).toBe(false);
    expect(repaired.activePicks.at(-1)?.player.id).toBe(replacement.id);
  });
});
