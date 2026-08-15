import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { PlayerDataSnapshot, ScoringFormat } from './player-data'

export type CloudStatus = 'local-only' | 'configuration-error' | 'connecting' | 'cloud-connected' | 'authenticated' | 'unauthorized' | 'cloud-unavailable'
export interface RuntimeDraftConfig { supabaseUrl?: string; supabasePublishableKey?: string }
export interface DraftCloudConfig { environment: string; url: string; publishableKey: string; source: 'runtime' | 'build' | 'none' }

declare global { interface Window { __DRAFT_ASSISTANT_CONFIG__?: RuntimeDraftConfig } }

const clean = (value: string | undefined) => value?.trim() || ''
export function readDraftCloudConfig(
  env: Record<string, string | undefined>,
  runtime: RuntimeDraftConfig | undefined,
  production: boolean,
): DraftCloudConfig {
  const runtimeUrl = clean(runtime?.supabaseUrl)
  const runtimeKey = clean(runtime?.supabasePublishableKey)
  if (runtimeUrl && runtimeKey) return { environment: 'production', url: runtimeUrl, publishableKey: runtimeKey, source: 'runtime' }
  if (production) return { environment: 'production', url: '', publishableKey: '', source: 'none' }
  const url = clean(env.VITE_DRAFT_SUPABASE_URL)
  const publishableKey = clean(env.VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY)
  return { environment: clean(env.VITE_DRAFT_APP_ENV) || 'local', url, publishableKey, source: url && publishableKey ? 'build' : 'none' }
}
export function configurationStatus(config: DraftCloudConfig): CloudStatus {
  if (!config.url && !config.publishableKey) return config.environment === 'local' ? 'local-only' : 'configuration-error'
  return config.url && config.publishableKey ? 'connecting' : 'configuration-error'
}
export class DraftCloudGateway {
  readonly client: SupabaseClient | null
  readonly initialStatus: CloudStatus
  constructor(readonly config: DraftCloudConfig) {
    this.initialStatus = configurationStatus(config)
    this.client = this.initialStatus === 'connecting' ? createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
  }
  async session(): Promise<Session | null> { if (!this.client) return null; return (await this.client.auth.getSession()).data.session }
  async sendMagicLink(email: string): Promise<void> {
    if (!this.client) throw new Error('Draft Supabase is not configured.')
    const redirect = new URL(import.meta.env.BASE_URL || '/draft-assistant/', window.location.origin).toString()
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
    if (error) throw error
  }
  async authorize(session: Session): Promise<boolean> {
    if (!this.client) return false
    const { data, error } = await this.client.from('draft_allowed_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
    if (error) throw error
    return data?.user_id === session.user.id
  }
  async signOut(): Promise<void> { if (this.client) { const { error } = await this.client.auth.signOut(); if (error) throw error } }
  async status(): Promise<CloudStatus> {
    if (!this.client) return this.initialStatus
    if (!navigator.onLine) return 'cloud-unavailable'
    try { const session = await this.session(); if (!session) return 'cloud-connected'; return await this.authorize(session) ? 'authenticated' : 'unauthorized' } catch { return 'cloud-unavailable' }
  }
  async refreshPlayerData(input: { season:number; scoringFormat:ScoringFormat; includeIdp:boolean; previous?:PlayerDataSnapshot }): Promise<PlayerDataSnapshot> {
    if (!this.client || !await this.session()) throw new Error('Player refresh requires an authenticated Draft Assistant session.')
    const { data, error } = await this.client.functions.invoke('draft-player-data-refresh', { body: input })
    if (error || !data?.snapshot) throw new Error(typeof data?.error === 'string' ? data.error : 'Automated player refresh is unavailable.')
    return data.snapshot as PlayerDataSnapshot
  }
}
export const draftCloud = new DraftCloudGateway(readDraftCloudConfig(import.meta.env, typeof window === 'undefined' ? undefined : window.__DRAFT_ASSISTANT_CONFIG__, import.meta.env.PROD))
