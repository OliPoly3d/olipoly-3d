import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('premium visual system contract', () => {
  it('centralizes surface, accent, glow, radius, and shadow tokens', () => {
    for (const token of ['--surface-0','--surface-raised','--accent-teal','--accent-purple','--glow-gold','--radius-lg','--shadow-panel','--shadow-button']) {
      expect(css).toContain(token);
    }
  });

  it('keeps distinct recommendation roles while alerts and preferences remain additive', () => {
    expect(main).toContain('recommendation-role-${r.recommendationType');
    expect(main).toContain('interestBadge(interests.find');
    expect(main).toContain('player-alert alert-${alert.severity');
    expect(css).toContain('.recommendation-role-best-pick');
    expect(css).toContain('.recommendation-role-alternative');
    expect(css).toContain('.recommendation-role-best-value');
  });

  it('preserves three-card tablet presentation, bounded chat, privacy replacement, and reduced motion', () => {
    expect(css).toContain('.recommendations{grid-template-columns:repeat(3,minmax(0,1fr))');
    expect(css).toMatch(/\.conversation\{height:min\(620px,calc\(100vh - 196px\)\)/);
    expect(css).toContain('.privacy-enabled .cockpit');
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
    expect(main).toContain('recentPicksMarkup(state,managerName)');
    expect(main).toContain('id="more-options"');
  });
});
