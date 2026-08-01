import { describe, it, expect } from 'vitest'
import { ACT_CURRICULUM, CURRICULUM_LENGTH, isMasteryAct, themeForAct, piecesForAct } from './actThemes'

describe('themeForAct / piecesForAct (Act piece curriculum)', () => {
  it('Act 1 is pawns-only', () => {
    expect(piecesForAct(1)).toEqual(['P'])
  })

  it('each curriculum Act cumulatively adds exactly one new piece type', () => {
    for (let a = 2; a <= CURRICULUM_LENGTH; a++) {
      const prev = piecesForAct(a - 1)
      const cur = piecesForAct(a)
      expect(cur.length).toBe(prev.length + 1)
      prev.forEach(p => expect(cur).toContain(p))
    }
  })

  it('the final curriculum Act has the full classic roster (minus none)', () => {
    expect(piecesForAct(CURRICULUM_LENGTH).sort()).toEqual(['B', 'N', 'P', 'Q', 'R'].sort())
  })

  it('Mastery Acts (past the curriculum) keep the full roster and are flagged', () => {
    expect(isMasteryAct(CURRICULUM_LENGTH)).toBe(false)
    expect(isMasteryAct(CURRICULUM_LENGTH + 1)).toBe(true)
    expect(piecesForAct(CURRICULUM_LENGTH + 5)).toEqual(piecesForAct(CURRICULUM_LENGTH))
    expect(themeForAct(CURRICULUM_LENGTH + 1).label).toBe('Maestría')
  })

  it('every curriculum entry has a non-empty label and theme line', () => {
    ACT_CURRICULUM.forEach(entry => {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.theme.length).toBeGreaterThan(0)
    })
  })
})
