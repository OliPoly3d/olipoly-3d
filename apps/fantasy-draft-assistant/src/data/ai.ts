import type { DraftCloudGateway } from './cloud'

export type AiStatus = 'READY' | 'UNCONFIGURED' | 'UNAVAILABLE'
export interface AiHealthResponse { ready: boolean; configured: boolean }

export function aiStatusFromHealth(data: Partial<AiHealthResponse> | null | undefined): AiStatus {
  if (data?.ready === true && data.configured === true) return 'READY'
  if (data?.configured === false) return 'UNCONFIGURED'
  return 'UNAVAILABLE'
}

export async function probeAi(cloud: DraftCloudGateway): Promise<AiStatus> {
  try {
    // requireAccess already established authorization. A second session read here
    // raced auth hydration in production; invoke supplies the current client token.
    if (!cloud.client) return 'UNAVAILABLE'
    const { data, error } = await cloud.client.functions.invoke('draft-assistant-ai', { body: { action: 'health' } })
    return error ? 'UNAVAILABLE' : aiStatusFromHealth(data as Partial<AiHealthResponse> | null)
  } catch {
    return 'UNAVAILABLE'
  }
}

export async function refreshAiStatus(cloud: DraftCloudGateway, apply: (status: AiStatus) => void): Promise<void> {
  apply(await probeAi(cloud))
}

export const aiLabel = (status: AiStatus) => `AI ${status}`

export async function requestAi(cloud: DraftCloudGateway, prompt: string, context: unknown): Promise<string> {
  if (!cloud.client || !await cloud.session()) throw new Error('AI is not authenticated.')
  const { data, error } = await cloud.client.functions.invoke('draft-assistant-ai', { body: { action: 'reason', prompt, context } })
  if (error || typeof data?.text !== 'string') throw new Error('AI endpoint is unavailable.')
  return data.text
}
