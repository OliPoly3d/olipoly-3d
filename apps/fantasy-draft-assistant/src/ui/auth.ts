import { draftCloud, type CloudStatus } from '../data/cloud'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
export type AuthView = 'loading' | 'email' | 'sending' | 'check-email' | 'authenticated' | 'unauthorized' | 'configuration-error' | 'local-only'
export const AUTHENTICATED_BEFORE_KEY = 'draft-assistant-authenticated-before'
export function authViewFor(status: CloudStatus, hasSession: boolean): AuthView {
  if (status === 'local-only') return 'local-only'
  if (status === 'configuration-error') return 'configuration-error'
  if (status === 'unauthorized') return 'unauthorized'
  if (status === 'authenticated') return 'authenticated'
  return hasSession ? 'loading' : 'email'
}
export const loginMarkup = (view: AuthView, message = '') => `<main class="auth"><p class="eyebrow">PRIVATE DRAFT ASSISTANT</p><h1>${view === 'loading' ? 'Restoring session…' : 'Sign in'}</h1>${view === 'loading' ? '<p>Checking this device for a saved, refreshable session.</p>' : ''}${view === 'configuration-error' ? '<p role="alert">Draft cloud configuration error. Production requires both the Draft Supabase URL and publishable key.</p>' : ''}${view === 'unauthorized' ? '<p role="alert"><b>Access not authorized</b></p><p>Your authenticated account is not on the Draft Assistant allowlist.</p><button id="sign-out">Sign out</button>' : ''}${view === 'email' || view === 'sending' ? `<p>Enter your authorized email to receive a sign-in link.</p><form><label>Email<input type="email" required autocomplete="email"></label><button ${view === 'sending' ? 'disabled' : ''}>${view === 'sending' ? 'Sending sign-in link…' : 'Send sign-in link'}</button></form>` : ''}${view === 'check-email' ? '<p><b>Check your email</b></p><p>Open the new sign-in link on this device. You will not need to reuse it after the session is saved.</p>' : ''}${message ? `<p role="alert">${message}</p>` : ''}</main>`

export interface AuthGateway {
  session(): Promise<Session | null>
  authorize(session: Session): Promise<boolean>
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): () => void
}

/** Coordinates the initial persisted-session read with later Supabase auth events. */
export function restoreAccess(gateway: AuthGateway, update: (view: AuthView, message?: string) => void, ready: () => void) {
  let completed = false
  let generation = 0
  const inspect = async (session: Session | null) => {
    const current = ++generation
    try {
      if (!session) { if (!completed && current === generation) update('email'); return }
      const authorized = await gateway.authorize(session)
      if (current !== generation || completed) return
      if (!authorized) { update('unauthorized'); return }
      completed = true
      localStorage.setItem(AUTHENTICATED_BEFORE_KEY, 'true')
      stop()
      ready()
    } catch {
      if (!completed && current === generation) update('email', 'Session restoration failed. Send a new sign-in link to try again.')
    }
  }
  let stop: () => void = () => undefined
  stop = gateway.onAuthStateChange((_event, session) => { queueMicrotask(() => void inspect(session)) })
  void gateway.session().then(inspect, () => update('email', 'Session restoration failed. Send a new sign-in link to try again.'))
  return stop
}
export async function requireAccess(root: HTMLElement, ready: () => void) {
  if (draftCloud.initialStatus === 'local-only') { root.innerHTML = '<div class="dev-banner">LOCAL DEVELOPMENT MODE · Draft cloud and authentication are not configured.</div>'; ready(); return }
  if (draftCloud.initialStatus === 'configuration-error') { root.innerHTML = loginMarkup('configuration-error'); return }
  root.innerHTML = loginMarkup('loading')
  try {
    const renderForm = (view: AuthView, message = '') => {
      if (view === 'email' && !message && localStorage.getItem(AUTHENTICATED_BEFORE_KEY) === 'true') message = 'Your session expired. Send a new sign-in link.'
      root.innerHTML = loginMarkup(view, message)
      root.querySelector('#sign-out')?.addEventListener('click', () => void draftCloud.signOut().then(() => { localStorage.removeItem(AUTHENTICATED_BEFORE_KEY); location.reload() }))
      root.querySelector('form')?.addEventListener('submit', async event => { event.preventDefault(); const email = root.querySelector<HTMLInputElement>('input')!.value; renderForm('sending'); try { await draftCloud.sendMagicLink(email); root.innerHTML = loginMarkup('check-email') } catch (error) { renderForm('email', error instanceof Error ? error.message : 'Unable to send magic link.') } })
    }
    restoreAccess(draftCloud, renderForm, ready)
  } catch { root.innerHTML = loginMarkup('email', 'Draft cloud is unavailable. Local draft data remains stored on this device.') }
}
