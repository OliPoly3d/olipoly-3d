import type { DraftPlayer, DraftState, Position, SeasonSetup } from '../domain/models';

export interface RecommendationViewModel {
  playerId: string;
  order: 1 | 2 | 3;
  recommendationType: 'PRIMARY' | 'SECONDARY' | 'VALUE';
  headlineReason: string;
  costOfWaitingLabel: string;
  confidence: 'Preview only';
  badges: string[];
  sourceLabel: 'FIXTURE PREVIEW';
}

export const positionClass = (position: Position) => `position-${position.replace('/', '').toLowerCase()}`;
export const byeWeek = (player: DraftPlayer) => 5 + Math.abs([...player.id].reduce((n, char) => n + char.charCodeAt(0), 0)) % 10;

export function previewRecommendations(available: DraftPlayer[]): RecommendationViewModel[] {
  const reasons = ['First available fixture player', 'Alternative position profile', 'Value option from fixture order'];
  const waiting = ['Tier risk if you wait', 'Comparable options remain', 'Likely available later'];
  return available.slice(0, 3).map((player, index) => ({
    playerId: player.id,
    order: (index + 1) as 1 | 2 | 3,
    recommendationType: (['PRIMARY', 'SECONDARY', 'VALUE'] as const)[index],
    headlineReason: reasons[index],
    costOfWaitingLabel: waiting[index],
    confidence: 'Preview only',
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
