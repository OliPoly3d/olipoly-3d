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
const news={data:{news:[{news_id:7,player_id:1,title:'Named starter',published_at:fetchedAt}]}}
const injuries={injuries:[{player_id:2,status:'QUESTIONABLE',updated_at:fetchedAt}]}

type EdgeModule={
  normalizeFantasyPros:typeof normalizeFantasyPros
  providerJson:(path:string,apiKey:string)=>Promise<unknown>
}
let edge:EdgeModule
beforeAll(async()=>{
  Object.assign(globalThis,{Deno:{env:{get:()=>undefined},serve:vi.fn()}})
  const edgePath='../../../../supabase/fantasy-draft-assistant/functions/draft-player-data-refresh/index'
  edge=await import(edgePath) as EdgeModule
})

describe('FantasyPros v2 refresh contract',()=>{
  it('builds PPR and HALF offense requests with required ALL position',()=>{
    expect(fantasyProsRankingPaths(2026,'PPR',false)).toEqual(['/nfl/2026/consensus-rankings?position=ALL&scoring=PPR'])
    expect(fantasyProsRankingPaths(2026,'HALF_PPR',false)).toEqual(['/nfl/2026/consensus-rankings?position=ALL&scoring=HALF'])
  })
  it('requests IDP separately without the rejected ALL plus include_idp combination',()=>{
    const paths=fantasyProsRankingPaths(2026,'HALF_PPR',true)
    expect(paths).toEqual(['/nfl/2026/consensus-rankings?position=ALL&scoring=HALF','/nfl/2026/consensus-rankings?position=IDP'])
    expect(paths.join('&')).not.toContain('include_idp')
  })
  it('normalizes Believeland current wrappers without fixture players',()=>{
    const snapshot=normalizeFantasyPros({players,rankings:offense,news,injuries},{fetchedAt,season:2026,scoringFormat:'PPR',includeIdp:false})
    expect(snapshot.players).toHaveLength(2)
    expect(snapshot.players.every(player=>!player.fixturePlayerId&&!player.displayName.includes('Test Player'))).toBe(true)
  })
  it('merges offense and IDP pools by canonical identity without renumbering either pool',()=>{
    const snapshot=normalizeFantasyPros({players,rankings:[offense,idp],news,injuries},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})
    expect(new Set(snapshot.players.map(player=>player.canonicalPlayerId)).size).toBe(3)
    expect(snapshot.players.find(player=>player.position==='RB')?.baselineRank).toBe(1)
    expect(snapshot.players.find(player=>player.position==='LB')).toMatchObject({baselineRank:1,positionRank:1,idp:{rank:1,tier:1}})
  })
  it('keeps the Dashboard normalizer in parity with the application normalizer',()=>{
    const payloads={players,rankings:[offense,idp],news,injuries}
    const options={fetchedAt,season:2026,scoringFormat:'HALF_PPR' as const,includeIdp:true}
    expect(edge.normalizeFantasyPros(payloads,options)).toEqual(normalizeFantasyPros(payloads,options))
  })
  it('requires both ranking pools atomically for IDP leagues',()=>{
    expect(()=>normalizeFantasyPros({players,rankings:[offense,{}],news,injuries},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})).toThrow(/IDP/)
    expect(()=>normalizeFantasyPros({players,rankings:[{},idp],news,injuries},{fetchedAt,season:2026,scoringFormat:'HALF_PPR',includeIdp:true})).toThrow(/offensive/)
  })
  it('surfaces a bounded provider 400 body and redacts a reflected key',async()=>{
    const original=globalThis.fetch
    globalThis.fetch=vi.fn(async()=>new Response(`bad scoring; key=secret-key\n${'x'.repeat(700)}`,{status:400})) as typeof fetch
    await expect(edge.providerJson('/nfl/2026/consensus-rankings?position=IDP','secret-key')).rejects.toThrow(/^FantasyPros consensus rankings failed HTTP 400: bad scoring; key=\[REDACTED\]/)
    globalThis.fetch=original
  })
})
