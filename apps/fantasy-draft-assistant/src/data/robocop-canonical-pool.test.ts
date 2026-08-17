import { describe, expect, it } from 'vitest';
import type { DraftPlayer, Position } from '../domain/models';
import { previewFantasyProsCsv } from './fantasypros-csv';
import { parseEspnImport } from './espn-rankings';
import { canonicalPoolDiagnostic, CanonicalPoolUnavailableError } from './ranking-reconciliation';
import { normalizePlayerName, selectPlayerPool, type CanonicalPlayerId, type PlayerDataSnapshot, type PlayerIntelligence } from './player-data';

const player=(name:string,team:string,position:Position,index:number):PlayerIntelligence=>({canonicalPlayerId:`nfl:test-${index}` as CanonicalPlayerId,displayName:name,normalizedName:normalizePlayerName(name),position,nflTeam:team,sourceValues:[],newsItems:[],freshness:'FRESH',quality:'COMPLETE',uncertaintyFlags:[],sourceProvenance:[],...(['DL','LB','DB'].includes(position)?{idp:{rank:index}}:{})});
const players=[player('Jahmyr Gibbs','DET','RB',1),player('Bijan Robinson','ATL','RB',2),player("Ja'Marr Chase",'CIN','WR',3),player('Micah Parsons','DAL','DL',4),player('Roquan Smith','BAL','LB',5)];
const snapshot:PlayerDataSnapshot={id:'robocop-current-half-ppr-idp',version:1,createdAt:'2026-08-17T00:00:00Z',season:2026,scoringFormat:'HALF_PPR',includeIdp:true,quality:'COMPLETE',freshness:'FRESH',players,changes:[],providerResults:[]};
const pool=selectPlayerPool([],snapshot);
const metadata={type:'FANTASYPROS_ALL' as const,season:2026,scoringFormat:'HALF_PPR' as const,importedAt:'2026-08-17T00:00:00Z',originalFilename:'half.csv',sourceLabel:'FantasyPros HALF_PPR'};

describe('RoboCop canonical import pool',()=>{
  it('keeps offense and IDP in the current HALF_PPR + IDP snapshot',()=>{const diagnostic=canonicalPoolDiagnostic(pool);expect(diagnostic).toMatchObject({total:5,withCanonicalIds:5,withoutCanonicalIds:0,offense:3,idp:2,gibbsPresent:true,chasePresent:true});expect(diagnostic.gibbs).toEqual({canonicalPlayerId:'nfl:test-1',name:'Jahmyr Gibbs',normalizedName:'jahmyr gibbs',team:'DET',normalizedTeam:'DET',position:'RB',normalizedPosition:'RB'})});
  it('auto-matches FantasyPros Gibbs, Bijan, and Chase',()=>{const preview=previewFantasyProsCsv('RK,PLAYER NAME,TEAM,POS\n1,Jahmyr Gibbs,DET,RB1\n2,Bijan Robinson,ATL,RB2\n3,Ja\'Marr Chase,CIN,WR1',metadata,pool);expect(preview.matched.map(x=>x.player.displayName)).toEqual(['Jahmyr Gibbs','Bijan Robinson',"Ja'Marr Chase"]);expect(preview.unmatched).toHaveLength(0)});
  it('auto-matches ESPN Gibbs and Chase',()=>{const preview=parseEspnImport('player_name,team,position,overall_rank\nJahmyr Gibbs,DET,RB,1\nJa\'Marr Chase,CIN,WR,2',{filename:'espn.csv'},pool,new Date('2026-08-17T00:00:00Z'));expect(preview.matched.map(x=>x.player.displayName)).toEqual(['Jahmyr Gibbs',"Ja'Marr Chase"])});
  it('fails loudly instead of offering selectors when no canonical IDs exist',()=>{const broken:DraftPlayer[]=pool.map(item=>({...item,canonicalPlayerId:null}));expect(()=>previewFantasyProsCsv('RK,PLAYER NAME,TEAM,POS\n1,Jahmyr Gibbs,DET,RB1',metadata,broken)).toThrow(CanonicalPoolUnavailableError)});
});
