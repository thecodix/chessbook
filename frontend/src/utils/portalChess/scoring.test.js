import { describe, it, expect } from 'vitest'
import { scoreForCapture, targetScoreForLevel, turnLimitForLevel, applyScoreModifiers } from './scoring'

describe('scoreForCapture', () => {
  it('returns 0 for no piece', () => { expect(scoreForCapture(null, 'move')).toBe(0) })

  it('weighs a plain capture at base piece value', () => {
    expect(scoreForCapture({ t: 'N' }, 'capture')).toBe(30)
  })

  it('triples the value for a "kill" finishing move', () => {
    expect(scoreForCapture({ t: 'Q' }, 'kill')).toBe(270)
  })

  it('doubles the value for a "charge" move', () => {
    expect(scoreForCapture({ t: 'R' }, 'charge')).toBe(100)
  })
})

describe('targetScoreForLevel', () => {
  it('grows with level', () => {
    expect(targetScoreForLevel(2, 'match')).toBeGreaterThan(targetScoreForLevel(1, 'match'))
  })

  it('elite nodes demand a higher target than match nodes at the same level', () => {
    expect(targetScoreForLevel(3, 'elite')).toBeGreaterThan(targetScoreForLevel(3, 'match'))
  })
})

describe('turnLimitForLevel', () => {
  it('elite nodes grant more turns than match nodes at the same level', () => {
    expect(turnLimitForLevel(3, 'elite')).toBeGreaterThan(turnLimitForLevel(3, 'match'))
  })

  it('caps out at higher levels', () => {
    expect(turnLimitForLevel(50, 'match')).toBeLessThanOrEqual(36)
  })
})

describe('applyScoreModifiers', () => {
  it('sums bonuses from all sources with a scoreModifier hook', () => {
    const sources = [
      { scoreModifier: ({ event }) => Math.round(event.baseScore * 0.5) },
      { scoreModifier: ({ event }) => Math.round(event.baseScore * 0.25) },
      {}, // no scoreModifier — ignored
    ]
    const total = applyScoreModifiers(100, { kind: 'capture' }, sources)
    expect(total).toBe(175)
  })

  it('returns the base score unchanged when no sources apply', () => {
    expect(applyScoreModifiers(50, { kind: 'capture' }, [])).toBe(50)
  })
})
