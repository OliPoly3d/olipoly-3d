import { describe, expect, it } from 'vitest';
import { HOF_CANCELLATION_DATE, espnBoardMarkup, remainingEspnRows, reminderMarkup, reminderState } from './live-draft-ux';
import type { RankingRow } from './rankings';

const row = (rank: number | undefined, available = true, name = `Player ${rank ?? 'none'}`): RankingRow => ({
  player: { id: name, canonicalPlayerId: name, displayName: name, normalizedName: name.toLowerCase(), position: 'RB', nflTeam: 'CLE' },
  market: { overallRank: rank ?? 400, positionRank: 1, tier: 1, source: 'FantasyPros', sourceClass: 'ANALYST_INTERPRETATION', updatedAt: '', scoringFormat: 'PPR', freshness: 'FRESH' },
  espn: rank == null ? undefined : { overallRank: rank, positionRank: 1, tier: 1, source: 'ESPN', sourceClass: 'ANALYST_INTERPRETATION', updatedAt: '', scoringFormat: 'PPR', freshness: 'FRESH' },
  available,
});

describe('live ESPN board', () => {
  it('shows only available genuine ESPN rows and preserves gaps/original ranks', () => {
    const rows = remainingEspnRows([row(25), row(26, false), row(27, false), row(28), row(undefined)]);
    expect(rows.map(item => item.espn?.overallRank)).toEqual([25, 28]);
    expect(espnBoardMarkup(rows, true)).toContain('>28<');
    expect(espnBoardMarkup(rows, true)).not.toContain('>27<');
  });
  it('restores the original rank when availability changes (undo/correction)', () => {
    expect(remainingEspnRows([row(28, false)])).toHaveLength(0);
    expect(remainingEspnRows([row(28, true)])[0].espn?.overallRank).toBe(28);
  });
  it('offers import without fabricating fallback ESPN values', () => {
    expect(espnBoardMarkup([], false)).toContain('IMPORT ESPN PPR300');
    expect(espnBoardMarkup([row(undefined)], true)).not.toContain('301');
  });
});

describe('HOF reminder', () => {
  it('uses the requested date and timing states', () => {
    expect(HOF_CANCELLATION_DATE).toBe('2026-09-12');
    expect(reminderState(new Date('2026-09-04T12:00:00Z'))).toBe('normal');
    expect(reminderState(new Date('2026-09-05T12:00:00Z'))).toBe('final-week');
    expect(reminderState(new Date('2026-09-12T12:00:00Z'))).toBe('due-today');
    expect(reminderState(new Date('2026-09-13T12:00:00Z'))).toBe('overdue');
    expect(reminderMarkup(new Date('2026-08-15T12:00:00Z'), true)).toBe('');
  });
});
