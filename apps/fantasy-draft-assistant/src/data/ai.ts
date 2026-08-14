import type { DraftCloudGateway } from './cloud'

export type AiStatus = 'READY' | 'UNCONFIGURED' | 'UNAVAILABLE'

export async function probeAi(cloud: DraftCloudGateway): Promise<AiStatus> {
  const session = await cloud.session()
  if (!cloud.client || !session) return 'UNCONFIGURED'
  try {
    const { data, error } = await cloud.client.functions.invoke('draft-assistant-ai', { body: { action: 'health' } })
    return !error && data?.ready === true ? 'READY' : data?.configured === false ? 'UNCONFIGURED' : 'UNAVAILABLE'
  } catch {
    return 'UNAVAILABLE'
  }
}

export const aiLabel = (status: AiStatus) => `AI ${status}`

export async function requestAi(cloud: DraftCloudGateway, prompt: string, context: unknown): Promise<string> {
  if (!cloud.client || !await cloud.session()) throw new Error('AI is not authenticated.')
  const { data, error } = await cloud.client.functions.invoke('draft-assistant-ai', { body: { action: 'reason', prompt, context } })
  if (error || typeof data?.text !== 'string') throw new Error('AI endpoint is unavailable.')
  return data.text
}
