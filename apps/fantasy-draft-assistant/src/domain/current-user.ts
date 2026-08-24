import type { SeasonSetup } from './models';

/** Stable application-user assignments. Team IDs are deliberately season and league specific. */
export const CURRENT_USER_ASSIGNMENTS = {
  'season-believeland-2026': { managerId: 'manager-believeland-8', teamId: 'team-believeland-8' },
  'season-robocop-2026': { managerId: 'manager-robocop-6', teamId: 'team-robocop-6' },
} as const;

export function currentUserTeamId(setup: SeasonSetup): string {
  const assignment = CURRENT_USER_ASSIGNMENTS[setup.season.id as keyof typeof CURRENT_USER_ASSIGNMENTS];
  const configuredManagerId = setup.settings.metadata?.userManagerId;
  const managerId = assignment?.managerId ?? (typeof configuredManagerId === 'string' ? configuredManagerId : undefined);
  const team = setup.teams.find(candidate => candidate.managerId === managerId && candidate.seasonId === setup.season.id);
  if (!managerId || !team || (assignment && team.id !== assignment.teamId)) {
    throw new Error(`Current-user identity is not configured for ${setup.season.id}.`);
  }
  return team.id;
}

/** Repairs old IndexedDB setup records without changing participants, draft order, or ownership. */
export function reconcileCurrentUserIdentity(setup: SeasonSetup): SeasonSetup {
  const assignment = CURRENT_USER_ASSIGNMENTS[setup.season.id as keyof typeof CURRENT_USER_ASSIGNMENTS];
  if (!assignment) return setup;
  const manager = setup.managers.find(candidate => candidate.id === assignment.managerId);
  const team = setup.teams.find(candidate => candidate.id === assignment.teamId && candidate.managerId === assignment.managerId);
  if (!manager || !team) throw new Error(`Current-user franchise is missing from ${setup.season.id}.`);
  if (setup.settings.metadata?.userManagerId === assignment.managerId) return setup;
  return { ...setup, settings: { ...setup.settings, metadata: { ...setup.settings.metadata, userManagerId: assignment.managerId } } };
}

export function validRosterViewTeamId(setup: SeasonSetup, persistedTeamId: string | null): string {
  return setup.teams.some(team => team.id === persistedTeamId && team.seasonId === setup.season.id && team.active)
    ? persistedTeamId!
    : currentUserTeamId(setup);
}
