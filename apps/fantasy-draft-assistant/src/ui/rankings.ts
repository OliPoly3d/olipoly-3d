import type { PlayerDataSnapshot, RankingValue } from '../data/player-data';
import { rankingSources } from '../data/player-data';
import type { DraftFit } from '../intelligence/recommendation-engine';
import type { DraftPlayer, DraftState, Position } from '../domain/models';

export interface RankingRow { player:DraftPlayer; market:RankingValue; draftFit?:DraftFit; delta?:number; available:boolean }
export interface RankingFilters { position?:Position; search?:string; availableOnly?:boolean; team?:string; tier?:number }

export function rankingRows(snapshot:PlayerDataSnapshot|undefined,players:DraftPlayer[],state:DraftState,draftFits:DraftFit[]):RankingRow[]{
  const source=rankingSources(snapshot).find(item=>item.id==='FANTASYPROS_ECR');
  if(!source)return[];
  const byCanonical=new Map(players.filter(player=>player.canonicalPlayerId).map(player=>[player.canonicalPlayerId!,player]));
  const fits=new Map(draftFits.map(fit=>[fit.playerId,fit]));
  const available=new Set(state.available.map(player=>player.id));
  return [...source.rankings.entries()].flatMap(([canonical,market])=>{const player=byCanonical.get(canonical);if(!player||player.historyOnly||market.overallRank==null)return[];const draftFit=fits.get(player.id);return[{player,market,draftFit,delta:draftFit?market.overallRank-draftFit.rank:undefined,available:available.has(player.id)}]}).sort((a,b)=>a.market.overallRank!-b.market.overallRank!);
}

export function filterRankingRows(rows:RankingRow[],filters:RankingFilters):RankingRow[]{
  const search=filters.search?.trim().toLowerCase();
  return rows.filter(row=>(!filters.position||row.player.position===filters.position)&&(!search||row.player.displayName.toLowerCase().includes(search))&&(!filters.availableOnly||row.available)&&(!filters.team||row.player.nflTeam===filters.team)&&(filters.tier==null||row.market.tier===filters.tier));
}

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function deltaLabel(delta:number|undefined){return delta==null?{text:'—',label:'Draft Fit unavailable'}:delta>0?{text:`+${delta} ↑`,label:`Assistant values player ${delta} spots above FantasyPros ECR`}:delta<0?{text:`${delta} ↓`,label:`Assistant values player ${Math.abs(delta)} spots below FantasyPros ECR`}:{text:'0 =',label:'Aligned with FantasyPros ECR'}}
export function rankingsTableMarkup(rows:RankingRow[]):string{return rows.length?`<div class="rankings-table" role="table"><div class="rankings-row rankings-header" role="row"><b>RANK</b><b>PLAYER</b><b>POS</b><b>TEAM</b><b>FP ECR</b><b>POS RANK</b><b>TIER</b><b>FP ADP</b><b>DRAFT FIT</b><b>DELTA</b><b>STATUS</b><b>WHY</b></div>${rows.map((row,index)=>{const delta=deltaLabel(row.delta);return`<div class="rankings-row" role="row" data-ranking-player="${escape(row.player.id)}" data-position="${row.player.position}" data-available="${row.available}"><span>${index+1}</span><b>${escape(row.player.displayName)}</b><span>${row.player.position}</span><span>${escape(row.player.nflTeam??'—')}</span><span>${row.market.overallRank}</span><span>${row.market.positionRank??'—'}</span><span>${row.market.tier??'—'}</span><span>${row.market.adp??'—'}</span><span>${row.draftFit?.rank??'—'}</span><strong class="delta ${row.delta==null?'':row.delta>0?'above':row.delta<0?'below':'aligned'}" title="${escape(delta.label)}">${delta.text}</strong><span>${row.available?'AVAILABLE':'DRAFTED'}</span><button data-ranking-why="${escape(row.player.id)}" ${row.draftFit?'':'disabled'}>WHY</button></div>`}).join('')}</div>`:'<p class="empty">No rankings match these filters.</p>'}
