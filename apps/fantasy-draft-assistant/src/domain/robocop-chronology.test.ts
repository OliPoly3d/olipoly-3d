import { describe, expect, it } from 'vitest';
import { createDraftPlan } from './engine';
import { seedSetup } from './seeds';

const forward=Array.from({length:12},(_,index)=>index+1);
const reverse=[...forward].reverse();

describe('RoboCop live snake chronology',()=>{
  it('keeps placeholder rounds linear and alternates live rounds from Round 4',()=>{
    const plan=createDraftPlan(seedSetup('robocop'));
    expect([1,2,3,4,5,6,7].map(round=>plan.filter(pick=>pick.round===round).map(pick=>pick.slot)))
      .toEqual([forward,forward,forward,forward,reverse,forward,reverse]);
  });

  it('uses the configured base teams at both Round 4 and Round 5 boundaries',()=>{
    const setup=seedSetup('robocop');
    const plan=createDraftPlan(setup);
    const teamName=(teamId:string)=>setup.teams.find(team=>team.id===teamId)?.displayName;
    const round4=plan.filter(pick=>pick.round===4);
    const round5=plan.filter(pick=>pick.round===5);
    expect([teamName(round4[0].originalTeamId),teamName(round4.at(-1)!.originalTeamId)]).toEqual(["kevin’s Top-Notch Team",'Run CMC']);
    expect([teamName(round5[0].originalTeamId),teamName(round5.at(-1)!.originalTeamId)]).toEqual(['Run CMC',"kevin’s Top-Notch Team"]);
  });

  it('applies traded ownership without moving the underlying slot',()=>{
    const setup=seedSetup('robocop');
    const slot=setup.draftSlots[0];
    setup.ownership.push({seasonId:setup.season.id,round:4,slot:slot.slot,originalTeamId:slot.originalTeamId,currentTeamId:setup.teams[1].id});
    const round4=createDraftPlan(setup).filter(pick=>pick.round===4);
    expect(round4.map(pick=>pick.slot)).toEqual(forward);
    expect(round4[0]).toMatchObject({slot:1,originalTeamId:slot.originalTeamId,currentTeamId:setup.teams[1].id});
  });

  it('leaves Believeland absolute-round chronology unchanged',()=>{
    const plan=createDraftPlan(seedSetup('believeland'));
    expect([1,2,3,4].map(round=>plan.filter(pick=>pick.round===round).map(pick=>pick.slot)))
      .toEqual([forward,reverse,forward,reverse]);
  });
});
