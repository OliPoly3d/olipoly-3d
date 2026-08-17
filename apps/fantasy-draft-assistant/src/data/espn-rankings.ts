import type { DraftPlayer, Position } from '../domain/models';
import { freshnessAt, normalizePlayerName, normalizePosition, normalizeTeam, type CanonicalPlayerId, type RankingSource, type RankingValue, type ScoringFormat } from './player-data';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export interface EspnRankingValue extends Pick<RankingValue,'source'|'sourceClass'|'updatedAt'|'overallRank'|'positionRank'|'scoringFormat'|'freshness'> { byeWeek?:number }
export interface EspnImportDiagnostics { matched:number; unmatched:number; ambiguous:number; invalid:number; ignored:number }
export interface EspnRankingSource extends Omit<RankingSource,'updatedAt'|'rankings'> { id:'ESPN'; label:'ESPN PPR300'; season:number; sourceUpdatedAt:string|null; importedAt:string; originalFilename:string; detectedRows:number; diagnostics:EspnImportDiagnostics; ignoredRows?:{rank?:number;reason:string}[]; rankings:Map<CanonicalPlayerId,EspnRankingValue> }
export interface EspnImportRow { player_name:string; team?:string; position:string; overall_rank:number; position_rank?:number; bye_week?:number }
export interface EspnImportMetadata { season:number; scoringFormat:'PPR'; rankingType:'PPR300'; sourceUpdatedAt:string|null; importedAt:string; originalFilename:string }
export interface EspnInvalidRow { row:number; detectedRank?:number; rawText:string; reason:string; sourceRow?:EspnImportRow }
export interface EspnImportPreview { metadata:EspnImportMetadata; rows:EspnImportRow[]; matched:{row:EspnImportRow;player:DraftPlayer;manual?:boolean}[]; unmatched:EspnImportRow[]; ambiguous:{row:EspnImportRow;candidates:DraftPlayer[]}[]; invalid:EspnInvalidRow[]; ignored:EspnImportRow[]; excludedInvalid:EspnInvalidRow[] }

const fantasyPositions=new Set<Position>(['QB','RB','WR','TE','K','DST']);
const aliases:Record<string,string>={'gabe davis':'gabriel davis','hollywood brown':'marquise brown','chig okonkwo':'chigoziem okonkwo'};
const csvLine=(line:string)=>{const values:string[]= [];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){values.push(value.trim());value=''}else value+=c}values.push(value.trim());return values};
const optionalInteger=(value:unknown)=>value==null||value===''?undefined:Number.isInteger(Number(value))?Number(value):undefined;

export const pdfWorkerSrc=pdfWorkerUrl;
export const configurePdfWorker=(pdfjs:{GlobalWorkerOptions:{workerSrc:string}})=>{pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerSrc};

/** Extracts text in the browser. OCR is deliberately not attempted. */
export async function extractPdfText(data:ArrayBuffer):Promise<string>{
  const pages:string[]=[];
  try{
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    configurePdfWorker(pdfjs);
    const document=await pdfjs.getDocument({data:new Uint8Array(data)}).promise;
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){const page=await document.getPage(pageNumber),content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '))}
  }catch(error){
    console.error('ESPN PDF import failed while PDF.js was reading the document.',error);
    throw new Error('Unable to read this PDF. The existing ESPN rankings were not changed.');
  }
  const text=pages.join('\n').replace(/\s+/g,' ').trim();
  if(!text)throw new Error('This PDF contains no usable text. Scanned/image-only PDFs are unsupported; upload the text-based ESPN PPR Top 300 PDF.');
  return text;
}

export function parseEspnPdfText(text:string):{rows:EspnImportRow[];invalid:EspnImportPreview['invalid']} {
  if(!text.trim())throw new Error('This PDF contains no usable text. Scanned/image-only PDFs are unsupported.');
  const rows:EspnImportRow[]=[],invalid:EspnImportPreview['invalid']=[];
  // Printed rank is authoritative; extraction order is intentionally discarded.
  const pattern=/(?:^|\s)(\d{1,3})\s*\.?\s*\(\s*(QB|RB|WR|TE|K|D\/ST|DST)(\d{1,3})\s*\)\s+([A-Za-zÀ-ž.'’`\- ]+?)\s*,\s*([A-Z]{2,3})\s+\$\s*\d+(?:\.\d+)?\s+(\d{1,2})(?=\s|$)/g;
  for(const match of text.matchAll(pattern)){const overallRank=Number(match[1]),position=normalizePosition(match[2]),positionRank=Number(match[3]),playerName=match[4].replace(/\s+/g,' ').trim(),byeWeek=Number(match[6]);if(overallRank<1||overallRank>300||!fantasyPositions.has(position)||!playerName){invalid.push({row:overallRank,detectedRank:overallRank,rawText:match[0].trim(),reason:'Rank must be 1-300 with a player name and recognized fantasy position.'});continue}rows.push({overall_rank:overallRank,position,position_rank:positionRank,player_name:playerName,team:normalizeTeam(match[5]),bye_week:byeWeek})}
  const seen=new Set<number>();for(const row of rows)if(seen.has(row.overall_rank))invalid.push({row:row.overall_rank,detectedRank:row.overall_rank,rawText:`${row.overall_rank}. (${row.position}${row.position_rank??'?'}) ${row.player_name}, ${row.team??'—'}`,reason:`Duplicate overall rank ${row.overall_rank}.`,sourceRow:row});else seen.add(row.overall_rank);
  if(!rows.length)invalid.push({row:0,rawText:text.replace(/\s+/g,' ').trim().slice(0,500),reason:'No ESPN PPR Top 300 ranking rows were detected; this may be a header, footer, or malformed PDF extraction.'});
  return{rows:rows.sort((a,b)=>a.overall_rank-b.overall_rank),invalid};
}

function parseStructured(text:string){let raw:Record<string,unknown>[]=[];if(text.trim().startsWith('[')){const value=JSON.parse(text);if(!Array.isArray(value))throw new Error('JSON must be an array.');raw=value}else{const lines=text.trim().split(/\r?\n/).filter(Boolean),headers=csvLine(lines.shift()??'').map(x=>x.toLowerCase());raw=lines.map(line=>Object.fromEntries(csvLine(line).map((value,index)=>[headers[index],value])))}return raw.map(value=>({player_name:String(value.player_name??'').trim(),team:String(value.team??'').trim()||undefined,position:String(value.position??'').trim(),overall_rank:Number(value.overall_rank),position_rank:optionalInteger(value.position_rank),bye_week:optionalInteger(value.bye_week)} satisfies EspnImportRow))}
function metadataFrom(text:string,filename:string,now:Date):EspnImportMetadata{const season=Number(text.match(/\b(20\d{2})\s+ESPN\s+Fantasy Football Draft Kit/i)?.[1]??now.getUTCFullYear()),date=text.match(/(?:updated|published)\s*(?:on|:)??\s*([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})/i)?.[1];return{season,scoringFormat:'PPR',rankingType:'PPR300',sourceUpdatedAt:date?new Date(date).toISOString():null,importedAt:now.toISOString(),originalFilename:filename}}

export function reconcileEspnRows(rows:EspnImportRow[],players:DraftPlayer[],metadata:EspnImportMetadata,invalid:EspnImportPreview['invalid']=[]):EspnImportPreview{
  const matched:EspnImportPreview['matched']=[],unmatched:EspnImportRow[]=[],ambiguous:EspnImportPreview['ambiguous']=[];
  for(const row of rows){const name=normalizePlayerName(row.player_name),aliased=aliases[name],position=normalizePosition(row.position),team=normalizeTeam(row.team);if(!Number.isInteger(row.overall_rank)||row.overall_rank<1||row.overall_rank>300||!fantasyPositions.has(position)||!name){invalid.push({row:row.overall_rank,detectedRank:Number.isFinite(row.overall_rank)?row.overall_rank:undefined,rawText:JSON.stringify(row),reason:'Invalid rank, name, or position.'});continue}const compatible=players.filter(player=>player.canonicalPlayerId&&normalizePosition(player.position)===position);let candidates=compatible.filter(player=>normalizePlayerName(player.displayName)===name&&team&&normalizeTeam(player.nflTeam)===team);if(!candidates.length)candidates=compatible.filter(player=>normalizePlayerName(player.displayName)===name);if(!candidates.length&&aliased)candidates=compatible.filter(player=>normalizePlayerName(player.displayName)===aliased&&(!team||normalizeTeam(player.nflTeam)===team));if(candidates.length===1)matched.push({row,player:candidates[0]});else if(candidates.length>1)ambiguous.push({row,candidates});else unmatched.push(row)}
  return{metadata,rows,matched,unmatched,ambiguous,invalid,ignored:[],excludedInvalid:[]};
}

export function parseEspnImport(text:string,options:{updatedAt?:string;sourceUpdatedAt?:string|null;scoringFormat?:ScoringFormat;filename?:string},players:DraftPlayer[],now=new Date()):EspnImportPreview{let parsed:{rows:EspnImportRow[];invalid:EspnImportPreview['invalid']};try{parsed=text.includes('$')&&/\([A-Z/]+\d+\)/.test(text)?parseEspnPdfText(text):{rows:parseStructured(text),invalid:[]}}catch(error){parsed={rows:[],invalid:[{row:0,rawText:text.replace(/\s+/g,' ').trim().slice(0,500),reason:error instanceof Error?error.message:'Invalid import file.'}]}}const metadata=metadataFrom(text,options.filename??'espn-ppr300',now);metadata.sourceUpdatedAt=options.sourceUpdatedAt??options.updatedAt??metadata.sourceUpdatedAt;return reconcileEspnRows(parsed.rows,players,metadata,parsed.invalid)}

const editableEspnRow=(preview:EspnImportPreview,rank:number)=>preview.rows.find(item=>item.overall_rank===rank);
function withoutEditableRow(preview:EspnImportPreview,row:EspnImportRow){return{...preview,matched:preview.matched.filter(item=>item.row!==row),unmatched:preview.unmatched.filter(item=>item!==row),ambiguous:preview.ambiguous.filter(item=>item.row!==row),ignored:preview.ignored.filter(item=>item!==row)}}
export function clearEspnRowResolution(preview:EspnImportPreview,rank:number):EspnImportPreview{const row=editableEspnRow(preview,rank);if(!row)throw new Error('ESPN row was not found.');const cleared=withoutEditableRow(preview,row);return{...cleared,unmatched:[...cleared.unmatched,row]}}
export function manuallyAssignEspnRow(preview:EspnImportPreview,rank:number,player:DraftPlayer):EspnImportPreview{const row=editableEspnRow(preview,rank);if(!row||!player.canonicalPlayerId)throw new Error('Manual assignment requires an ESPN row and a canonical player.');const cleared=withoutEditableRow(preview,row);return{...cleared,matched:[...cleared.matched,{row,player,manual:true}]}}
export function ignoreEspnRow(preview:EspnImportPreview,rank:number):EspnImportPreview{const row=editableEspnRow(preview,rank);if(!row)throw new Error('ESPN row was not found.');const cleared=withoutEditableRow(preview,row);return{...cleared,ignored:[...cleared.ignored,row]}}
export function ignoreInvalidEspnRow(preview:EspnImportPreview,index:number):EspnImportPreview{const invalid=preview.invalid[index];if(!invalid)throw new Error('Invalid ESPN row was not found.');const sourceRow=invalid.sourceRow;return{...preview,rows:sourceRow?preview.rows.filter(row=>row!==sourceRow):preview.rows,matched:sourceRow?preview.matched.filter(item=>item.row!==sourceRow):preview.matched,unmatched:sourceRow?preview.unmatched.filter(row=>row!==sourceRow):preview.unmatched,ambiguous:sourceRow?preview.ambiguous.filter(item=>item.row!==sourceRow):preview.ambiguous,ignored:sourceRow?preview.ignored.filter(row=>row!==sourceRow):preview.ignored,invalid:preview.invalid.filter((_,itemIndex)=>itemIndex!==index),excludedInvalid:[...preview.excludedInvalid,invalid]}}
export const espnImportDiagnostics=(preview:EspnImportPreview):EspnImportDiagnostics=>({matched:preview.matched.length,unmatched:preview.unmatched.length,ambiguous:preview.ambiguous.length,invalid:preview.invalid.length,ignored:preview.ignored.length+preview.excludedInvalid.length});
const duplicateAssignments=(preview:EspnImportPreview)=>{const ids=preview.matched.map(item=>item.player.canonicalPlayerId).filter(Boolean);return new Set(ids).size!==ids.length};
export const isEspnImportActivatable=(preview:EspnImportPreview,target:ScoringFormat)=>preview.rows.length>0&&!preview.invalid.length&&!preview.unmatched.length&&!preview.ambiguous.length&&!duplicateAssignments(preview)&&preview.metadata.scoringFormat===target&&preview.matched.length>0;
export function espnActivationError(preview:EspnImportPreview,target:ScoringFormat):string|undefined{if(preview.invalid.length)return`${preview.invalid.length} invalid row${preview.invalid.length===1?'':'s'} must be resolved or ignored before activation.`;const unresolved=preview.unmatched.length+preview.ambiguous.length;if(unresolved)return`${unresolved} unresolved ESPN row${unresolved===1?' remains.':'s remain.'}`;if(duplicateAssignments(preview))return'Duplicate canonical player assignments must be changed before activation.';if(preview.metadata.scoringFormat!==target)return`ESPN ${preview.metadata.scoringFormat} rankings cannot activate for ${target} scoring.`;if(!preview.rows.length||!preview.matched.length)return'At least one ESPN ranking must be matched before activation.';return undefined}
export function activateEspnImport(preview:EspnImportPreview,target:ScoringFormat):EspnRankingSource{const validationError=espnActivationError(preview,target);if(validationError||!isEspnImportActivatable(preview,target))throw new Error(validationError??'ESPN import does not have sufficient canonical coverage.');const rankings=new Map<CanonicalPlayerId,EspnRankingValue>();for(const {row,player} of preview.matched){const id=player.canonicalPlayerId as CanonicalPlayerId;if(!id||rankings.has(id))throw new Error(`Duplicate canonical player: ${row.player_name}.`);rankings.set(id,{source:'ESPN PPR300',sourceClass:'ANALYST_INTERPRETATION',updatedAt:preview.metadata.sourceUpdatedAt??preview.metadata.importedAt,overallRank:row.overall_rank,positionRank:row.position_rank,byeWeek:row.bye_week,scoringFormat:'PPR',freshness:freshnessAt(preview.metadata.sourceUpdatedAt??undefined)})}return{id:'ESPN',label:'ESPN PPR300',season:preview.metadata.season,sourceUpdatedAt:preview.metadata.sourceUpdatedAt,importedAt:preview.metadata.importedAt,originalFilename:preview.metadata.originalFilename,detectedRows:preview.rows.length,diagnostics:espnImportDiagnostics(preview),ignoredRows:[...preview.ignored.map(row=>({rank:row.overall_rank,reason:'User excluded during reconciliation'})),...preview.excludedInvalid.map(row=>({rank:row.detectedRank,reason:row.reason}))],scoringFormat:'PPR',rankingType:'PPR300',rankings}}

export interface StoredEspnRankingSource extends Omit<EspnRankingSource,'rankings'>{leagueId:string;rankings:[CanonicalPlayerId,EspnRankingValue][]}
export const serializeEspnSource=(leagueId:string,source:EspnRankingSource):StoredEspnRankingSource=>({...source,leagueId,rankings:[...source.rankings]});
export const deserializeEspnSource=(value:StoredEspnRankingSource):EspnRankingSource=>{
  if(!value||value.id!=='ESPN'||value.scoringFormat!=='PPR'||value.rankingType!=='PPR300'||!value.leagueId||!Number.isInteger(value.season)||!Number.isFinite(Date.parse(value.importedAt))||!Array.isArray(value.rankings)||!value.rankings.length)throw new Error('Persisted ESPN source is invalid.');
  const rankings=new Map(value.rankings);
  if(rankings.size!==value.rankings.length||[...rankings].some(([id,ranking])=>typeof id!=='string'||!id||!Number.isFinite(ranking?.overallRank)||Number(ranking.overallRank)<=0))throw new Error('Persisted ESPN rankings are invalid.');
  return{...value,rankings};
};
