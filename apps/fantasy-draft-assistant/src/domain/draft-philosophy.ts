import type { DraftPhilosophy, DraftPhilosophyProfile } from './models';

export const ROBOCOP_2026_PHILOSOPHY_SCOPE = { leagueId: 'league-robocop', seasonId: 'season-robocop-2026' } as const;

const ROBOCOP_2026_NOTES = `Rob Siwicki / Drake's Chuba: value-first, roster-aware, and tier-aware. Begin the live draft with Josh Allen at QB and Drake London plus Jaxon Smith-Njigba at WR; derive keeper and drafted-player availability from canonical draft state. Establish at least one dependable lead RB early, but never force a lower tier over a material WR or TE value advantage. WR3 and FLEX remain open paths. Treat TE by remaining tier and genuine cliff, not the empty starter. Backup QB is optional and late. Recalculate runs and compare the cost of waiting at every serious position using the keeper-depleted live pool and actual next-owned-pick chronology. Prefer safety within an early tier and asymmetric upside later. Moderate reaches must be near the same tier, unlikely to return, and explicitly identified as reaches. Bye weeks are secondary. Keep IDP separate from offensive overall value unless a RoboCop-scoring-compatible common scale is validated; otherwise disclose limited authority and prioritize offense. D/ST and K are final-round priorities. Bench priority is contingent/upside RB, then target-growth WR, with roster flexibility preserved.`;

export function robocop2026Philosophy(): DraftPhilosophy {
  const profile: DraftPhilosophyProfile = { coreApproach:'VALUE_FIRST_ADAPTIVE', earlyRisk:'SAFETY_WITHIN_TIER', lateRisk:'PREFER_UPSIDE', rbWorkload:'LEAD_ROLE', flexDepth:'HIGH', qbStrategy:'PREFER_WAITING', teStrategy:'TIER_VALUE_CLIFF', reachTolerance:'MODERATE', interestWeight:'MODERATE', byeWeekImportance:'LOW', draftRoomExploitation:'HIGH', scarcityWeight:'HIGH', returnProbabilityWeight:'HIGH', rosterRiskBalance:'CONTINUOUS' };
  const updatedAt = '2026-08-24T00:00:00.000Z';
  const preference = (category:string,label:string,value:string,strength:'SOFT'|'STRONG'|'HARD'='SOFT') => ({ id:`philosophy:robocop-2026:${category.toLowerCase()}`, category, label, value, source:'USER_SELECTED' as const, strength, confidence:'CONFIRMED' as const, updatedAt });
  return { id:'philosophy:season-robocop-2026', ...ROBOCOP_2026_PHILOSOPHY_SCOPE, profile, summary:'Value-first and tier-aware for Rob’s keeper-built roster: prioritize dependable RB workload without surrendering major WR/TE value, wait on backup QB, and move from early safety to late upside.', freeformNotes:ROBOCOP_2026_NOTES, preferences:[
    preference('RB_TIMING','RB','Early priority for a dependable lead RB; permit only a moderate same-tier reach before a workload tier cliff.','STRONG'),
    preference('WR_CONSTRUCTION','WR','Keep WR3 and FLEX viable when WR value or tier advantage materially beats RB.','SOFT'),
    preference('QB_TIMING','QB','Wait until late for an optional backup behind keeper Josh Allen unless extraordinary value falls.','STRONG'),
    preference('TE_TIMING','TE','Wait when the tier is flat; act only at fair value or before a genuine remaining-tier cliff.','SOFT'),
    preference('IDP_TIMING','DP/IDP','Wait while meaningful offense remains; never use generic IDP positional rank as cross-position overall value.','STRONG'),
    preference('DST_TIMING','D/ST','Wait until final roster positions.','HARD'),
    preference('K_TIMING','K','Wait until final roster positions.','HARD'),
  ], onboardingStatus:'COMPLETED', updatedAt };
}

export const DEFAULT_PHILOSOPHY_PROFILE: DraftPhilosophyProfile = {coreApproach:'VALUE_FIRST_ADAPTIVE',earlyRisk:'SAFETY_WITHIN_TIER',lateRisk:'PREFER_UPSIDE',rbWorkload:'OPPORTUNITY',flexDepth:'HIGH',qbStrategy:'TIER_VALUE',teStrategy:'TIER_VALUE_CLIFF',reachTolerance:'MODERATE_HIGH',interestWeight:'MODERATE',byeWeekImportance:'STAGE_SENSITIVE',draftRoomExploitation:'HIGH',scarcityWeight:'MODERATE',returnProbabilityWeight:'HIGH',rosterRiskBalance:'CONTINUOUS'};

export const philosophyProfile=(philosophy:DraftPhilosophy):DraftPhilosophyProfile=>({...DEFAULT_PHILOSOPHY_PROFILE,...philosophy.profile});
const words=(value:string)=>value.toLowerCase().replaceAll('_',' ');
export function philosophySummary(profile:DraftPhilosophyProfile):string{return `Use a ${words(profile.coreApproach)} approach. ${words(profile.earlyRisk)} early, shifting toward ${words(profile.lateRisk)} as starters fill. Evaluate QB as ${words(profile.qbStrategy)} and TE as ${words(profile.teStrategy)}. Give ${words(profile.flexDepth)} priority to league-aware RB/WR/FLEX depth and favor ${words(profile.rbWorkload)} RB roles. Reach tolerance is ${words(profile.reachTolerance)} when return probability and the pick gap justify it. Player interest has ${words(profile.interestWeight)} influence, bye weeks are ${words(profile.byeWeekImportance)}, draft-room exploitation is ${words(profile.draftRoomExploitation)}, and roster risk is balanced ${words(profile.rosterRiskBalance)}.`}
export function updatePhilosophyProfile(philosophy:DraftPhilosophy,changes:Partial<DraftPhilosophyProfile>,summary?:string):DraftPhilosophy{const profile={...philosophyProfile(philosophy),...changes};return{...philosophy,profile,summary:summary?.trim()||philosophySummary(profile),onboardingStatus:'IN_PROGRESS',updatedAt:new Date().toISOString()}}
