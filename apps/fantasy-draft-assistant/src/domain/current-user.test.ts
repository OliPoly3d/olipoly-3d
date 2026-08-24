import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DraftStore } from '../data/store';
import { runRecommendationEngine } from '../intelligence/recommendation-engine';
import { createDraftPlan, rebuildDraftState, startDraft } from './engine';
import { currentUserTeamId, reconcileCurrentUserIdentity, validRosterViewTeamId } from './current-user';
import { emptyPhilosophy, userContext } from './user-context';
import { playerPool, seedSetup } from './seeds';

const managerName = (setup: ReturnType<typeof seedSetup>, teamId: string) => {
  const managerId = setup.teams.find(team => team.id === teamId)?.managerId;
  return setup.managers.find(manager => manager.id === managerId)?.displayName;
};

describe('league-specific current-user identity', () => {
  beforeEach(async () => new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase('fantasy-draft-assistant');
    request.onsuccess = request.onerror = () => resolve();
  }));

  it('maps RoboCop Rob Siwicki to Drake’s Chuba at base slot 8, separately from Corey', () => {
    const setup = seedSetup('robocop');
    const robTeamId = currentUserTeamId(setup);
    const rob = setup.teams.find(team => team.id === robTeamId)!;
    const corey = setup.teams.find(team => managerName(setup, team.id) === 'Corey Huffman')!;
    expect(rob).toMatchObject({ id: 'team-robocop-6', managerId: 'manager-robocop-6', displayName: 'Drake’s Chuba' });
    expect(managerName(setup, robTeamId)).toBe('Rob Siwicki');
    expect(setup.draftSlots.find(slot => slot.originalTeamId === robTeamId)?.slot).toBe(8);
    expect(corey).toMatchObject({ id: 'team-robocop-1', displayName: 'Hot lava Hot lava' });
    expect(setup.draftSlots.find(slot => slot.originalTeamId === corey.id)?.slot).toBe(6);
    expect(robTeamId).not.toBe(corey.id);
  });

  it('maps Believeland to Rob without changing its existing draft order', () => {
    const setup = seedSetup('believeland');
    const before = setup.draftSlots.map(slot => ({ ...slot }));
    const repaired = reconcileCurrentUserIdentity({ ...setup, settings: { ...setup.settings, metadata: {} } });
    expect(managerName(repaired, currentUserTeamId(repaired))).toBe('Rob Siwicki');
    expect(managerName(repaired, currentUserTeamId(repaired))).not.toBe('Brandon Whipkey');
    expect(repaired.draftSlots).toEqual(before);
  });

  it('repairs stale IndexedDB identity and invalid roster views after hydration', async () => {
    const store = new DraftStore();
    const seeded = seedSetup('robocop');
    await store.saveSetup({ ...seeded, settings: { ...seeded.settings, metadata: { userManagerId: 'manager-robocop-1' } } });
    const hydrated = (await store.getSetup(seeded.season.id))!;
    const repaired = reconcileCurrentUserIdentity(hydrated);
    await store.saveSetup(repaired);
    expect(currentUserTeamId((await store.getSetup(seeded.season.id))!)).toBe('team-robocop-6');
    expect(validRosterViewTeamId(repaired, 'team-believeland-8')).toBe('team-robocop-6');
    expect(validRosterViewTeamId(repaired, 'missing-team')).toBe('team-robocop-6');
  });

  it('keeps roster needs, Draft Fit, recommendations, and pick alerts on Rob’s team rather than slot 1', () => {
    const setup = seedSetup('robocop');
    const robTeamId = currentUserTeamId(setup);
    const context = startDraft({ ...setup, keeperLock: { ...setup.keeperLock, status: 'locked' } }, playerPool(), true);
    const state = rebuildDraftState(context);
    const intelligence = runRecommendationEngine({
      setup,
      context,
      state,
      userTeamId: robTeamId,
      userContext: userContext(emptyPhilosophy(setup.league.id, setup.season.id), [], [], []),
    });
    expect(state.rosters[robTeamId].keepers.map(player => player.displayName)).toEqual(['Josh Allen', 'Drake London', 'Jaxon Smith-Njigba']);
    expect(intelligence.teamNeeds.find(need => need.teamId === robTeamId)?.positionCounts).toMatchObject({ QB: 1, WR: 2 });
    expect(intelligence.draftFits).not.toHaveLength(0);
    expect(intelligence.recommendations).not.toHaveLength(0);
    expect(intelligence.picksUntilNextTurn).toBeGreaterThan(0);
    expect(createDraftPlan(setup)[0].currentTeamId).not.toBe(robTeamId);
  });

  it('treats traded picks as ownership only and never changes current-user identity', () => {
    const setup = seedSetup('robocop');
    const robTeamId = currentUserTeamId(setup);
    const first = createDraftPlan(setup)[0];
    const traded = { ...setup, ownership: [{ seasonId: setup.season.id, round: first.round, slot: first.slot, originalTeamId: first.originalTeamId, currentTeamId: robTeamId }] };
    expect(createDraftPlan(traded)[0].currentTeamId).toBe(robTeamId);
    expect(currentUserTeamId(traded)).toBe(robTeamId);
  });

  it('does not leak team IDs while switching leagues', () => {
    const believeland = seedSetup('believeland');
    const robocop = seedSetup('robocop');
    expect(currentUserTeamId(believeland)).toBe('team-believeland-8');
    expect(currentUserTeamId(robocop)).toBe('team-robocop-6');
    expect(validRosterViewTeamId(believeland, currentUserTeamId(robocop))).toBe('team-believeland-8');
  });
});
