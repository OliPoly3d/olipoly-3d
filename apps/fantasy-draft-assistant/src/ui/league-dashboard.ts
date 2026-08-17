import type { DraftState, PlayerInterest, SeasonSetup, StrategicIntent, DraftPhilosophy } from '../domain/models';
import type { PlayerDataSnapshot } from '../data/player-data';

export interface LeagueDashboardInput {
  setup: SeasonSetup;
  state?: DraftState;
  philosophy: DraftPhilosophy;
  interests: PlayerInterest[];
  intents: StrategicIntent[];
  playerData?: PlayerDataSnapshot;
  espnPlayerCount?: number;
  nextOwnedPick?: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const rosterSize = (setup: SeasonSetup) => setup.rosterSlots.filter(slot => slot.kind !== 'ir').reduce((total, slot) => total + slot.count, 0);
const format = (setup: SeasonSetup) => setup.settings.ppr === 1 ? 'PPR' : setup.settings.ppr === .5 ? 'Half PPR' : 'Standard';

export function leagueDashboardMarkup(input: LeagueDashboardInput): string {
  const { setup, state, philosophy, interests, intents, playerData, espnPlayerCount, nextOwnedPick } = input;
  const slug = escapeHtml(setup.league.slug);
  const status = state?.status ?? 'NOT STARTED';
  const current = state?.current;
  const complete = status === 'COMPLETED';
  const playerCount = playerData?.players.length ?? 0;
  const updated = playerData ? new Date(playerData.createdAt).toLocaleString() : 'Not refreshed';
  const freshness = playerData ? `${playerData.freshness === 'FRESH' ? 'Fresh' : 'Needs refresh'} · ${playerCount} players` : 'No shared snapshot';
  return `<main class="league-command">
    <a class="league-back" href="#/">← Leagues</a>
    <header class="league-identity">
      <div><p class="eyebrow">${setup.season.year} · ${status}</p><h1>${escapeHtml(setup.league.name)}</h1></div>
      <p>Head-to-Head Points · ${format(setup)} · ${setup.draft.teamCount} teams · ${rosterSize(setup)} roster</p>
    </header>
    <section class="command-primary" aria-labelledby="live-draft-title">
      <div><div class="section-heading"><h2 id="live-draft-title">LIVE DRAFT</h2><span class="status-chip">${status}</span></div>
      <p>${complete ? 'Draft complete' : current ? `Round ${current.round} · Pick ${current.pickInRound} · Overall ${current.overallPick}` : 'Ready when your league is'}</p>
      ${!complete && nextOwnedPick ? `<small>YOUR NEXT OWNED PICK · ${escapeHtml(nextOwnedPick)}</small>` : ''}</div>
      <a class="primary-action" href="#/${slug}/draft">${complete ? 'VIEW DRAFT ROOM' : 'ENTER DRAFT ROOM'}</a>
    </section>
    <div class="command-grid command-support">
      <section class="strategy-card"><div class="section-heading"><h2>STRATEGY</h2><span class="status-chip">PERSONAL</span></div>
        <div class="dashboard-metrics"><span><b>${philosophy.preferences.length}</b><small>PHILOSOPHY</small></span><span><b>${interests.length}</b><small>PLAYER INTERESTS</small></span><span><b>${intents.filter(intent => intent.status === 'ACTIVE').length}</b><small>ACTIVE INTENTS</small></span></div>
        <a class="dashboard-button" href="#/${slug}/philosophy">REVIEW PHILOSOPHY</a>
      </section>
      <section class="rankings-data-card"><div class="section-heading"><h2>RANKINGS &amp; DATA</h2><span class="status-chip">SOURCES</span></div>
        <div class="source-grid"><div><small>FANTASYPROS</small><b>${freshness}</b><span>Last refresh ${updated}</span></div><div><small>ESPN</small><b>${espnPlayerCount == null ? 'Not imported' : 'PPR300 active'}</b><span>${espnPlayerCount == null ? 'Import from Rankings' : `${espnPlayerCount} player ranks`}</span></div></div>
        <div class="card-actions"><a class="dashboard-button" href="#/${slug}/rankings">RANKINGS</a><button class="dashboard-button" id="dashboard-refresh">REFRESH PLAYER DATA</button></div><p id="dashboard-refresh-status" role="status" aria-live="polite"></p>
      </section>
    </div>
    <div class="command-grid command-secondary">
      <section class="administration-card"><div class="section-heading"><h2>LEAGUE ADMINISTRATION</h2><span class="status-chip muted-chip">SETUP</span></div><div class="command-links">
        <a href="#/${slug}/settings">LEAGUE SETTINGS</a><a href="#/${slug}/managers">TEAMS &amp; MANAGERS</a><a href="#/${slug}/order">DRAFT ORDER</a><a href="#/${slug}/ownership">PICK OWNERSHIP</a>${setup.draft.keeperCount?`<a href="#/${slug}/keepers">KEEPERS</a>`:''}
      </div></section>
      <section class="secondary-tools"><div class="section-heading"><h2>TOOLS</h2><span class="status-chip muted-chip">REFERENCE</span></div><a class="dashboard-button quiet-button" href="#/${slug}/board">DRAFT BOARD</a></section>
    </div>
  </main>`;
}
