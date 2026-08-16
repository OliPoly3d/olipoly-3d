const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return new Response(JSON.stringify({ ready: false }), { status: 405, headers })
  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  const model = Deno.env.get('OPENAI_MODEL')?.trim() || 'gpt-5-mini'
  if (!key) return new Response(JSON.stringify({ ready: false, configured: false }), { status: 503, headers })
  const body = await request.json().catch(() => ({})) as { action?: string }
  if (body.action === 'health') {
    const check = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${key}` } })
    return new Response(JSON.stringify({ ready: check.ok, configured: true }), { status: check.ok ? 200 : 503, headers })
  }
  const input = body as { action?: string; prompt?: string; context?: unknown }
  if (input.action !== 'reason' || !input.prompt?.trim()) return new Response(JSON.stringify({ error: 'A prompt is required.' }), { status: 400, headers })
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, instructions: 'You are a concise fantasy football draft adviser. Treat the supplied deterministic recommendations and availability as authoritative. Never recommend a player outside the supplied available pool. Disclose missing or stale current data. For ordinary live-draft questions, default to a decision-first answer in 2–5 short paragraphs or compact bullets. Expand only when the user explicitly requests detail.', input: JSON.stringify({ prompt: input.prompt.slice(0, 2000), context: input.context }) }) })
  const result = await response.json() as { output_text?: string; error?: { message?: string } }
  return new Response(JSON.stringify(response.ok ? { text: result.output_text } : { error: result.error?.message ?? 'OpenAI request failed.' }), { status: response.ok ? 200 : 502, headers })
})
