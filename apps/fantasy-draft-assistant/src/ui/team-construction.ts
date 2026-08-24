import type { DraftPlayer, SeasonSetup } from '../domain/models';
import { byeWeek, positionClass } from './live-room';

export interface TeamConstructionSlot {
  key: string;
  label: string;
  kind: 'starter' | 'bench';
  player?: DraftPlayer;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]!));

/** Expands the active season's roster and retains every empty configured slot. */
export function teamConstructionSlots(setup: SeasonSetup, players: DraftPlayer[]): TeamConstructionSlot[] {
  const remaining = [...players];
  const labelCounts = new Map<string, number>();
  return setup.rosterSlots.filter(definition => definition.kind !== 'ir').flatMap(definition =>
    Array.from({ length: definition.count }, () => {
      const instance = (labelCounts.get(definition.label) ?? 0) + 1;
      labelCounts.set(definition.label, instance);
      const playerIndex = definition.kind === 'bench'
        ? (remaining.length ? 0 : -1)
        : remaining.findIndex(player => definition.eligible.includes(player.position));
      const player = playerIndex < 0 ? undefined : remaining.splice(playerIndex, 1)[0];
      return { key: `${definition.label}-${instance}`, label: definition.label, kind: definition.kind === 'bench' ? 'bench' as const : 'starter' as const, ...(player ? { player } : {}) };
    })
  );
}

interface TeamConstructionMarkupInput {
  setup: SeasonSetup;
  players: DraftPlayer[];
  selectedTeamId: string;
  userTeamId: string;
  managerName: (teamId: string) => string;
}

/** The single render path for the Draft Room's Team Construction panel. */
export function teamConstructionMarkup({ setup, players, selectedTeamId, userTeamId, managerName }: TeamConstructionMarkupInput): string {
  const rows = teamConstructionSlots(setup, players).map(slot => slot.player
    ? `<button class="player-row roster-slot-row" data-roster-slot="${escapeHtml(slot.key)}" data-detail="${escapeHtml(slot.player.id)}"><span class="position-chip ${positionClass(slot.player.position)}">${escapeHtml(slot.label)}</span><b>${escapeHtml(slot.player.displayName)}</b><small>${escapeHtml(slot.player.nflTeam ?? 'NFL TBD')} · Bye ${byeWeek(slot.player) ?? '—'}</small></button>`
    : `<div class="player-row roster-slot-row roster-slot-empty" data-roster-slot="${escapeHtml(slot.key)}"><span class="position-chip">${escapeHtml(slot.label)}</span><b>Empty</b><small>${slot.kind === 'bench' ? 'Bench position' : 'Starter position'}</small></div>`
  ).join('');
  const selectedManager = escapeHtml(managerName(selectedTeamId));
  const options = setup.teams.map(team => `<option value="${escapeHtml(team.id)}" ${team.id === selectedTeamId ? 'selected' : ''}>${escapeHtml(managerName(team.id))}${team.id === userTeamId ? ' (You)' : ''}</option>`).join('');
  return `<aside class="roster-panel"><div class="panel-title"><div><small>TEAM CONSTRUCTION</small><h2>${selectedManager}</h2></div>${selectedTeamId !== userTeamId ? '<button id="my-team">MY TEAM</button>' : ''}</div><label>View manager<select id="team-switch">${options}</select></label><div class="roster-list" aria-label="${selectedManager} roster">${rows}</div></aside>`;
}
