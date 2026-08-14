import { describe, expect, it } from 'vitest';
import { playerPool, seedSetup } from '../domain/seeds';
import { rebuildDraftState, startDraft } from '../domain/engine';
import { confidenceRing, picksUntilUser, positionClass, previewRecommendations, teamMark, userTeamId } from './live-room';
import { TEAM_IDS, teamIdentity } from './team-marks';

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

  it('renders categorical confidence without invented precision', () => {
    expect(confidenceRing('HIGH', true)).toContain('HIGH');
    expect(confidenceRing('HIGH', true)).toContain('CONFIDENCE · PREVIEW');
    expect(confidenceRing('HIGH', true)).not.toContain('%');
  });

  it('resolves all 32 original team identities', () => {
    expect(TEAM_IDS).toHaveLength(32);
    expect(TEAM_IDS.every(team => teamIdentity(team))).toBe(true);
  });

  it('renders accessible vector marks and an abbreviation fallback', () => {
    expect(teamMark('buf')).toContain('aria-label="Buffalo team identity"');
    expect(teamMark('buf')).toContain('<svg');
    expect(teamMark('xyz')).toContain('XYZ team mark');
    expect(teamMark()).toContain('NFL team mark');
  });

  it('supports compact, standard, and detail team-mark modes', () => {
    expect(teamMark('MIN', 'compact')).toContain('team-mark-compact');
    expect(teamMark('DAL')).toContain('team-mark-standard');
    expect(teamMark('NYJ', 'detail')).toContain('team-mark-detail');
  });

  it('keeps semantic position classes independent from team colors', () => {
    expect(positionClass('QB')).toBe('position-qb');
    expect(teamMark('BUF')).toContain('--team-primary:');
    expect(teamMark('BUF')).not.toContain('--position-color:');
  });

  it('derives approaching and on-clock state from the deterministic plan', () => {
    const setup = seedSetup('believeland');
    const state = rebuildDraftState(startDraft(setup, playerPool(), false));
    expect(picksUntilUser(state, userTeamId(setup))).toBe(7);
    expect(state.rosters[userTeamId(setup)].combined).toEqual([]);
  });
});
