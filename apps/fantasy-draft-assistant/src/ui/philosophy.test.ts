import { describe, expect, it } from 'vitest';
import { emptyPhilosophy, setPreference } from '../domain/user-context';
import { playerPool } from '../domain/seeds';
import { philosophyWorkspaceMarkup, positionCategory } from './philosophy';

describe('strategy control center', () => {
  it('renders saved position strategy, truthful authority labels, player groups, and separate live adjustments', () => {
    const base = emptyPhilosophy('l', 's');
    const philosophy = setPreference(base, { category: positionCategory('QB'), label: 'QB', value: 'WAIT — unless value falls', source: 'USER_SELECTED' });
    const player = playerPool()[0];
    const markup = philosophyWorkspaceMarkup({ slug: 'believeland', philosophy, players: [player], interests: [{ id:'p', leagueId:'l', seasonId:'s', playerId:player.id, state:'INTERESTED', updatedAt:'' }], intents: [{ id:'i', leagueId:'l', seasonId:'s', text:'Wait on QB', category:'CUSTOM', status:'ACTIVE', createdAt:'', updatedAt:'' }] });
    expect(markup).toContain('YOUR DRAFT PLAN');
    expect(markup).toContain('WAIT — unless value falls');
    expect(markup).toContain('AFFECTS DRAFT FIT');
    expect(markup).toContain('AI CONTEXT');
    expect(markup).toContain(player.displayName);
    expect(markup).toContain('data-intent-form="i"');
    expect(markup).toContain('RESET PHILOSOPHY');
  });
  it('does not fabricate an unconfigured plan', () => {
    const markup = philosophyWorkspaceMarkup({ slug:'robocop', philosophy:emptyPhilosophy('l','s'), players:[], interests:[], intents:[] });
    expect(markup).toContain('NO PLAN CONFIGURED');
    expect(markup).toContain('Not configured');
    expect(markup).not.toContain('BALANCED BUILD');
  });
});
