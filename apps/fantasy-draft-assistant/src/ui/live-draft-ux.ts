import type { RankingRow } from './rankings';

export const PRIVACY_STORAGE_KEY = 'fantasy-draft-assistant:privacy';
export const HOF_REMINDER_STORAGE_KEY = 'fantasy-draft-assistant:fantasypros-hof-reminder-done';
export const HOF_CANCELLATION_DATE = '2026-09-12';

export type ReminderState = 'normal' | 'final-week' | 'due-today' | 'overdue';

export function reminderState(now: Date): ReminderState {
  const day = now.toISOString().slice(0, 10);
  if (day > HOF_CANCELLATION_DATE) return 'overdue';
  if (day === HOF_CANCELLATION_DATE) return 'due-today';
  return day >= '2026-09-05' ? 'final-week' : 'normal';
}

export function reminderMarkup(now: Date, completed: boolean): string {
  if (completed) return '';
  const state = reminderState(now);
  const label = state === 'due-today' ? 'FantasyPros HOF cancellation due today'
    : state === 'overdue' ? 'FantasyPros HOF cancellation overdue · Sep 12, 2026'
      : state === 'final-week' ? 'FantasyPros HOF cancellation due Sep 12'
        : 'REMINDER · Cancel FantasyPros HOF by Sep 12, 2026';
  return `<aside class="hof-reminder ${state}" role="status"><span>${label}</span><button id="hof-reminder-done">MARK DONE</button></aside>`;
}

/** A derived view: it never mutates or renumbers the imported ranking source. */
export function remainingEspnRows(rows: RankingRow[]): RankingRow[] {
  return rows.filter(row => row.available && row.espn?.overallRank != null)
    .sort((a, b) => a.espn!.overallRank! - b.espn!.overallRank!);
}

export function espnBoardMarkup(rows: RankingRow[], hasSource: boolean): string {
  if (!hasSource) return '<div class="espn-empty"><p>No ESPN PPR300 ranking source is active.</p><a href="#rankings-import">IMPORT ESPN PPR300</a></div>';
  return `<div class="espn-board-table" role="table"><div class="espn-board-row header" role="row"><b>ESPN</b><b>PLAYER</b><b>POS</b><b>TEAM</b><b>STATUS</b></div>${remainingEspnRows(rows).map(row => `<div class="espn-board-row" role="row" data-espn-player="${row.player.id}"><b>${row.espn!.overallRank}</b><strong>${row.player.displayName}</strong><span>${row.player.position}</span><span>${row.player.nflTeam ?? '—'}</span><span>AVAILABLE</span></div>`).join('')}</div>`;
}
