import type { DraftPlayer, Position } from '../domain/models';
import { freshnessAt, normalizePlayerName, normalizePosition, normalizeTeam, type CanonicalPlayerId, type RankingSource, type RankingValue, type ScoringFormat } from './player-data';

export interface EspnRankingValue extends Pick<RankingValue,'source'|'sourceClass'|'updatedAt'|'overallRank'|'positionRank'|'scoringFormat'|'freshness'> { byeWeek?:number }
export interface EspnRankingSource extends Omit<RankingSource,'updatedAt'|'rankings'> { id:'ESPN'; label:'ESPN PPR300'; season:number; sourceUpdatedAt:string|null; importedAt:string; originalFilename:string; detectedRows:number; rankings:Map<CanonicalPlayerId,EspnRankingValue> }
export interface EspnImportRow { player_name:string; team?:string; position:string; overall_rank:number; position_rank?:number; bye_week?:number }
export interface EspnImportMetadata { season:number; scoringFormat:'PPR'; rankingType:'PPR300'; sourceUpdatedAt:string|null; importedAt:string; originalFilename:string }
export interface EspnImportPreview { metadata:EspnImportMetadata; rows:EspnImportRow[]; matched:{row:EspnImportRow;player:DraftPlayer;manual?:boolean}[]; unmatched:EspnImportRow[]; ambiguous:{row:EspnImportRow;candidates:DraftPlayer[]}[]; invalid:{row:number;reason:string}[] }

const fantasyPositions=new Set<Position>(['QB','RB','WR','TE','K','DST']);
const aliases:Record<string,string>={'gabe davis':'gabriel davis','hollywood brown':'marquise brown','chig okonkwo':'chigoziem okonkwo'};
const csvLine=(line:string)=>{const values:string[]= [];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){values.push(value.trim());value=''}else value+=c}values.push(value.trim());return values};
const optionalInteger=(value:unknown)=>value==null||value===''?undefined:Number.isInteger(Number(value))?Number(value):undefined;

/** Extracts text in the browser. OCR is deliberately not attempted. */
export async function extractPdfText(data:ArrayBuffer):Promise<string>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document=await pdfjs.getDocument({data:new Uint8Array(data)}).promise;
  const pages:string[]=[];
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){const page=await document.getPage(pageNumber),content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '))}
  const text=pages.join('\n').replace(/\s+/g,' ').trim();
  if(!text)throw new Error('This PDF contains no usable text. Scanned/image-only PDFs are unsupported; upload the text-based ESPN PPR Top 300 PDF.');
  return text;
}

export function parseEspnPdfText(text:string):{rows:EspnImportRow[];invalid:EspnImportPreview['invalid']} {
  if(!text.trim())throw new Error('This PDF contains no usable text. Scanned/image-only PDFs are unsupported.');
  const rows:EspnImportRow[]=[],invalid:EspnImportPreview['invalid']=[];
  // Printed rank is authoritative; extraction order is intentionally discarded.
  const pattern=/(?:^|\s)(\d{1,3})\s*\.?\s*\(\s*(QB|RB|WR|TE|K|D\/ST|DST)(\d{1,3})\s*\)\s+([A-Za-zÀ-ž.'’`\- ]+?)\s*,\s*([A-Z]{2,3})\s+\$\s*\d+(?:\.\d+)?\s+(\d{1,2})(?=\s|$)/g;
  for(const match of text.matchAll(pattern)){const overallRank=Number(match[1]),position=normalizePosition(match[2]),positionRank=Number(match[3]),playerName=match[4].replace(/\s+/g,' ').trim(),byeWeek=Number(match[6]);if(overallRank<1||overallRank>300||!fantasyPositions.has(position)||!playerName){invalid.push({row:overallRank,reason:'Rank must be 1-300 with a player name and recognized fantasy position.'});continue}rows.push({overall_rank:overallRank,position,position_rank:positionRank,player_name:playerName,team:normalizeTeam(match[5]),bye_week:byeWeek})}
  const seen=new Set<number>();for(const row of rows)if(seen.has(row.overall_rank))invalid.push({row:row.overall_rank,reason:`Duplicate overall rank ${row.overall_rank}.`});else seen.add(row.overall_rank);
  if(!rows.length)invalid.push({row:0,reason:'No ESPN PPR Top 300 ranking rows were detected.'});
  return{rows:rows.sort((a,b)=>a.overall_rank-b.overall_rank),invalid};
}

function parseStructured(text:string){let raw:Record<string,unknown>[]=[];if(text.trim().startsWith('[')){const value=JSON.parse(text);if(!Array.isArray(value))throw new Error('JSON must be an array.');raw=value}else{const lines=text.trim().split(/\r?\n/).filter(Boolean),headers=csvLine(lines.shift()??'').map(x=>x.toLowerCase());raw=lines.map(line=>Object.fromEntries(csvLine(line).map((value,index)=>[headers[index],value])))}return raw.map(value=>({player_name:String(value.player_name??'').trim(),team:String(value.team??'').trim()||undefined,position:String(value.position??'').trim(),overall_rank:Number(value.overall_rank),position_rank:optionalInteger(value.position_rank),bye_week:optionalInteger(value.bye_week)} satisfies EspnImportRow))}
function metadataFrom(text:string,filename:string,now:Date):EspnImportMetadata{const season=Number(text.match(/\b(20\d{2})\s+ESPN\s+Fantasy Football Draft Kit/i)?.[1]??now.getUTCFullYear()),date=text.match(/(?:updated|published)\s*(?:on|:)??\s*([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})/i)?.[1];return{season,scoringFormat:'PPR',rankingType:'PPR300',sourceUpdatedAt:date?new Date(date).toISOString():null,importedAt:now.toISOString(),originalFilename:filename}}

export function reconcileEspnRows(rows:EspnImportRow[],players:DraftPlayer[],metadata:EspnImportMetadata,invalid:EspnImportPreview['invalid']=[]):EspnImportPreview{
  const matched:EspnImportPreview['matched']=[],unmatched:EspnImportRow[]=[],ambiguous:EspnImportPreview['ambiguous']=[];
  for(const row of rows){const name=normalizePlayerName(row.player_name),aliased=aliases[name],position=normalizePosition(row.position),team=normalizeTeam(row.team);if(!Number.isInteger(row.overall_rank)||row.overall_rank<1||row.overall_rank>300||!fantasyPositions.has(position)||!name){invalid.push({row:row.overall_rank,reason:'Invalid rank, name, or position.'});continue}const compatible=players.filter(player=>player.canonicalPlayerId&&normalizePosition(player.position)===position);let candidates=compatible.filter(player=>normalizePlayerName(player.displayName)===name&&team&&normalizeTeam(player.nflTeam)===team);if(!candidates.length)candidates=compatible.filter(player=>normalizePlayerName(player.displayName)===name);if(!candidates.length&&aliased)candidates=compatible.filter(player=>normalizePlayerName(player.displayName)===aliased&&(!team||normalizeTeam(player.nflTeam)===team));if(candidates.length===1)matched.push({row,player:candidates[0]});else if(candidates.length>1)ambiguous.push({row,candidates});else unmatched.push(row)}
  return{metadata,rows,matched,unmatched,ambiguous,invalid};
}

export function parseEspnImport(text:string,options:{updatedAt?:string;sourceUpdatedAt?:string|null;scoringFormat?:ScoringFormat;filename?:string},players:DraftPlayer[],now=new Date()):EspnImportPreview{let parsed:{rows:EspnImportRow[];invalid:EspnImportPreview['invalid']};try{parsed=text.includes('$')&&/\([A-Z/]+\d+\)/.test(text)?parseEspnPdfText(text):{rows:parseStructured(text),invalid:[]}}catch(error){parsed={rows:[],invalid:[{row:0,reason:error instanceof Error?error.message:'Invalid import file.'}]}}const metadata=metadataFrom(text,options.filename??'espn-ppr300',now);metadata.sourceUpdatedAt=options.sourceUpdatedAt??options.updatedAt??metadata.sourceUpdatedAt;return reconcileEspnRows(parsed.rows,players,metadata,parsed.invalid)}

export function manuallyAssignEspnRow(preview:EspnImportPreview,rank:number,player:DraftPlayer):EspnImportPreview{const row=preview.unmatched.find(item=>item.overall_rank===rank)??preview.ambiguous.find(item=>item.row.overall_rank===rank)?.row;if(!row||!player.canonicalPlayerId||normalizePosition(player.position)!==normalizePosition(row.position))throw new Error('Manual assignment requires an unresolved row and a position-compatible canonical player.');return{...preview,matched:[...preview.matched,{row,player,manual:true}],unmatched:preview.unmatched.filter(item=>item!==row),ambiguous:preview.ambiguous.filter(item=>item.row!==row)}}
const duplicateAssignments=(preview:EspnImportPreview)=>{const ids=preview.matched.map(item=>item.player.canonicalPlayerId).filter(Boolean);return new Set(ids).size!==ids.length};
export const isEspnImportActivatable=(preview:EspnImportPreview,target:ScoringFormat)=>preview.rows.length>0&&!preview.invalid.length&&!duplicateAssignments(preview)&&preview.metadata.scoringFormat===target&&preview.matched.length>=Math.max(1,Math.ceil(preview.rows.length/2));
export function activateEspnImport(preview:EspnImportPreview,target:ScoringFormat):EspnRankingSource{if(!isEspnImportActivatable(preview,target))throw new Error('ESPN import is not valid, has duplicate assignments, or has insufficient canonical coverage.');const rankings=new Map<CanonicalPlayerId,EspnRankingValue>();for(const {row,player} of preview.matched){const id=player.canonicalPlayerId as CanonicalPlayerId;if(!id||rankings.has(id))throw new Error(`Duplicate canonical player: ${row.player_name}.`);rankings.set(id,{source:'ESPN PPR300',sourceClass:'ANALYST_INTERPRETATION',updatedAt:preview.metadata.sourceUpdatedAt??preview.metadata.importedAt,overallRank:row.overall_rank,positionRank:row.position_rank,byeWeek:row.bye_week,scoringFormat:'PPR',freshness:freshnessAt(preview.metadata.sourceUpdatedAt??undefined)})}return{id:'ESPN',label:'ESPN PPR300',season:preview.metadata.season,sourceUpdatedAt:preview.metadata.sourceUpdatedAt,importedAt:preview.metadata.importedAt,originalFilename:preview.metadata.originalFilename,detectedRows:preview.rows.length,scoringFormat:'PPR',rankingType:'PPR300',rankings}}

export interface StoredEspnRankingSource extends Omit<EspnRankingSource,'rankings'>{leagueId:string;rankings:[CanonicalPlayerId,EspnRankingValue][]}
export const serializeEspnSource=(leagueId:string,source:EspnRankingSource):StoredEspnRankingSource=>({...source,leagueId,rankings:[...source.rankings]});
export const deserializeEspnSource=(value:StoredEspnRankingSource):EspnRankingSource=>({...value,rankings:new Map(value.rankings)});
