import { draftCloud, type CloudStatus } from '../data/cloud'
export type AuthView = 'loading' | 'email' | 'sending' | 'check-email' | 'authenticated' | 'unauthorized' | 'configuration-error' | 'local-only'
export function authViewFor(status: CloudStatus, hasSession: boolean): AuthView {
  if (status === 'local-only') return 'local-only'
  if (status === 'configuration-error') return 'configuration-error'
  if (status === 'unauthorized') return 'unauthorized'
  if (status === 'authenticated') return 'authenticated'
  return hasSession ? 'loading' : 'email'
}
export const loginMarkup = (view: AuthView, message = '') => `<main class="auth"><p class="eyebrow">PRIVATE ACCESS</p><h1>Fantasy Draft Assistant</h1>${view === 'loading' ? '<p>Loading session…</p>' : ''}${view === 'configuration-error' ? '<p role="alert">Draft cloud configuration error. Production requires both the Draft Supabase URL and publishable key.</p>' : ''}${view === 'unauthorized' ? '<p role="alert"><b>Access not authorized</b></p><p>Your authenticated account is not on the Draft Assistant allowlist.</p><button id="sign-out">Sign out</button>' : ''}${view === 'email' || view === 'sending' ? `<p>Sign in with the allowlisted private account.</p><form><label>Email<input type="email" required autocomplete="email"></label><button ${view === 'sending' ? 'disabled' : ''}>${view === 'sending' ? 'Sending link…' : 'Send magic link'}</button></form>` : ''}${view === 'check-email' ? '<p><b>Check your email</b></p><p>Use the secure magic link to return to this Draft Assistant.</p>' : ''}${message ? `<p role="alert">${message}</p>` : ''}</main>`
export async function requireAccess(root: HTMLElement, ready: () => void) {
  if (draftCloud.initialStatus === 'local-only') { root.innerHTML = '<div class="dev-banner">LOCAL DEVELOPMENT MODE · Draft cloud and authentication are not configured.</div>'; ready(); return }
  if (draftCloud.initialStatus === 'configuration-error') { root.innerHTML = loginMarkup('configuration-error'); return }
  root.innerHTML = loginMarkup('loading')
  try {
    const session = await draftCloud.session()
    if (session) {
      const authorized = await draftCloud.authorize(session)
      if (authorized) { ready(); return }
      root.innerHTML = loginMarkup('unauthorized'); root.querySelector('#sign-out')?.addEventListener('click', () => void draftCloud.signOut().then(() => location.reload())); return
    }
    const renderForm = (view: AuthView, message = '') => {
      root.innerHTML = loginMarkup(view, message)
      root.querySelector('form')?.addEventListener('submit', async event => { event.preventDefault(); const email = root.querySelector<HTMLInputElement>('input')!.value; renderForm('sending'); try { await draftCloud.sendMagicLink(email); root.innerHTML = loginMarkup('check-email') } catch (error) { renderForm('email', error instanceof Error ? error.message : 'Unable to send magic link.') } })
    }
    renderForm('email')
  } catch { root.innerHTML = loginMarkup('email', 'Draft cloud is unavailable. Local draft data remains stored on this device.') }
}
import{draftCloud}from'../data/cloud';export async function requireAccess(root:HTMLElement,ready:()=>void){if(!draftCloud.configured){root.innerHTML='<div class="dev-banner">LOCAL DEVELOPMENT MODE · Authentication bypass is explicit because the separate Draft Supabase project is not configured.</div>';ready();return}const client=draftCloud.client!;const{data}=await client.auth.getSession();if(data.session){ready();return}root.innerHTML='<main class="auth"><h1>Private Draft Assistant</h1><p>Authenticated allowlisted access only.</p><form><input type="email" required placeholder="Allowlisted email"><button>Send magic link</button></form><p class="message"></p></main>';root.querySelector('form')!.addEventListener('submit',async e=>{e.preventDefault();const email=(root.querySelector('input')as HTMLInputElement).value;const allowed=import.meta.env.VITE_DRAFT_ALLOWED_EMAIL;if(allowed&&email.toLowerCase()!==allowed.toLowerCase()){root.querySelector('.message')!.textContent='This email is not allowlisted.';return}const{error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.href}});root.querySelector('.message')!.textContent=error?.message??'Check your email for the private sign-in link.'})}
