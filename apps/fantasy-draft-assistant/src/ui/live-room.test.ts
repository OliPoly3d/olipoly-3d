import { describe, expect, it } from 'vitest';
import { playerPool, seedSetup } from '../domain/seeds';
import { rebuildDraftState, startDraft } from '../domain/engine';
import { picksUntilUser, positionClass, previewRecommendations, userTeamId } from './live-room';

describe('live room view model', () => {
  it('uses consistent semantic position classes', () => {
    expect(positionClass('QB')).toBe('position-qb');
    expect(positionClass('DST')).toBe('position-dst');
    expect(positionClass('LB')).toBe('position-lb');
  });

  it('creates exactly three honestly labelled fixture recommendations', () => {
    const recommendations = previewRecommendations(playerPool());
    expect(recommendations).toHaveLength(3);
    expect(recommendations.map(({ order }) => order)).toEqual([1, 2, 3]);
    expect(recommendations.every(({ sourceLabel }) => sourceLabel === 'FIXTURE PREVIEW')).toBe(true);
  });

  it('derives approaching and on-clock state from the deterministic plan', () => {
    const setup = seedSetup('believeland');
    const state = rebuildDraftState(startDraft(setup, playerPool(), false));
    expect(picksUntilUser(state, userTeamId(setup))).toBe(7);
    expect(state.rosters[userTeamId(setup)].combined).toEqual([]);
  });
});
