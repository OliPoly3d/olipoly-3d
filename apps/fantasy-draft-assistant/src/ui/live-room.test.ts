import { describe, expect, it } from 'vitest';
import { playerPool, seedSetup } from '../domain/seeds';
import { makePick, rebuildDraftState, startDraft } from '../domain/engine';
import { confidenceRing, picksUntilUser, positionClass, recentPicksMarkup, RECENT_PICK_LIMIT, teamMark, userTeamId } from './live-room';
import { TEAM_IDS, teamIdentity } from './team-marks';

describe('live room view model', () => {
  it('uses consistent semantic position classes', () => {
    expect(positionClass('QB')).toBe('position-qb');
    expect(positionClass('DST')).toBe('position-dst');
    expect(positionClass('LB')).toBe('position-lb');
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

  it('caps recent picks at four while preserving newest-first behavior', () => {
    const setup = seedSetup('believeland');
    let draft = startDraft(setup, playerPool(), false);
    for (const player of playerPool().slice(0, 5)) draft = makePick(draft, player.id);
    const markup = recentPicksMarkup(rebuildDraftState(draft), () => 'Manager');
    expect(RECENT_PICK_LIMIT).toBe(4);
    expect(markup.match(/class="recent-pick/g)).toHaveLength(4);
    expect(markup.indexOf(playerPool()[4].displayName)).toBeLessThan(markup.indexOf(playerPool()[1].displayName));
    expect(markup).not.toContain(playerPool()[0].displayName);
  });

  it('gives long player and manager names contained text hooks', () => {
    const setup = seedSetup('believeland');
    const names = ['Amon-Ra St. Brown', 'Marvin Harrison Jr.', 'Brian Thomas Jr.', 'Jaxon Smith-Njigba'];
    const players = playerPool().map((player, index) => index < names.length ? { ...player, displayName: names[index] } : player);
    let context = startDraft(setup, players, false);
    for (const player of players.slice(0, names.length)) context = makePick(context, player.id);
    const markup = recentPicksMarkup(rebuildDraftState(context), () => 'Commissioner Alexander Montgomery-Smythe');
    for (const name of names) expect(markup).toContain(`<b>${name}</b>`);
    expect(markup.match(/Commissioner Alexander Montgomery-Smythe<\/small>/g)).toHaveLength(4);
    expect(markup.match(/class="recent-pick/g)).toHaveLength(4);
  });

  it('marks retained synthetic history as legacy without making it available', () => {
    const setup = seedSetup('believeland');
    const legacy = { ...playerPool()[0], id: 'legacy-test-002', displayName: 'Test Player 002', historyOnly: true };
    const context = makePick(startDraft(setup, [legacy, ...playerPool().slice(1)], false), playerPool()[1].id);
    const events = context.events.map(event => event.type === 'PICK_MADE' ? { ...event, payload: { ...event.payload, playerId: legacy.id } } : event);
    const picked = rebuildDraftState({ ...context, events });
    const markup = recentPicksMarkup(picked, () => 'Historical Manager');
    expect(markup).toContain('Test Player 002');
    expect(markup).toContain('LEGACY');
    expect(picked.available.some(player => player.id === legacy.id)).toBe(false);
  });
});

describe('interest presentation boundary',()=>{it('filters the Master Board without moving base player order',async()=>{const{filterPlayersByInterest}=await import('./live-room');const players=playerPool();const filtered=filterPlayersByInterest(players,[{id:'i',leagueId:'l',seasonId:'s',playerId:players[1].id,state:'WATCH',updatedAt:''}],'WATCH');expect(filtered.map(x=>x.id)).toEqual([players[1].id]);expect(players[0].id).toBe('player-omarion-hampton')});it('renders a subtle contextual recommendation marker',async()=>{const{interestBadge}=await import('./live-room');expect(interestBadge({id:'i',leagueId:'l',seasonId:'s',playerId:'p',state:'AVOID',updatedAt:''})).toContain('Bounded user-context adjustment');expect(interestBadge()).toBe('')})});
