import { describe, expect, it } from 'vitest'
import { configurationStatus, readDraftCloudConfig } from './cloud'
import { authViewFor, loginMarkup } from '../ui/auth'
describe('Draft cloud configuration and auth states', () => {
  it('loads the dedicated project URL and publishable key', () => { const config = readDraftCloudConfig({ VITE_DRAFT_APP_ENV:'production', VITE_DRAFT_SUPABASE_URL:'https://ffcjcepugnyhfkfezdlw.supabase.co', VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY:'publishable-test' }); expect(config.url).toBe('https://ffcjcepugnyhfkfezdlw.supabase.co'); expect(configurationStatus(config)).toBe('connecting') })
  it('reports a production configuration error when the publishable key is missing', () => expect(configurationStatus(readDraftCloudConfig({ VITE_DRAFT_APP_ENV:'production', VITE_DRAFT_SUPABASE_URL:'https://ffcjcepugnyhfkfezdlw.supabase.co' }))).toBe('configuration-error'))
  it('allows explicitly labelled local-only startup without cloud values', () => expect(configurationStatus(readDraftCloudConfig({ VITE_DRAFT_APP_ENV:'local' }))).toBe('local-only'))
  it('maps authenticated and unauthorized states explicitly', () => { expect(authViewFor('authenticated',true)).toBe('authenticated'); expect(authViewFor('unauthorized',true)).toBe('unauthorized'); expect(loginMarkup('unauthorized')).toContain('Access not authorized'); expect(loginMarkup('email')).toContain('Send magic link'); expect(loginMarkup('check-email')).toContain('Check your email') })
})
