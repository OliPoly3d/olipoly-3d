import { normalizeFantasyPros, type FantasyProsPayloads } from '../../../../apps/fantasy-draft-assistant/src/data/automated-player-data.ts'
import type { PlayerDataSnapshot, ScoringFormat } from '../../../../apps/fantasy-draft-assistant/src/data/player-data.ts'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'content-type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors })

async function authorized(request: Request): Promise<boolean> {
  const scheduledToken = Deno.env.get('DRAFT_PLAYER_REFRESH_TOKEN')?.trim()
  const suppliedToken = request.headers.get('x-refresh-token')?.trim()
  if (scheduledToken && suppliedToken && scheduledToken === suppliedToken) return true
  const authorization = request.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim(), anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (!authorization || !supabaseUrl || !anonKey) return false
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { authorization, apikey: anonKey } })
  if (!userResponse.ok) return false
  const user = await userResponse.json() as { id?: string }; if (!user.id) return false
  const allowed = await fetch(`${supabaseUrl}/rest/v1/draft_allowed_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { authorization, apikey: anonKey } })
  return allowed.ok && ((await allowed.json()) as unknown[]).length === 1
}

async function providerJson(path: string, apiKey: string): Promise<unknown> {
  const response = await fetch(`https://api.fantasypros.com/public/v2/json${path}`, { headers: { 'x-api-key': apiKey, accept: 'application/json' } })
  if (!response.ok) throw new Error(`FantasyPros ${path.split('?')[0]} failed with HTTP ${response.status}.`)
  return response.json()
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!await authorized(request)) return json({ error: 'Authorized Draft Assistant access is required.' }, 401)
  const apiKey = Deno.env.get('FANTASYPROS_API_KEY')?.trim()
  if (!apiKey) return json({ error: 'FantasyPros provider is not configured.', configured: false }, 503)
  const input = await request.json().catch(() => ({})) as { season?: number; scoringFormat?: ScoringFormat; includeIdp?: boolean; previous?: PlayerDataSnapshot }
  const season = Number.isInteger(input.season) ? input.season! : 2026
  const scoringFormat: ScoringFormat = input.scoringFormat === 'IDP' ? 'IDP' : 'PPR'; const includeIdp = Boolean(input.includeIdp)
  const params = new URLSearchParams({ scoring: 'PPR', position: includeIdp ? 'ALL' : 'FLX', ...(includeIdp ? { include_idp: 'true' } : {}) })
  const fetchedAt = new Date().toISOString()
  try {
    const [players, rankings, news, injuries, sleeperResult] = await Promise.all([
      providerJson('/nfl/players', apiKey), providerJson(`/nfl/${season}/consensus-rankings?${params}`, apiKey), providerJson('/nfl/news', apiKey), providerJson('/nfl/injuries', apiKey),
      fetch('https://api.sleeper.app/v1/players/nfl', { headers: { accept: 'application/json' } }).then(async response => response.ok ? response.json() : Promise.reject(new Error(`Sleeper failed with HTTP ${response.status}.`))).catch(() => undefined),
    ])
    const snapshot = normalizeFantasyPros({ players, rankings, news, injuries } satisfies FantasyProsPayloads, { fetchedAt, scoringFormat, season, includeIdp, sleeper: sleeperResult, previous: input.previous })
    return json({ snapshot, persisted: false, persistence: 'PENDING_SCHEMA_APPROVAL', summary: { players: snapshot.players.length, quality: snapshot.quality, changes: snapshot.changes.length, sleeper: sleeperResult === undefined ? 'FAILED' : 'SUCCESS' } })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Provider refresh failed.', priorSnapshotPreserved: true }, 502)
  }
})
