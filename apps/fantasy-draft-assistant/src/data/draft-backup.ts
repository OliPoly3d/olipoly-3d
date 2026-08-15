import { rebuildDraftState, type DraftContext } from '../domain/engine';
import type { ConversationMessage, DraftPhilosophy, PlayerInterest, SeasonSetup, StrategicIntent } from '../domain/models';
import { validateSetup } from '../domain/setup';
import type { PlayerDataSnapshot } from './player-data';
import { deserializeEspnSource, serializeEspnSource, type EspnRankingSource, type StoredEspnRankingSource } from './espn-rankings';

export const DRAFT_BACKUP_FORMAT = 'fantasy-draft-assistant-backup' as const;
export const DRAFT_BACKUP_VERSION = 1 as const;
const SECRET_KEY = /(openai.*key|fantasypros.*key|draft.*refresh.*token|service.*role|access[_-]?token|refresh[_-]?token|magic[_-]?link|password|secret)/i;

export interface DraftBackup {
  format: typeof DRAFT_BACKUP_FORMAT;
  version: typeof DRAFT_BACKUP_VERSION;
  exportedAt: string;
  leagueId: string;
  season: number;
  setup: SeasonSetup;
  session: DraftContext['session'];
  events: DraftContext['events'];
  philosophy: DraftPhilosophy;
  interests: PlayerInterest[];
  strategicIntents: StrategicIntent[];
  conversation: ConversationMessage[];
  draftPlayers: DraftContext['players'];
  playerSnapshot: PlayerDataSnapshot | null;
  espnRankingSource: StoredEspnRankingSource | null;
}

export interface BackupSource {
  setup: SeasonSetup;
  context: DraftContext;
  philosophy: DraftPhilosophy;
  interests: PlayerInterest[];
  strategicIntents: StrategicIntent[];
  conversation: ConversationMessage[];
  playerSnapshot?: PlayerDataSnapshot;
  espnRankingSource?: EspnRankingSource;
}

function assertNoSecrets(value: unknown, path = 'backup') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`Backup contains a forbidden credential field at ${path}.${key}.`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

export function buildDraftBackup(source: BackupSource, exportedAt = new Date().toISOString()): DraftBackup {
  const backup: DraftBackup = {
    format: DRAFT_BACKUP_FORMAT,
    version: DRAFT_BACKUP_VERSION,
    exportedAt,
    leagueId: source.setup.league.id,
    season: source.setup.season.year,
    setup: structuredClone(source.setup),
    session: structuredClone(source.context.session),
    events: structuredClone(source.context.events),
    philosophy: structuredClone(source.philosophy),
    interests: structuredClone(source.interests),
    strategicIntents: structuredClone(source.strategicIntents),
    conversation: structuredClone(source.conversation),
    draftPlayers: structuredClone(source.context.players),
    playerSnapshot: source.playerSnapshot ? structuredClone(source.playerSnapshot) : null,
    espnRankingSource: source.espnRankingSource ? serializeEspnSource(source.setup.league.id, source.espnRankingSource) : null,
  };
  validateDraftBackup(backup);
  return backup;
}

export function parseDraftBackup(json: string): DraftBackup {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('Draft backup is not valid JSON.'); }
  return validateDraftBackup(value);
}

export function validateDraftBackup(value: unknown): DraftBackup {
  if (!value || typeof value !== 'object') throw new Error('Draft backup must be an object.');
  const backup = value as DraftBackup;
  if (backup.format !== DRAFT_BACKUP_FORMAT) throw new Error('File is not a Draft Assistant backup.');
  if (backup.version !== DRAFT_BACKUP_VERSION) throw new Error(`Unsupported draft backup version: ${String(backup.version)}.`);
  assertNoSecrets(backup);
  if (!Number.isFinite(Date.parse(backup.exportedAt))) throw new Error('Backup export timestamp is invalid.');
  if (!backup.setup || backup.leagueId !== backup.setup.league?.id || backup.season !== backup.setup.season?.year) throw new Error('Backup league or season identifiers do not match its setup.');
  validateSetup(backup.setup, true);
  if (!backup.session || backup.session.seasonId !== backup.setup.season.id) throw new Error('Draft session does not belong to the backup season.');
  if (!Array.isArray(backup.events) || !Array.isArray(backup.interests) || !Array.isArray(backup.strategicIntents) || !Array.isArray(backup.conversation)) throw new Error('Backup collections are malformed.');
  const ids = new Set<string>();
  const sequences = new Set<number>();
  for (const event of backup.events) {
    if (!event?.id || ids.has(event.id)) throw new Error('Draft backup contains a duplicate or missing event ID.');
    if (!Number.isInteger(event.sequence) || event.sequence < 1 || sequences.has(event.sequence)) throw new Error('Draft backup contains an invalid or duplicate event sequence.');
    if (event.sessionId !== backup.session.id || event.seasonId !== backup.setup.season.id || !Number.isFinite(Date.parse(event.occurredAt))) throw new Error('Draft event identity or timestamp is invalid.');
    ids.add(event.id); sequences.add(event.sequence);
  }
  const players = backup.draftPlayers;
  if (!Array.isArray(players) || players.length === 0 || players.some(player => !player.id || !player.canonicalPlayerId || !player.displayName)) throw new Error('Backup requires a valid canonical draft player snapshot.');
  if (backup.playerSnapshot && (!Array.isArray(backup.playerSnapshot.players) || !backup.playerSnapshot.players.length)) throw new Error('FantasyPros player snapshot is malformed.');
  const context: DraftContext = { setup: backup.setup, session: backup.session, events: backup.events, players, deviceId: 'backup-validation' };
  const state = rebuildDraftState(context);
  if (new Set(state.activePicks.map(pick => pick.player.id)).size !== state.activePicks.length) throw new Error('Draft backup contains a duplicate drafted player.');
  if (new Set(state.activePicks.map(pick => pick.plan.sequence)).size !== state.activePicks.length) throw new Error('Draft backup contains a duplicate draft slot.');
  if (backup.espnRankingSource) deserializeEspnSource(backup.espnRankingSource);
  return backup;
}

export function backupPreview(backup: DraftBackup) {
  const context: DraftContext = { setup: backup.setup, session: backup.session, events: backup.events, players: backup.draftPlayers, deviceId: 'backup-preview' };
  const state = rebuildDraftState(context);
  return {
    league: backup.setup.league.name,
    season: backup.season,
    exportedAt: backup.exportedAt,
    recordedPicks: state.activePicks.length,
    currentPick: state.current ? `${state.current.round}.${state.current.pickInRound} (#${state.current.overallPick})` : 'COMPLETE',
    espnRankings: backup.espnRankingSource?.rankings.length ?? 0,
    fantasyProsPlayers: backup.playerSnapshot?.players.length ?? 0,
    messages: backup.conversation.length,
  };
}

export function backupFilename(backup: DraftBackup) {
  const league = backup.setup.league.slug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  return `draft-assistant-${league}-${backup.season}-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
}
