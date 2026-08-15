import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AUTHENTICATED_BEFORE_KEY, loginMarkup, restoreAccess, type AuthGateway, type AuthView } from './auth'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
})

const session = (id = 'allowed') => ({ user: { id } }) as Session
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function gateway(initial: Session | null, allowed = true) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined
  const value: AuthGateway & { emit: (event: AuthChangeEvent, value: Session | null) => void } = {
    session: vi.fn().mockResolvedValue(initial),
    authorize: vi.fn().mockResolvedValue(allowed),
    onAuthStateChange: vi.fn(callback => { listener = callback; return vi.fn() }),
    emit: (event, next) => listener?.(event, next),
  }
  return value
}

describe('auth restoration', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the restoring view until a valid persisted session is authorized', async () => {
    let resolve!: (value: Session | null) => void
    const cloud = gateway(null)
    cloud.session = vi.fn(() => new Promise<Session | null>(done => { resolve = done }))
    const views: AuthView[] = ['loading']
    const ready = vi.fn()
    restoreAccess(cloud, view => views.push(view), ready)
    expect(views).toEqual(['loading'])
    resolve(session())
    await tick()
    expect(ready).toHaveBeenCalledOnce()
    expect(views).toEqual(['loading'])
    expect(localStorage.getItem(AUTHENTICATED_BEFORE_KEY)).toBe('true')
  })

  it('rerenders when a magic-link or refresh event restores a session after startup', async () => {
    const cloud = gateway(null)
    const views: AuthView[] = []
    const ready = vi.fn()
    restoreAccess(cloud, view => views.push(view), ready)
    await tick()
    expect(views).toEqual(['email'])
    cloud.emit('SIGNED_IN', session())
    await tick()
    expect(ready).toHaveBeenCalledOnce()
  })

  it('recovers an expired access token when Supabase returns its refreshed session', async () => {
    const cloud = gateway(session())
    const ready = vi.fn()
    restoreAccess(cloud, vi.fn(), ready)
    await tick()
    expect(ready).toHaveBeenCalledOnce()
    expect(cloud.authorize).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 'allowed' } }))
  })

  it('shows recoverable login for revoked sessions and errors without hanging', async () => {
    const revoked = gateway(null)
    const revokedViews: AuthView[] = []
    restoreAccess(revoked, view => revokedViews.push(view), vi.fn())
    await tick()
    expect(revokedViews).toEqual(['email'])

    const failed = gateway(session())
    failed.authorize = vi.fn().mockRejectedValue(new Error('offline'))
    const messages: string[] = []
    restoreAccess(failed, (_view, message) => messages.push(message ?? ''), vi.fn())
    await tick()
    expect(messages.at(-1)).toContain('Send a new sign-in link')
  })

  it('denies authenticated users who are not allowlisted', async () => {
    const cloud = gateway(session('denied'), false)
    const views: AuthView[] = []
    const ready = vi.fn()
    restoreAccess(cloud, view => views.push(view), ready)
    await tick()
    expect(views).toEqual(['unauthorized'])
    expect(ready).not.toHaveBeenCalled()
  })

  it('uses a new-link sign-in UX rather than referring users to an old link', () => {
    expect(loginMarkup('loading')).toContain('Restoring session')
    expect(loginMarkup('email')).toContain('Enter your authorized email')
    expect(loginMarkup('email')).toContain('Send sign-in link')
    expect(loginMarkup('check-email')).toContain('new sign-in link')
    expect(loginMarkup('check-email')).not.toContain('magic link')
  })
})
