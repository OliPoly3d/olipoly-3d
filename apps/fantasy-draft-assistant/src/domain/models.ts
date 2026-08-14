import type { ScoringRule } from './scoring';
export type Id=string;export type Position='QB'|'RB'|'WR'|'TE'|'DST'|'K'|'DL'|'LB'|'DB'|'DT'|'DE'|'CB'|'S'|'P'|'HC';
export interface League{id:Id;name:string;slug:string} export interface Season{id:Id;leagueId:Id;year:number;name:string}
export interface LeagueSettings{seasonId:Id;scoringLabel:string;ppr:number;idpEnabled:boolean;scoringRules?:ScoringRule[];metadata?:Record<string,string|number|boolean|null>}
export interface Manager{id:Id;leagueId:Id;displayName:string;active:boolean} export interface SeasonTeam{id:Id;seasonId:Id;managerId:Id;active:boolean}
export interface RosterSlotDefinition{id:Id;seasonId:Id;label:string;count:number;eligible:Position[];kind:'starter'|'bench'|'ir'} export interface PositionLimit{seasonId:Id;position:Position;maximum:number|null}
export interface DraftConfiguration{seasonId:Id;teamCount:number;draftType?:'offline'|'online';draftDate?:string|null;snake:boolean;rounds:number;pickTimerSeconds:number|null;keeperCount:number;liveStartRound:number;pickTradingEnabled:boolean;orderStatus:'unassigned'|'assigned'|'locked'}
export interface DraftSlot{seasonId:Id;slot:number;originalTeamId:Id} export interface PickOwnership{seasonId:Id;round:number;slot:number;originalTeamId:Id;currentTeamId:Id}
export interface KeeperPlayer{id:Id;canonicalPlayerId:Id|null;displayName:string;normalizedName:string;position?:Position;nflTeam?:string} export interface KeeperAssignment{id:Id;seasonId:Id;teamId:Id;keeperSlot:number;player:KeeperPlayer;status:'provisional'|'locked'}
export interface KeeperLockState{seasonId:Id;status:'provisional'|'locked';deadline:string|null;lockedAt:string|null;lockedBy:string|null;audit:{action:'locked'|'unlocked';at:string;actor:string}[]}
export interface SeasonSetup{league:League;season:Season;settings:LeagueSettings;managers:Manager[];teams:SeasonTeam[];rosterSlots:RosterSlotDefinition[];positionLimits:PositionLimit[];draft:DraftConfiguration;draftSlots:DraftSlot[];ownership:PickOwnership[];keepers:KeeperAssignment[];keeperLock:KeeperLockState}
export interface PlayerRelationship{type:'HANDCUFF'|'COMPETITION'|'STACK';playerId:Id}
export interface DraftPlayer{id:Id;canonicalPlayerId:Id|null;displayName:string;normalizedName:string;position:Position;nflTeam?:string;byeWeek?:number;baselineRank?:number;fixtureTier?:number;baselineValue?:number;relationships?:PlayerRelationship[]}
export type DraftEventType='DRAFT_STARTED'|'PICK_MADE'|'PICK_UNDONE'|'PICK_EDITED'|'DRAFT_PAUSED'|'DRAFT_RESUMED'|'DRAFT_COMPLETED';
export interface DraftEvent{id:Id;sessionId:Id;seasonId:Id;sequence:number;type:DraftEventType;occurredAt:string;deviceId:string;payload:Record<string,unknown>;reversesEventId?:Id;supersedesEventId?:Id}
export interface DraftSession{id:Id;seasonId:Id;status:'NOT_STARTED'|'ACTIVE'|'PAUSED'|'COMPLETED';rounds:number;allowIncompleteKeepers:boolean;createdAt:string}
export interface DraftSnapshot{sessionId:Id;sequence:number;stateVersion:number;projection:unknown}
export interface PlannedPick{round:number;slot:number;sequence:number;originalTeamId:Id;currentTeamId:Id;kind:'keeper'|'live'}
export interface TeamRoster{teamId:Id;keepers:DraftPlayer[];live:DraftPlayer[];combined:DraftPlayer[];positionCounts:Partial<Record<Position,number>>}
export interface DraftState{status:DraftSession['status'];plan:PlannedPick[];current:PlannedPick|null;activePicks:{eventId:Id;plan:PlannedPick;player:DraftPlayer}[];rosters:Record<Id,TeamRoster>;available:DraftPlayer[];keeperPlayerIds:Set<Id>;completedRounds:number;remaining:number;robPicks:{pick:PlannedPick;picksAway:number}[]}
export type PreferenceSource='USER_SELECTED'|'USER_TEXT'|'FUTURE_INTERPRETATION';
export interface DraftPreference{id:Id;category:string;label:string;value:string;notes?:string;source:PreferenceSource;confidence?:'CONFIRMED'|'INFERRED';strength?:'SOFT'|'STRONG'|'HARD';updatedAt:string}
export interface DraftPhilosophy{id:Id;leagueId:Id;seasonId:Id;preferences:DraftPreference[];freeformNotes:string;onboardingStatus:'NOT_STARTED'|'IN_PROGRESS'|'COMPLETED'|'DEFERRED';updatedAt:string}
export type PlayerInterestState='INTERESTED'|'WATCH'|'FAVORITE'|'FADE'|'AVOID'|'CONCERNED';
export interface PlayerInterest{id:Id;leagueId:Id;seasonId:Id;playerId:Id;state:PlayerInterestState;note?:string;updatedAt:string}
export type StrategicIntentCategory='POSITION_WATCH'|'PLAYER_WATCH'|'ROSTER_GOAL'|'DO_NOT_FORCE'|'LATE_ROUND_REMINDER'|'CUSTOM';
export type StrategicIntentWindow='NEXT_2_ROUNDS'|'BEFORE_NEXT_PICK'|'LATE_ROUNDS'|'UNTIL_FILLED'|'UNTIL_DISMISSED';
export interface StrategicIntent{id:Id;leagueId:Id;seasonId:Id;text:string;category:StrategicIntentCategory;window?:StrategicIntentWindow;status:'ACTIVE'|'PAUSED'|'RESOLVED';createdAt:string;updatedAt:string}
export type ConversationMessageType='USER'|'SYSTEM'|'PHILOSOPHY_PROMPT'|'PHILOSOPHY_SUMMARY'|'INTENT_CREATED'|'ARGUE_REQUEST'|'OFFSEASON_BRIEF_REQUEST'|'AI_PLACEHOLDER';
export interface ConversationMessage{id:Id;leagueId:Id;seasonId:Id;draftSessionId?:Id;type:ConversationMessageType;text:string;createdAt:string;contextId?:Id}
export interface ArgumentRequestContext{id:Id;leagueId:Id;seasonId:Id;draftSessionId:Id;pickNumber:number|null;playerId:Id;recommendationOrder:number;rosterTeamId:Id;philosophyId:Id;activeIntentIds:Id[];createdAt:string}
export interface OffseasonBriefingContext{id:Id;leagueId:Id;seasonId:Id;draftSessionId?:Id;playerId:Id;position:Position;team?:string;philosophyPreferenceIds:Id[];playerInterestId?:Id;createdAt:string}
export interface DraftUserContext{philosophy:DraftPhilosophy;playerInterests:PlayerInterest[];strategicIntents:StrategicIntent[];recentConversation:ConversationMessage[]}
