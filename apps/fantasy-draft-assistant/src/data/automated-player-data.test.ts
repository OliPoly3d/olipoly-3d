import { describe, expect, it } from 'vitest'
import { normalizeFantasyPros } from './automated-player-data'

const fetchedAt = '2026-08-15T12:00:00.000Z'
const payloads = { players: { players: [
  { player_id: 1, player_name: 'José Test Jr.', player_team_id: 'JAC', player_position_id: 'RB', bye_week: 8 },
  { player_id: 2, player_name: 'Edge Test', player_team_id: 'WSH', player_position_id: 'EDGE' },
] }, rankings: { rankings: [
  { player_id: 1, rank_ecr: 10, pos_rank: 'RB3', tier: 2, adp: 12.5, rank_min: 7, rank_max: 16, rank_std: 2.1, updated_at: fetchedAt },
  { player_id: 2, rank_ecr: 4, pos_rank: 'DL2', tier: 1, updated_at: fetchedAt },
] }, news: { news: [{ news_id: 3, player_id: 1, title: 'Player ruled out', summary: 'Will not play this week.', published_at: fetchedAt, source: 'Team report' }] }, injuries: { injuries: [{ player_id: 1, designation: 'IR', body_part: 'Knee', practice_status: 'DNP', updated_at: fetchedAt }] } }

describe('automated player data', () => {
  it('normalizes FantasyPros identity, PPR ECR, tiers, ADP, news, and injuries', () => {
    const snapshot = normalizeFantasyPros(payloads, { fetchedAt, scoringFormat:'PPR', season:2026, includeIdp:true, sleeper:{ sleeper1:{ player_id:'sleeper1', fantasy_data_id:1, full_name:'Jose Test', team:'JAX', position:'RB', active:true } } })
    const player = snapshot.players[1]
    expect(player).toMatchObject({ fantasyProsPlayerId:'1', sleeperPlayerId:'sleeper1', normalizedName:'jose test', nflTeam:'JAX', position:'RB', baselineRank:10, positionRank:3, tier:2, adp:12.5, availabilityStatus:'IR' })
    expect(player.sourceValues[0]).toMatchObject({ source:'FantasyPros ECR', scoringFormat:'PPR', rankSpread:9, standardDeviation:2.1, rankingClass:'OFFENSE' })
    expect(player.newsItems[0]).toMatchObject({ headline:'Player ruled out', materiality:'HIGH' }); expect(player.injury).toMatchObject({ bodyArea:'Knee', practiceParticipation:'DNP' })
    expect(snapshot.rankingSource).toBe('FANTASYPROS ECR')
  })
  it('keeps IDP typed and separate from offensive ECR', () => {
    const snapshot = normalizeFantasyPros(payloads, { fetchedAt, scoringFormat:'PPR', season:2026, includeIdp:true })
    expect(snapshot.players[0]).toMatchObject({ position:'DL', idp:{ rank:4, tier:1 } }); expect(snapshot.players[0].sourceValues[0]).toMatchObject({ scoringFormat:'IDP', rankingClass:'IDP' }); expect(snapshot.quality).toBe('PARTIAL')
  })
  it('preserves a prior real snapshot by rejecting incomplete FantasyPros refreshes', () => {
    expect(() => normalizeFantasyPros({ ...payloads, rankings:{} }, { fetchedAt, scoringFormat:'PPR', season:2026, includeIdp:false })).toThrow(/atomic snapshot/)
  })
  it('records only material changes', () => {
    const first = normalizeFantasyPros(payloads, { fetchedAt, scoringFormat:'PPR', season:2026, includeIdp:true })
    const changed = structuredClone(payloads); changed.rankings.rankings[0].rank_ecr = 30
    const next = normalizeFantasyPros(changed, { fetchedAt:'2026-08-15T13:00:00.000Z', scoringFormat:'PPR', season:2026, includeIdp:true, previous:first })
    expect(next.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field:'baselineRank', before:10, after:30 })]))
  })
})
