import { describe, expect, it } from 'vitest';
import { playerPool, seedSetup } from '../domain/seeds';
import { makePick, rebuildDraftState, startDraft } from '../domain/engine';
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

  it('resolves required team identities case-insensitively and rejects unknown IDs', () => {
    expect(teamIdentity('LAC')?.name).toBe('Los Angeles Chargers');
    expect(teamIdentity('cle')?.name).toBe('Cleveland');
    expect(teamIdentity('DaL')?.name).toBe('Dallas');
    expect(teamIdentity('XYZ')).toBeUndefined();
  });

  it('preserves NFL team IDs in fixture recommendation view models', () => {
    const recommendations = previewRecommendations(playerPool());
    expect(recommendations.map(({ playerId, nflTeam }) => ({ playerId, nflTeam }))).toEqual([
      { playerId: 'player-omarion-hampton', nflTeam: 'LAC' },
      { playerId: 'player-quinshon-judkins', nflTeam: 'CLE' },
      { playerId: 'player-ceedee-lamb', nflTeam: 'DAL' },
    ]);
  });

  it('renders custom marks rather than the NFL fallback for recommendation teams', () => {
    const marks = previewRecommendations(playerPool()).map(({ nflTeam }) => teamMark(nflTeam));
    expect(marks).toEqual(expect.arrayContaining([
      expect.stringContaining('Los Angeles Chargers team identity'),
      expect.stringContaining('Cleveland team identity'),
      expect.stringContaining('Dallas team identity'),
    ]));
    expect(marks.every(mark => !mark.includes('NFL team mark'))).toBe(true);
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

  it('preserves fixture team identity for detail, Master Board, and recent-pick projections', () => {
    const players = playerPool();
    const omarion = players.find(({ displayName }) => displayName === 'Omarion Hampton')!;
    expect(teamMark(omarion.nflTeam, 'detail')).toContain('Los Angeles Chargers team identity');
    expect(teamMark(omarion.nflTeam, 'compact')).toContain('Los Angeles Chargers team identity');

    const setup = seedSetup('believeland');
    const state = rebuildDraftState(makePick(startDraft(setup, players, false), omarion.id));
    expect(state.activePicks[0].player.nflTeam).toBe('LAC');
    expect(teamMark(state.activePicks[0].player.nflTeam, 'compact')).not.toContain('NFL team mark');
  });
});

describe('interest presentation boundary',()=>{it('filters the Master Board without moving base player order',async()=>{const{filterPlayersByInterest}=await import('./live-room');const players=playerPool();const filtered=filterPlayersByInterest(players,[{id:'i',leagueId:'l',seasonId:'s',playerId:players[1].id,state:'WATCH',updatedAt:''}],'WATCH');expect(filtered.map(x=>x.id)).toEqual([players[1].id]);expect(players[0].id).toBe('player-omarion-hampton')});it('renders a subtle contextual recommendation marker',async()=>{const{interestBadge}=await import('./live-room');expect(interestBadge({id:'i',leagueId:'l',seasonId:'s',playerId:'p',state:'AVOID',updatedAt:''})).toContain('does not change recommendation rank');expect(interestBadge()).toBe('')})});
