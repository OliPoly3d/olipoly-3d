import type { PlayerInterest, PlayerInterestState } from './models'
import { setInterest } from './user-context'

export type InterestSelection = PlayerInterestState | 'NONE'
interface InterestStore { saveInterest(interest: PlayerInterest): Promise<void>; clearInterest(id: string): Promise<void> }

export async function persistPlayerInterest(store: InterestStore, interests: PlayerInterest[], scope: { leagueId:string; seasonId:string }, playerId:string, state:InterestSelection, note:string):Promise<PlayerInterest[]> {
  const existing=interests.find(interest=>interest.playerId===playerId)
  if(state==='NONE'){
    if(existing)await store.clearInterest(existing.id)
    return interests.filter(interest=>interest.playerId!==playerId)
  }
  const saved=setInterest(scope,playerId,state,note,existing)
  await store.saveInterest(saved)
  return[...interests.filter(interest=>interest.playerId!==playerId),saved]
}

export function playerInterestContext(interests:PlayerInterest[],playerName:(playerId:string)=>string|undefined){return interests.map(interest=>({player:playerName(interest.playerId)??interest.playerId,state:interest.state,note:interest.note}))}
