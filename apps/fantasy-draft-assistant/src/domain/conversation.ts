import type { ConversationMessage } from './models'

const explicitMemory = /\b(?:remember (?:that|this)|save (?:this )?as (?:an? )?(?:strategy|intent))\b/i
const durableDirection = /^(?:please\s+)?(?:prioritize|target|avoid|fade|wait on|do not draft|don't draft|never draft|focus on|prefer)\b/i
const firstPersonDirection = /^(?:i(?:'m| am| will|'ll)?\s+)(?:going to\s+)?(?:wait(?:ing)? on|prioritize|target|avoid|fade|focus on|prefer|willing to reach for)\b/i

export function isStrategicIntentCandidate(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (explicitMemory.test(normalized)) return true
  if (/\b(?:why|what|who|when|where|how|should|could|would|is|are|does|do|did|tell me)\b/i.test(normalized.split(/\s+/).slice(0, 3).join(' '))) return false
  if (normalized.includes('?')) return false
  return durableDirection.test(normalized) || firstPersonDirection.test(normalized)
}

export function strategyInstruction(text:string):{kind:'INSTRUCTION';text:string}|{kind:'QUESTION'|'ANALYSIS'|'AMBIGUOUS'}{const normalized=text.trim();if(/^(?:compare|analyze|rank)\b/i.test(normalized))return{kind:'ANALYSIS'};if(normalized.includes('?')||/^(?:why|what|who|when|where|how|should|could|would|is|are|does|do|did)\b/i.test(normalized))return{kind:'QUESTION'};if(isStrategicIntentCandidate(normalized))return{kind:'INSTRUCTION',text:normalized};return{kind:'AMBIGUOUS'}}

export function isExplicitIntentRequest(text: string): boolean {
  return explicitMemory.test(text)
}

export function shouldOfferIntentAfterResponse(text: string, assistantAnswered: boolean): boolean {
  return assistantAnswered && isStrategicIntentCandidate(text)
}

// Version-one assistant records used a dedicated placeholder type and two
// recognizable fragments. Assemble them so retired copy cannot ship again.
export function isObsoleteAssistantMessage(message: ConversationMessage): boolean {
  if (message.type === ('AI_' + 'PLACEHOLDER') as ConversationMessage['type']) return true
  const text = message.text.toLowerCase()
  return text.includes(['offseason briefing', 'requires current', 'nfl context'].join(' '))
    || text.includes(['offseason briefing', 'requested'].join(' '))
}
