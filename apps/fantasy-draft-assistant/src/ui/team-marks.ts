export type TeamMarkMotif = 'chevron' | 'diamond' | 'horizon' | 'orbit';

export interface TeamIdentity {
  name: string;
  initials: string;
  primary: string;
  secondary: string;
  motif: TeamMarkMotif;
}

/**
 * Original internal broadcast badges, intentionally distinct from official NFL/team artwork.
 * Official marks remain deferred until an approved, licensed asset source is available.
 */
export const TEAM_IDENTITIES = {
  ARI: ['Arizona', 'AZ', '#8f2942', '#d4a35f', 'diamond'], ATL: ['Atlanta', 'ATL', '#a93643', '#a5adb8', 'chevron'],
  BAL: ['Baltimore', 'BM', '#49377c', '#c6a34b', 'orbit'], BUF: ['Buffalo', 'BUF', '#2461a8', '#c43e4b', 'horizon'],
  CAR: ['Carolina', 'CAR', '#278cb8', '#aab5c2', 'diamond'], CHI: ['Chicago', 'CHI', '#243b62', '#c36a39', 'orbit'],
  CIN: ['Cincinnati', 'CIN', '#d26a2e', '#24262c', 'chevron'], CLE: ['Cleveland', 'CLE', '#a94f2c', '#5d392d', 'horizon'],
  DAL: ['Dallas', 'DAL', '#315b86', '#aebac5', 'diamond'], DEN: ['Denver', 'DEN', '#25538a', '#cf612f', 'chevron'],
  DET: ['Detroit', 'DET', '#3e87aa', '#aab8c3', 'horizon'], GB: ['Green Bay', 'GB', '#285a49', '#d0ae4c', 'orbit'],
  HOU: ['Houston', 'HOU', '#263e62', '#b53949', 'diamond'], IND: ['Indianapolis', 'IND', '#315b91', '#d6dde4', 'chevron'],
  JAX: ['Jacksonville', 'JAX', '#21878b', '#c39a4c', 'horizon'], KC: ['Kansas City', 'KC', '#ad3944', '#d2ae59', 'orbit'],
  LV: ['Las Vegas', 'LV', '#353b43', '#b8c0c9', 'diamond'], LAC: ['Los Angeles Chargers', 'LAC', '#337caf', '#e2ba4b', 'horizon'],
  LAR: ['Los Angeles Rams', 'LAR', '#315a9b', '#d5aa45', 'chevron'], MIA: ['Miami', 'MIA', '#258b8d', '#d27a3d', 'orbit'],
  MIN: ['Minnesota', 'MIN', '#5d4186', '#cba94b', 'diamond'], NE: ['New England', 'NE', '#334e74', '#b74654', 'horizon'],
  NO: ['New Orleans', 'NO', '#9c814b', '#292c31', 'chevron'], NYG: ['New York Giants', 'NYG', '#315d9b', '#b8424d', 'orbit'],
  NYJ: ['New York Jets', 'NYJ', '#286148', '#9cad9e', 'diamond'], PHI: ['Philadelphia', 'PHI', '#24615f', '#aab7be', 'chevron'],
  PIT: ['Pittsburgh', 'PIT', '#34373c', '#d2ad43', 'horizon'], SF: ['San Francisco', 'SF', '#a64048', '#b69a63', 'orbit'],
  SEA: ['Seattle', 'SEA', '#285474', '#58a65d', 'diamond'], TB: ['Tampa Bay', 'TB', '#963747', '#a68a66', 'horizon'],
  TEN: ['Tennessee', 'TEN', '#397ba2', '#b74451', 'chevron'], WAS: ['Washington', 'WAS', '#7e3545', '#c3a14d', 'orbit'],
} as const satisfies Record<string, readonly [string, string, string, string, TeamMarkMotif]>;

export type KnownTeamId = keyof typeof TEAM_IDENTITIES;
export const TEAM_IDS = Object.freeze(Object.keys(TEAM_IDENTITIES) as KnownTeamId[]);

export function teamIdentity(team?: string): TeamIdentity | undefined {
  const record = TEAM_IDENTITIES[team?.trim().toUpperCase() as KnownTeamId];
  if (!record) return undefined;
  const [name, initials, primary, secondary, motif] = record;
  return { name, initials, primary, secondary, motif };
}
