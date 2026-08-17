import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { inspectPlayerDataSnapshot, type PlayerDataSnapshot, type ScoringFormat } from './player-data'
import { deserializeEspnSource, serializeEspnSource, type EspnRankingSource, type StoredEspnRankingSource } from './espn-rankings'

export type CloudStatus = 'local-only' | 'configuration-error' | 'connecting' | 'cloud-connected' | 'authenticated' | 'unauthorized' | 'cloud-unavailable'
export interface RuntimeDraftConfig { supabaseUrl?: string; supabasePublishableKey?: string }
export interface DraftCloudConfig { environment: string; url: string; publishableKey: string; source: 'runtime' | 'build' | 'none' }
export interface SharedSnapshotRereadDiagnostic {status:'DATABASE_QUERY_RETURNED_ZERO_ROWS'|'DATABASE_QUERY_ERROR'|'DATABASE_ROW_RETURNED_BUT_SNAPSHOT_VALIDATION_FAILED'|'DATABASE_ROW_RETURNED_AND_VALID';queryMatchedRow:boolean;returnedSnapshotId?:string;returnedScoringFormat?:string;returnedIncludeIdp?:boolean;returnedPlayerCount?:number;validationPassed:boolean;validationFailureReason?:string;error?:string;snapshot?:PlayerDataSnapshot}

declare global { interface Window { __DRAFT_ASSISTANT_CONFIG__?: RuntimeDraftConfig } }

const clean = (value: string | undefined) => value?.trim() || ''
export function readDraftCloudConfig(
  env: Record<string, string | undefined>,
  runtime: RuntimeDraftConfig | undefined,
  production: boolean,
): DraftCloudConfig {
  const runtimeUrl = clean(runtime?.supabaseUrl)
  const runtimeKey = clean(runtime?.supabasePublishableKey)
  if (runtimeUrl && runtimeKey) return { environment: 'production', url: runtimeUrl, publishableKey: runtimeKey, source: 'runtime' }
  if (production) return { environment: 'production', url: '', publishableKey: '', source: 'none' }
  const url = clean(env.VITE_DRAFT_SUPABASE_URL)
  const publishableKey = clean(env.VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY)
  return { environment: clean(env.VITE_DRAFT_APP_ENV) || 'local', url, publishableKey, source: url && publishableKey ? 'build' : 'none' }
}
export function configurationStatus(config: DraftCloudConfig): CloudStatus {
  if (!config.url && !config.publishableKey) return config.environment === 'local' ? 'local-only' : 'configuration-error'
  return config.url && config.publishableKey ? 'connecting' : 'configuration-error'
}
export class DraftCloudGateway {
  readonly client: SupabaseClient | null
  readonly initialStatus: CloudStatus
  constructor(readonly config: DraftCloudConfig) {
    this.initialStatus = configurationStatus(config)
    this.client = this.initialStatus === 'connecting' ? createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
  }
  async session(): Promise<Session | null> { if (!this.client) return null; return (await this.client.auth.getSession()).data.session }
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): () => void {
    if (!this.client) return () => undefined
    const { data } = this.client.auth.onAuthStateChange(callback)
    return () => data.subscription.unsubscribe()
  }
  async sendMagicLink(email: string): Promise<void> {
    if (!this.client) throw new Error('Draft Supabase is not configured.')
    const redirect = new URL(import.meta.env.BASE_URL || '/draft-assistant/', window.location.origin).toString()
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
    if (error) throw error
  }
  async authorize(session: Session): Promise<boolean> {
    if (!this.client) return false
    const { data, error } = await this.client.from('draft_allowed_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
    if (error) throw error
    return data?.user_id === session.user.id
  }
  async signOut(): Promise<void> { if (this.client) { const { error } = await this.client.auth.signOut(); if (error) throw error } }
  async status(): Promise<CloudStatus> {
    if (!this.client) return this.initialStatus
    if (!navigator.onLine) return 'cloud-unavailable'
    try { const session = await this.session(); if (!session) return 'cloud-connected'; return await this.authorize(session) ? 'authenticated' : 'unauthorized' } catch { return 'cloud-unavailable' }
  }
  async refreshPlayerData(input: { season:number; scoringFormat:ScoringFormat; includeIdp:boolean; previous?:PlayerDataSnapshot }): Promise<PlayerDataSnapshot> {
    if (!this.client || !await this.session()) throw new Error('Player refresh requires an authenticated Draft Assistant session.')
    const { data, error } = await this.client.functions.invoke('draft-player-data-refresh', { body: input })
    if (error || !data?.snapshot) throw new Error(typeof data?.error === 'string' ? data.error : 'Automated player refresh is unavailable.')
    return data.snapshot as PlayerDataSnapshot
  }
  async loadLatestSharedPlayerSnapshot(season:number,scoringFormat:ScoringFormat,includeIdp=false):Promise<PlayerDataSnapshot|undefined>{
    const result=await this.inspectLatestSharedPlayerSnapshot(season,scoringFormat,includeIdp)
    if(result.status==='DATABASE_QUERY_ERROR')throw new Error(result.error)
    return result.snapshot
  }
  async inspectLatestSharedPlayerSnapshot(season:number,scoringFormat:ScoringFormat,includeIdp=false):Promise<SharedSnapshotRereadDiagnostic>{
    if(!this.client||!await this.session())return{status:'DATABASE_QUERY_ERROR',queryMatchedRow:false,validationPassed:false,error:'Shared snapshot reread requires an authenticated Draft Assistant session.'}
    const {data,error}=await this.client.from('draft_player_data_snapshots').select('season,provider,scoring_format,include_idp,snapshot_id,quality,fetched_at,activated_at,snapshot').eq('season',season).eq('scoring_format',scoringFormat).eq('include_idp',includeIdp).order('activated_at',{ascending:false}).limit(1).maybeSingle()
    if(error)return{status:'DATABASE_QUERY_ERROR',queryMatchedRow:false,validationPassed:false,error:error.message??String(error)}
    if(!data)return{status:'DATABASE_QUERY_RETURNED_ZERO_ROWS',queryMatchedRow:false,validationPassed:false}
    const row=data as Record<string,unknown>,raw=row.snapshot as {id?:unknown;scoringFormat?:unknown;includeIdp?:unknown;players?:unknown[]}|undefined,validation=inspectPlayerDataSnapshot(raw,season,scoringFormat,includeIdp)
    const diagnostic={queryMatchedRow:true,returnedSnapshotId:String(row.snapshot_id??raw?.id??''),returnedScoringFormat:String(row.scoring_format??raw?.scoringFormat??''),returnedIncludeIdp:typeof row.include_idp==='boolean'?row.include_idp:undefined,returnedPlayerCount:Array.isArray(raw?.players)?raw.players.length:undefined,validationPassed:validation.passed,validationFailureReason:validation.reason}
    return validation.passed?{status:'DATABASE_ROW_RETURNED_AND_VALID',...diagnostic,snapshot:validation.snapshot}:{status:'DATABASE_ROW_RETURNED_BUT_SNAPSHOT_VALIDATION_FAILED',...diagnostic}
  }
  async refreshLatestSharedPlayerSnapshot(input:{season:number;scoringFormat:ScoringFormat;includeIdp:boolean}):Promise<PlayerDataSnapshot|undefined>{
    if(!this.client||!await this.session())throw new Error('Player refresh requires an authenticated Draft Assistant session.')
    const result=await this.client.functions.invoke('draft-player-data-refresh',{body:input});let data=result.data
    if(result.error&&data==null){const response=(result.error as unknown as{context?:Response}).context;if(response)try{data=await response.clone().json()}catch{/* Keep the SDK error when the response is not JSON. */}}
    const details={scoringFormat:input.scoringFormat,includeIdp:input.includeIdp,players:Number(data?.summary?.players??data?.snapshot?.players?.length??0),snapshotId:data?.snapshot?.id??data?.snapshotId??'none'}
    if(result.error)throw new Error(`Player refresh function failed (${details.scoringFormat}, IDP ${details.includeIdp}, players ${details.players}, snapshot ${details.snapshotId}, persisted ${data?.persisted===true}): ${data?.persistenceError??data?.error??result.error.message}.`)
    if(data?.persisted!==true)throw new Error(`Player refresh persistence failed (${details.scoringFormat}, IDP ${details.includeIdp}, players ${details.players}, snapshot ${details.snapshotId}): ${data?.persistenceError??data?.error??'persisted was not true'}.`)
    const reread=await this.inspectLatestSharedPlayerSnapshot(input.season,input.scoringFormat,input.includeIdp)
    if(!reread.snapshot){const diagnostic={persistedSnapshotId:details.snapshotId,persistedPlayerCount:details.players,reread:{queryMatchedRow:reread.queryMatchedRow,returnedSnapshotId:reread.returnedSnapshotId,returnedScoringFormat:reread.returnedScoringFormat,returnedIncludeIdp:reread.returnedIncludeIdp,returnedPlayerCount:reread.returnedPlayerCount,validationPassed:reread.validationPassed,validationFailureReason:reread.validationFailureReason,status:reread.status,error:reread.error}};throw new Error(`Player refresh reread failed: ${JSON.stringify(diagnostic)}`)}
    return reread.snapshot
  }
  async loadSharedEspnRankingSource(leagueId:string,season:number):Promise<EspnRankingSource|undefined>{
    if(!this.client||!await this.session())return undefined
    const{data,error}=await this.client.from('draft_espn_ranking_sources').select('ranking_source').eq('league_id',leagueId).eq('season',season).eq('source_type','ESPN').order('imported_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw error
    return data?.ranking_source?deserializeEspnSource(data.ranking_source as StoredEspnRankingSource):undefined
  }
  async saveSharedEspnRankingSource(leagueId:string,source:EspnRankingSource):Promise<void>{
    if(!this.client||!await this.session())throw new Error('ESPN activation requires an authenticated Draft Assistant session.')
    const rankingSource=serializeEspnSource(leagueId,source),{error}=await this.client.from('draft_espn_ranking_sources').upsert({league_id:leagueId,season:source.season,source_type:'ESPN',source_id:source.id,scoring_format:source.scoringFormat,imported_at:source.importedAt,source_label:source.label,document_label:source.originalFilename,ranking_source:rankingSource},{onConflict:'league_id,season,source_type'})
    if(error)throw new Error(`Shared ESPN persistence failed: ${error.message}`)
  }
  async removeSharedEspnRankingSource(leagueId:string,season:number):Promise<void>{
    if(!this.client||!await this.session())throw new Error('ESPN removal requires an authenticated Draft Assistant session.')
    const{error}=await this.client.from('draft_espn_ranking_sources').delete().eq('league_id',leagueId).eq('season',season).eq('source_type','ESPN');if(error)throw error
  }
}
export const draftCloud = new DraftCloudGateway(readDraftCloudConfig(import.meta.env, typeof window === 'undefined' ? undefined : window.__DRAFT_ASSISTANT_CONFIG__, import.meta.env.PROD))
