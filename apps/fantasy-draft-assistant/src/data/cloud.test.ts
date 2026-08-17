import { describe, expect, it, vi } from 'vitest'
import { configurationStatus, DraftCloudGateway, readDraftCloudConfig } from './cloud'
import { authViewFor, loginMarkup } from '../ui/auth'
describe('Draft cloud configuration and auth states', () => {
  it('prefers complete runtime browser configuration in production', () => { const config = readDraftCloudConfig({ VITE_DRAFT_SUPABASE_URL:'https://build.example', VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY:'build-key' }, { supabaseUrl:'https://runtime.example', supabasePublishableKey:'runtime-key' }, true); expect(config).toMatchObject({url:'https://runtime.example',publishableKey:'runtime-key',source:'runtime'}); expect(configurationStatus(config)).toBe('connecting') })
  it('fails closed in production when runtime configuration is missing or partial', () => { expect(configurationStatus(readDraftCloudConfig({ VITE_DRAFT_APP_ENV:'local', VITE_DRAFT_SUPABASE_URL:'https://build.example', VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY:'build-key' }, undefined, true))).toBe('configuration-error'); expect(configurationStatus(readDraftCloudConfig({}, {supabaseUrl:'https://partial.example'}, true))).toBe('configuration-error') })
  it('continues to support VITE values for local development and tests', () => { const config=readDraftCloudConfig({VITE_DRAFT_APP_ENV:'local',VITE_DRAFT_SUPABASE_URL:'https://ffcjcepugnyhfkfezdlw.supabase.co',VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY:'publishable-test'},undefined,false); expect(config.source).toBe('build'); expect(configurationStatus(config)).toBe('connecting') })
  it('allows explicitly labelled local-only startup without cloud values', () => expect(configurationStatus(readDraftCloudConfig({ VITE_DRAFT_APP_ENV:'local' },undefined,false))).toBe('local-only'))
  it('maps authenticated and unauthorized states explicitly', () => { expect(authViewFor('authenticated',true)).toBe('authenticated'); expect(authViewFor('unauthorized',true)).toBe('unauthorized'); expect(loginMarkup('unauthorized')).toContain('Access not authorized'); expect(loginMarkup('email')).toContain('Send sign-in link'); expect(loginMarkup('check-email')).toContain('Check your email') })
  it('reads and validates the newest authenticated shared snapshot', async()=>{
    const player={canonicalPlayerId:'nfl:fantasypros:1',displayName:'Real Player',normalizedName:'real player',position:'RB',baselineRank:1,sourceValues:[],newsItems:[],freshness:'FRESH',quality:'COMPLETE',uncertaintyFlags:[],sourceProvenance:[]};
    const snapshot={id:'shared',version:1,createdAt:'2026-08-15T12:00:00Z',season:2026,scoringFormat:'PPR',quality:'COMPLETE',freshness:'FRESH',players:[player],changes:[],providerResults:[]};
    const maybeSingle=vi.fn().mockResolvedValue({data:{snapshot},error:null}),limit=vi.fn(()=>({maybeSingle})),order=vi.fn(()=>({limit})),eqIdp=vi.fn(()=>({order})),eqFormat=vi.fn(()=>({eq:eqIdp})),eqSeason=vi.fn(()=>({eq:eqFormat})),select=vi.fn(()=>({eq:eqSeason}));
    const gateway=new DraftCloudGateway({environment:'test',url:'',publishableKey:'',source:'none'});
    Object.defineProperty(gateway,'client',{value:{auth:{getSession:vi.fn().mockResolvedValue({data:{session:{user:{id:'allowed'}}}})},from:vi.fn(()=>({select})),functions:{invoke:vi.fn()}}});
    await expect(gateway.loadLatestSharedPlayerSnapshot(2026,'PPR')).resolves.toMatchObject({id:'shared'});
    expect(eqSeason).toHaveBeenCalledWith('season',2026);expect(eqFormat).toHaveBeenCalledWith('scoring_format','PPR');expect(eqIdp).toHaveBeenCalledWith('include_idp',false);expect(order).toHaveBeenCalledWith('activated_at',{ascending:false});expect(limit).toHaveBeenCalledWith(1);
    await expect(gateway.loadLatestSharedPlayerSnapshot(2026,'HALF_PPR',true)).resolves.toBeUndefined();
  });
})
