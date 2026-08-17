import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DraftStore} from './store';
import {activateImport,aggregateRankings,applySnapshot,canonicalPlayerId,freshnessAt,inspectPlayerDataSnapshot,isIdpPosition,normalizePlayerName,normalizePosition,normalizeTeam,parseRankingImport,refreshPlayerData,selectPlayerPool,scoringFormatFor,snapshotId,snapshotSources,validatePlayerDataSnapshot,type PlayerDataSnapshot,type PlayerIntelligence,type RankingValue} from './player-data';
import {playerPool,seedSetup} from '../domain/seeds';
import {rebuildDraftState,startDraft} from '../domain/engine';
import {emptyPhilosophy,userContext} from '../domain/user-context';
import {runRecommendationEngine} from '../intelligence/recommendation-engine';
const now='2026-08-14T12:00:00.000Z';
const rank=(overallRank:number,updatedAt=now,scoringFormat:'PPR'|'STANDARD'='PPR'):RankingValue=>({source:'Test',sourceClass:'ANALYST_INTERPRETATION',updatedAt,overallRank,scoringFormat,freshness:freshnessAt(updatedAt,new Date(now))});
const intel=(fixturePlayerId:string,overrides:Partial<PlayerIntelligence>={}):PlayerIntelligence=>({canonicalPlayerId:canonicalPlayerId({name:'Test Player 001',team:'CLE',position:'QB'}),fixturePlayerId,displayName:'Test Player 001',normalizedName:'test player 001',position:'QB',sourceValues:[rank(1)],newsItems:[],freshness:'FRESH',lastUpdated:now,quality:'COMPLETE',uncertaintyFlags:[],sourceProvenance:[rank(1)],baselineRank:1,...overrides});
const snapshot=(players:PlayerIntelligence[]):PlayerDataSnapshot=>({id:snapshotId(now,'PPR',players),version:1,createdAt:now,scoringFormat:'PPR',quality:'COMPLETE',freshness:'FRESH',players,changes:[],providerResults:[]});
describe('canonical normalization',()=>{it('handles punctuation, suffixes, aliases, teams, positions, DST and duplicate disambiguation',()=>{expect(normalizePlayerName("D'Andre Swift Jr.")).toBe('d andre swift');expect(normalizeTeam('JAC')).toBe('JAX');expect(normalizePosition('D/ST')).toBe('DST');expect(canonicalPlayerId({name:'Browns',team:'CLE',position:'DST'})).toBe('nfl:dst:CLE');expect(canonicalPlayerId({name:'Alex Smith',team:'KC',position:'QB'})).not.toBe(canonicalPlayerId({name:'Alex Smith',team:'WAS',position:'QB'}))});});
describe('ranking normalization',()=>{it('weights stale and mismatched formats below fresh matching rankings and flags disagreement',()=>{const result=aggregateRankings([rank(10),rank(80,'2026-01-01T00:00:00Z'),rank(70,now,'STANDARD')],'PPR');expect(result.baselineRank).toBeLessThan(35);expect(result.uncertaintyFlags).toContain('SOURCE_DISAGREEMENT');expect(result.uncertaintyFlags).toContain('SCORING_MISMATCH')});it('preserves missing data',()=>expect(aggregateRankings([],'PPR')).toEqual({uncertaintyFlags:['RANKING_MISSING']}));});
describe('manual import and stable snapshots',()=>{const players=playerPool();it('previews matched and unmatched rows, then activates atomically',()=>{const preview=parseRankingImport('player_name,team,position,overall_rank,adp\nTest Player 1,,QB,7,9\nNobody,BUF,RB,8,10',{source:'FantasyPros export',updatedAt:now,scoringFormat:'PPR'},players);expect(preview.matched).toHaveLength(1);expect(preview.unmatched).toHaveLength(1);const active=activateImport(preview);expect(active.players[0].baselineRank).toBe(7);expect(active.players[0].adp).toBe(9);expect(active.id).toBe(snapshotId(now,'PPR',active.players))});it('rejects incompatible rows without producing a partial snapshot',()=>{const preview=parseRankingImport('player_name,position,overall_rank\nTest Player 1,QB,nope',{source:'x',updatedAt:now,scoringFormat:'PPR'},players);expect(preview.errors).toHaveLength(1);expect(()=>activateImport(preview)).toThrow()});it('keeps offensive and IDP paths distinct',()=>{expect(isIdpPosition('LB')).toBe(true);expect(isIdpPosition('RB')).toBe(false)});});
describe('cache and deterministic integration',()=>{beforeEach(async()=>await new Promise<void>(r=>{const q=indexedDB.deleteDatabase('fantasy-draft-assistant');q.onsuccess=()=>r();q.onerror=()=>r()}));it('persists and reloads the last good snapshot',async()=>{const store=new DraftStore(),s=snapshot([intel('synthetic-1')]);await store.savePlayerData('league',s);expect((await store.getPlayerData('league'))?.id).toBe(s.id)});it('preserves current snapshot when all refresh providers fail',async()=>{const current=snapshot([intel('synthetic-1')]),provider={id:'failed',kind:'RANKING' as const,refresh:vi.fn().mockRejectedValue(new Error('offline'))};await expect(refreshPlayerData(current,{setup:seedSetup('believeland'),players:playerPool(),now},[provider])).rejects.toThrow('preserved');expect(current.players).toHaveLength(1)});it('is reproducible, current rank replaces fixture, and never fetches',()=>{const setup=seedSetup('believeland'),players=applySnapshot(playerPool(20),snapshot([intel('synthetic-1')])),context=startDraft(setup,players),state=rebuildDraftState(context),team=setup.teams[0].id,input={setup,context,state,userTeamId:team,userContext:userContext(emptyPhilosophy(setup.league.id,setup.season.id),[],[],[]),playerDataSnapshotId:'fixed'};const fetchSpy=vi.spyOn(globalThis,'fetch');const a=runRecommendationEngine(input),b=runRecommendationEngine(input);expect(a).toEqual(b);expect(a.recommendations.find(x=>x.playerId==='synthetic-1')?.valueSourceLabel).toBe('CURRENT PLAYER DATA');expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore()});it('hard-excludes confirmed season-ending status despite favorite context',()=>{const setup=seedSetup('believeland'),players=applySnapshot(playerPool(20),snapshot([intel('synthetic-1',{availabilityStatus:'OUT_FOR_SEASON'})])),context=startDraft(setup,players),state=rebuildDraftState(context),team=setup.teams[0].id,user=userContext(emptyPhilosophy(setup.league.id,setup.season.id),[{id:'f',leagueId:setup.league.id,seasonId:setup.season.id,playerId:'synthetic-1',state:'FAVORITE',updatedAt:now}],[],[]);expect(runRecommendationEngine({setup,context,state,userTeamId:team,userContext:user}).recommendations.every(x=>x.playerId!=='synthetic-1')).toBe(true)});it('bounds low-confidence role/news adjustment and lowers confidence',()=>{const data=intel('synthetic-1',{role:{summary:'Possible committee',confidence:'LOW',source:'Camp report',sourceClass:'SPECULATION',updatedAt:now,tags:['COMMITTEE']},newsItems:[{id:'n',playerId:canonicalPlayerId({name:'Test Player 001',position:'QB'}),headline:'Maybe',summary:'May share work',eventType:'ROLE',source:'Camp',sourceClass:'SPECULATION',publishedAt:now,updatedAt:now,confidence:'LOW',materiality:'HIGH'}]});const setup=seedSetup('believeland'),players=applySnapshot(playerPool(20),snapshot([data])),context=startDraft(setup,players),state=rebuildDraftState(context),result=runRecommendationEngine({setup,context,state,userTeamId:setup.teams[0].id,userContext:userContext(emptyPhilosophy(setup.league.id,setup.season.id),[],[],[])}),rec=result.recommendations.find(x=>x.playerId==='synthetic-1');expect(rec?.breakdown.rosterRisk).toBeGreaterThanOrEqual(-.6);expect(rec?.confidence).toBe('LOW')});});

describe('production data gate',()=>{
  const realCsv='player_name,team,position,overall_rank,tier\nJosh Allen,BUF,QB,1,1\nBijan Robinson,ATL,RB,2,1\nAmon-Ra St. Brown,DET,WR,3,1';
  it('activates a complete imported player universe without fixture mixing',()=>{
    const preview=parseRankingImport(realCsv,{source:'Manual ranking import',updatedAt:now,scoringFormat:'PPR'},playerPool());
    const active=activateImport(preview),selected=selectPlayerPool(playerPool(),active);
    expect(selected.map(p=>p.displayName)).toEqual(['Josh Allen','Bijan Robinson','Amon-Ra St. Brown']);
    expect(selected.some(p=>p.displayName.startsWith('Test Player'))).toBe(false);
    expect(snapshotSources(active)).toMatchObject({mode:'MANUAL_IMPORT',rankingSource:'MANUAL RANKING IMPORT'});
  });
  it('uses an explicitly labeled fixture fallback only when no snapshot exists',()=>{
    expect(selectPlayerPool(playerPool(),undefined).some(p=>p.displayName==='Test Player 003')).toBe(true);
    expect(snapshotSources()).toMatchObject({mode:'FIXTURE_FALLBACK',rankingSource:'BASELINE FIXTURE RANKING'});
  });
  it('validates season, scoring, unique identity, timestamp, and usable ranks',()=>{
    const valid={...snapshot([intel('synthetic-1')]),season:2026};
    expect(validatePlayerDataSnapshot(valid,2026,'PPR')?.id).toBe(valid.id);
    expect(validatePlayerDataSnapshot({...valid,season:2025},2026,'PPR')).toBeUndefined();
    expect(validatePlayerDataSnapshot({...valid,scoringFormat:'KEEPER'},2026,'PPR')).toBeUndefined();
    expect(validatePlayerDataSnapshot({...valid,createdAt:'not-a-date'},2026,'PPR')).toBeUndefined();
    expect(validatePlayerDataSnapshot({...valid,players:[valid.players[0],valid.players[0]]},2026,'PPR')).toBeUndefined();
    expect(validatePlayerDataSnapshot({...valid,players:[{...valid.players[0],baselineRank:undefined}]},2026,'PPR')).toBeDefined();
  });
  it('keeps stale real data atomic and excludes every fixture player',()=>{
    const stale={...snapshot([intel('real-id',{displayName:'Real Player',normalizedName:'real player'})]),season:2026,freshness:'STALE' as const};
    expect(selectPlayerPool(playerPool(),stale).map(player=>player.displayName)).toEqual(['Real Player']);
  });
});

describe('league-compatible player snapshots',()=>{
  const real=(format:'PPR'|'HALF_PPR'|'STANDARD',includeIdp=false,season=2026)=>({id:`${format}-${includeIdp}`,version:1 as const,createdAt:'2026-08-17T12:00:00Z',season,scoringFormat:format,includeIdp,quality:'COMPLETE' as const,freshness:'FRESH' as const,players:[{canonicalPlayerId:'nfl:fantasypros:1' as never,displayName:'Real Player',normalizedName:'real player',position:'RB' as const,baselineRank:1,sourceValues:[rank(1)],newsItems:[],freshness:'FRESH' as const,quality:'COMPLETE' as const,uncertaintyFlags:[],sourceProvenance:[]}],changes:[],providerResults:[]});
  it('keeps offensive scoring and IDP as independent compatibility dimensions',()=>{
    expect(validatePlayerDataSnapshot(real('PPR'),2026,'PPR',false)).toBeDefined();
    expect(validatePlayerDataSnapshot(real('PPR'),2026,'HALF_PPR',false)).toBeUndefined();
    expect(validatePlayerDataSnapshot(real('PPR'),2026,'PPR',true)).toBeUndefined();
    expect(validatePlayerDataSnapshot(real('HALF_PPR',true),2026,'HALF_PPR',true)).toBeDefined();
    expect(validatePlayerDataSnapshot(real('STANDARD'),2026,'PPR',false)).toBeUndefined();
    expect(validatePlayerDataSnapshot(real('PPR',false,2025),2026,'PPR',false)).toBeUndefined();
  });
  it.each(['QB','RB','WR','TE','K','DST'] as const)('accepts %s without global ECR',position=>{
    const player={...real('PPR').players[0],canonicalPlayerId:`nfl:optional:${position}` as never,position,baselineRank:undefined};
    expect(inspectPlayerDataSnapshot({...real('PPR'),players:[player]},2026,'PPR').passed).toBe(true);
  });
  it.each(['K','DST'] as const)('accepts %s without global ECR while preserving position rank',position=>{
    const player={...real('PPR').players[0],canonicalPlayerId:(position==='DST'?'nfl:dst:ARI':'nfl:fantasypros:kicker') as never,displayName:position==='DST'?'Arizona Cardinals':'Real Kicker',normalizedName:position==='DST'?'arizona cardinals':'real kicker',position,baselineRank:undefined,positionRank:3,sourceValues:[{...rank(1),overallRank:undefined,positionRank:3}]};
    const candidate={...real('PPR'),players:[player]};
    expect(validatePlayerDataSnapshot(candidate,2026,'PPR')).toBeDefined();
    expect(validatePlayerDataSnapshot(candidate,2026,'PPR')?.players[0]).toMatchObject({baselineRank:undefined,positionRank:3});
  });
  it('rejects malformed optional ECR and unrecognized roster positions',()=>{
    const base=real('PPR').players[0];
    for(const baselineRank of [0,-1,Number.NaN,Number.POSITIVE_INFINITY])expect(inspectPlayerDataSnapshot({...real('PPR'),players:[{...base,position:'K' as const,baselineRank}]},2026,'PPR').passed).toBe(false);
    expect(inspectPlayerDataSnapshot({...real('PPR'),players:[{...base,baselineRank:2}]},2026,'PPR')).toMatchObject({passed:false,reason:expect.stringContaining('BASELINE_RANK_SOURCE_INVALID')});
    expect(inspectPlayerDataSnapshot({...real('PPR'),players:[{...base,position:'P' as const}]},2026,'PPR')).toMatchObject({passed:false,reason:expect.stringContaining('POSITION_INVALID')});
  });
  it('accepts Believeland and RoboCop mixed ranking classes',()=>{
    const offensePositions=['QB','RB','WR','TE'] as const;
    const offense=offensePositions.map((position,index)=>({...real('PPR').players[0],canonicalPlayerId:`nfl:offense:${position}` as never,displayName:`Real ${position}`,normalizedName:`real ${position.toLowerCase()}`,position,baselineRank:index+1,sourceValues:[rank(index+1)]}));
    const specialists=(['K','DST'] as const).map((position,index)=>({...real('PPR').players[0],canonicalPlayerId:(position==='DST'?'nfl:dst:ARI':'nfl:kicker') as never,displayName:`Real ${position}`,normalizedName:`real ${position.toLowerCase()}`,position,baselineRank:undefined,positionRank:index+1,sourceValues:[{...rank(1),overallRank:undefined,positionRank:index+1}]}));
    const believeland={...real('PPR'),id:'player-data-v1-5d8f0fa8',players:[...offense,...specialists]};
    expect(validatePlayerDataSnapshot(believeland,2026,'PPR',false)).toBeDefined();
    const idp={...real('HALF_PPR',true).players[0],canonicalPlayerId:'nfl:linebacker' as never,displayName:'Real LB',normalizedName:'real lb',position:'LB' as const,baselineRank:undefined,idp:{rank:7},sourceValues:[{...rank(7),overallRank:undefined,scoringFormat:'IDP' as const,rankingClass:'IDP' as const}]};
    const roboCop={...real('HALF_PPR',true),id:'player-data-v1-5dfd59c0',players:[...offense.map(player=>({...player,sourceValues:[rank(player.baselineRank)]})),...specialists,idp]};
    expect(validatePlayerDataSnapshot(roboCop,2026,'HALF_PPR',true)).toBeDefined();
  });
  it('accepts persisted RoboCop IDP positions without changing canonical identities',()=>{
    const positions=['DE','DT','CB','S'] as const;
    const players=positions.map((position,index)=>({...real('HALF_PPR',true).players[0],canonicalPlayerId:`nfl:fantasypros:${12217+index}` as never,displayName:`Real ${position}`,normalizedName:`real ${position.toLowerCase()}`,position,baselineRank:undefined,idp:{rank:index+1},sourceValues:[{...rank(index+1),overallRank:undefined,scoringFormat:'IDP' as const,rankingClass:'IDP' as const}]}));
    const candidate={...real('HALF_PPR',true),players};
    const validation=inspectPlayerDataSnapshot(candidate,2026,'HALF_PPR',true);
    expect(validation.passed).toBe(true);
    expect(validation.snapshot?.players.map(player=>({position:player.position,canonicalPlayerId:player.canonicalPlayerId}))).toEqual(players.map(player=>({position:player.position,canonicalPlayerId:player.canonicalPlayerId})));
  });
  it('continues to reject unsupported persisted positions',()=>{
    const player={...real('HALF_PPR',true).players[0],position:'GARBAGE' as never};
    expect(inspectPlayerDataSnapshot({...real('HALF_PPR',true),players:[player]},2026,'HALF_PPR',true)).toMatchObject({passed:false,reason:expect.stringContaining('POSITION_INVALID')});
  });

  it('validates representative persisted snapshot sizes with an unranked offensive player',()=>{
    const representative=(count:number,format:'PPR'|'HALF_PPR',includeIdp:boolean)=>{
      const ranked={...real(format,includeIdp).players[0],canonicalPlayerId:'nfl:fantasypros:1' as never,sourceValues:[rank(1)]};
      const unranked={...ranked,canonicalPlayerId:'nfl:fantasypros:10007' as never,displayName:'Provider player 10007',normalizedName:'provider player 10007',baselineRank:undefined,sourceValues:[{...rank(1),overallRank:undefined,positionRank:400}]};
      const players=[ranked,unranked,...Array.from({length:count-2},(_,index)=>({...unranked,canonicalPlayerId:`nfl:shape:${index}` as never,displayName:`Shape Player ${index}`,normalizedName:`shape player ${index}`}))];
      return{...real(format,includeIdp),id:includeIdp?'player-data-v1-4f6071b':'player-data-v1-7702e6b8',players};
    };
    expect(validatePlayerDataSnapshot(representative(763,'PPR',false),2026,'PPR',false)?.players).toHaveLength(763);
    expect(validatePlayerDataSnapshot(representative(1214,'HALF_PPR',true),2026,'HALF_PPR',true)?.players).toHaveLength(1214);
  });
  it('does not synthesize a current rank when selecting an unranked snapshot player',()=>{
    const candidate={...real('PPR'),players:[{...real('PPR').players[0],baselineRank:undefined}]};
    expect(selectPlayerPool(playerPool(),candidate)[0].currentBaselineRank).toBeUndefined();
  });
  it('derives the actual league configuration without slug conditionals',()=>{
    expect(scoringFormatFor(seedSetup('believeland'))).toBe('PPR');
    expect(scoringFormatFor(seedSetup('robocop'))).toBe('HALF_PPR');
    expect(seedSetup('robocop').settings.idpEnabled).toBe(true);
  });
  it('accepts the intended mixed offense and IDP ranking shape without fabricating offensive ECR',()=>{
    const offense=real('HALF_PPR',true).players[0],idp={...offense,canonicalPlayerId:'nfl:fantasypros:2' as never,displayName:'Real Linebacker',normalizedName:'real linebacker',position:'LB' as const,baselineRank:undefined,idp:{rank:7},sourceValues:[{...rank(7),overallRank:undefined,scoringFormat:'IDP' as const,rankingClass:'IDP' as const}]};
    const mixed={...real('HALF_PPR',true),players:[offense,idp]};
    expect(validatePlayerDataSnapshot(mixed,2026,'HALF_PPR',true)).toBeDefined();
    expect(inspectPlayerDataSnapshot({...mixed,players:[offense,{...idp,idp:undefined}]},2026,'HALF_PPR',true)).toMatchObject({passed:false,reason:expect.stringContaining('IDP_RANK_INVALID')});
    expect(inspectPlayerDataSnapshot({...mixed,players:[offense,{...idp,sourceValues:[]}]},2026,'HALF_PPR',true)).toMatchObject({passed:false,reason:expect.stringContaining('IDP_RANKING_CLASS_MISSING')});
  });
});
