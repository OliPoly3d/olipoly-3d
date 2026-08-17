import type { DraftPlayer, Position } from '../domain/models';
import { isIdpPosition, normalizePlayerName, normalizePosition, normalizeTeam } from './player-data';

const defensiveFamily = (position: Position) => ['DE', 'DT', 'DL'].includes(position)
  ? 'DL'
  : ['S', 'CB', 'DB'].includes(position) ? 'DB' : position;

export interface RankingIdentity { name: string; team?: string; position: string }

export interface CanonicalCandidateDiagnostic { canonicalPlayerId:string|null; name:string; normalizedName:string; team?:string; normalizedTeam?:string; position:string; normalizedPosition:string }
export interface CanonicalPoolDiagnostic { total:number; withCanonicalIds:number; withoutCanonicalIds:number; offense:number; idp:number; gibbsPresent:boolean; chasePresent:boolean; gibbs?:CanonicalCandidateDiagnostic; chase?:CanonicalCandidateDiagnostic }

export function canonicalPoolDiagnostic(players:DraftPlayer[]):CanonicalPoolDiagnostic{
  const candidate=(name:string)=>{const player=players.find(item=>normalizePlayerName(item.displayName)===normalizePlayerName(name));return player?{canonicalPlayerId:player.canonicalPlayerId,name:player.displayName,normalizedName:normalizePlayerName(player.displayName),team:player.nflTeam,normalizedTeam:normalizeTeam(player.nflTeam),position:player.position,normalizedPosition:normalizePosition(player.position)}:undefined};
  const withCanonicalIds=players.filter(player=>!!player.canonicalPlayerId).length,idp=players.filter(player=>isIdpPosition(player.position)).length;
  const gibbs=candidate('Jahmyr Gibbs'),chase=candidate("Ja'Marr Chase");
  return{total:players.length,withCanonicalIds,withoutCanonicalIds:players.length-withCanonicalIds,offense:players.length-idp,idp,gibbsPresent:!!gibbs,chasePresent:!!chase,gibbs,chase};
}

export class CanonicalPoolUnavailableError extends Error{
  constructor(readonly diagnostic:CanonicalPoolDiagnostic){super(`Canonical reconciliation unavailable: canonical pool has ${diagnostic.total} players but 0 canonical IDs.`);this.name='CanonicalPoolUnavailableError'}
}

export function assertCanonicalPool(players:DraftPlayer[]):CanonicalPoolDiagnostic{const diagnostic=canonicalPoolDiagnostic(players);if(!diagnostic.withCanonicalIds)throw new CanonicalPoolUnavailableError(diagnostic);return diagnostic}

/** One provider-neutral, deterministic identity matcher for every ranking import. */
export function canonicalRankingCandidates(identity: RankingIdentity, players: DraftPlayer[], alternateNames: string[] = []): DraftPlayer[] {
  assertCanonicalPool(players);
  const names = new Set([identity.name, ...alternateNames].map(normalizePlayerName).filter(Boolean));
  const position = defensiveFamily(normalizePosition(identity.position));
  const team = normalizeTeam(identity.team);
  const compatible = players.filter(player => player.canonicalPlayerId
    && defensiveFamily(normalizePosition(player.position)) === position
    && names.has(normalizePlayerName(player.displayName)));
  const exactTeam = compatible.filter(player => team && normalizeTeam(player.nflTeam) === team);
  return exactTeam.length ? exactTeam : compatible;
}
