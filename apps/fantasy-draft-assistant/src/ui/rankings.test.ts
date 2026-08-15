import { describe, expect, it } from 'vitest';
import { activateImport, parseRankingImport, rankingSources, selectPlayerPool } from '../data/player-data';
import { makePick, rebuildDraftState, startDraft } from '../domain/engine';
import { playerPool, seedSetup } from '../domain/seeds';
import { emptyPhilosophy } from '../domain/user-context';
import { runRecommendationEngine } from '../intelligence/recommendation-engine';
import { deltaLabel, filterRankingRows, rankingRows, rankingsTableMarkup } from './rankings';
const setup=seedSetup('believeland');
const snapshot=activateImport(parseRankingImport('player_name,team,position,overall_rank,position_rank,tier,adp\nTest Player 1,,QB,2,1,1,3\nTest Player 2,,RB,1,1,1,\nTest Player 3,,WR,3,1,2,5',{source:'FantasyPros ECR',updatedAt:'2026-08-15T12:00:00Z',scoringFormat:'PPR'},playerPool()));
const model=()=>{const players=selectPlayerPool(playerPool(),snapshot),context=startDraft(setup,players),state=rebuildDraftState(context),result=runRecommendationEngine({setup,context,state,userTeamId:setup.teams[0].id,userContext:{philosophy:emptyPhilosophy(setup.league.id,setup.season.id),playerInterests:[],strategicIntents:[],recentConversation:[]}});return{players,context,state,result,rows:rankingRows(snapshot,players,state,result.draftFits)}};
describe('rankings workspace model',()=>{
 it('uses only active snapshot rows and defaults to ECR ascending',()=>{const {rows}=model();expect(rows.map(row=>row.market.overallRank)).toEqual([1,2,3]);expect(rows.every(row=>row.player.playerIntelligence)).toBe(true)});
 it('filters position, search, and availability while ALL retains drafted players',()=>{const {players,context,result}=model(),picked=makePick(context,players.find(player=>player.displayName==='Test Player 2')!.id),state=rebuildDraftState(picked),rows=rankingRows(snapshot,players,state,result.draftFits);expect(filterRankingRows(rows,{position:'QB'}).map(row=>row.player.position)).toEqual(['QB']);expect(filterRankingRows(rows,{search:'player 3'})).toHaveLength(1);expect(filterRankingRows(rows,{availableOnly:true})).toHaveLength(2);expect(filterRankingRows(rows,{})).toHaveLength(3)});
 it('shows ranking fields, truthful missing ADP, and correct delta direction',()=>{const {rows}=model(),markup=rankingsTableMarkup(rows);expect(markup).toContain('POS RANK');expect(markup).toContain('TIER');expect(rows.find(row=>row.player.displayName==='Test Player 2')?.market.adp).toBeUndefined();expect(deltaLabel(12).label).toContain('above');expect(deltaLabel(-8).label).toContain('below')});
 it('uses deterministic explanations and only a populated FantasyPros source',()=>{const {rows}=model(),sources=rankingSources(snapshot);expect(rows[0].draftFit?.explanationFacts.length).toBeGreaterThan(0);expect(sources.map(source=>source.id)).toEqual(['FANTASYPROS_ECR']);expect(sources.some(source=>source.id as string==='ESPN')).toBe(false)});
});
