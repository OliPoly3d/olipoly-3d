import { describe, expect, it } from 'vitest';
import { emptyPhilosophy } from '../domain/user-context';
import { seedSetup } from '../domain/seeds';
import { leagueDashboardMarkup } from './league-dashboard';

describe('league dashboard', () => {
  const setup = seedSetup('believeland');
  const markup = leagueDashboardMarkup({ setup, philosophy: emptyPhilosophy(setup.league.id, setup.season.id), interests: [], intents: [] });

  it('makes Draft Room the single primary action and renders the supporting cockpit cards', () => {
    expect(markup).toContain('class="primary-action"');
    expect(markup).toContain('ENTER DRAFT ROOM');
    expect(markup).toContain('STRATEGY');
    expect(markup).toContain('RANKINGS &amp; DATA');
  });

  it('uses equal administration actions instead of an underlined directory', () => {
    expect(markup).toContain('class="command-links"');
    for (const action of ['LEAGUE SETTINGS', 'TEAMS &amp; MANAGERS', 'DRAFT ORDER', 'PICK OWNERSHIP']) expect(markup).toContain(action);
  });

  it('keeps source status in Rankings & Data and removes developer diagnostics', () => {
    expect(markup).toContain('FANTASYPROS');
    expect(markup).toContain('ESPN');
    expect(markup).not.toContain('data-status');
    expect(markup).not.toContain('Backup, restore');
    expect(markup).not.toContain('AUTO REFRESH');
  });

  it('uses current setup values rather than fixed league dimensions', () => {
    const custom = { ...setup, settings: { ...setup.settings, ppr: .5 }, draft: { ...setup.draft, teamCount: 10 }, rosterSlots: setup.rosterSlots.map((slot, index) => index === 0 ? { ...slot, count: 2 } : slot) };
    const customMarkup = leagueDashboardMarkup({ setup: custom, philosophy: emptyPhilosophy(custom.league.id, custom.season.id), interests: [], intents: [] });
    expect(customMarkup).toContain('Half PPR · 10 teams · 17 roster');
    expect(customMarkup).not.toContain('PPR · 12 teams · 16 roster');
  });
});
