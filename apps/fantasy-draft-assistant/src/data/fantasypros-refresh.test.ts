import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fantasyProsRankingPaths, fantasyProsRankingPoolDiagnostics, normalizeFantasyPros } from './automated-player-data'

const fetchedAt='2026-08-17T12:00:00.000Z'
const metadata=(includeIdp=false)=>({data:{players:[
  {player_id:1,player_name:'Quarter Back',player_team_id:'BUF',player_position_id:'QB'},
  {player_id:2,player_name:'Real Runner',player_team_id:'JAC',player_position_id:'RB'},
  {player_id:3,player_name:'Real Receiver',player_team_id:'WSH',player_position_id:'WR'},
  {player_id:4,player_name:'Tight End',player_team_id:'CLE',player_position_id:'TE'},
  ...(includeIdp?[{player_id:7,player_name:'Real Linebacker',player_team_id:'CLE',player_position_id:'LB'}]:[]),
]}})
const row=(player_id:number,rank_ecr:number,pos_rank:string,extra:Record<string,unknown>={})=>({player_id,rank_ecr,pos_rank,tier:2,rank_min:rank_ecr-1,rank_max:rank_ecr+2,rank_ave:rank_ecr+.4,rank_std:1.2,adp:rank_ecr+3,updated_at:fetchedAt,...extra})
const pools=(includeIdp=false):unknown[]=>[
  {players:[row(1,25,'QB4')]}, {players:[row(2,2,'RB1')]}, {rankings:[row(3,3,'WR2')]}, {players:[row(4,28,'TE3')]},
  {players:[]}, {rankings:[]}, ...(includeIdp?[{players:[row(7,6,'LB2')]}]:[]),
]
const empty={news:[],injuries:[]}

type EdgeModule={normalizeFantasyPros:typeof normalizeFantasyPros;providerJson:(path:string,key:string)=>Promise<unknown>}
let edge:EdgeModule
beforeAll(async()=>{Object.assign(globalThis,{Deno:{env:{get:()=>undefined},serve:vi.fn()}});const edgePath='../../../../supabase/fantasy-draft-assistant/functions/draft-player-data-refresh/index';edge=await import(edgePath) as unknown as EdgeModule})

describe('FantasyPros real-position ranking model',()=>{
  it('requests QB/RB/WR/TE with supplemental K/DST and never requests FLX',()=>{
    expect(fantasyProsRankingPaths(2026,'PPR',false)).toEqual(['QB','RB','WR','TE','K','DST'].map(position=>`/nfl/2026/consensus-rankings?position=${position}&scoring=PPR`))
    expect(fantasyProsRankingPaths(2026,'PPR',false).join('|')).not.toContain('FLX')
  })
  it('requests IDP separately without applying offensive scoring to it',()=>expect(fantasyProsRankingPaths(2026,'HALF_PPR',true).at(-1)).toBe('/nfl/2026/consensus-rankings?position=IDP'))
  it.each([['QB',1,25,4],['RB',2,2,1],['WR',3,3,2],['TE',4,28,3]] as const)('extracts %s rank_ecr as overall ECR and pos_rank separately',(_position,id,ecr,posRank)=>{
    const player=normalizeFantasyPros({players:metadata(),rankings:pools(),...empty},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false}).players.find(item=>item.fantasyProsPlayerId===String(id))
    expect(player).toMatchObject({baselineRank:ecr,positionRank:posRank,tier:2,adp:ecr+3})
    expect(player?.sourceValues[0]).toMatchObject({overallRank:ecr,positionRank:posRank,rankMin:ecr-1,rankMax:ecr+2,rankAverage:ecr+.4,standardDeviation:1.2})
  })
  it('never manufactures rank from array position or a generic rank field',()=>{
    const values=pools();values[1]={players:[{player_id:2,rank:1,pos_rank:'RB1'}]}
    expect(()=>normalizeFantasyPros({players:metadata(),rankings:values,...empty},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false})).toThrow(/RB.*rank_ecr/)
  })
  it('deduplicates by player_id and does not let another pool overwrite genuine ECR',()=>{
    const values=pools();(values[2] as {rankings:unknown[]}).rankings.push(row(2,99,'RB99'))
    const snapshot=normalizeFantasyPros({players:metadata(),rankings:values,...empty},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false})
    expect(snapshot.players).toHaveLength(4);expect(snapshot.players.find(p=>p.fantasyProsPlayerId==='2')).toMatchObject({baselineRank:2,positionRank:1})
  })
  it('allows empty supplemental K and DST while reporting every pool',()=>{
    expect(normalizeFantasyPros({players:metadata(),rankings:pools(),...empty},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false}).players).toHaveLength(4)
    expect(fantasyProsRankingPoolDiagnostics(pools(),false)).toMatchObject({QB:{count:1},RB:{count:1},WR:{count:1},TE:{count:1},K:{status:'empty'},DST:{status:'empty'}})
  })
  it('keeps IDP ECR on its separate scale rather than offensive baselineRank',()=>{
    const player=normalizeFantasyPros({players:metadata(true),rankings:pools(true),...empty},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true}).players.find(p=>p.position==='LB')
    expect(player).toMatchObject({baselineRank:undefined,idp:{rank:6,tier:2}});expect(player?.sourceValues[0]).toMatchObject({overallRank:undefined,rankingClass:'IDP',scoringFormat:'IDP'})
  })
  it('accepts representative Believeland and RoboCop snapshots without fixtures',()=>{
    for(const includeIdp of [false,true]){const snapshot=normalizeFantasyPros({players:metadata(includeIdp),rankings:pools(includeIdp),...empty},{fetchedAt,season:2026,scoringFormat:includeIdp?'HALF_PPR':'PPR',includeIdp});expect(snapshot.players.every(p=>!p.fixturePlayerId&&!p.displayName.includes('Test Player'))).toBe(true)}
  })
  it('rejects a failed/empty required pool atomically so callers preserve the prior snapshot',()=>{
    const values=pools();values[0]={__poolError:'HTTP 503'};expect(()=>normalizeFantasyPros({players:metadata(),rankings:values,...empty},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false,previous:{players:[]} as never})).toThrow(/QB.*failed/)
  })
  it('requires IDP for RoboCop',()=>{const values=pools(true);values[6]={players:[]};expect(()=>normalizeFantasyPros({players:metadata(true),rankings:values,...empty},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})).toThrow(/IDP.*empty/)})
  it('keeps the self-contained Dashboard normalizer in deep parity',()=>{const payload={players:metadata(true),rankings:pools(true),...empty},options={fetchedAt,season:2026,scoringFormat:'HALF_PPR' as const,includeIdp:true};expect(edge.normalizeFantasyPros(payload,options)).toEqual(normalizeFantasyPros(payload,options))})
})
