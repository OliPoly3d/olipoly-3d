/**
 * Dashboard-deployable FantasyPros refresh Edge Function.
 *
 * Keep the player-data types and normalization implementation in this file:
 * the Supabase Dashboard deploys this file without access to application source.
 */
export type Position = 'QB'|'RB'|'WR'|'TE'|'DST'|'K'|'DL'|'LB'|'DB'|'DT'|'DE'|'CB'|'S'|'P'|'HC'
export type CanonicalPlayerId = string & { readonly __canonicalPlayerId: unique symbol }
export type Freshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN'
export type DataQuality = 'COMPLETE' | 'PARTIAL' | 'STALE' | 'MISSING'
export type Confidence = 'HIGH' | 'MED' | 'LOW'
export type SourceClass = 'OFFICIAL' | 'PRIMARY_REPORTING' | 'SECONDARY_REPORTING' | 'ANALYST_INTERPRETATION' | 'SPECULATION'
export type ScoringFormat = 'PPR' | 'HALF_PPR' | 'STANDARD' | 'KEEPER' | 'IDP' | 'OTHER'
export type AvailabilityStatus = 'ACTIVE' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'OUT_FOR_SEASON' | 'PUP' | 'IR' | 'SUSPENDED' | 'HOLDOUT' | 'RETIRED' | 'NOT_IN_PLAYER_POOL' | 'OTHER' | 'UNKNOWN'

export interface SourceReference { source:string; sourceClass:SourceClass; updatedAt:string; fetchedAt?:string; reference?:string }
export interface RankingValue extends SourceReference { overallRank?:number; positionRank?:number; tier?:number; adp?:number; rankMin?:number; rankMax?:number; rankAverage?:number; rankSpread?:number; standardDeviation?:number; scoringFormat:ScoringFormat; freshness:Freshness; rankingClass?:'OFFENSE'|'IDP' }
export interface InjuryContext extends SourceReference { status:AvailabilityStatus; bodyArea?:string; practiceParticipation?:string }
export interface RoleContext extends SourceReference { summary:string; confidence:Confidence; tags?:('WORKHORSE'|'COMMITTEE'|'TIMESHARE'|'STARTER'|'BACKUP'|'THIRD_DOWN'|'GOAL_LINE'|'COMPETITION'|'ROOKIE_COMPETITION'|'QB_COMPETITION'|'EASED_IN')[] }
export interface PlayerNewsItem extends SourceReference { id:string; playerId:CanonicalPlayerId; headline:string; summary:string; eventType:string; publishedAt:string; confidence:Confidence; materiality:'HIGH'|'MED'|'LOW' }
export interface IdpContext { rank?:number; tier?:number; tackleOpportunity?:string; snapRole?:string; passRushRole?:string; coverageRole?:string; starterStatus?:string; schemeContext?:string }
export interface PlayerIntelligence { canonicalPlayerId:CanonicalPlayerId; fixturePlayerId?:string; fantasyProsPlayerId?:string; sleeperPlayerId?:string; displayName:string; normalizedName:string; position:Position; nflTeam?:string; byeWeek?:number; active?:boolean; baselineRank?:number; positionRank?:number; tier?:number; adp?:number; sourceValues:RankingValue[]; injury?:InjuryContext; availabilityStatus?:AvailabilityStatus; role?:RoleContext; newsItems:PlayerNewsItem[]; freshness:Freshness; lastUpdated?:string; quality:DataQuality; uncertaintyFlags:string[]; sourceProvenance:SourceReference[]; idp?:IdpContext }
export interface PlayerContextChange { playerId:CanonicalPlayerId; field:'baselineRank'|'role'|'injury'|'availability'; before?:string|number; after?:string|number; reason:string; source:string; detectedAt:string }
export type PlayerDataMode='CURRENT'|'CACHED'|'MANUAL_IMPORT'|'FIXTURE_FALLBACK'|'DEVELOPMENT_FIXTURE'
export interface PlayerDataSnapshot { id:string; version:1; createdAt:string; scoringFormat:ScoringFormat; includeIdp?:boolean; leagueId?:string; season?:number; quality:DataQuality; freshness:Freshness; mode?:Exclude<PlayerDataMode,'FIXTURE_FALLBACK'|'DEVELOPMENT_FIXTURE'>; playerSource?:string; rankingSource?:string; newsStatus?:string; endpointUpdatedAt?:Partial<Record<'players'|'rankings'|'news'|'injuries',string>>; limitations?:string[]; players:PlayerIntelligence[]; changes:PlayerContextChange[]; providerResults:{providerId:string;status:'SUCCESS'|'FAILED'|'SKIPPED';checkedAt:string;message?:string}[] }

const suffix=/\b(jr|sr|ii|iii|iv|v)\b/g
export const normalizePlayerName=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’`-]/g,' ').replace(suffix,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
const teams:Record<string,string>={JAC:'JAX',JAX:'JAX',WSH:'WAS',WAS:'WAS',LA:'LAR',LAR:'LAR',STL:'LAR',OAK:'LV',LVR:'LV',LV:'LV',SD:'LAC',LAC:'LAC'}
export const normalizeTeam=(team?:string)=>{const value=team?.trim().toUpperCase();return value?(teams[value]??value):undefined}
const positions:Record<string,Position>={DEF:'DST','D/ST':'DST',DST:'DST',PK:'K',EDGE:'DL',ILB:'LB',OLB:'LB',FS:'DB',SS:'DB'}
export const normalizePosition=(position:string)=>positions[position.trim().toUpperCase()]??position.trim().toUpperCase() as Position
export function canonicalPlayerId(input:{name:string;team?:string;position:string;vendorId?:string}):CanonicalPlayerId { const position=normalizePosition(input.position),team=normalizeTeam(input.team);if(position==='DST')return `nfl:dst:${team??normalizePlayerName(input.name).replaceAll(' ','-')}` as CanonicalPlayerId;if(input.vendorId)return `nfl:${input.vendorId}` as CanonicalPlayerId;return `nfl:${normalizePlayerName(input.name).replaceAll(' ','-')}:${team??'FA'}:${position}` as CanonicalPlayerId }
export const freshnessAt=(updatedAt:string|undefined,now=new Date(),freshHours=24,agingHours=72):Freshness=>{if(!updatedAt||!Number.isFinite(Date.parse(updatedAt)))return'UNKNOWN';const hours=(now.getTime()-Date.parse(updatedAt))/36e5;return hours<=freshHours?'FRESH':hours<=agingHours?'AGING':'STALE'}
export const isIdpPosition=(p:Position)=>['DL','LB','DB','DT','DE','CB','S'].includes(p)
export function snapshotId(createdAt:string,format:ScoringFormat,players:PlayerIntelligence[]){const stable=players.map(p=>`${p.canonicalPlayerId}:${p.baselineRank??''}:${p.availabilityStatus??''}:${p.lastUpdated??''}`).sort().join('|');let hash=2166136261;for(const c of `${format}|${createdAt}|${stable}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);return `player-data-v1-${(hash>>>0).toString(16)}`}

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

export const fantasyProsOffensiveRankingPositions = ['FLX','QB','RB','WR','TE','K','DST'] as const
export type FantasyProsRankingPool = typeof fantasyProsOffensiveRankingPositions[number] | 'IDP'
export type RankingPoolDiagnostic = { status:'ok'|'empty'|'failed'; count:number; error?:string }

export function fantasyProsRankingPoolDiagnostics(rankings:unknown|unknown[],includeIdp:boolean):Record<string,RankingPoolDiagnostic>{
  const payloads=Array.isArray(rankings)?rankings:[rankings]
  const names:FantasyProsRankingPool[]=[...fantasyProsOffensiveRankingPositions,...(includeIdp?['IDP' as const]:[])]
  return Object.fromEntries(names.map((name,index)=>{const payload=record(payloads[index]);const error=text(payload,'__poolError');const count=list(payloads[index],['rankings','players']).length;return[name,error?{status:'failed',count,error}:{status:count?'ok':'empty',count}]}))
}

/** Build only provider-supported ranking requests. FLX preserves the provider's cross-position ECR. */
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
  if(diagnostics.FLX.status==='failed')throw new Error(`Required FantasyPros FLX ranking pool failed: ${diagnostics.FLX.error}`)
  if(diagnostics.FLX.status!=='ok')throw new Error('Required FantasyPros FLX ranking pool was empty.')
  if(options.includeIdp&&diagnostics.IDP.status==='failed')throw new Error(`Required FantasyPros IDP ranking pool failed: ${diagnostics.IDP.error}`)
  if(options.includeIdp&&diagnostics.IDP.status!=='ok')throw new Error('Required FantasyPros IDP ranking pool was empty.')
  const rankings = rankingPools.flatMap((pool,poolIndex)=>pool.map(row=>({row,poolIndex})))
  if (!players.length || !rankings.length) throw new Error('FantasyPros players and rankings are required for an atomic snapshot.')
  const byFp = new Map<string, PlayerIntelligence>()
  for (const row of players) {
    const fpId = text(row, 'player_id', 'playerId', 'id'); const name = text(row, 'player_name', 'playerName', 'name'); const rawPosition = text(row, 'player_position_id', 'player_position', 'position')
    if (!fpId || !name || !rawPosition) continue
    const position = normalizePosition(rawPosition); if (!options.includeIdp && isIdpPosition(position)) continue
    const team = normalizeTeam(text(row, 'player_team_id', 'player_team', 'team'))
    const canonical = canonicalPlayerId({ name, team, position, vendorId: `fantasypros:${fpId}` })
    byFp.set(fpId, { canonicalPlayerId: canonical, fantasyProsPlayerId: fpId, displayName: name, normalizedName: normalizePlayerName(name), position, nflTeam: team, byeWeek: number(row, 'bye_week', 'bye'), active: text(row, 'is_active', 'active') !== '0' && text(row, 'is_active', 'active') !== 'false', sourceValues: [], newsItems: [], freshness: 'UNKNOWN', quality: 'PARTIAL', uncertaintyFlags: [], sourceProvenance: [] })
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
    const providerRank = number(row, 'rank_ecr', 'ecr', 'overall_rank', 'rank'); const comparable=poolIndex===0||isIdpPosition(player.position); const overallRank=comparable?providerRank:undefined; const positionRank = number(row, 'pos_rank', 'position_rank')??(!comparable?providerRank:undefined); const tier = number(row, 'tier'); const adp = number(row, 'adp', 'rank_adp'); const min = number(row, 'rank_min'); const max = number(row, 'rank_max')
    const existing=player.sourceValues[0]
    if(existing){
      // Positional pools enrich the canonical FLX row but never replace its comparable ECR.
      existing.positionRank??=positionRank;existing.tier??=tier;existing.adp??=adp
      player.positionRank??=positionRank;player.tier??=tier;player.adp??=adp
      continue
    }
    const ranking: RankingValue = { ...fpSource(updatedAt, options.fetchedAt), source: 'FantasyPros ECR', overallRank, positionRank, tier, adp, rankMin:min, rankMax:max, rankAverage:number(row,'rank_ave','rank_average'), rankSpread: min != null && max != null ? max - min : undefined, standardDeviation: number(row, 'rank_std', 'standard_deviation'), scoringFormat: isIdpPosition(player.position) ? 'IDP' : options.scoringFormat, rankingClass: isIdpPosition(player.position) ? 'IDP' : 'OFFENSE', freshness: freshnessAt(updatedAt, new Date(options.fetchedAt), 6, 24) }
    player.sourceValues.push(ranking); player.sourceProvenance.push(ranking); player.baselineRank = overallRank; player.positionRank = positionRank; player.tier = tier; player.adp = adp; player.lastUpdated = updatedAt; player.freshness = ranking.freshness
    if (isIdpPosition(player.position)) { player.idp = { rank: overallRank, tier }; player.uncertaintyFlags.push('IDP_BASELINE_NOT_COMPARABLE_TO_OFFENSE') }
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
  const normalized = [...byFp.values()].filter(player => player.sourceValues.length).sort((a,b) => (a.baselineRank ?? 9999) - (b.baselineRank ?? 9999))
  if (!normalized.length) throw new Error('FantasyPros rankings did not match a valid player identity.')
  for (const player of normalized) { player.quality = player.sourceValues.length ? 'COMPLETE' : 'PARTIAL'; if (!player.injury) player.uncertaintyFlags.push('INJURY_NOT_REPORTED') }
  const quality: DataQuality = options.sleeper === undefined ? 'PARTIAL' : 'COMPLETE'; const changes = detectMaterialChanges(options.previous, normalized, options.fetchedAt)
  return { id: snapshotId(options.fetchedAt, options.scoringFormat, normalized), version: 1, createdAt: options.fetchedAt, season: options.season, scoringFormat: options.scoringFormat, includeIdp: options.includeIdp, mode: 'CURRENT', quality, freshness: normalized.some(p=>p.freshness==='STALE')?'STALE':'FRESH', playerSource: 'FANTASYPROS', rankingSource: `FANTASYPROS ECR · ${options.scoringFormat.replace('_','-')}${options.includeIdp?' + IDP':''}`, newsStatus: 'FANTASYPROS', limitations: [`${options.scoringFormat.replace('_','-')} ECR is market-value input; league custom scoring remains deterministic.`, ...(options.includeIdp ? ['IDP baselines remain separate from offensive ECR and may only partially represent league-specific IDP scoring.'] : [])], players: normalized, changes, providerResults: [{ providerId: 'fantasypros-public-v2', status: 'SUCCESS', checkedAt: options.fetchedAt }, { providerId: 'sleeper-nfl-players', status: options.sleeper === undefined ? 'FAILED' : 'SUCCESS', checkedAt: options.fetchedAt, message: options.sleeper === undefined ? 'Supplemental metadata unavailable; FantasyPros snapshot remains valid.' : undefined }] }
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
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors })

async function authorized(request: Request): Promise<boolean> {
  const scheduledToken = Deno.env.get('DRAFT_PLAYER_REFRESH_TOKEN')?.trim()
  const suppliedToken = request.headers.get('x-refresh-token')?.trim()
  if (scheduledToken && suppliedToken && scheduledToken === suppliedToken) return true
  const authorization = request.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim(), anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (!authorization || !supabaseUrl || !anonKey) return false
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { authorization, apikey: anonKey } })
  if (!userResponse.ok) return false
  const user = await userResponse.json() as { id?: string }; if (!user.id) return false
  const allowed = await fetch(`${supabaseUrl}/rest/v1/draft_allowed_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { authorization, apikey: anonKey } })
  return allowed.ok && ((await allowed.json()) as unknown[]).length === 1
}

export function safeProviderErrorBody(body:string, apiKey:string, limit=500):string {
  return body.replaceAll(apiKey,'[REDACTED]').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,limit)
}

export interface RankingRequestDiagnostic {
  requestPath:string
  scoringFormat:ScoringFormat
  httpStatus:number
  contentType:string
  topLevelKeys:string[]
  dataKeys:string[]
  candidateArrays:{rankings:{exists:boolean;length:number};players:{exists:boolean;length:number};'data.rankings':{exists:boolean;length:number};'data.players':{exists:boolean;length:number}}
  firstRow?:JsonRecord
  responsePreview?:string
}

/** Inspect the untouched provider JSON. This deliberately does not use list() or normalization. */
export function fantasyProsRankingDiagnostic(payload:unknown,context:{requestPath:string;scoringFormat:ScoringFormat;httpStatus?:number;status?:number;contentType:string;responseBody?:string;apiKey?:string;errorPreview?:string}):RankingRequestDiagnostic&Record<string,unknown> {
  const root=record(payload),data=record(root.data)
  const candidates={rankings:Array.isArray(root.rankings)?root.rankings:undefined,players:Array.isArray(root.players)?root.players:undefined,'data.rankings':Array.isArray(data.rankings)?data.rankings:undefined,'data.players':Array.isArray(data.players)?data.players:undefined}
  const populated=Object.values(candidates).find(candidate=>candidate?.length)
  const sanitize=(value:unknown):unknown=>{
    if(typeof value==='string')return safeProviderErrorBody(value,context.apiKey??'',1000)
    if(Array.isArray(value))return value.slice(0,20).map(sanitize)
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as JsonRecord).map(([key,item])=>[/key|token|secret|authorization/i.test(key)?key:key,/key|token|secret|authorization/i.test(key)?'[REDACTED]':sanitize(item)]))
    return value
  }
  const candidateArrays=Object.fromEntries(Object.entries(candidates).map(([name,candidate])=>[name,{exists:candidate!==undefined,length:candidate?.length??0}])) as RankingRequestDiagnostic['candidateArrays']
  const legacy=context.responseBody===undefined
  const firstItemKeys=Object.keys(record(populated?.[0]))
  const diagnostic={requestPath:context.requestPath,scoringFormat:context.scoringFormat,httpStatus:context.httpStatus??context.status??0,contentType:context.contentType,topLevelKeys:Object.keys(root),dataKeys:Object.keys(data),candidateArrays,...(!legacy&&populated?{firstRow:record(sanitize(populated[0]))}: {}),...(!populated?{responsePreview:safeProviderErrorBody(context.responseBody??context.errorPreview??JSON.stringify(payload),context.apiKey??'',1000)}:{})}
  const compatibility={status:context.httpStatus??context.status,topPlayersExists:candidates.players!==undefined,topPlayersCount:candidates.players?.length??0,topRankingsExists:candidates.rankings!==undefined,topRankingsCount:candidates.rankings?.length??0,dataPlayersExists:candidates['data.players']!==undefined,dataPlayersCount:candidates['data.players']?.length??0,dataRankingsExists:candidates['data.rankings']!==undefined,dataRankingsCount:candidates['data.rankings']?.length??0,firstItemKeys,responseBodyType:payload===null?'null':Array.isArray(payload)?'array':typeof payload,errorPreview:context.errorPreview??(!populated?diagnostic.responsePreview:undefined)}
  return {...diagnostic,...compatibility,...(legacy?{firstRow:undefined}:{})}
}

export const fantasyProsFlxDiagnostic=fantasyProsRankingDiagnostic

export async function providerJson(path: string, apiKey: string): Promise<unknown> {
  const response = await fetch(`https://api.fantasypros.com/public/v2/json${path}`, { headers: { 'x-api-key': apiKey, accept: 'application/json' } })
  if (!response.ok) {
    const detail=safeProviderErrorBody(await response.text(),apiKey)
    const endpoint=path.includes('/consensus-rankings')?'consensus rankings':path.split('?')[0]
    throw new Error(`FantasyPros ${endpoint} failed HTTP ${response.status}${detail?`: ${detail}`:'.'}`)
  }
  return response.json()
}

export async function fetchFantasyProsRankingPools(paths:string[],apiKey:string,scoringFormat:ScoringFormat):Promise<{payloads:unknown[];diagnostics:Record<string,RankingRequestDiagnostic>}>{
  const diagnostics:Record<string,RankingRequestDiagnostic>={}
  const payloads=await Promise.all(paths.map(async(path,index)=>{
    const response=await fetch(`https://api.fantasypros.com/public/v2/json${path}`,{headers:{'x-api-key':apiKey,accept:'application/json'}})
    const contentType=response.headers.get('content-type')??''
    const body=await response.text();let payload:unknown
    try{payload=body?JSON.parse(body):null}catch{payload=body}
    const pool=path.match(/[?&]position=([^&]+)/)?.[1]??String(index)
    diagnostics[pool.toLowerCase()]=fantasyProsRankingDiagnostic(payload,{requestPath:path,scoringFormat,httpStatus:response.status,contentType,responseBody:body,apiKey})
    if(!response.ok){const detail=safeProviderErrorBody(body,apiKey);return{__poolError:`FantasyPros consensus rankings failed HTTP ${response.status}${detail?`: ${detail}`:'.'}`}}
    if(typeof payload==='string')return{__poolError:`FantasyPros ${pool} rankings returned invalid JSON.`}
    return payload
  }))
  return {payloads,diagnostics}
}

export function flxDiagnosticError(error:string,diagnostic:RankingRequestDiagnostic|undefined,parsedCount:number|undefined):string {
  if(!diagnostic||!/^Required FantasyPros FLX ranking pool was empty\./.test(error))return error
  const arrays=diagnostic.candidateArrays
  const counts=`rankings=${arrays.rankings.length}; players=${arrays.players.length}; data.rankings=${arrays['data.rankings'].length}; data.players=${arrays['data.players'].length}`
  const providerRows=Object.values(arrays).reduce((total,candidate)=>total+candidate.length,0)
  const parserWarning=providerRows>0&&(parsedCount??0)===0?' FLX PROVIDER DATA EXISTS BUT PARSER DID NOT RECOGNIZE IT':''
  return `${error} FLX diagnostic: HTTP ${diagnostic.httpStatus}; keys=[${diagnostic.topLevelKeys.join(',')}]; ${counts}.${parserWarning}`
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!await authorized(request)) return json({ error: 'Authorized Draft Assistant access is required.' }, 401)
  const apiKey = Deno.env.get('FANTASYPROS_API_KEY')?.trim()
  if (!apiKey) return json({ error: 'FantasyPros provider is not configured.', configured: false }, 503)
  const input = await request.json().catch(() => ({})) as { season?: number; scoringFormat?: ScoringFormat; includeIdp?: boolean; previous?: PlayerDataSnapshot }
  const season = Number.isInteger(input.season) ? input.season! : 2026
  const scoringFormat: ScoringFormat = input.scoringFormat === 'STANDARD' || input.scoringFormat === 'HALF_PPR' || input.scoringFormat === 'PPR' ? input.scoringFormat : 'PPR'; const includeIdp = Boolean(input.includeIdp)
  const rankingPaths=fantasyProsRankingPaths(season,scoringFormat,includeIdp)
  const fetchedAt = new Date().toISOString()
  let rankingPools:Record<string,RankingPoolDiagnostic>|undefined
  let diagnostics:Record<string,RankingRequestDiagnostic>|undefined
  try {
    const [players, rankings, news, injuries, sleeperResult] = await Promise.all([
      providerJson('/nfl/players', apiKey), fetchFantasyProsRankingPools(rankingPaths,apiKey,scoringFormat), providerJson('/nfl/news', apiKey), providerJson('/nfl/injuries', apiKey),
      fetch('https://api.sleeper.app/v1/players/nfl', { headers: { accept: 'application/json' } }).then(async response => response.ok ? response.json() : Promise.reject(new Error(`Sleeper failed with HTTP ${response.status}.`))).catch(() => undefined),
    ])
    const rankingPayloads=rankings.payloads;diagnostics=rankings.diagnostics
    rankingPools=fantasyProsRankingPoolDiagnostics(rankingPayloads,includeIdp)
    const snapshot = normalizeFantasyPros({ players, rankings:rankingPayloads, news, injuries } satisfies FantasyProsPayloads, { fetchedAt, scoringFormat, season, includeIdp, sleeper: sleeperResult, previous: input.previous })
    const supabaseUrl=Deno.env.get('SUPABASE_URL')?.trim(),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if(!supabaseUrl||!serviceKey)throw new Error('Shared snapshot persistence is not configured.')
    const writeBody={created_at:fetchedAt,season,provider:'fantasypros',scoring_format:scoringFormat,include_idp:includeIdp,snapshot_id:snapshot.id,snapshot,mode:snapshot.mode??'CURRENT',player_source:snapshot.playerSource??'FantasyPros API',ranking_source:snapshot.rankingSource??'FantasyPros ECR',news_status:snapshot.newsStatus??'FantasyPros news',quality:snapshot.quality,freshness:snapshot.freshness,fetched_at:fetchedAt,activated_at:fetchedAt,inserted_at:fetchedAt}
    const persisted=await fetch(`${supabaseUrl}/rest/v1/draft_player_data_snapshots`,{method:'POST',headers:{authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(writeBody)})
    const persistenceBody=await persisted.text()
    if(!persisted.ok)return json({error:'Provider refresh succeeded but shared snapshot persistence failed.',persistenceError:`HTTP ${persisted.status}: ${persistenceBody.slice(0,1000)}`,persisted:false,snapshotId:snapshot.id,rankingPools,diagnostics,flxDiagnostic:diagnostics?.flx,summary:{players:snapshot.players.length,quality:snapshot.quality,scoringFormat,includeIdp},priorSnapshotPreserved:true},502)
    return json({ snapshot, snapshotId:snapshot.id, persisted: true, rankingPools, diagnostics, flxDiagnostic:diagnostics?.flx, persistenceResponse:persistenceBody?JSON.parse(persistenceBody):null, summary: { players: snapshot.players.length, normalizedPlayerCount:snapshot.players.length, quality: snapshot.quality,changes: snapshot.changes.length, scoringFormat, includeIdp, sleeper: sleeperResult === undefined ? 'FAILED' : 'SUCCESS' } })
  } catch (error) {
    const message=error instanceof Error?error.message:'Provider refresh failed.'
    return json({ error:flxDiagnosticError(message,diagnostics?.flx,rankingPools?.FLX.count), scoringFormat, includeIdp, rankingPools, diagnostics, flxDiagnostic:diagnostics?.flx, persisted:false, priorSnapshotPreserved: true }, 502)
  }
})
