import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const EXPECTED_URL = 'https://ffcjcepugnyhfkfezdlw.supabase.co'
const PUBLISHABLE_PREFIX = 'sb_publishable_'
const CONFIG_PATHS = ['public/config.js', '../../draft-assistant/config.js']

function evaluateRuntimeConfig(path: string) {
  const source = readFileSync(path, 'utf8')
  const sandbox: { window: { __DRAFT_ASSISTANT_CONFIG__?: unknown } } = { window: {} }
  expect(() => runInNewContext(source, sandbox, { filename: path })).not.toThrow()
  return { source, config: sandbox.window.__DRAFT_ASSISTANT_CONFIG__ as Record<string, unknown> }
}

describe.each(CONFIG_PATHS)('runtime configuration %s', path => {
  it('is valid JavaScript with exactly one populated URL and publishable key', () => {
    const { source, config } = evaluateRuntimeConfig(path)
    expect(source.match(/\bsupabaseUrl\s*:/g)).toHaveLength(1)
    expect(source.match(/\bsupabasePublishableKey\s*:/g)).toHaveLength(1)
    expect(Object.keys(config).sort()).toEqual(['supabasePublishableKey', 'supabaseUrl'])
    expect(config.supabaseUrl).toBe(EXPECTED_URL)
    expect(config.supabasePublishableKey).toMatch(new RegExp(`^${PUBLISHABLE_PREFIX}.+`))
  })
})
