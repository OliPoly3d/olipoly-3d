import type { DraftPlayer, DraftState, Position, SeasonSetup } from '../domain/models';

export interface RecommendationViewModel {
  playerId: string;
  order: 1 | 2 | 3;
  recommendationType: 'PRIMARY' | 'SECONDARY' | 'VALUE';
  headlineReason: string;
  costOfWaitingLabel: string;
  confidence: 'HIGH' | 'MED' | 'LOW';
  badges: string[];
  sourceLabel: 'FIXTURE PREVIEW';
}

export const positionClass = (position: Position) => `position-${position.replace('/', '').toLowerCase()}`;
export const byeWeek = (player: DraftPlayer) => 5 + Math.abs([...player.id].reduce((n, char) => n + char.charCodeAt(0), 0)) % 10;

export type ConfidenceLevel = RecommendationViewModel['confidence'];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]!));

/** Reserved logo surface. Approved assets can replace the monogram without changing consumers. */
export function teamMark(team?: string, size: 'compact' | 'standard' = 'standard'): string {
  const label = team?.trim().toUpperCase() || 'NFL';
  return `<span class="team-mark team-mark-${size}" role="img" aria-label="${escapeHtml(label)} team mark">${escapeHtml(label)}</span>`;
}

/** Categorical by default; numeric values are only rendered when explicitly marked as preview. */
export function confidenceRing(value: ConfidenceLevel | number, preview = false): string {
  const numeric = typeof value === 'number';
  const label = numeric ? `${Math.max(0, Math.min(100, Math.round(value)))}%` : value;
  const modifier = numeric ? 'numeric' : value.toLowerCase();
  return `<div class="confidence" aria-label="${label} confidence${preview ? ', preview' : ''}"><span class="confidence-ring confidence-${modifier}"><b>${label}</b></span><small>CONFIDENCE${preview ? ' · PREVIEW' : ''}</small></div>`;
}

export function previewRecommendations(available: DraftPlayer[]): RecommendationViewModel[] {
  const reasons = ['First available fixture player', 'Alternative position profile', 'Value option from fixture order'];
  const waiting = ['Tier risk if you wait', 'Comparable options remain', 'Likely available later'];
  return available.slice(0, 3).map((player, index) => ({
    playerId: player.id,
    order: (index + 1) as 1 | 2 | 3,
    recommendationType: (['PRIMARY', 'SECONDARY', 'VALUE'] as const)[index],
    headlineReason: reasons[index],
    costOfWaitingLabel: waiting[index],
    confidence: (['HIGH', 'MED', 'LOW'] as const)[index],
    badges: [],
    sourceLabel: 'FIXTURE PREVIEW',
  }));
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
