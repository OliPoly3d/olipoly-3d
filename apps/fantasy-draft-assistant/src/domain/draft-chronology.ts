import type { DraftConfiguration } from './models';

export function draftSlotForPick(draft:DraftConfiguration,round:number,pickInRound:number){
  const liveRoundIndex=round-(draft.snakeStartRound??1);
  const reverses=draft.snake&&round>=draft.liveStartRound&&liveRoundIndex%2===1;
  return reverses?draft.teamCount-pickInRound+1:pickInRound;
}
