import type { EspnRankingSource } from '../data/espn-rankings';
import type { FantasyProsCsvSource } from '../data/fantasypros-csv';
import type { PlayerDataSnapshot, RankingValue } from '../data/player-data';
import { rankingSources } from '../data/player-data';
import type { DraftFit } from '../intelligence/recommendation-engine';
import type { DraftPlayer, DraftState, PlayerInterest, Position } from '../domain/models';
import { interestBadge } from './live-room';

export type RankingMode='FANTASYPROS'|'ESPN'|'COMPARE';
export type RankingSortKey='fp'|'idp'|'espn'|'draftFit'|'deltaFp'|'deltaEspn'|'positionRank'|'tier'|'adp';
export type RankingSortDirection='asc'|'desc';
export interface RankingSort { key:RankingSortKey; direction:RankingSortDirection }
export interface RankingRow { player:DraftPlayer; market?:RankingValue; idp?:RankingValue; espn?:RankingValue; draftFit?:DraftFit; delta?:number; espnDelta?:number; available:boolean }
export interface RankingFilters { position?:Position; search?:string; availableOnly?:boolean; team?:string; tier?:number }
export const ESPN_IGNORE_VALUE='__IGNORE__';
export const ESPN_CLEAR_VALUE='';
export const locationDefaultAvailable=(hash:string)=>hash.endsWith('/rankings/draft');
export function espnReconciliationOptions(players:DraftPlayer[]):{value:string;label:string}[]{const canonical=players.filter(player=>player.canonicalPlayerId).sort((a,b)=>a.displayName.localeCompare(b.displayName,undefined,{sensitivity:'base'})||a.position.localeCompare(b.position)||(a.nflTeam??'').localeCompare(b.nflTeam??''));return[{value:ESPN_CLEAR_VALUE,label:'SELECT MATCH...'},{value:ESPN_IGNORE_VALUE,label:'IGNORE — No canonical match'},...canonical.map(player=>({value:player.id,label:`${player.displayName} · ${player.position} · ${player.nflTeam??'—'}`}))]}

export function rankingRows(snapshot:PlayerDataSnapshot|undefined,players:DraftPlayer[],state:DraftState,draftFits:DraftFit[],espn?:EspnRankingSource,manualAll?:FantasyProsCsvSource,manualIdp?:FantasyProsCsvSource):RankingRow[]{
  const api=rankingSources(snapshot).find(item=>item.id==='FANTASYPROS_ECR'),all=manualAll??api;
  if(!all&&!manualIdp)return[];
  const byCanonical=new Map(players.filter(player=>player.canonicalPlayerId).map(player=>[player.canonicalPlayerId!,player])),fits=new Map(draftFits.map(fit=>[fit.playerId,fit])),available=new Set(state.available.map(player=>player.id)),canonicalIds=new Set([...(all?.rankings.keys()??[]),...(manualIdp?.rankings.keys()??[])]);
  return [...canonicalIds].flatMap(canonical=>{
    const player=byCanonical.get(canonical);if(!player||player.historyOnly)return[];
    const allValue=all?.rankings.get(canonical),market=allValue?(manualAll||snapshot?.mode==='MANUAL_IMPORT'?allValue:{...allValue,overallRank:undefined}):undefined,idp=manualIdp?.rankings.get(canonical),draftFit=fits.get(player.id),espnValue=espn?.rankings.get(canonical);
    return[{player,market,idp,espn:espnValue,draftFit,delta:draftFit&&market?.overallRank!=null?market.overallRank-draftFit.rank:undefined,espnDelta:draftFit&&espnValue?.overallRank!=null?espnValue.overallRank-draftFit.rank:undefined,available:available.has(player.id)}];
  }).sort(classAwareFallback);
}

const classAwareFallback=(a:RankingRow,b:RankingRow)=>(a.market?.overallRank??Number.MAX_SAFE_INTEGER)-(b.market?.overallRank??Number.MAX_SAFE_INTEGER)||(a.market?0:1)-(b.market?0:1)||(a.idp?.overallRank??Number.MAX_SAFE_INTEGER)-(b.idp?.overallRank??Number.MAX_SAFE_INTEGER)||a.player.id.localeCompare(b.player.id);
const sortValue=(row:RankingRow,key:RankingSortKey)=>key==='fp'?row.market?.overallRank:key==='idp'?row.idp?.overallRank:key==='espn'?row.espn?.overallRank:key==='draftFit'?row.draftFit?.rank:key==='deltaFp'?row.delta:key==='deltaEspn'?row.espnDelta:key==='positionRank'?(row.market?.positionRank??row.idp?.positionRank):key==='tier'?row.market?.tier:row.market?.adp;
export function sortRankingRows(rows:RankingRow[],sort:RankingSort):RankingRow[]{return[...rows].sort((a,b)=>{const av=sortValue(a,sort.key),bv=sortValue(b,sort.key);if(av==null&&bv==null)return classAwareFallback(a,b);if(av==null)return 1;if(bv==null)return-1;const result=av-bv;return(result?(sort.direction==='asc'?result:-result):0)||classAwareFallback(a,b)})}
export function orderRankingRows(rows:RankingRow[],mode:RankingMode):RankingRow[]{return sortRankingRows(rows,{key:mode==='ESPN'?'espn':'fp',direction:'asc'})}
export function filterRankingRows(rows:RankingRow[],filters:RankingFilters):RankingRow[]{const search=filters.search?.trim().toLowerCase();return rows.filter(row=>(!filters.position||row.player.position===filters.position)&&(!search||row.player.displayName.toLowerCase().includes(search))&&(!filters.availableOnly||row.available)&&(!filters.team||row.player.nflTeam===filters.team)&&(filters.tier==null||row.market?.tier===filters.tier))}
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function deltaLabel(delta:number|undefined,source='FantasyPros ECR'){return delta==null?{text:'—',label:'Draft Fit or source ranking unavailable'}:delta>0?{text:`+${delta} ↑`,label:`Assistant values player ${delta} spots above ${source}`}:delta<0?{text:`${delta} ↓`,label:`Assistant values player ${Math.abs(delta)} spots below ${source}`}:{text:'0 =',label:`Aligned with ${source}`}}
const header=(label:string,key:RankingSortKey,sort?:RankingSort)=>`<button class="ranking-sort" data-ranking-sort="${key}" aria-label="Sort by ${label}">${label}${sort?.key===key?` <span aria-hidden="true">${sort.direction==='asc'?'▲':'▼'}</span>`:''}</button>`;
export function rankingsTableMarkup(rows:RankingRow[],mode:RankingMode='FANTASYPROS',sort?:RankingSort,interests:PlayerInterest[]=[]):string{const showFp=mode!=='ESPN',showEspn=mode!=='FANTASYPROS',showIdp=showFp&&rows.some(row=>row.idp);return rows.length?`<div class="rankings-table ${mode.toLowerCase()} ${showIdp?'has-idp':''}" role="table"><div class="rankings-row rankings-header" role="row"><b>PLAYER</b><b>POS</b><b>TEAM</b>${showFp?header('FP ECR','fp',sort):''}${showIdp?header('FP IDP','idp',sort):''}${showEspn?header('ESPN','espn',sort):''}${header('DRAFT FIT','draftFit',sort)}${showFp?header('DELTA VS FP','deltaFp',sort):''}${showEspn?header('DELTA VS ESPN','deltaEspn',sort):''}${header('POS RANK','positionRank',sort)}${header('TIER','tier',sort)}${header('ADP','adp',sort)}<b>STATUS</b><b>WHY</b></div>${rows.map(row=>{const fp=deltaLabel(row.delta),espn=deltaLabel(row.espnDelta,'ESPN');return`<div class="rankings-row" role="row" data-ranking-player="${escape(row.player.id)}"><b>${escape(row.player.displayName)}${interestBadge(interests.find(interest=>interest.playerId===row.player.id))}</b><span>${row.player.position}</span><span>${escape(row.player.nflTeam??'—')}</span>${showFp?`<span>${row.market?.overallRank??'—'}</span>`:''}${showIdp?`<span>${row.idp?.overallRank??'—'}</span>`:''}${showEspn?`<span>${row.espn?.overallRank??'—'}</span>`:''}<span>${row.draftFit?.rank??'—'}</span>${showFp?`<strong title="${escape(fp.label)}">${fp.text}</strong>`:''}${showEspn?`<strong title="${escape(espn.label)}">${espn.text}</strong>`:''}<span>${row.market?.positionRank??row.idp?.positionRank??'—'}</span><span>${row.market?.tier??'—'}</span><span>${row.market?.adp??'—'}</span><span>${row.available?'AVAILABLE':'DRAFTED'}</span><button data-ranking-why="${escape(row.player.id)}" ${row.draftFit?'':'disabled'}>WHY</button></div>`}).join('')}</div>`:'<p class="empty">No players match the current filters.</p>'}
