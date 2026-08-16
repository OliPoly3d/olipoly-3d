import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RECENT_PICK_LIMIT } from './live-room';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('iPad landscape cockpit readability contract', () => {
  it('keeps important and secondary cockpit text above the chosen thresholds', () => {
    expect(css).toMatch(/\.reason\{[^}]*font-size:13px/);
    expect(css).toMatch(/\.rec-copy p\{[^}]*font-size:12px/);
    expect(css).toMatch(/\.messages p\{[^}]*font-size:13px/);
    expect(css).toMatch(/\.recent \.recent-pick>small\{[^}]*font-size:11px/);
  });
  it('wraps readable player names, keeps bounded chat, and retains the composer', () => {
    expect(css).toContain('white-space:normal;overflow-wrap:normal;word-break:normal');
    expect(css).toMatch(/\.conversation\{height:min\(620px,calc\(100vh - 196px\)\)/);
    expect(css).toContain('.messages{min-height:0;overflow-y:auto');
    expect(main).toContain('<form id="chat-form">');
  });
  it('keeps three primary recommendations, Last 4, alerts and preference badges without repeated card provenance', () => {
    expect(main).toContain('recommendations=intelligence.recommendations');
    expect(main).toContain('playerAlert(p)');
    expect(main).toContain('interestBadge(interests.find');
    expect(RECENT_PICK_LIMIT).toBe(4);
    expect(main).not.toContain('<span class="fixture">${r.sourceLabel}</span>');
  });
});
