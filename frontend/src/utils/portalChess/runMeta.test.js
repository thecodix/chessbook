import { describe, it, expect, beforeEach } from 'vitest'
import { getMetaState, noteLevelReached, noteRunEnded, isUnlocked, resetMeta } from './runMeta'

describe('runMeta', () => {
  beforeEach(() => { resetMeta() })

  it('starts with a fresh default state', () => {
    const m = getMetaState()
    expect(m).toEqual({ highestLevel: 0, totalWins: 0, totalRuns: 0 })
  })

  it('noteLevelReached bumps the highestLevel watermark', () => {
    noteLevelReached(3)
    expect(getMetaState().highestLevel).toBe(3)
    noteLevelReached(2)
    expect(getMetaState().highestLevel).toBe(3) // never decreases
    noteLevelReached(5)
    expect(getMetaState().highestLevel).toBe(5)
  })

  it('noteRunEnded increments totalRuns and totalWins', () => {
    noteRunEnded(2)
    noteRunEnded(0)
    const m = getMetaState()
    expect(m.totalRuns).toBe(2)
    expect(m.totalWins).toBe(2)
  })

  it('isUnlocked is true with no requirement', () => {
    expect(isUnlocked(undefined)).toBe(true)
    expect(isUnlocked(null)).toBe(true)
  })

  it('isUnlocked respects minLevel against the highestLevel watermark', () => {
    noteLevelReached(4)
    expect(isUnlocked({ minLevel: 4 })).toBe(true)
    expect(isUnlocked({ minLevel: 5 })).toBe(false)
  })
})
