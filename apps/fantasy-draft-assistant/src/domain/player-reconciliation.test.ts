import { describe, expect, it } from 'vitest';
import { editPick, makePick, rebuildDraftState, startDraft, undoLastPick } from './engine';
import type { DraftEvent, DraftPlayer } from './models';
import { DraftHistoryRepairError, historyRepairMarkup, reconcileDraftHistory } from './player-reconciliation';
import { playerPool, seedSetup } from './seeds';
import { canonicalPlayerId, type PlayerIntelligence } from '../data/player-data';

const currentPlayer = (id: string, name: string, position: DraftPlayer['position'], team: string, intelligence: Partial<PlayerIntelligence> = {}): DraftPlayer => ({
  id, canonicalPlayerId: canonicalPlayerId({ name, position, team }), displayName: name,
  normalizedName: name.toLowerCase(), position, nflTeam: team, currentBaselineRank: 1,
  playerIntelligence: { canonicalPlayerId: canonicalPlayerId({ name, position, team }), displayName: name,
    normalizedName: name.toLowerCase(), position, nflTeam: team, baselineRank: 1, sourceValues: [], newsItems: [],
    freshness: 'FRESH', quality: 'COMPLETE', uncertaintyFlags: [], sourceProvenance: [], ...intelligence },
});
const pickEvent = (playerId: string, payload: Record<string, unknown> = {}): DraftEvent => ({
  id: 'pick-1', sessionId: 'session', seasonId: 'season-believeland-2026', sequence: 2, type: 'PICK_MADE',
  occurredAt: '2026-08-01T00:00:00Z', deviceId: 'old-device',
  payload: { planSequence: 1, playerId, teamId: 'team-believeland-1', ...payload },
});

describe('legacy draft player reconciliation', () => {
  it('maps fixture IDs through fixturePlayerId and preserves provenance', () => {
    const live = currentPlayer('current:one', 'Real Player', 'RB', 'CLE', { fixturePlayerId: 'fixture-old' });
    const result = reconcileDraftHistory([pickEvent('fixture-old')], [live], []);
    expect(result.events[0].payload).toMatchObject({ playerId: 'current:one', legacyPlayerId: 'fixture-old' });
  });
  it('maps an old fixture by exact normalized name, position, and team', () => {
    const legacy = { ...playerPool(1)[0], id: 'fixture-old', displayName: 'Real Player', normalizedName: 'real player', position: 'RB' as const, nflTeam: 'CLE' };
    const live = currentPlayer('current:one', 'Real Player', 'RB', 'CLE');
    expect(reconcileDraftHistory([pickEvent(legacy.id)], [live], [legacy]).events[0].payload.playerId).toBe(live.id);
  });
  it('maps a persisted canonical identity to the current authority', () => {
    const live = currentPlayer('current:one', 'Real Player', 'RB', 'CLE');
    expect(reconcileDraftHistory([pickEvent('older-id', { canonicalPlayerId: live.canonicalPlayerId })], [live], []).events[0].payload.playerId).toBe(live.id);
  });
  it('does not guess an ambiguous identity', () => {
    const players = [currentPlayer('one', 'Same Name', 'WR', 'CLE'), currentPlayer('two', 'Same Name', 'WR', 'CLE')];
    const result = reconcileDraftHistory([pickEvent('old', { normalizedName: 'same name', position: 'WR', nflTeam: 'CLE' })], players, []);
    expect(result.unresolved).toEqual([{ eventId: 'pick-1', playerId: 'old' }]);
    expect(result.events[0].payload.playerId).toBe('old');
  });
  it('keeps a synthetic historical pick on the roster but never available', () => {
    const setup = seedSetup('believeland'), synthetic = playerPool(1)[0], live = currentPlayer('live-one', 'Live Player', 'RB', 'CLE');
    const picked = makePick(startDraft(setup, [synthetic]), synthetic.id);
    const result = reconcileDraftHistory(picked.events, [live], [synthetic]);
    const state = rebuildDraftState({ ...picked, players: result.players, events: result.events });
    expect(state.activePicks[0].player).toMatchObject({ id: synthetic.id, historyOnly: true });
    expect(state.available.map(player => player.id)).toEqual([live.id]);
  });
  it('preserves progression and supports undo and correction after remapping', () => {
    const setup = seedSetup('believeland'), legacy = { ...playerPool(1)[0], id: 'old', displayName: 'First', normalizedName: 'first', position: 'RB' as const, nflTeam: 'CLE' };
    const first = currentPlayer('live-first', 'First', 'RB', 'CLE'), replacement = currentPlayer('live-second', 'Second', 'WR', 'DET');
    const original = makePick(startDraft(setup, [legacy]), legacy.id);
    const result = reconcileDraftHistory(original.events, [first, replacement], [legacy]);
    const loaded = { ...original, players: result.players, events: result.events }, before = rebuildDraftState(loaded);
    expect(before.current?.sequence).toBe(2);
    expect(before.activePicks[0]).toMatchObject({ plan: { round: 1, slot: 1 }, player: { id: first.id } });
    expect(rebuildDraftState(undoLastPick(loaded)).current?.sequence).toBe(1);
    const edited = editPick(loaded, before.activePicks[0].eventId, replacement.id);
    expect(rebuildDraftState(edited).activePicks[0].player.id).toBe(replacement.id);
    expect(edited.events.at(-1)?.payload).toMatchObject({ playerId: replacement.id, canonicalPlayerId: replacement.canonicalPlayerId });
  });
  it('renders an explicit recoverable state for truly unknown references', () => {
    const markup = historyRepairMarkup(new DraftHistoryRepairError([{ eventId: '<bad>', playerId: 'missing' }]));
    expect(markup).toContain('Draft history needs repair');
    expect(markup).toContain('Event &lt;bad&gt; · player missing');
  });
});
