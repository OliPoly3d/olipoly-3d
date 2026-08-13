import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

export type CloudStatus = 'local-only' | 'configuration-error' | 'connecting' | 'cloud-connected' | 'authenticated' | 'unauthorized' | 'cloud-unavailable'
export interface DraftCloudConfig { environment: string; url: string; publishableKey: string }
export function readDraftCloudConfig(env: Record<string, string | undefined>): DraftCloudConfig {
  return { environment: env.VITE_DRAFT_APP_ENV?.trim() || 'local', url: env.VITE_DRAFT_SUPABASE_URL?.trim() || '', publishableKey: env.VITE_DRAFT_SUPABASE_PUBLISHABLE_KEY?.trim() || '' }
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
}
export const draftCloud = new DraftCloudGateway(readDraftCloudConfig(import.meta.env))
import{createClient,type SupabaseClient}from'@supabase/supabase-js';const url=import.meta.env.VITE_DRAFT_SUPABASE_URL?.trim(),key=import.meta.env.VITE_DRAFT_SUPABASE_ANON_KEY?.trim();export const draftCloud:{configured:boolean;client:SupabaseClient|null}={configured:Boolean(url&&key),client:url&&key?createClient(url,key):null};export async function connectivity(){if(!draftCloud.client||!navigator.onLine)return'LOCAL DEV · CLOUD OFF';const{error}=await draftCloud.client.from('leagues').select('id').limit(1);return error?'SYNC ERROR':'DRAFT CLOUD CONNECTED'}
