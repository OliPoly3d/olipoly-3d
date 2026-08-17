import type { DraftPlayer, Position } from '../domain/models';
import { normalizePlayerName, normalizePosition, normalizeTeam } from './player-data';

const defensiveFamily = (position: Position) => ['DE', 'DT', 'DL'].includes(position)
  ? 'DL'
  : ['S', 'CB', 'DB'].includes(position) ? 'DB' : position;

export interface RankingIdentity { name: string; team?: string; position: string }

/** One provider-neutral, deterministic identity matcher for every ranking import. */
export function canonicalRankingCandidates(identity: RankingIdentity, players: DraftPlayer[], alternateNames: string[] = []): DraftPlayer[] {
  const names = new Set([identity.name, ...alternateNames].map(normalizePlayerName).filter(Boolean));
  const position = defensiveFamily(normalizePosition(identity.position));
  const team = normalizeTeam(identity.team);
  const compatible = players.filter(player => player.canonicalPlayerId
    && defensiveFamily(normalizePosition(player.position)) === position
    && names.has(normalizePlayerName(player.displayName)));
  const exactTeam = compatible.filter(player => team && normalizeTeam(player.nflTeam) === team);
  return exactTeam.length ? exactTeam : compatible;
}
