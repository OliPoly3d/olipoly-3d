import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fantasyProsRankingPaths, normalizeFantasyPros } from './automated-player-data'

const fetchedAt='2026-08-17T12:00:00.000Z'
const players={data:{players:[
  {player_id:1,player_name:'Real Runner',player_team_id:'JAC',player_position_id:'RB',is_active:true},
  {player_id:2,player_name:'Real Receiver',player_team_id:'WSH',player_position_id:'WR',is_active:true},
  {player_id:3,player_name:'Real Linebacker',player_team_id:'CLE',player_position_id:'LB',is_active:true},
]}}
const offense={players:[
  {player_id:1,rank_ecr:1,pos_rank:'RB1',tier:1,updated_at:fetchedAt},
  {player_id:2,rank_ecr:2,pos_rank:'WR1',tier:1,updated_at:fetchedAt},
]}
const idp={rankings:[{player_id:3,rank_ecr:1,pos_rank:'LB1',tier:1,updated_at:fetchedAt}]}
const offensePools=(primary:unknown=offense)=>[primary,offense,offense,offense,offense,offense,offense]
const news={data:{news:[{news_id:7,player_id:1,title:'Named starter',published_at:fetchedAt}]}}
const injuries={injuries:[{player_id:2,status:'QUESTIONABLE',updated_at:fetchedAt}]}

type EdgeModule={
  normalizeFantasyPros:typeof normalizeFantasyPros
  providerJson:(path:string,apiKey:string)=>Promise<unknown>
}
let edge:EdgeModule
let edgeHandler:(request:Request)=>Promise<Response>
const edgeEnv:Record<string,string>={}
beforeAll(async()=>{
  Object.assign(globalThis,{Deno:{env:{get:(key:string)=>edgeEnv[key]},serve:vi.fn((handler:(request:Request)=>Promise<Response>)=>{edgeHandler=handler})}})
  const edgePath='../../../../supabase/fantasy-draft-assistant/functions/draft-player-data-refresh/index'
  edge=await import(edgePath) as EdgeModule
})

describe('FantasyPros v2 refresh contract',()=>{
  it('builds concurrent PPR and HALF requests without an invalid ALL position',()=>{
    const positions=['FLX','QB','RB','WR','TE','K','DST']
    for(const [format,scoring] of [['PPR','PPR'],['HALF_PPR','HALF']] as const){
      const paths=fantasyProsRankingPaths(2026,format,false)
      expect(paths).toEqual(positions.map(position=>`/nfl/2026/consensus-rankings?position=${position}&scoring=${scoring}`))
      expect(paths.every(path=>!path.includes('position=ALL'))).toBe(true)
    }
  })
  it('requests valid IDP separately for RoboCop',()=>{
    const paths=fantasyProsRankingPaths(2026,'HALF_PPR',true)
    expect(paths.at(-1)).toBe('/nfl/2026/consensus-rankings?position=IDP')
    expect(paths).toHaveLength(8)
    expect(paths.join('&')).not.toContain('position=ALL')
    expect(paths.join('&')).not.toContain('include_idp')
  })
  it('normalizes Believeland current wrappers without fixture players',()=>{
    const snapshot=normalizeFantasyPros({players,rankings:offensePools(),news,injuries},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false})
    expect(snapshot.players).toHaveLength(2)
    expect(snapshot.players.every(player=>!player.fixturePlayerId&&!player.displayName.includes('Test Player'))).toBe(true)
  })
  it('merges offense and IDP pools by canonical identity without renumbering either pool',()=>{
    const snapshot=normalizeFantasyPros({players,rankings:[...offensePools(),idp],news,injuries},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})
    expect(new Set(snapshot.players.map(player=>player.canonicalPlayerId)).size).toBe(3)
    expect(snapshot.players.find(player=>player.position==='RB')).toMatchObject({baselineRank:1,positionRank:1})
    expect(snapshot.players.find(player=>player.position==='RB')?.sourceValues).toHaveLength(1)
    expect(snapshot.players.find(player=>player.position==='LB')).toMatchObject({baselineRank:1,positionRank:1,idp:{rank:1,tier:1}})
  })
  it('keeps the Dashboard normalizer in parity with the application normalizer',()=>{
    const payloads={players,rankings:[...offensePools(),idp],news,injuries}
    const options={fetchedAt,season:2026,scoringFormat:'HALF_PPR' as const,includeIdp:true}
    expect(edge.normalizeFantasyPros(payloads,options)).toEqual(normalizeFantasyPros(payloads,options))
  })
  it('requires both ranking pools atomically for IDP leagues',()=>{
    expect(()=>normalizeFantasyPros({players,rankings:[...offensePools(),{}],news,injuries},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})).toThrow(/IDP/)
    expect(()=>normalizeFantasyPros({players,rankings:[...offensePools({}),idp],news,injuries},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})).toThrow(/offensive/)
  })
  it('surfaces a bounded provider 400 body and redacts a reflected key',async()=>{
    const original=globalThis.fetch
    globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify({message:'Invalid Position',parameter:'position',valid_format:'QB, RB, WR, TE, K, OP, FLX, DST, IDP, DL, LB, DB, TK, TQB, TRB, TWR, TTE, TOL, HC, P'}),{status:400})) as typeof fetch
    await expect(edge.providerJson('/nfl/2026/consensus-rankings?position=IDP','secret-key')).rejects.toThrow(/^FantasyPros consensus rankings failed HTTP 400: .*Invalid Position.*valid_format.*FLX/)
    globalThis.fetch=original
  })
  it('returns the production Invalid Position diagnostic without persisting a partial snapshot',async()=>{
    Object.assign(edgeEnv,{DRAFT_PLAYER_REFRESH_TOKEN:'refresh-token',FANTASYPROS_API_KEY:'secret-key'})
    const original=globalThis.fetch
    const diagnostic={message:'Invalid Position',parameter:'position',valid_format:'QB, RB, WR, TE, K, OP, FLX, DST, IDP, DL, LB, DB, TK, TQB, TRB, TWR, TTE, TOL, HC, P'}
    globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify(diagnostic),{status:400})) as typeof fetch
    const response=await edgeHandler(new Request('https://example.test/refresh',{method:'POST',headers:{'x-refresh-token':'refresh-token'},body:JSON.stringify({season:2026,scoringFormat:'PPR',includeIdp:false,previous:{players:Array.from({length:513})}})}))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({error:expect.stringContaining('Invalid Position'),priorSnapshotPreserved:true})
    expect(globalThis.fetch).toHaveBeenCalledTimes(11)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url])=>String(url).includes('draft_player_data_snapshots'))).toBe(false)
    globalThis.fetch=original
  })
})
