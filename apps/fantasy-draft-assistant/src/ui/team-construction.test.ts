import { describe, expect, it } from 'vitest';
import { makePick, rebuildDraftState, startDraft } from '../domain/engine';
import { playerPool, seedSetup } from '../domain/seeds';
import { currentUserTeamId } from '../domain/current-user';
import type { DraftPlayer, SeasonSetup } from '../domain/models';
import { teamConstructionMarkup } from './team-construction';

const managerName = (setup: SeasonSetup) => (teamId: string) => {
  const managerId = setup.teams.find(team => team.id === teamId)?.managerId;
  return setup.managers.find(manager => manager.id === managerId)?.displayName ?? 'Unknown';
};
const render = (setup: SeasonSetup, players: DraftPlayer[] = [], teamId = currentUserTeamId(setup)) =>
  teamConstructionMarkup({ setup, players, selectedTeamId: teamId, userTeamId: currentUserTeamId(setup), managerName: managerName(setup) });
const rows = (markup: string) => markup.match(/data-roster-slot=/g) ?? [];
const empties = (markup: string) => markup.match(/<b>Empty<\/b>/g) ?? [];
const labels = (markup: string) => [...markup.matchAll(/<span class="position-chip(?: [^"]*)?">([^<]+)<\/span>/g)].map(match => match[1]);
const quantities = (markup: string) => Object.fromEntries([...new Set(labels(markup))].map(label => [label, labels(markup).filter(value => value === label).length]));
const rules = (setup: SeasonSetup) => ({ positionLimits: structuredClone(setup.positionLimits), draft: structuredClone(setup.draft) });

describe('Team Construction panel', () => {
  it('renders all 20 empty RoboCop positions from SeasonSetup', () => {
    const setup = seedSetup('robocop'), before = rules(setup), markup = render(setup);
    expect(markup).not.toContain('No players yet');
    expect(rows(markup)).toHaveLength(20);
    expect(empties(markup)).toHaveLength(20);
    expect(quantities(markup)).toEqual({ QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, DP: 2, 'D/ST': 1, K: 1, Bench: 8 });
    expect(markup).toContain('data-roster-slot="RB-1"');
    expect(markup).toContain('data-roster-slot="RB-2"');
    expect(rules(setup)).toEqual(before);
  });

  it('places three RoboCop keepers while retaining 17 visible empty positions', () => {
    const seeded = seedSetup('robocop');
    const setup = { ...seeded, keeperLock: { ...seeded.keeperLock, status: 'locked' as const } };
    const beforeRules = rules(setup), state = rebuildDraftState(startDraft(setup, playerPool(), true));
    const teamId = currentUserTeamId(setup), roster = state.rosters[teamId];
    const beforeState = { keepers: roster.keepers.map(player => player.id), available: state.available.map(player => player.id) };
    const markup = render(setup, roster.combined, teamId);
    expect(rows(markup)).toHaveLength(20);
    expect(empties(markup)).toHaveLength(17);
    expect(['Josh Allen', 'Drake London', 'Jaxon Smith-Njigba'].every(name => markup.includes(name))).toBe(true);
    expect({ keepers: roster.keepers.map(player => player.id), available: state.available.map(player => player.id) }).toEqual(beforeState);
    expect(rules(setup)).toEqual(beforeRules);
  });

  it('renders all 16 empty Believeland positions without defensive-player rows', () => {
    const setup = seedSetup('believeland'), before = rules(setup), markup = render(setup);
    expect(markup).not.toContain('No players yet');
    expect(rows(markup)).toHaveLength(16);
    expect(empties(markup)).toHaveLength(16);
    expect(quantities(markup)).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, 'D/ST': 1, K: 1, Bench: 6 });
    expect(labels(markup)).not.toContain('DP');
    expect(rules(setup)).toEqual(before);
  });

  it('keeps every Believeland row when the selected team is partially drafted', () => {
    const setup = seedSetup('believeland');
    let context = startDraft(setup, playerPool());
    context = makePick(context, playerPool().find(player => player.position === 'RB')!.id);
    const state = rebuildDraftState(context), pickedTeam = state.activePicks[0].plan.currentTeamId;
    const markup = render(setup, state.rosters[pickedTeam].combined, pickedTeam);
    expect(rows(markup)).toHaveLength(16);
    expect(empties(markup)).toHaveLength(15);
    expect(markup).toContain(state.activePicks[0].player.displayName);
  });

  it('switches and restores league templates without leaking rules or current-user identity', () => {
    const robocop = structuredClone(seedSetup('robocop')), believeland = structuredClone(seedSetup('believeland'));
    const roboRules = rules(robocop), belieRules = rules(believeland);
    const roboMarkup = render(robocop), belieMarkup = render(believeland), restoredRoboMarkup = render(structuredClone(robocop));
    expect([rows(roboMarkup).length, rows(belieMarkup).length, rows(restoredRoboMarkup).length]).toEqual([20, 16, 20]);
    expect(quantities(roboMarkup)).toMatchObject({ DP: 2, FLEX: 1, Bench: 8 });
    expect(quantities(belieMarkup)).toMatchObject({ FLEX: 2, Bench: 6 });
    expect(labels(belieMarkup)).not.toContain('DP');
    expect(currentUserTeamId(robocop)).not.toBe(currentUserTeamId(believeland));
    expect(rules(robocop)).toEqual(roboRules);
    expect(rules(believeland)).toEqual(belieRules);
  });
});
