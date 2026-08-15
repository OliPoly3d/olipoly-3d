import { describe, expect, it } from 'vitest';
import { makePick, rebuildDraftState, startDraft } from '../domain/engine';
import { playerPool, seedSetup } from '../domain/seeds';
import { emptyPhilosophy } from '../domain/user-context';
import { backupPreview, buildDraftBackup, parseDraftBackup, validateDraftBackup } from './draft-backup';
import type { CanonicalPlayerId, PlayerDataSnapshot } from './player-data';

function source(pickCount = 75) {
  const seeded = seedSetup('believeland');
  const setup = { ...seeded, draft: { ...seeded.draft, rounds: 15 }, positionLimits: seeded.positionLimits.map(limit => ({ ...limit, maximum: null })) };
  const players = playerPool().slice(0, 200).map((player, index) => ({ ...player, canonicalPlayerId: player.canonicalPlayerId ?? `nfl:fixture-${index}` }));
  let context = startDraft(setup, players);
  for (let index = 0; index < pickCount; index++) context = makePick(context, players[index].id, `backup-pick-${index}`);
  const playerSnapshot: PlayerDataSnapshot = {
    id: 'last-good-snapshot', version: 1, createdAt: '2026-08-15T12:00:00.000Z', season: setup.season.year, scoringFormat: 'PPR', quality: 'COMPLETE', freshness: 'FRESH', mode: 'CURRENT', players: players.map((player, index) => ({ canonicalPlayerId: player.canonicalPlayerId as CanonicalPlayerId, fixturePlayerId: player.id, displayName: player.displayName, normalizedName: player.normalizedName, position: player.position, nflTeam: player.nflTeam, baselineRank: index + 1, sourceValues: [], newsItems: [], freshness: 'FRESH', quality: 'COMPLETE', uncertaintyFlags: [], sourceProvenance: [] })), changes: [], providerResults: [{ providerId: 'fixture-cache', status: 'SUCCESS', checkedAt: '2026-08-15T12:00:00.000Z' }],
  };
  return { setup, context, philosophy: { ...emptyPhilosophy(setup.league.id, setup.season.id), freeformNotes: 'Prioritize weekly floor.' }, interests: [], strategicIntents: [], conversation: [], playerSnapshot };
}

describe('emergency draft backups', () => {
  it('exports explicit authoritative state and replays it for preview/restore', () => {
    const original = source();
    const backup = buildDraftBackup(original, '2026-08-15T12:30:00.000Z');
    expect(backup).toMatchObject({ format: 'fantasy-draft-assistant-backup', version: 1, leagueId: original.setup.league.id, season: original.setup.season.year });
    expect(backup.events).toEqual(original.context.events);
    expect(backup.playerSnapshot?.id).toBe('last-good-snapshot');
    expect(backupPreview(backup)).toMatchObject({ recordedPicks: 75, currentPick: '7.4 (#76)', fantasyProsPlayers: 200 });
    const parsed = parseDraftBackup(JSON.stringify(backup));
    const replay = rebuildDraftState({ setup: parsed.setup, session: parsed.session, events: parsed.events, players: parsed.draftPlayers });
    expect(replay.activePicks.map(item => [item.plan.currentTeamId, item.player.id])).toEqual(rebuildDraftState(original.context).activePicks.map(item => [item.plan.currentTeamId, item.player.id]));
    expect(replay.available.map(player => player.id)).toEqual(rebuildDraftState(original.context).available.map(player => player.id));
  });

  it.each([
    ['wrong format', (value: Record<string, unknown>) => { value.format = 'foreign'; }],
    ['unsupported version', (value: Record<string, unknown>) => { value.version = 2; }],
    ['duplicate event', (value: Record<string, unknown>) => { const events = value.events as unknown[]; events.push(structuredClone(events[1])); }],
    ['duplicate player', (value: Record<string, unknown>) => { const events = value.events as { payload: Record<string, unknown> }[]; events[2].payload.playerId = events[1].payload.playerId; }],
    ['invalid slot', (value: Record<string, unknown>) => { const events = value.events as { payload: Record<string, unknown> }[]; events[1].payload.planSequence = 999; }],
    ['unknown manager', (value: Record<string, unknown>) => { const setup = value.setup as { ownership: { currentTeamId: string }[] }; setup.ownership = [{ currentTeamId: 'unknown' }] as typeof setup.ownership; }],
    ['malformed player snapshot', (value: Record<string, unknown>) => { (value.playerSnapshot as { players: unknown[] }).players = []; }],
    ['secret field', (value: Record<string, unknown>) => { value.access_token = 'forbidden'; }],
  ])('rejects %s without accepting partial data', (_label, corrupt) => {
    const backup = structuredClone(buildDraftBackup(source(3)) as unknown as Record<string, unknown>);
    corrupt(backup);
    expect(() => validateDraftBackup(backup)).toThrow();
  });

  it('rejects malformed JSON and completed drafts restore without a phantom pick', () => {
    expect(() => parseDraftBackup('{nope')).toThrow('not valid JSON');
    const completeSource = source(180);
    const backup = buildDraftBackup(completeSource);
    const replay = rebuildDraftState({ setup: backup.setup, session: backup.session, events: backup.events, players: backup.draftPlayers });
    expect(replay).toMatchObject({ status: 'COMPLETED', current: null, remaining: 0 });
  });
});
