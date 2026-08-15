import { describe, expect, it, vi } from 'vitest'
import { aiLabel, probeAi } from './ai'

describe('AI readiness', () => {
  it('cannot show ready without an authenticated usable endpoint', async () => {
    expect(await probeAi({ client: null, session: vi.fn().mockResolvedValue(null) } as never)).toBe('UNCONFIGURED')
    expect(aiLabel('UNCONFIGURED')).not.toBe('AI READY')
  })
  it('shows ready only when the server confirms an OpenAI check', async () => {
    const cloud = { session: vi.fn().mockResolvedValue({ access_token: 'x' }), client: { functions: { invoke: vi.fn().mockResolvedValue({ data: { ready: true }, error: null }) } } }
    expect(await probeAi(cloud as never)).toBe('READY')
  })
  it('reports an unreachable endpoint as unavailable', async () => {
    const cloud = { session: vi.fn().mockResolvedValue({ access_token: 'x' }), client: { functions: { invoke: vi.fn().mockRejectedValue(new Error('offline')) } } }
    expect(await probeAi(cloud as never)).toBe('UNAVAILABLE')
  })
})
