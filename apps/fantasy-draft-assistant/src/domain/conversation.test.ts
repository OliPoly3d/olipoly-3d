import { describe, expect, it } from 'vitest'
import { isExplicitIntentRequest, isObsoleteAssistantMessage, isStrategicIntentCandidate, shouldOfferIntentAfterResponse } from './conversation'

describe('conversation classification', () => {
  it.each([
    'Why not a QB?',
    'Why Brock Bowers?',
    'What does FantasyPros rank him?',
    'Why do you prefer this player over the highest-ranked FantasyPros player?',
    'Who is the best value?',
    'Should I wait on WR?',
    'Tell me about this player\'s injury.',
  ])('keeps %s conversational', text => expect(isStrategicIntentCandidate(text)).toBe(false))

  it.each(['Prioritize RB early', 'Wait on quarterback unless value falls', 'Avoid players with significant injury risk.'])('offers to save durable direction: %s', text => {
    expect(isStrategicIntentCandidate(text)).toBe(true)
  })

  it('recognizes explicit memory requests', () => {
    expect(isExplicitIntentRequest('Remember that I want to wait on QB.')).toBe(true)
    expect(isStrategicIntentCandidate('Save this as a strategy: prioritize RB depth.')).toBe(true)
  })

  it('offers only after an AI answer and never turns an unavailable question into intent', () => {
    expect(shouldOfferIntentAfterResponse('Prioritize RB early', true)).toBe(true)
    expect(shouldOfferIntentAfterResponse('Why not a QB?', true)).toBe(false)
    expect(shouldOfferIntentAfterResponse('Why not a QB?', false)).toBe(false)
    expect(shouldOfferIntentAfterResponse('Prioritize RB early', false)).toBe(false)
  })

  it('only suppresses retired system records', () => {
    const base = { id: '1', leagueId: 'l', seasonId: 's', createdAt: '' }
    expect(isObsoleteAssistantMessage({ ...base, type: 'AI_PLACEHOLDER', text: 'legacy' })).toBe(true)
    expect(isObsoleteAssistantMessage({ ...base, type: 'SYSTEM', text: ['Offseason briefing', 'requires current', 'NFL context and is not enabled yet.'].join(' ') })).toBe(true)
    expect(isObsoleteAssistantMessage({ ...base, type: 'USER', text: 'Why not a QB?' })).toBe(false)
    expect(isObsoleteAssistantMessage({ ...base, type: 'SYSTEM', text: 'Current ECR favors the running back.' })).toBe(false)
  })
})
