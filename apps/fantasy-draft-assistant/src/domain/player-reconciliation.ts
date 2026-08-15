import type { DraftEvent, DraftPlayer } from './models';
import { normalizePlayerName, normalizeTeam } from '../data/player-data';

export interface ReconciliationResult {
  events: DraftEvent[];
  players: DraftPlayer[];
  remapped: number;
  historyOnly: number;
  unresolved: { eventId: string; playerId: string }[];
}

export class DraftHistoryRepairError extends Error {
  constructor(public readonly unresolved: { eventId: string; playerId: string }[]) {
    super(`Draft history needs repair: ${unresolved.length} player reference${unresolved.length === 1 ? '' : 's'} could not be resolved.`);
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export function historyRepairMarkup(error: DraftHistoryRepairError) {
  const details = error.unresolved.map(item =>
    `Event ${escapeHtml(item.eventId)} · player ${escapeHtml(item.playerId)}`).join('<br>');
  return `<main><p class="eyebrow">RECOVERABLE DRAFT HISTORY ERROR</p><h1>Draft history needs repair</h1><p>No draft events were deleted or discarded. An authorized user must reconcile the unresolved historical player reference before replay can continue.</p><p role="alert">${details}</p><a href="#/">Return to leagues</a></main>`;
}

const text = (value: unknown) => typeof value === 'string' && value ? value : undefined;

function exactCandidates(reference: string, current: DraftPlayer[]) {
  return current.filter(player => {
    const intelligence = player.playerIntelligence;
    return [player.id, player.canonicalPlayerId, intelligence?.fixturePlayerId,
      intelligence?.fantasyProsPlayerId, intelligence?.sleeperPlayerId,
      intelligence?.fantasyProsPlayerId && `nfl:fantasypros:${intelligence.fantasyProsPlayerId}`,
      intelligence?.sleeperPlayerId && `nfl:sleeper:${intelligence.sleeperPlayerId}`].includes(reference);
  });
}

function identityCandidates(payload: Record<string, unknown>, legacy: DraftPlayer | undefined, current: DraftPlayer[]) {
  const canonical = text(payload.canonicalPlayerId) ?? legacy?.canonicalPlayerId ?? undefined;
  if (canonical) {
    const candidates = current.filter(player => player.canonicalPlayerId === canonical);
    if (candidates.length) return candidates;
  }
  const normalizedName = text(payload.normalizedName) ?? legacy?.normalizedName;
  const position = text(payload.position) ?? legacy?.position;
  const team = normalizeTeam(text(payload.nflTeam) ?? legacy?.nflTeam);
  if (!normalizedName || !position) return [];
  return current.filter(player => player.normalizedName === normalizePlayerName(normalizedName)
    && player.position === position
    && normalizeTeam(player.nflTeam) === team);
}

/** Reconciles persisted pick identities at the storage boundary without weakening replay validation. */
export function reconcileDraftHistory(events: DraftEvent[], current: DraftPlayer[], historical: DraftPlayer[]): ReconciliationResult {
  const legacyById = new Map(historical.map(player => [player.id, player]));
  const historyPlayers = new Map<string, DraftPlayer>();
  const unresolved: ReconciliationResult['unresolved'] = [];
  let remapped = 0;

  const reconciled = events.map(event => {
    if (event.type !== 'PICK_MADE' && event.type !== 'PICK_EDITED') return event;
    const reference = text(event.payload.playerId);
    if (!reference) {
      unresolved.push({ eventId: event.id, playerId: String(event.payload.playerId) });
      return event;
    }
    let candidates = exactCandidates(reference, current);
    const legacy = legacyById.get(reference);
    if (candidates.length !== 1) candidates = identityCandidates(event.payload, legacy, current);
    if (candidates.length === 1) {
      if (candidates[0].id === reference) return event;
      remapped += 1;
      return { ...event, payload: { ...event.payload, playerId: candidates[0].id, legacyPlayerId: reference } };
    }
    if (candidates.length > 1) {
      unresolved.push({ eventId: event.id, playerId: reference });
      return event;
    }
    if (legacy) {
      historyPlayers.set(reference, { ...legacy, historyOnly: true });
      return event;
    }
    unresolved.push({ eventId: event.id, playerId: reference });
    return event;
  });

  return { events: reconciled, players: [...current, ...historyPlayers.values()], remapped, historyOnly: historyPlayers.size, unresolved };
}
