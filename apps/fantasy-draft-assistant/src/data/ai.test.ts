import { describe, expect, it, vi } from 'vitest'
import { aiLabel, probeAi, refreshAiStatus } from './ai'

describe('AI readiness', () => {
  it('reports an unauthenticated client as unavailable', async () => {
    expect(await probeAi({ client: null, session: vi.fn().mockResolvedValue(null) } as never)).toBe('UNAVAILABLE')
    expect(aiLabel('UNAVAILABLE')).not.toBe('AI READY')
  })
  it('applies and renders READY from the exact production health response', async () => {
    const cloud = { session: vi.fn().mockResolvedValue({ access_token: 'x' }), client: { functions: { invoke: vi.fn().mockResolvedValue({ data: { ready: true, configured: true }, error: null }) } } }
    let renderedStatus = aiLabel('UNCONFIGURED')

    await refreshAiStatus(cloud as never, status => { renderedStatus = aiLabel(status) })

    expect(renderedStatus).toBe('AI READY')
  })
  it('does not require a second session read after authenticated startup', async () => {
    const cloud = { session: vi.fn().mockResolvedValue(null), client: { functions: { invoke: vi.fn().mockResolvedValue({ data: { ready: true, configured: true }, error: null }) } } }
    let draftRoom = 'ASSISTANT · UNAVAILABLE'
    await refreshAiStatus(cloud as never, status => { draftRoom = `ASSISTANT · ${status}` })
    expect(draftRoom).toBe('ASSISTANT · READY')
    expect(cloud.session).not.toHaveBeenCalled()
  })
  it('reports server configuration as unconfigured', async () => {
    const cloud = { session: vi.fn().mockResolvedValue({ access_token: 'x' }), client: { functions: { invoke: vi.fn().mockResolvedValue({ data: { ready: false, configured: false }, error: null }) } } }
    expect(await probeAi(cloud as never)).toBe('UNCONFIGURED')
  })
  it('reports an unreachable endpoint as unavailable', async () => {
    const cloud = { session: vi.fn().mockResolvedValue({ access_token: 'x' }), client: { functions: { invoke: vi.fn().mockRejectedValue(new Error('offline')) } } }
    expect(await probeAi(cloud as never)).toBe('UNAVAILABLE')
  })
})
