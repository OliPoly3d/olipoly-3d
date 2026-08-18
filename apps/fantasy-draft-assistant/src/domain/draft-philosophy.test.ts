import { describe, expect, it } from 'vitest';
import { DEFAULT_PHILOSOPHY_PROFILE, philosophyProfile, philosophySummary, updatePhilosophyProfile } from './draft-philosophy';
import { emptyPhilosophy } from './user-context';

describe('league draft philosophy profile',()=>{
  it('hydrates old records additively without league-name rules',()=>{const legacy={...emptyPhilosophy('any-league','s'),profile:undefined,summary:undefined};expect(philosophyProfile(legacy)).toEqual(DEFAULT_PHILOSOPHY_PROFILE);expect(JSON.stringify(philosophyProfile(legacy))).not.toContain('believeland')});
  it('keeps structured settings authoritative while producing readable context',()=>{const changed=updatePhilosophyProfile(emptyPhilosophy('l','s'),{qbStrategy:'PREFER_WAITING',flexDepth:'LOW'});expect(changed.profile?.qbStrategy).toBe('PREFER_WAITING');expect(changed.summary).toContain('prefer waiting');expect(philosophySummary(changed.profile!)).toContain('league-aware')});
});
