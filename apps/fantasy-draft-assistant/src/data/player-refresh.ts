import type{SeasonSetup}from'../domain/models';
import{scoringFormatFor,snapshotCompatibilityLabel,type PlayerDataSnapshot}from'./player-data';

export interface PlayerRefreshBoundary{refreshLatestSharedPlayerSnapshot(input:{season:number;scoringFormat:ReturnType<typeof scoringFormatFor>;includeIdp:boolean}):Promise<PlayerDataSnapshot|undefined>}
export interface PlayerRefreshCache{savePlayerData(leagueId:string,snapshot:PlayerDataSnapshot):Promise<unknown>}

/** The single explicit refresh transaction used by every screen. */
export async function refreshLeaguePlayerData(setup:SeasonSetup,boundary:PlayerRefreshBoundary,cache:PlayerRefreshCache):Promise<PlayerDataSnapshot>{
 const input={season:setup.season.year,scoringFormat:scoringFormatFor(setup),includeIdp:setup.settings.idpEnabled};
 const snapshot=await boundary.refreshLatestSharedPlayerSnapshot(input);
 if(!snapshot)throw new Error(`Refresh completed without a compatible shared snapshot. Requested: ${snapshotCompatibilityLabel(input.season,input.scoringFormat,input.includeIdp)}.`);
 await cache.savePlayerData(setup.league.id,snapshot);
 return snapshot;
}
