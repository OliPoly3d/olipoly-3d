import type { DraftPlayer, Position } from '../domain/models';
import type { DraftContext } from '../domain/engine';
import { rebuildDraftState } from '../domain/engine';
import type { CanonicalPlayerId, Freshness, RankingValue, ScoringFormat } from './player-data';
import type { CanonicalSeasonRecord, DataCenterFreshness, DataCenterSnapshot, FieldValue } from './player-data-center';

export type SnapshotResolutionState='LOADING_ACTIVE_SNAPSHOT'|'ACTIVE_SNAPSHOT_AVAILABLE'|'PINNED_SNAPSHOT_AVAILABLE'|'NO_SNAPSHOT_AVAILABLE'|'SNAPSHOT_LOAD_FAILED';
export type PlayerDataViewStatus='ACTIVE_GLOBAL'|'DRAFT_PINNED'|'LEGACY_FALLBACK';
export interface NormalizedPlayerData {
  canonicalPlayerId:CanonicalPlayerId; displayName:string; team?:string; position:Position; providerPosition?:string;
  available:boolean; keeper:boolean; drafted:boolean; pprEcr?:number; halfPprEcr?:number; idpRank?:number;
  positionRank?:number; pprTier?:number; halfPprTier?:number; idpTier?:number; compositeAdp?:number; realTimeAdp?:number;
  bye?:number; espnTop300Rank?:number; clayPprProjection?:number; clayHalfPprProjection?:number;
  clayFields:Record<string,unknown>; clayIdpFields:Record<string,unknown>; robocopIdpProjection?:number;
  injury?:string; news?:string; provenance:CanonicalSeasonRecord['fields']; freshness?:DataCenterFreshness;
}
export interface PlayerDataConsumerView { leagueId:string; draftSessionId?:string; resolutionState:Exclude<SnapshotResolutionState,'LOADING_ACTIVE_SNAPSHOT'|'SNAPSHOT_LOAD_FAILED'>; snapshot?:DataCenterSnapshot; status:PlayerDataViewStatus; globalIsNewer:boolean; players:NormalizedPlayerData[]; sourceAuthorities:string[]; limitations:string[] }
export interface SnapshotReader { getActiveDataCenterSnapshot():Promise<DataCenterSnapshot|undefined>; getDataCenterSnapshot(id:string):Promise<DataCenterSnapshot|undefined> }
export interface ResolvePlayerDataInput { leagueId:string; draftSessionId?:string; pinnedSnapshotVersion?:string; reader:SnapshotReader; players?:DraftPlayer[] }
export type SnapshotResolution={state:'SNAPSHOT_LOAD_FAILED';error:Error}|({state:'ACTIVE_SNAPSHOT_AVAILABLE'|'PINNED_SNAPSHOT_AVAILABLE'|'NO_SNAPSHOT_AVAILABLE'}&PlayerDataConsumerView);

const numeric=(field?:FieldValue)=>{if(field?.value==null||field.value==='')return undefined;const value=typeof field.value==='number'?field.value:typeof field.value==='string'?Number(field.value.trim()):NaN;return Number.isFinite(value)&&value>0?value:undefined};
const text=(field?:FieldValue)=>typeof field?.value==='string'?field.value:undefined;
const mapFreshness=(value?:DataCenterFreshness):Freshness=>value==='CURRENT'?'FRESH':value==='AGING'||value==='RECENT'?'AGING':value==='STALE'||value==='EXPIRED'?'STALE':'UNKNOWN';

/** The sole interpretation boundary between immutable Data Center records and league features. */
export function normalizeDataCenterSnapshot(snapshot:DataCenterSnapshot,players:DraftPlayer[]=[]):NormalizedPlayerData[]{
  void players;
  return snapshot.players.map(record=>{const f=record.fields,clay=(record.sourceMetadata.MIKE_CLAY??{}) as Record<string,unknown>,receptions=typeof clay.receptions==='number'?clay.receptions:undefined,ppr=numeric(f.projection);return{
    canonicalPlayerId:record.canonicalPlayerId,displayName:record.displayName,team:record.team,position:record.position,
    providerPosition:String((record.sourceMetadata.FP_IDP as Record<string,unknown>|undefined)?.providerPosition??record.position),
    available:true,keeper:false,drafted:false,
    pprEcr:numeric(f.pprRank),halfPprEcr:numeric(f.halfPprRank),idpRank:numeric(f.idpRank),positionRank:numeric(f.positionRank),
    pprTier:numeric(f.pprTier),halfPprTier:numeric(f.halfPprTier),idpTier:numeric(f.idpTier),compositeAdp:numeric(f.adp),realTimeAdp:numeric(f.realTimeAdp),bye:numeric(f.bye),
    espnTop300Rank:numeric(f.espnRank),clayPprProjection:ppr,clayHalfPprProjection:ppr!=null&&receptions!=null?ppr-.5*receptions:undefined,
    clayFields:clay,clayIdpFields:Object.fromEntries(Object.entries(clay).filter(([key])=>/tackle|sack|interception|defensive|idp/i.test(key))),
    robocopIdpProjection:typeof clay.robocopCustomPoints==='number'?clay.robocopCustomPoints:undefined,injury:text(f.injury),news:text(f.news),provenance:f,
    freshness:f.pprRank?.freshness??f.halfPprRank?.freshness??f.idpRank?.freshness
  }});
}

const authorities=(snapshot?:DataCenterSnapshot)=>snapshot?.sources.map(source=>source.id)??[];
export function selectPlayerDataConsumer(active:DataCenterSnapshot|undefined,pinned:DataCenterSnapshot|undefined,hasDraft:boolean,players:DraftPlayer[]=[],leagueId='',draftSessionId?:string):PlayerDataConsumerView{
  const snapshot=hasDraft?pinned:active,status:PlayerDataViewStatus=hasDraft?(pinned?'DRAFT_PINNED':'LEGACY_FALLBACK'):(active?'ACTIVE_GLOBAL':'LEGACY_FALLBACK'),resolutionState=hasDraft&&pinned?'PINNED_SNAPSHOT_AVAILABLE':!hasDraft&&active?'ACTIVE_SNAPSHOT_AVAILABLE':'NO_SNAPSHOT_AVAILABLE';
  return{leagueId,draftSessionId,resolutionState,snapshot,status,globalIsNewer:!!(active&&pinned&&active.id!==pinned.id),players:snapshot?normalizeDataCenterSnapshot(snapshot,players):[],sourceAuthorities:authorities(snapshot),limitations:snapshot?.limitations??['No active or pinned centralized snapshot is available.']};
}

/** One persisted-snapshot resolver for routes, dashboards, details, and recommendation consumers. */
export async function resolvePlayerDataSnapshot(input:ResolvePlayerDataInput):Promise<SnapshotResolution>{
  try{const active=await input.reader.getActiveDataCenterSnapshot(),hasDraft=!!input.draftSessionId;if(hasDraft&&input.pinnedSnapshotVersion){const pinned=await input.reader.getDataCenterSnapshot(input.pinnedSnapshotVersion);if(!pinned)throw new Error(`Draft-pinned Player Data ${input.pinnedSnapshotVersion} could not be loaded.`);return{state:'PINNED_SNAPSHOT_AVAILABLE',...selectPlayerDataConsumer(active,pinned,true,input.players,input.leagueId,input.draftSessionId)}}return{state:hasDraft?'NO_SNAPSHOT_AVAILABLE':active?'ACTIVE_SNAPSHOT_AVAILABLE':'NO_SNAPSHOT_AVAILABLE',...selectPlayerDataConsumer(active,undefined,hasDraft,input.players,input.leagueId,input.draftSessionId)}}catch(error){return{state:'SNAPSHOT_LOAD_FAILED',error:error instanceof Error?error:new Error('Active player data could not be loaded.')}}
}

export function dataCenterDraftPlayers(view:PlayerDataConsumerView,existing:DraftPlayer[]):DraftPlayer[]{const byCanonical=new Map(existing.filter(player=>player.canonicalPlayerId).map(player=>[player.canonicalPlayerId!,player]));return view.players.map(player=>{const prior=byCanonical.get(player.canonicalPlayerId),adp=player.provenance.adp;return{...prior,id:prior?.id??player.canonicalPlayerId,canonicalPlayerId:player.canonicalPlayerId,displayName:player.displayName,normalizedName:player.displayName.toLowerCase(),position:player.position,nflTeam:player.team,byeWeek:player.bye??prior?.byeWeek,currentBaselineRank:player.pprEcr??player.halfPprEcr,currentPositionRank:player.positionRank,currentTier:player.pprTier??player.halfPprTier,currentAdp:player.compositeAdp,realTimeAdp:player.realTimeAdp,adpSource:'FantasyPros',adpProvenance:adp,adpFreshness:adp?.freshness,playerDataSnapshotVersion:view.snapshot?.version}})}

/** Changes only the snapshot reference and normalized player DTOs after canonical integrity checks. */
export function updateDraftPlayerDataPin(context:DraftContext,view:PlayerDataConsumerView):DraftContext{
  if(!view.snapshot)throw new Error('The latest Player Data snapshot is unavailable.');
  const required=new Set<string>();
  for(const keeper of context.setup.keepers){const canonical=keeper.player.canonicalPlayerId??context.players.find(player=>player.id===keeper.player.id||player.normalizedName===keeper.player.normalizedName)?.canonicalPlayerId;if(!canonical)throw new Error(`Player Data update rejected: keeper ${keeper.player.displayName} has no reconcilable canonical identity.`);required.add(canonical)}
  for(const pick of rebuildDraftState(context).activePicks)if(pick.player.canonicalPlayerId)required.add(pick.player.canonicalPlayerId);
  const available=new Set(view.players.map(player=>player.canonicalPlayerId)),missing=[...required].filter(id=>!available.has(id as CanonicalPlayerId));
  if(missing.length)throw new Error(`Player Data update rejected: ${missing.length} drafted or kept canonical player identities cannot be reconciled.`);
  const players=dataCenterDraftPlayers(view,context.players),next={...context,players,session:{...context.session,previousPlayerDataSnapshotId:context.session.playerDataSnapshotId,playerDataSnapshotId:view.snapshot.id}};
  const before=rebuildDraftState(context),after=rebuildDraftState(next);
  if(before.activePicks.map(p=>p.player.canonicalPlayerId).join('|')!==after.activePicks.map(p=>p.player.canonicalPlayerId).join('|')||before.keeperPlayerIds.size!==after.keeperPlayerIds.size)throw new Error('Player Data update rejected: canonical draft integrity checks failed.');
  return next;
}

export function consumerRankingMaps(view:PlayerDataConsumerView,format:ScoringFormat){const market=new Map<CanonicalPlayerId,RankingValue>(),idp=new Map<CanonicalPlayerId,RankingValue>(),espn=new Map<CanonicalPlayerId,RankingValue>();for(const player of view.players){const updatedAt=view.snapshot?.activatedAt??'',common={source:'Player Data Center',sourceClass:'ANALYST_INTERPRETATION' as const,updatedAt,freshness:mapFreshness(player.freshness)};const rank=format==='PPR'?player.pprEcr:player.halfPprEcr,tier=format==='PPR'?player.pprTier:player.halfPprTier;if(rank!=null)market.set(player.canonicalPlayerId,{...common,overallRank:rank,positionRank:player.positionRank,tier,adp:player.compositeAdp,scoringFormat:format,rankingClass:'OFFENSE'});if(player.idpRank!=null)idp.set(player.canonicalPlayerId,{...common,overallRank:player.idpRank,positionRank:player.positionRank,tier:player.idpTier,scoringFormat:'IDP',rankingClass:'IDP'});if(player.espnTop300Rank!=null)espn.set(player.canonicalPlayerId,{...common,overallRank:player.espnTop300Rank,scoringFormat:'PPR',rankingClass:'OFFENSE'});}return{market,idp,espn};}
