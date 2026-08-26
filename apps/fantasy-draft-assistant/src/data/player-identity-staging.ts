import type { DraftPlayer, Position } from '../domain/models';
import { canonicalPlayerId, normalizePlayerName, normalizePosition, normalizeTeam } from './player-data';
import { reconcileDataCenterSource, type DataCenterRow, type ParsedSource, type PlayerDataSourceId, type ReconciledSource } from './player-data-center';

export type IdentityDisposition='BLOCKING_IDENTITY'|'REVIEW_RECOMMENDED'|'INFORMATIONAL_EXCLUDED';
export const DRAFT_POOL_BOUNDARIES={FP_PPR:360,FP_HALF_PPR:420,FP_IDP:240} as const;
const primary=new Set<PlayerDataSourceId>(['FP_PPR','FP_HALF_PPR','FP_IDP']);
const fantasyPositions=new Set(['QB','RB','WR','TE','K','DST','DL','LB','DB']);
const supplementalReview=new Set<PlayerDataSourceId>(['ESPN_TOP_300','MIKE_CLAY','ESPN_INJURIES','DRAFT_SHARKS']);

const family=(position?:Position)=>{const normalized=normalizePosition(position??'');return ['DE','DT','DL'].includes(normalized)?'DL':['CB','S','DB'].includes(normalized)?'DB':normalized};
const identityKey=(row:DataCenterRow)=>row.providerId?`provider:${row.source}:${row.providerId}`:`player:${normalizePlayerName(row.playerName)}|${normalizeTeam(row.team)??''}|${family(row.position)}`;
const occurrenceKey=(row:DataCenterRow)=>`${row.source}|${identityKey(row)}|${row.overallRank??''}|${row.adp??''}|${row.bye??''}|${row.headline??''}`;
const withinBoundary=(row:DataCenterRow)=>row.source==='FP_PPR'?(row.overallRank??Infinity)<=DRAFT_POOL_BOUNDARIES.FP_PPR:row.source==='FP_HALF_PPR'?(row.overallRank??Infinity)<=DRAFT_POOL_BOUNDARIES.FP_HALF_PPR:row.source==='FP_IDP'?(row.overallRank??Infinity)<=DRAFT_POOL_BOUNDARIES.FP_IDP:false;
const meaningfulSupplement=(row:DataCenterRow)=>fantasyPositions.has(family(row.position))&&!!normalizePlayerName(row.playerName);

export interface IdentityEvidence{source:PlayerDataSourceId;row:DataCenterRow;status:'MATCHED'|'AMBIGUOUS'|'UNMATCHED'|'DUPLICATE'|'EXCLUDED';canonicalPlayerId?:string}
export interface StagedIdentityGroup{id:string;normalizedName:string;team?:string;position:string;evidence:IdentityEvidence[];candidates:DraftPlayer[];player?:DraftPlayer;created?:boolean;disposition:IdentityDisposition;reason:string}
export interface SourceIdentityDiagnostic{source:PlayerDataSourceId;parsedRows:number;uniqueSourceIdentities:number;exactMatches:number;aliasMatches:number;ambiguous:number;unmatched:number;duplicates:number;nonFantasy:number;blocking:number;outsidePool:number;active:number;informational:number;usableCoverage:number}
export interface IdentityStagingResult{groups:StagedIdentityGroup[];sources:ReconciledSource[];diagnostics:SourceIdentityDiagnostic[];blockingGroups:StagedIdentityGroup[];reviewGroups:StagedIdentityGroup[];stagedPlayers:DraftPlayer[];existingMatches:number;informationalRows:number;repeatedAppearances:number;uniqueNormalizedPlayers:number;canonicalPoolSize:number;keeperAuthorityResolutions:number;duplicateCanonicalIdentities:{normalizedName:string;position:string;canonicalPlayerIds:string[]}[]}

const validTeams=new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS','FA']);
/** Creates candidates only from agreement between independent primary ranking files. Supplemental rows can join, but can never create, an identity. */
export function bootstrapPrimaryIdentities(sources:ParsedSource[],existing:DraftPlayer[]):DraftPlayer[]{
 const evidence=new Map<string,DataCenterRow[]>();
 for(const source of sources.filter(item=>primary.has(item.id)))for(const row of source.rows){const name=normalizePlayerName(row.playerName),position=family(row.position),team=normalizeTeam(row.team)??'FA';if(!name||!fantasyPositions.has(position)||!validTeams.has(team))continue;const key=`${name}|${position}`;evidence.set(key,[...(evidence.get(key)??[]),row])}
 const created:DraftPlayer[]=[];
 for(const rows of evidence.values()){const sourceIds=new Set(rows.map(row=>row.source)),teams=new Set(rows.map(row=>normalizeTeam(row.team)??'FA')),sample=rows[0],name=normalizePlayerName(sample.playerName),position=family(sample.position) as Position,trustedIdp=rows.some(row=>row.source==='FP_IDP'&&withinBoundary(row))&&name.split(' ').length>1&&name.split(' ').every(part=>part.length>1);if((sourceIds.size<2&&position!=='DST'&&!trustedIdp)||teams.size!==1)continue;
  const plausible=existing.filter(player=>normalizePlayerName(player.displayName)===name&&family(player.position)===position);if(plausible.length)continue;const team=[...teams][0],id=canonicalPlayerId({name:sample.playerName,team,position});created.push({id,canonicalPlayerId:id,displayName:sample.playerName.trim(),normalizedName:name,position,nflTeam:team==='FA'?undefined:team})
 }
 return created;
}

/** Reconciles all uploads against the already-loaded canonical pool, then consolidates review by safe player evidence. */
export function stagePlayerIdentities(sources:ParsedSource[],players:DraftPlayer[],keeperCanonicalIds:ReadonlySet<string>=new Set()):IdentityStagingResult{
 const stagedPlayers=bootstrapPrimaryIdentities(sources,players),candidatePool=[...players,...stagedPlayers],stagedIds=new Set(stagedPlayers.map(player=>player.canonicalPlayerId)),reconciled=sources.map(source=>reconcileDataCenterSource(source,candidatePool)),groups=new Map<string,StagedIdentityGroup>(),seenOccurrences=new Set<string>(),diagnostics:SourceIdentityDiagnostic[]=[];
 let keeperAuthorityResolutions=0;
 for(const source of reconciled)for(const ambiguous of [...source.ambiguous]){const authoritative=ambiguous.candidates.filter(player=>player.canonicalPlayerId&&keeperCanonicalIds.has(player.canonicalPlayerId));if(authoritative.length!==1)continue;source.ambiguous=source.ambiguous.filter(item=>item!==ambiguous);source.matched.push({row:ambiguous.row,player:authoritative[0]});keeperAuthorityResolutions++}
 for(const source of reconciled){let duplicates=0,nonFantasy=0,outsidePool=0,informational=0;const unique=new Set<string>();
  const matchedByRow=new Map(source.matched.map(item=>[item.row,item.player])),ambiguousByRow=new Map(source.ambiguous.map(item=>[item.row,item.candidates]));
  for(const row of source.rows){const occurrence=occurrenceKey(row),duplicate=seenOccurrences.has(occurrence);seenOccurrences.add(occurrence);if(duplicate){duplicates++;continue}unique.add(identityKey(row));
   const matched=matchedByRow.get(row),candidates=ambiguousByRow.get(row)??[],isPrimary=primary.has(row.source),inPool=isPrimary&&withinBoundary(row),isFantasy=meaningfulSupplement(row);
   if(!isFantasy)nonFantasy++;if(isPrimary&&!inPool)outsidePool++;
   let disposition:IdentityDisposition='INFORMATIONAL_EXCLUDED',reason='Supplemental, malformed, non-fantasy, duplicate, or outside the supported draft pool.';
   if(!matched&&inPool){disposition='BLOCKING_IDENTITY';reason=candidates.length?'Primary ranking identity has multiple compatible canonical candidates.':'Primary ranking identity in the useful draft universe has no safe canonical match.'}
   else if(!matched&&supplementalReview.has(row.source)&&isFantasy){disposition='REVIEW_RECOMMENDED';reason='Supplemental fantasy record has no safe canonical match and is excluded from active effects.'}
   else if(!matched)informational++;
   const key=matched?.canonicalPlayerId?`canonical:${matched.canonicalPlayerId}`:identityKey(row),existing=groups.get(key),evidence:IdentityEvidence={source:row.source,row,status:matched?'MATCHED':candidates.length?'AMBIGUOUS':disposition==='INFORMATIONAL_EXCLUDED'?'EXCLUDED':'UNMATCHED',canonicalPlayerId:matched?.canonicalPlayerId??undefined};
   if(existing){existing.evidence.push(evidence);existing.candidates=[...new Map([...existing.candidates,...candidates].map(player=>[player.canonicalPlayerId,player])).values()];if(disposition==='BLOCKING_IDENTITY'||(disposition==='REVIEW_RECOMMENDED'&&existing.disposition==='INFORMATIONAL_EXCLUDED')){existing.disposition=disposition;existing.reason=reason}if(matched)existing.player=matched}
   else groups.set(key,{id:key,normalizedName:normalizePlayerName(row.playerName),team:normalizeTeam(row.team),position:family(row.position),evidence:[evidence],candidates,player:matched,created:!!matched?.canonicalPlayerId&&stagedIds.has(matched.canonicalPlayerId),disposition,reason});
  }
  const blocking=[...groups.values()].filter(group=>group.disposition==='BLOCKING_IDENTITY'&&group.evidence.some(item=>item.source===source.id)).length,matched=source.matched.length,denominator=matched+source.ambiguous.filter(item=>withinBoundary(item.row)).length+source.unmatched.filter(withinBoundary).length;
  diagnostics.push({source:source.id,parsedRows:source.rows.length,uniqueSourceIdentities:unique.size,exactMatches:matched,aliasMatches:0,ambiguous:source.ambiguous.length,unmatched:source.unmatched.length,duplicates,nonFantasy,blocking,outsidePool,active:matched,informational,usableCoverage:denominator?Math.round(matched/denominator*1000)/10:0});
 }
 const all=[...groups.values()],blockingGroups=all.filter(group=>group.disposition==='BLOCKING_IDENTITY'),reviewGroups=all.filter(group=>group.disposition==='REVIEW_RECOMMENDED');
 // Only unresolved primary identities remain activation-blocking. Every unmatched supplemental/deep row stays provenance-only.
 const safeSources=reconciled.map(source=>({...source,ambiguous:source.ambiguous.filter(item=>blockingGroups.some(group=>group.evidence.some(e=>e.row===item.row))),unmatched:source.unmatched.filter(row=>blockingGroups.some(group=>group.evidence.some(e=>e.row===row)))}));
 const duplicateCanonicalIdentities=[...new Map(candidatePool.filter(player=>player.canonicalPlayerId).map(player=>[`${normalizePlayerName(player.displayName)}|${family(player.position)}`,candidatePool.filter(other=>other.canonicalPlayerId&&normalizePlayerName(other.displayName)===normalizePlayerName(player.displayName)&&family(other.position)===family(player.position))])).entries()].filter(([,items])=>new Set(items.map(item=>item.canonicalPlayerId)).size>1).map(([key,items])=>({normalizedName:key.split('|')[0],position:key.split('|')[1],canonicalPlayerIds:[...new Set(items.map(item=>item.canonicalPlayerId!))]}));
 return{groups:all,sources:safeSources,diagnostics,blockingGroups,reviewGroups,stagedPlayers,existingMatches:all.filter(group=>group.player&&!group.created).length,informationalRows:all.filter(group=>group.disposition==='INFORMATIONAL_EXCLUDED').reduce((sum,group)=>sum+group.evidence.length,0),repeatedAppearances:sources.reduce((sum,source)=>sum+source.rows.length,0)-all.length,uniqueNormalizedPlayers:new Set(sources.flatMap(source=>source.rows.map(row=>normalizePlayerName(row.playerName))).filter(Boolean)).size,canonicalPoolSize:candidatePool.length,keeperAuthorityResolutions,duplicateCanonicalIdentities};
}

export function resolveIdentityGroup(staging:IdentityStagingResult,groupId:string,player:DraftPlayer):IdentityStagingResult{
 const target=staging.groups.find(group=>group.id===groupId);if(!target)throw new Error('Identity group was not found.');
 const compatible=target.evidence.every(({row})=>normalizePlayerName(row.playerName)===normalizePlayerName(player.displayName)&&family(row.position)===family(player.position));if(!compatible)throw new Error('The selected canonical player is not compatible with every source record in this identity group.');
 const sources=staging.sources.map(source=>{const rows=target.evidence.filter(item=>item.source===source.id).map(item=>item.row);return{...source,matched:[...source.matched.filter(item=>!rows.includes(item.row)),...rows.map(row=>({row,player,manual:true}))],unmatched:source.unmatched.filter(row=>!rows.includes(row)),ambiguous:source.ambiguous.filter(item=>!rows.includes(item.row))}});
 return{...staging,sources,groups:staging.groups.map(group=>group.id===groupId?{...group,player,disposition:'INFORMATIONAL_EXCLUDED',reason:'Resolved once for every compatible source appearance.',evidence:group.evidence.map(item=>({...item,status:'MATCHED',canonicalPlayerId:player.canonicalPlayerId??undefined}))}:group),blockingGroups:staging.blockingGroups.filter(group=>group.id!==groupId),reviewGroups:staging.reviewGroups.filter(group=>group.id!==groupId)};
}
