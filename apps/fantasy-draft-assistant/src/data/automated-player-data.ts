import type { Position } from '../domain/models'
import { canonicalPlayerId, freshnessAt, isIdpPosition, normalizeByeWeek, normalizePlayerName, normalizePosition, normalizeTeam, snapshotId, type AvailabilityStatus, type Confidence, type DataQuality, type PlayerContextChange, type PlayerDataSnapshot, type PlayerIntelligence, type PlayerNewsItem, type RankingValue, type ScoringFormat, type SourceReference } from './player-data'

type JsonRecord = Record<string, unknown>
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
const list = (value: unknown, keys: string[]): JsonRecord[] => {
  if (Array.isArray(value)) return value.map(record)
  const root = record(value)
  for (const key of keys) if (Array.isArray(root[key])) return (root[key] as unknown[]).map(record)
  const nested = record(root.data)
  for (const key of keys) if (Array.isArray(nested[key])) return (nested[key] as unknown[]).map(record)
  return []
}
const text = (row: JsonRecord, ...keys: string[]) => { for (const key of keys) { const value = row[key]; if (typeof value === 'string' && value.trim()) return value.trim(); if (typeof value === 'number') return String(value) } }
const number = (row: JsonRecord, ...keys: string[]) => { const value = text(row, ...keys); if (value == null) return undefined; const parsed = Number(value.replace(/^\D+/, '')); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined }
const iso = (value: string | undefined, fallback: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback
const fpSource = (updatedAt: string, fetchedAt: string): SourceReference => ({ source: 'FantasyPros API', sourceClass: 'ANALYST_INTERPRETATION', updatedAt, fetchedAt, reference: 'FantasyPros Public API v2' })

export interface FantasyProsPayloads { players: unknown; rankings: unknown | unknown[]; news: unknown; injuries: unknown }
export interface NormalizeOptions { fetchedAt: string; scoringFormat: ScoringFormat; season: number; includeIdp: boolean; sleeper?: unknown; previous?: PlayerDataSnapshot }

/** FantasyPros Public API v2 scoring literals supported by this integration. */
export function fantasyProsScoringParameter(format:ScoringFormat):'STD'|'HALF'|'PPR'{
  if(format==='STANDARD')return'STD';
  if(format==='HALF_PPR')return'HALF';
  if(format==='PPR')return'PPR';
  throw new Error(`FantasyPros does not support offensive scoring format ${format}.`);
}

export const fantasyProsOffensiveRankingPositions = ['QB','RB','WR','TE','K','DST'] as const
export const fantasyProsRequiredRankingPositions = ['QB','RB','WR','TE'] as const
export type FantasyProsRankingPool = typeof fantasyProsOffensiveRankingPositions[number] | 'IDP'
export type RankingPoolDiagnostic = { status:'ok'|'empty'|'failed'; count:number; error?:string }

export function fantasyProsRankingPoolDiagnostics(rankings:unknown|unknown[],includeIdp:boolean):Record<string,RankingPoolDiagnostic>{
  const payloads=Array.isArray(rankings)?rankings:[rankings]
  const names:FantasyProsRankingPool[]=[...fantasyProsOffensiveRankingPositions,...(includeIdp?['IDP' as const]:[])]
  return Object.fromEntries(names.map((name,index)=>{const payload=record(payloads[index]);const error=text(payload,'__poolError');const count=list(payloads[index],['rankings','players']).length;return[name,error?{status:'failed',count,error}:{status:count?'ok':'empty',count}]}))
}

/** Request provider position pools. These calls provide position-relative ranks, not overall ECR. */
export function fantasyProsRankingPaths(season:number, format:ScoringFormat, includeIdp:boolean):string[]{
  const scoring=fantasyProsScoringParameter(format)
  const paths=fantasyProsOffensiveRankingPositions.map(position=>`/nfl/${season}/consensus-rankings?${new URLSearchParams({position,scoring})}`)
  if(includeIdp)paths.push(`/nfl/${season}/consensus-rankings?${new URLSearchParams({position:'IDP'})}`)
  return paths
}

const availability = (value?: string): AvailabilityStatus => {
  const normalized = value?.trim().toUpperCase().replace(/[ -]+/g, '_')
  const values: AvailabilityStatus[] = ['ACTIVE','QUESTIONABLE','DOUBTFUL','OUT','OUT_FOR_SEASON','PUP','IR','SUSPENDED','HOLDOUT','RETIRED','NOT_IN_PLAYER_POOL','OTHER','UNKNOWN']
  return values.includes(normalized as AvailabilityStatus) ? normalized as AvailabilityStatus : normalized === 'INJURED_RESERVE' ? 'IR' : 'UNKNOWN'
}
const materiality = (headline: string, category?: string): 'HIGH'|'MED'|'LOW' => /\b(out|ir|injur|suspend|trade|starter)\b/i.test(`${category ?? ''} ${headline}`) ? 'HIGH' : 'MED'

export function normalizeFantasyPros(payloads: FantasyProsPayloads, options: NormalizeOptions): PlayerDataSnapshot {
  const players = list(payloads.players, ['players'])
  const rankingPayloads = Array.isArray(payloads.rankings) ? payloads.rankings : [payloads.rankings]
  const diagnostics=fantasyProsRankingPoolDiagnostics(rankingPayloads,options.includeIdp)
  const rankingPools = rankingPayloads.map(payload => list(payload, ['rankings', 'players']))
  for (const position of fantasyProsRequiredRankingPositions) {
    const diagnostic=diagnostics[position]
    if(diagnostic.status==='failed')throw new Error(`Required FantasyPros ${position} ranking pool failed: ${diagnostic.error}`)
    if(diagnostic.status!=='ok')throw new Error(`Required FantasyPros ${position} ranking pool was empty.`)
  }
  if(options.includeIdp&&diagnostics.IDP.status==='failed')throw new Error(`Required FantasyPros IDP ranking pool failed: ${diagnostics.IDP.error}`)
  if(options.includeIdp&&diagnostics.IDP.status!=='ok')throw new Error('Required FantasyPros IDP ranking pool was empty.')
  const rankings = rankingPools.flatMap((pool,poolIndex)=>pool.map(row=>({row,poolIndex})))
  if (!players.length || !rankings.length) throw new Error('FantasyPros players and rankings are required for an atomic snapshot.')
  // A position-filtered rank_ecr resets within every pool. Only a previously
  // activated, collision-free overall snapshot is comparable across positions.
  const previousOffense=options.previous?.players.filter(player=>!isIdpPosition(player.position)&&player.baselineRank!=null)??[]
  const previousRanks=new Map<number,string>(),previousGlobalRanks=new Map<string,number>();let previousIsGlobal=previousOffense.length>0
  for(const player of previousOffense){const rank=player.baselineRank!;if(previousRanks.has(rank)&&previousRanks.get(rank)!==player.canonicalPlayerId){previousIsGlobal=false;break}previousRanks.set(rank,player.canonicalPlayerId);if(player.fantasyProsPlayerId)previousGlobalRanks.set(player.fantasyProsPlayerId,rank);previousGlobalRanks.set(player.canonicalPlayerId,rank)}
  if(!previousIsGlobal)previousGlobalRanks.clear()
  const byFp = new Map<string, PlayerIntelligence>()
  const previousByFp=new Map(options.previous?.players.filter(player=>player.fantasyProsPlayerId).map(player=>[player.fantasyProsPlayerId!,player])??[])
  const previousByCanonical=new Map(options.previous?.players.map(player=>[player.canonicalPlayerId,player])??[])
  for (const row of players) {
    const fpId = text(row, 'player_id', 'playerId', 'id'); const name = text(row, 'player_name', 'playerName', 'name'); const rawPosition = text(row, 'player_position_id', 'player_position', 'position')
    if (!fpId || !name || !rawPosition) continue
    const position = normalizePosition(rawPosition); if (!options.includeIdp && isIdpPosition(position)) continue
    const team = normalizeTeam(text(row, 'player_team_id', 'player_team', 'team'))
    const canonical = canonicalPlayerId({ name, team, position, vendorId: `fantasypros:${fpId}` })
    const prior=previousByFp.get(fpId)??previousByCanonical.get(canonical)
    const incomingBye=normalizeByeWeek(text(row,'player_bye_week','bye_week','byeWeek','bye','BYE'))
    byFp.set(fpId, { canonicalPlayerId: canonical, fantasyProsPlayerId: fpId, displayName: name, normalizedName: normalizePlayerName(name), position, nflTeam: team, byeWeek: incomingBye??normalizeByeWeek(prior?.byeWeek), active: text(row, 'is_active', 'active') !== '0' && text(row, 'is_active', 'active') !== 'false', sourceValues: [], newsItems: [], freshness: 'UNKNOWN', quality: 'PARTIAL', uncertaintyFlags: [], sourceProvenance: [] })
  }
  for (const ranked of rankings) {
    const {row,poolIndex}=ranked
    const fpId = text(row, 'player_id', 'playerId', 'id'); if (!fpId) continue
    let player = byFp.get(fpId)
    if (!player) {
      const name = text(row, 'player_name', 'playerName', 'name'), rawPosition = text(row, 'player_position_id', 'player_position', 'position')
      if (!name || !rawPosition) continue
      const position = normalizePosition(rawPosition); if (!options.includeIdp && isIdpPosition(position)) continue
      const team = normalizeTeam(text(row, 'player_team_id', 'player_team', 'team'))
      player = { canonicalPlayerId: canonicalPlayerId({ name, team, position, vendorId: `fantasypros:${fpId}` }), fantasyProsPlayerId: fpId, displayName: name, normalizedName: normalizePlayerName(name), position, nflTeam: team, sourceValues: [], newsItems: [], freshness: 'UNKNOWN', quality: 'PARTIAL', uncertaintyFlags: ['PLAYER_METADATA_FROM_RANKINGS'], sourceProvenance: [] }; byFp.set(fpId, player)
    }
    const updatedAt = iso(text(row, 'updated_at', 'last_updated'), options.fetchedAt)
    const pool = [...fantasyProsOffensiveRankingPositions,...(options.includeIdp?['IDP' as const]:[])][poolIndex]
    const providerEcr = number(row, 'rank_ecr'); const idp=isIdpPosition(player.position); const overallRank=idp?undefined:previousGlobalRanks.get(fpId)??previousGlobalRanks.get(player.canonicalPlayerId)
    const positionRank = number(row, 'pos_rank', 'position_rank'); const tier = number(row, 'tier'); const adp = number(row, 'adp', 'rank_adp'); const min = number(row, 'rank_min'); const max = number(row, 'rank_max')
    const fields = { overallRank, positionRank, tier, adp, rankMin:min, rankMax:max, rankAverage:number(row,'rank_ave'), rankSpread:min!=null&&max!=null?max-min:undefined, standardDeviation:number(row,'rank_std') }
    const existing=player.sourceValues[0]
    if(existing){
      // Each field is merged independently; only the player's own position pool supplies positional fields.
      existing.overallRank??=fields.overallRank
      if(pool===player.position){existing.positionRank??=positionRank;existing.tier??=tier;existing.adp??=adp}
      existing.rankMin??=fields.rankMin;existing.rankMax??=fields.rankMax;existing.rankAverage??=fields.rankAverage;existing.rankSpread??=fields.rankSpread;existing.standardDeviation??=fields.standardDeviation
      player.baselineRank??=fields.overallRank
      if(pool===player.position){player.positionRank??=positionRank;player.tier??=tier;player.adp??=adp}
      continue
    }
    const ranking: RankingValue = { ...fpSource(updatedAt, options.fetchedAt), source: 'FantasyPros ECR', ...fields, scoringFormat: idp ? 'IDP' : options.scoringFormat, rankingClass: idp ? 'IDP' : 'OFFENSE', freshness: freshnessAt(updatedAt, new Date(options.fetchedAt), 6, 24) }
    player.sourceValues.push(ranking); player.sourceProvenance.push(ranking); player.baselineRank = overallRank; player.positionRank = positionRank; player.tier = tier; player.adp = adp; player.lastUpdated = updatedAt; player.freshness = ranking.freshness
    if (idp) { player.idp = { rank: providerEcr, tier }; player.uncertaintyFlags.push('IDP_BASELINE_NOT_COMPARABLE_TO_OFFENSE') }
  }
  const attach = (row: JsonRecord) => byFp.get(text(row, 'player_id', 'playerId') ?? '')
  for (const row of list(payloads.news, ['news'])) {
    const player = attach(row); if (!player) continue
    const headline = text(row, 'title', 'headline') ?? 'Player update'; const publishedAt = iso(text(row, 'published_at', 'published', 'created_at'), options.fetchedAt); const source = text(row, 'source', 'source_name') ?? 'FantasyPros'
    const item: PlayerNewsItem = { id: text(row, 'news_id', 'id') ?? `${player.fantasyProsPlayerId}:${publishedAt}`, playerId: player.canonicalPlayerId, headline: headline.slice(0, 240), summary: (text(row, 'summary', 'description') ?? headline).slice(0, 500), eventType: text(row, 'type', 'category') ?? 'NEWS', publishedAt, confidence: 'MED', materiality: materiality(headline, text(row, 'type', 'category')), source, sourceClass: 'SECONDARY_REPORTING', updatedAt: publishedAt, fetchedAt: options.fetchedAt, reference: text(row, 'url', 'link') }
    player.newsItems.push(item); player.sourceProvenance.push(item)
  }
  for (const row of list(payloads.injuries, ['injuries'])) {
    const player = attach(row); if (!player) continue
    const updatedAt = iso(text(row, 'updated_at', 'last_updated'), options.fetchedAt); const status = availability(text(row, 'status', 'injury_status', 'designation'))
    player.injury = { ...fpSource(updatedAt, options.fetchedAt), sourceClass: 'SECONDARY_REPORTING', status, bodyArea: text(row, 'injury', 'body_part', 'description'), practiceParticipation: text(row, 'practice_status', 'practice') }; player.availabilityStatus = status; player.sourceProvenance.push(player.injury)
  }
  supplementWithSleeper([...byFp.values()], options.sleeper)
  const normalized = [...byFp.values()].filter(player => player.sourceValues.length).sort((a,b) => (a.baselineRank ?? Number.MAX_SAFE_INTEGER) - (b.baselineRank ?? Number.MAX_SAFE_INTEGER)||a.canonicalPlayerId.localeCompare(b.canonicalPlayerId))
  if (!normalized.length) throw new Error('FantasyPros rankings did not match a valid player identity.')
  for (const player of normalized) { player.quality = player.sourceValues.length ? 'COMPLETE' : 'PARTIAL'; if (!player.injury) player.uncertaintyFlags.push('INJURY_NOT_REPORTED') }
  const quality: DataQuality = options.sleeper === undefined ? 'PARTIAL' : 'COMPLETE'; const changes = detectMaterialChanges(options.previous, normalized, options.fetchedAt)
  const hasGlobalRanks=normalized.some(player=>!isIdpPosition(player.position)&&player.baselineRank!=null)
  return { id: snapshotId(options.fetchedAt, options.scoringFormat, normalized), version: 1, createdAt: options.fetchedAt, season: options.season, scoringFormat: options.scoringFormat, includeIdp: options.includeIdp, mode: 'CURRENT', quality, freshness: normalized.some(p=>p.freshness==='STALE')?'STALE':'FRESH', playerSource: 'FANTASYPROS', rankingSource: hasGlobalRanks?`FANTASYPROS ECR · PRIOR VALID OVERALL SNAPSHOT · ${options.scoringFormat.replace('_','-')}${options.includeIdp?' + IDP':''}`:`FANTASYPROS POSITION RANKINGS · OVERALL ECR UNAVAILABLE`, newsStatus: 'FANTASYPROS', limitations: [hasGlobalRanks?'Overall ECR is retained from the prior valid cross-position FantasyPros snapshot; current position calls supply supplemental fields.':'Current FantasyPros position calls do not expose a proven cross-position overall ECR; overall rank and FantasyPros delta are unavailable.', ...(options.includeIdp ? ['IDP baselines remain separate from offensive ECR and may only partially represent league-specific IDP scoring.'] : [])], players: normalized, changes, providerResults: [{ providerId: 'fantasypros-public-v2', status: 'SUCCESS', checkedAt: options.fetchedAt }, { providerId: 'sleeper-nfl-players', status: options.sleeper === undefined ? 'FAILED' : 'SUCCESS', checkedAt: options.fetchedAt, message: options.sleeper === undefined ? 'Supplemental metadata unavailable; FantasyPros snapshot remains valid.' : undefined }] }
}

export function supplementWithSleeper(players: PlayerIntelligence[], payload: unknown): void {
  if (payload === undefined) return
  const rows = Array.isArray(payload) ? payload.map(record) : Object.entries(record(payload)).map(([id,value])=>({ sleeper_id:id, ...record(value) }))
  const byFp = new Map(players.filter(p=>p.fantasyProsPlayerId).map(p=>[p.fantasyProsPlayerId!,p])); const byIdentity = new Map(players.map(p=>[`${p.normalizedName}|${normalizeTeam(p.nflTeam)??''}|${p.position}`,p]))
  for (const row of rows) {
    const position = normalizePosition(text(row, 'position') ?? ''); const name = text(row, 'full_name', 'name'); if (!name || !position) continue
    const team = normalizeTeam(text(row, 'team')); const fpId = text(row, 'fantasy_data_id'); const player = (fpId ? byFp.get(fpId) : undefined) ?? byIdentity.get(`${normalizePlayerName(name)}|${team??''}|${position}`); if (!player) continue
    player.sleeperPlayerId = text(row, 'player_id', 'sleeper_id'); player.active ??= text(row, 'active') !== 'false'; player.nflTeam ??= team
    if (!player.injury) { const status = availability(text(row, 'injury_status')); if (status !== 'UNKNOWN') { player.availabilityStatus = status; player.uncertaintyFlags.push('INJURY_SUPPLEMENTED_BY_SLEEPER') } }
  }
}

export function detectMaterialChanges(previous: PlayerDataSnapshot|undefined, players: PlayerIntelligence[], detectedAt: string): PlayerContextChange[] {
  if (!previous) return []
  const before = new Map(previous.players.map(p=>[p.canonicalPlayerId,p])); const changes: PlayerContextChange[] = []
  for (const player of players) { const old = before.get(player.canonicalPlayerId); if (!old) continue
    if (old.nflTeam && player.nflTeam && old.nflTeam !== player.nflTeam) changes.push({ playerId:player.canonicalPlayerId, field:'role', before:old.nflTeam, after:player.nflTeam, reason:'NFL team changed', source:'FantasyPros API', detectedAt })
    if (old.availabilityStatus !== player.availabilityStatus && ['OUT','IR','SUSPENDED'].includes(player.availabilityStatus ?? '')) changes.push({ playerId:player.canonicalPlayerId, field:'availability', before:old.availabilityStatus, after:player.availabilityStatus, reason:'Material availability designation', source:'FantasyPros API', detectedAt })
    if (old.baselineRank != null && player.baselineRank != null && Math.abs(old.baselineRank-player.baselineRank)>=12) changes.push({ playerId:player.canonicalPlayerId, field:'baselineRank', before:old.baselineRank, after:player.baselineRank, reason:'ECR moved by at least 12 places', source:'FantasyPros ECR', detectedAt })
  } return changes
}

export const providerConfidence = (player: PlayerIntelligence): Confidence => player.freshness === 'FRESH' && !player.uncertaintyFlags.length ? 'HIGH' : player.freshness === 'STALE' ? 'LOW' : 'MED'
export const supportedFantasyProsPositions: Position[] = ['QB','RB','WR','TE','K','DST','DL','LB','DB']
