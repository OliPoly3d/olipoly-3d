import type { DraftPlayer, Position, SeasonSetup } from '../domain/models';

export type CanonicalPlayerId = string & { readonly __canonicalPlayerId: unique symbol };
export type Freshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
export type DataQuality = 'COMPLETE' | 'PARTIAL' | 'STALE' | 'MISSING';
export type Confidence = 'HIGH' | 'MED' | 'LOW';
export type SourceClass = 'OFFICIAL' | 'PRIMARY_REPORTING' | 'SECONDARY_REPORTING' | 'ANALYST_INTERPRETATION' | 'SPECULATION';
export type ScoringFormat = 'PPR' | 'HALF_PPR' | 'STANDARD' | 'KEEPER' | 'IDP' | 'OTHER';
export type AvailabilityStatus = 'ACTIVE' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'OUT_FOR_SEASON' | 'PUP' | 'IR' | 'SUSPENDED' | 'HOLDOUT' | 'RETIRED' | 'NOT_IN_PLAYER_POOL' | 'OTHER' | 'UNKNOWN';

export interface SourceReference { source:string; sourceClass:SourceClass; updatedAt:string; fetchedAt?:string; reference?:string }
export interface RankingValue extends SourceReference { overallRank?:number; positionRank?:number; tier?:number; adp?:number; rankSpread?:number; standardDeviation?:number; scoringFormat:ScoringFormat; freshness:Freshness; rankingClass?:'OFFENSE'|'IDP' }
export interface InjuryContext extends SourceReference { status:AvailabilityStatus; bodyArea?:string; practiceParticipation?:string }
export interface RoleContext extends SourceReference { summary:string; confidence:Confidence; tags?:('WORKHORSE'|'COMMITTEE'|'TIMESHARE'|'STARTER'|'BACKUP'|'THIRD_DOWN'|'GOAL_LINE'|'COMPETITION'|'ROOKIE_COMPETITION'|'QB_COMPETITION'|'EASED_IN')[] }
export interface PlayerNewsItem extends SourceReference { id:string; playerId:CanonicalPlayerId; headline:string; summary:string; eventType:string; publishedAt:string; confidence:Confidence; materiality:'HIGH'|'MED'|'LOW' }
export interface IdpContext { rank?:number; tier?:number; tackleOpportunity?:string; snapRole?:string; passRushRole?:string; coverageRole?:string; starterStatus?:string; schemeContext?:string }
export interface PlayerIntelligence { canonicalPlayerId:CanonicalPlayerId; fixturePlayerId?:string; fantasyProsPlayerId?:string; sleeperPlayerId?:string; displayName:string; normalizedName:string; position:Position; nflTeam?:string; byeWeek?:number; active?:boolean; baselineRank?:number; positionRank?:number; tier?:number; adp?:number; sourceValues:RankingValue[]; injury?:InjuryContext; availabilityStatus?:AvailabilityStatus; role?:RoleContext; newsItems:PlayerNewsItem[]; freshness:Freshness; lastUpdated?:string; quality:DataQuality; uncertaintyFlags:string[]; sourceProvenance:SourceReference[]; idp?:IdpContext }
export interface PlayerContextChange { playerId:CanonicalPlayerId; field:'baselineRank'|'role'|'injury'|'availability'; before?:string|number; after?:string|number; reason:string; source:string; detectedAt:string }
export type PlayerDataMode='CURRENT'|'CACHED'|'MANUAL_IMPORT'|'FIXTURE_FALLBACK'|'DEVELOPMENT_FIXTURE';
export interface PlayerDataSnapshot { id:string; version:1; createdAt:string; scoringFormat:ScoringFormat; leagueId?:string; season?:number; quality:DataQuality; freshness:Freshness; mode?:Exclude<PlayerDataMode,'FIXTURE_FALLBACK'|'DEVELOPMENT_FIXTURE'>; playerSource?:string; rankingSource?:string; newsStatus?:string; endpointUpdatedAt?:Partial<Record<'players'|'rankings'|'news'|'injuries',string>>; limitations?:string[]; players:PlayerIntelligence[]; changes:PlayerContextChange[]; providerResults:{providerId:string;status:'SUCCESS'|'FAILED'|'SKIPPED';checkedAt:string;message?:string}[] }

export interface ProviderContext { setup:SeasonSetup; players:DraftPlayer[]; now:string }
export interface PlayerDataProvider { id:string; kind:'PLAYER'|'RANKING'|'NEWS'|'STATUS'|'IDP'; refresh(context:ProviderContext):Promise<Partial<PlayerIntelligence>[]> }
export type RankingProvider = PlayerDataProvider & { kind:'RANKING' };
export type NewsProvider = PlayerDataProvider & { kind:'NEWS' };
export type StatusProvider = PlayerDataProvider & { kind:'STATUS' };
export type IdpProvider = PlayerDataProvider & { kind:'IDP' };
export interface ProviderConfig { providerId:string; enabled:boolean; priority:number; freshHours:number; agingHours:number; scoringFormats:ScoringFormat[]; requiresServerSecret?:boolean }

const suffix=/\b(jr|sr|ii|iii|iv|v)\b/g;
export const normalizePlayerName=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’`-]/g,' ').replace(suffix,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const teams:Record<string,string>={JAC:'JAX',JAX:'JAX',WSH:'WAS',WAS:'WAS',LA:'LAR',LAR:'LAR',STL:'LAR',OAK:'LV',LVR:'LV',LV:'LV',SD:'LAC',LAC:'LAC'};
export const normalizeTeam=(team?:string)=>{const value=team?.trim().toUpperCase();return value?(teams[value]??value):undefined};
const positions:Record<string,Position>={DEF:'DST','D/ST':'DST',DST:'DST',PK:'K',EDGE:'DL',ILB:'LB',OLB:'LB',FS:'DB',SS:'DB'};
export const normalizePosition=(position:string)=>positions[position.trim().toUpperCase()]??position.trim().toUpperCase() as Position;
export function canonicalPlayerId(input:{name:string;team?:string;position:string;vendorId?:string}):CanonicalPlayerId { const position=normalizePosition(input.position),team=normalizeTeam(input.team);if(position==='DST')return `nfl:dst:${team??normalizePlayerName(input.name).replaceAll(' ','-')}` as CanonicalPlayerId;if(input.vendorId)return `nfl:${input.vendorId}` as CanonicalPlayerId;return `nfl:${normalizePlayerName(input.name).replaceAll(' ','-')}:${team??'FA'}:${position}` as CanonicalPlayerId }
export const freshnessAt=(updatedAt:string|undefined,now=new Date(),freshHours=24,agingHours=72):Freshness=>{if(!updatedAt||!Number.isFinite(Date.parse(updatedAt)))return'UNKNOWN';const hours=(now.getTime()-Date.parse(updatedAt))/36e5;return hours<=freshHours?'FRESH':hours<=agingHours?'AGING':'STALE'};
const sourceWeight=(r:RankingValue,target:ScoringFormat)=>{const freshness={FRESH:1,AGING:.65,STALE:.2,UNKNOWN:.3}[r.freshness];const format=r.scoringFormat===target?1:r.scoringFormat==='OTHER'?.55:.25;return freshness*format};
export function aggregateRankings(values:RankingValue[],target:ScoringFormat){const ranked=values.filter((v):v is RankingValue&{overallRank:number}=>v.overallRank!=null&&v.overallRank>0).map(v=>({v,w:sourceWeight(v,target)})).filter(x=>x.w>0);if(!ranked.length)return{uncertaintyFlags:['RANKING_MISSING']};const total=ranked.reduce((n,x)=>n+x.w,0),baselineRank=Math.round(ranked.reduce((n,x)=>n+x.v.overallRank*x.w,0)/total),spread=Math.max(...ranked.map(x=>x.v.overallRank))-Math.min(...ranked.map(x=>x.v.overallRank));return{baselineRank,tier:ranked.find(x=>x.v.tier!=null)?.v.tier,positionRank:ranked.find(x=>x.v.positionRank!=null)?.v.positionRank,adp:ranked.find(x=>x.v.adp!=null)?.v.adp,uncertaintyFlags:[...(spread>=18?['SOURCE_DISAGREEMENT']:[]),...(values.some(v=>v.scoringFormat!==target)?['SCORING_MISMATCH']:[]),...(values.every(v=>v.freshness==='STALE')?['RANKINGS_STALE']:[])]}}
export const isIdpPosition=(p:Position)=>['DL','LB','DB','DT','DE','CB','S'].includes(p);
export const scoringFormatFor=(setup:SeasonSetup):ScoringFormat=>setup.settings.idpEnabled?'KEEPER':setup.settings.ppr===1?'PPR':setup.settings.ppr===.5?'HALF_PPR':'STANDARD';

/** Validates an untrusted persisted or network snapshot before it can become draft authority. */
export function validatePlayerDataSnapshot(value:unknown,season:number,scoringFormat:ScoringFormat):PlayerDataSnapshot|undefined{
  if(!value||typeof value!=='object')return undefined;
  const snapshot=value as Partial<PlayerDataSnapshot>;
  if(snapshot.version!==1||snapshot.season!==season||snapshot.scoringFormat!==scoringFormat||!snapshot.createdAt||!Number.isFinite(Date.parse(snapshot.createdAt))||!Array.isArray(snapshot.players)||!snapshot.players.length)return undefined;
  const identities=new Set<string>();
  for(const player of snapshot.players){
    if(!player||typeof player.canonicalPlayerId!=='string'||!player.canonicalPlayerId||identities.has(player.canonicalPlayerId)||typeof player.displayName!=='string'||!player.displayName.trim()||!Number.isFinite(player.baselineRank)||player.baselineRank!<=0)return undefined;
    identities.add(player.canonicalPlayerId);
  }
  if(!Array.isArray(snapshot.changes)||!Array.isArray(snapshot.providerResults)||typeof snapshot.id!=='string')return undefined;
  return snapshot as PlayerDataSnapshot;
}
export function snapshotId(createdAt:string,format:ScoringFormat,players:PlayerIntelligence[]){const stable=players.map(p=>`${p.canonicalPlayerId}:${p.baselineRank??''}:${p.availabilityStatus??''}:${p.lastUpdated??''}`).sort().join('|');let hash=2166136261;for(const c of `${format}|${createdAt}|${stable}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);return `player-data-v1-${(hash>>>0).toString(16)}`}

export function applySnapshot(players:DraftPlayer[],snapshot?:PlayerDataSnapshot):DraftPlayer[]{if(!snapshot)return players;const byFixture=new Map(snapshot.players.filter(x=>x.fixturePlayerId).map(x=>[x.fixturePlayerId!,x])),byCanonical=new Map(snapshot.players.map(x=>[x.canonicalPlayerId,x]));return players.map(player=>{const current=byFixture.get(player.id)??(player.canonicalPlayerId?byCanonical.get(player.canonicalPlayerId as CanonicalPlayerId):undefined);if(!current)return player;return{...player,canonicalPlayerId:current.canonicalPlayerId,nflTeam:current.nflTeam??player.nflTeam,byeWeek:current.byeWeek??player.byeWeek,currentBaselineRank:current.baselineRank,currentTier:current.tier,currentAdp:current.adp,playerIntelligence:current}})}

/** Selects one atomic player authority. A current snapshot never decorates or mixes with fixtures. */
export function selectPlayerPool(fixtures:DraftPlayer[],snapshot?:PlayerDataSnapshot):DraftPlayer[]{
  if(!snapshot?.players.length)return fixtures;
  return snapshot.players.map((current,index)=>({
    id:current.fixturePlayerId??`current:${current.canonicalPlayerId}`,
    canonicalPlayerId:current.canonicalPlayerId,
    displayName:current.displayName,
    normalizedName:current.normalizedName,
    position:current.position,
    nflTeam:current.nflTeam,
    byeWeek:current.byeWeek,
    currentBaselineRank:current.baselineRank??index+1,
    currentTier:current.tier,
    currentAdp:current.adp,
    playerIntelligence:current,
  }));
}

export function snapshotSources(snapshot?:PlayerDataSnapshot){return snapshot?{mode:snapshot.mode??'CACHED',playerSource:snapshot.playerSource??'CURRENT PLAYER SNAPSHOT',rankingSource:snapshot.rankingSource??snapshot.providerResults[0]?.providerId??'CURRENT RANKING SNAPSHOT',updatedAt:snapshot.createdAt,news:snapshot.newsStatus??'NOT PROVIDED'}:{mode:'FIXTURE_FALLBACK' as const,playerSource:'FIXTURE PLAYER POOL',rankingSource:'BASELINE FIXTURE RANKING',updatedAt:undefined,news:'NOT ENABLED'}}

export interface ImportMetadata { source:string; updatedAt:string; scoringFormat:ScoringFormat }
export interface ImportedRankingRow { player_name:string; team?:string; position:string; overall_rank:number; position_rank?:number; tier?:number; adp?:number; source?:string; updated_at?:string }
export interface ImportPreview { metadata:ImportMetadata; matched:{row:ImportedRankingRow;player:DraftPlayer}[]; unmatched:ImportedRankingRow[]; errors:string[] }
const csvLine=(line:string)=>{const out:string[]= [];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){out.push(value.trim());value=''}else value+=c}out.push(value.trim());return out};
export function parseRankingImport(text:string,metadata:ImportMetadata,players:DraftPlayer[]):ImportPreview {let raw:Record<string,unknown>[]=[];const errors:string[]=[];try{if(text.trim().startsWith('['))raw=JSON.parse(text) as Record<string,unknown>[];else{const lines=text.trim().split(/\r?\n/).filter(Boolean),headers=csvLine(lines.shift()??'').map(x=>x.toLowerCase());raw=lines.map(line=>Object.fromEntries(csvLine(line).map((v,i)=>[headers[i],v])))} }catch{errors.push('File is not valid CSV or JSON.')}const rows:ImportedRankingRow[]=[];for(const [i,row] of raw.entries()){const name=String(row.player_name??'').trim(),position=String(row.position??'').trim(),rank=Number(row.overall_rank);if(!name||!position||!Number.isFinite(rank)||rank<=0){errors.push(`Row ${i+1} requires player_name, position, and a positive overall_rank.`);continue}rows.push({player_name:name,team:String(row.team??'')||undefined,position,overall_rank:rank,position_rank:Number(row.position_rank)||undefined,tier:Number(row.tier)||undefined,adp:Number(row.adp)||undefined,source:String(row.source??'')||undefined,updated_at:String(row.updated_at??'')||undefined})}const matched:ImportPreview['matched']=[],unmatched:ImportedRankingRow[]=[];for(const row of rows){const name=normalizePlayerName(row.player_name),position=normalizePosition(row.position),team=normalizeTeam(row.team);const candidates=players.filter(p=>p.normalizedName===name&&p.position===position&&(!team||!p.nflTeam||normalizeTeam(p.nflTeam)===team));if(candidates.length===1)matched.push({row,player:candidates[0]});else unmatched.push(row)}return{metadata,matched,unmatched,errors}}
export function activateImport(preview:ImportPreview):PlayerDataSnapshot {if(preview.errors.length||(!preview.matched.length&&!preview.unmatched.length))throw new Error('Import cannot be activated until validation succeeds.');const createdAt=preview.metadata.updatedAt,all=[...preview.matched.map(x=>({row:x.row,player:x.player})),...preview.unmatched.map(row=>({row,player:undefined}))],seen=new Set<string>(),players=all.map(({row,player})=>{const updatedAt=row.updated_at??createdAt,position=normalizePosition(row.position),team=normalizeTeam(row.team??player?.nflTeam),canonical=(player?.canonicalPlayerId as CanonicalPlayerId|null|undefined)??canonicalPlayerId({name:row.player_name,team,position}),identity=String(canonical);if(seen.has(identity))throw new Error(`Duplicate player identity: ${row.player_name}.`);seen.add(identity);const ranking:RankingValue={source:row.source??preview.metadata.source,sourceClass:'ANALYST_INTERPRETATION',updatedAt,overallRank:row.overall_rank,positionRank:row.position_rank,tier:row.tier,adp:row.adp,scoringFormat:preview.metadata.scoringFormat,freshness:freshnessAt(updatedAt)};return{canonicalPlayerId:canonical,fixturePlayerId:player&&!player.id.startsWith('synthetic-')?player.id:undefined,displayName:row.player_name,normalizedName:normalizePlayerName(row.player_name),position,nflTeam:team,byeWeek:player?.byeWeek,baselineRank:row.overall_rank,positionRank:row.position_rank,tier:row.tier,adp:row.adp,sourceValues:[ranking],newsItems:[],freshness:ranking.freshness,lastUpdated:updatedAt,quality:ranking.freshness==='STALE'?'STALE':'PARTIAL',uncertaintyFlags:[],sourceProvenance:[ranking]} satisfies PlayerIntelligence});return{id:snapshotId(createdAt,preview.metadata.scoringFormat,players),version:1,createdAt,scoringFormat:preview.metadata.scoringFormat,mode:'MANUAL_IMPORT',playerSource:'MANUAL PLAYER IMPORT',rankingSource:preview.metadata.source.toUpperCase(),newsStatus:'NOT PROVIDED',quality:'COMPLETE',freshness:players.some(p=>p.freshness==='STALE')?'STALE':players.every(p=>p.freshness==='FRESH')?'FRESH':'AGING',players,changes:[],providerResults:[{providerId:`manual:${preview.metadata.source}`,status:'SUCCESS',checkedAt:new Date().toISOString(),message:`${players.length} imported; ${preview.matched.length} matched existing identities`}]}}

export async function refreshPlayerData(current:PlayerDataSnapshot|undefined,context:ProviderContext,providers:PlayerDataProvider[]):Promise<PlayerDataSnapshot>{const enabled=providers.filter(Boolean);if(!enabled.length)throw new Error('No automatic providers are configured; use manual import.');const results=await Promise.allSettled(enabled.map(p=>p.refresh(context)));const successful=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.map(x=>({...x,__provider:enabled[i].id})):[]);if(!successful.length)throw new Error('All player-data providers failed; the last good snapshot was preserved.');throw new Error('Provider merge is reserved for a configured legal source.');}
