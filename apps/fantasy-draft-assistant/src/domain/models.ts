import type { ScoringRule } from './scoring';
export type Id=string;export type Position='QB'|'RB'|'WR'|'TE'|'DST'|'K'|'DL'|'LB'|'DB'|'DT'|'DE'|'CB'|'S'|'P'|'HC';
export interface League{id:Id;name:string;slug:string} export interface Season{id:Id;leagueId:Id;year:number;name:string}
export interface LeagueSettings{seasonId:Id;scoringLabel:string;ppr:number;idpEnabled:boolean;scoringRules?:ScoringRule[];metadata?:Record<string,string|number|boolean|null>}
export interface Manager{id:Id;leagueId:Id;displayName:string;active:boolean} export interface SeasonTeam{id:Id;seasonId:Id;managerId:Id;active:boolean}
export interface RosterSlotDefinition{id:Id;seasonId:Id;label:string;count:number;eligible:Position[];kind:'starter'|'bench'|'ir'} export interface PositionLimit{seasonId:Id;position:Position;maximum:number|null}
export interface DraftConfiguration{seasonId:Id;teamCount:number;draftType?:'offline'|'online';draftDate?:string|null;snake:boolean;rounds:number;pickTimerSeconds:number|null;keeperCount:number;liveStartRound:number;pickTradingEnabled:boolean;orderStatus:'unassigned'|'assigned'|'locked'}
export interface DraftSlot{seasonId:Id;slot:number;originalTeamId:Id} export interface PickOwnership{seasonId:Id;round:number;slot:number;originalTeamId:Id;currentTeamId:Id}
export interface KeeperPlayer{id:Id;canonicalPlayerId:Id|null;displayName:string;normalizedName:string;position?:Position} export interface KeeperAssignment{id:Id;seasonId:Id;teamId:Id;keeperSlot:number;player:KeeperPlayer;status:'provisional'|'locked'}
export interface KeeperLockState{seasonId:Id;status:'provisional'|'locked';deadline:string|null;lockedAt:string|null;lockedBy:string|null;audit:{action:'locked'|'unlocked';at:string;actor:string}[]}
export interface SeasonSetup{league:League;season:Season;settings:LeagueSettings;managers:Manager[];teams:SeasonTeam[];rosterSlots:RosterSlotDefinition[];positionLimits:PositionLimit[];draft:DraftConfiguration;draftSlots:DraftSlot[];ownership:PickOwnership[];keepers:KeeperAssignment[];keeperLock:KeeperLockState}
export interface DraftPlayer{id:Id;canonicalPlayerId:Id|null;displayName:string;normalizedName:string;position:Position;nflTeam?:string}
export type DraftEventType='DRAFT_STARTED'|'PICK_MADE'|'PICK_UNDONE'|'PICK_EDITED'|'DRAFT_PAUSED'|'DRAFT_RESUMED'|'DRAFT_COMPLETED';
export interface DraftEvent{id:Id;sessionId:Id;seasonId:Id;sequence:number;type:DraftEventType;occurredAt:string;deviceId:string;payload:Record<string,unknown>;reversesEventId?:Id;supersedesEventId?:Id}
export interface DraftSession{id:Id;seasonId:Id;status:'NOT_STARTED'|'ACTIVE'|'PAUSED'|'COMPLETED';rounds:number;allowIncompleteKeepers:boolean;createdAt:string}
export interface DraftSnapshot{sessionId:Id;sequence:number;stateVersion:number;projection:unknown}
export interface PlannedPick{round:number;slot:number;sequence:number;originalTeamId:Id;currentTeamId:Id;kind:'keeper'|'live'}
export interface TeamRoster{teamId:Id;keepers:DraftPlayer[];live:DraftPlayer[];combined:DraftPlayer[];positionCounts:Partial<Record<Position,number>>}
export interface DraftState{status:DraftSession['status'];plan:PlannedPick[];current:PlannedPick|null;activePicks:{eventId:Id;plan:PlannedPick;player:DraftPlayer}[];rosters:Record<Id,TeamRoster>;available:DraftPlayer[];keeperPlayerIds:Set<Id>;completedRounds:number;remaining:number;robPicks:{pick:PlannedPick;picksAway:number}[]}
