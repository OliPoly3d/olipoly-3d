import type { DraftPlayer, DraftState, Position, SeasonSetup } from '../domain/models';
import { teamIdentity } from './team-marks';
import { snapshotSources, type PlayerDataSnapshot } from '../data/player-data';
import type { AiStatus } from '../data/ai';

export function playerDataStatusMarkup(snapshot:PlayerDataSnapshot|undefined,aiStatus:AiStatus):string{
  const source=snapshotSources(snapshot);
  return `<small>FANTASYPROS · LAST REFRESH: ${source.updatedAt?new Date(source.updatedAt).toLocaleString():'NOT AVAILABLE'} · AUTO REFRESH: NOT CONFIGURED · PLAYER DATA: ${source.playerSource}${snapshot?` · ${snapshot.players.length} PLAYERS`:''} · RANKINGS: ${source.rankingSource}${snapshot?` · ${snapshot.freshness}`:''} · NEWS: ${source.news} · AI ${aiStatus}</small>`;
}

export interface RecommendationViewModel {
  playerId: string;
  nflTeam?: string;
  order: 1 | 2 | 3;
  recommendationType: 'PRIMARY' | 'SECONDARY' | 'VALUE';
  headlineReason: string;
  costOfWaitingLabel: string;
  confidence: 'HIGH' | 'MED' | 'LOW';
  badges: string[];
  sourceLabel: 'DETERMINISTIC INTELLIGENCE';
}

export const positionClass = (position: Position) => `position-${position.replace('/', '').toLowerCase()}`;
export const byeWeek = (player: DraftPlayer) => 5 + Math.abs([...player.id].reduce((n, char) => n + char.charCodeAt(0), 0)) % 10;

export const RECENT_PICK_LIMIT = 4;

export function recentPicksMarkup(state: DraftState, managerName: (teamId: string) => string): string {
  const picks = state.activePicks.slice(-RECENT_PICK_LIMIT).reverse();
  return `<div class="recent-heading"><small>RECENT PICKS</small><b>Last ${Math.min(RECENT_PICK_LIMIT, state.activePicks.length)}</b></div>${picks.map(({ eventId, plan, player }) => `<button class="recent-pick${player.historyOnly ? ' legacy-pick' : ''}" data-correct="${eventId}">${teamMark(player.nflTeam, 'compact')}<span class="position-chip ${positionClass(player.position)}">${player.position}</span><b>${escapeHtml(player.displayName)}</b><small>${plan.round}.${plan.pickInRound} (#${plan.overallPick}) · ${escapeHtml(managerName(plan.currentTeamId))}</small>${player.historyOnly ? '<span class="legacy-label">LEGACY</span>' : ''}</button>`).join('') || '<p>No live picks yet.</p>'}`;
}

export type ConfidenceLevel = RecommendationViewModel['confidence'];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]!));

const motifPath = (motif: 'chevron' | 'diamond' | 'horizon' | 'orbit') => ({
  chevron: '<path d="M15 19 32 10l17 9-6 5-11-6-11 6Z"/>',
  diamond: '<path d="m32 9 13 10-13 10-13-10Z"/>',
  horizon: '<path d="M15 15h34v5H15zm6 9h22v3H21z"/>',
  orbit: '<circle cx="32" cy="19" r="10" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 19h9m18 0h9"/>',
}[motif]);

/** Single UI entry point for original internal marks and the abbreviation fallback. */
export function teamMark(team?: string, size: 'compact' | 'standard' | 'detail' = 'standard'): string {
  const label = team?.trim().toUpperCase() || 'NFL';
  const identity = teamIdentity(label);
  if (!identity) return `<span class="team-mark team-mark-${size} team-mark-fallback" role="img" aria-label="${escapeHtml(label)} team mark">${escapeHtml(label)}</span>`;
  return `<span class="team-mark team-mark-${size}" role="img" aria-label="${escapeHtml(identity.name)} team identity" style="--team-primary:${identity.primary};--team-secondary:${identity.secondary}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="team-mark-shell" d="M9 12 32 4l23 8v25c0 11-9 18-23 23C18 55 9 48 9 37Z"/><g class="team-mark-motif">${motifPath(identity.motif)}</g><text x="32" y="45">${identity.initials}</text></svg></span>`;
}

/** Categorical by default; numeric values are only rendered when explicitly marked as preview. */
export function confidenceRing(value: ConfidenceLevel | number, preview = false): string {
  const numeric = typeof value === 'number';
  const label = numeric ? `${Math.max(0, Math.min(100, Math.round(value)))}%` : value;
  const modifier = numeric ? 'numeric' : value.toLowerCase();
  return `<div class="confidence" aria-label="${label} confidence${preview ? ', preview' : ''}"><span class="confidence-ring confidence-${modifier}"><b>${label}</b></span><small>CONFIDENCE${preview ? ' · PREVIEW' : ''}</small></div>`;
}

export function userTeamId(setup: SeasonSetup): string {
  const manager = setup.managers.find(({ displayName }) => displayName === 'Rob Siwicki') ?? setup.managers[0];
  return setup.teams.find(({ managerId }) => managerId === manager.id)?.id ?? setup.teams[0].id;
}

export function picksUntilUser(state: DraftState, teamId: string): number | null {
  const currentIndex = state.current ? state.plan.findIndex(({ sequence }) => sequence === state.current?.sequence) : -1;
  const nextIndex = state.plan.findIndex((pick, index) => index >= currentIndex && pick.kind === 'live' && pick.currentTeamId === teamId);
  return currentIndex < 0 || nextIndex < 0 ? null : nextIndex - currentIndex;
}

import type { PlayerInterest, PlayerInterestState } from '../domain/models';
export const interestLabels:Record<PlayerInterestState,string>={INTERESTED:'Interested',WATCH:'Watching',FAVORITE:'Favorite',FADE:'Fade',AVOID:'Avoid',CONCERNED:'Concerned'};
export function filterPlayersByInterest<T extends {id:string}>(players:T[],interests:PlayerInterest[],state:PlayerInterestState|null):T[]{if(!state)return players;const ids=new Set(interests.filter(x=>x.state===state).map(x=>x.playerId));return players.filter(x=>ids.has(x.id))}
export function interestBadge(interest?:PlayerInterest):string{return interest?`<span class="interest-tag interest-${interest.state.toLowerCase()}" title="Bounded user-context adjustment">${interestLabels[interest.state]}</span>`:''}
