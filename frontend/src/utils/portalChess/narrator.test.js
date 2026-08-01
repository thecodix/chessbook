import { describe, it, expect } from 'vitest'
import { NARRATOR_LINES, narratorLineForAct } from './narrator'

describe('narratorLineForAct', () => {
  it('returns the matching line for each defined act', () => {
    Object.keys(NARRATOR_LINES).forEach(act => {
      expect(narratorLineForAct(Number(act))).toBe(NARRATOR_LINES[act])
    })
  })

  it('clamps to the last defined line for acts beyond the max', () => {
    const maxAct = Math.max(...Object.keys(NARRATOR_LINES).map(Number))
    expect(narratorLineForAct(maxAct + 1)).toBe(NARRATOR_LINES[maxAct])
    expect(narratorLineForAct(999)).toBe(NARRATOR_LINES[maxAct])
  })

  it('every line is a non-empty string', () => {
    Object.values(NARRATOR_LINES).forEach(line => {
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    })
  })
})
