import { describe, it, expect } from 'vitest'
import { skirmishSetup } from './setup'

function piecesOnBoard(board) {
  const types = new Set()
  board.forEach(row => row.forEach(p => { if (p) types.add(p.t) }))
  return types
}

function countPieces(board, color) {
  let n = 0
  board.forEach(row => row.forEach(p => { if (p && p.color === color) n++ }))
  return n
}

describe('skirmishSetup (Act piece curriculum)', () => {
  it('Act 1 board only ever contains pawns and kings, at every level-in-act', () => {
    for (let lvl = 1; lvl <= 8; lvl++) {
      const b = skirmishSetup(8, 1, lvl)
      const types = piecesOnBoard(b)
      types.forEach(t => expect(['P', 'K']).toContain(t))
    }
  })

  it('both kings are always placed', () => {
    const b = skirmishSetup(8, 1, 1)
    let wKing = 0, bKing = 0
    b.forEach(row => row.forEach(p => { if (p?.t === 'K' && p.color === 'w') wKing++; if (p?.t === 'K' && p.color === 'b') bKing++ }))
    expect(wKing).toBe(1)
    expect(bKing).toBe(1)
  })

  it('pawn count grows monotonically with levelInAct within an Act', () => {
    let prevCount = countPieces(skirmishSetup(8, 1, 1), 'w')
    for (let lvl = 2; lvl <= 7; lvl++) {
      const count = countPieces(skirmishSetup(8, 1, lvl), 'w')
      expect(count).toBeGreaterThanOrEqual(prevCount)
      prevCount = count
    }
  })

  it("Act 2 introduces Knights only from level 2 onward, not level 1", () => {
    const lvl1 = skirmishSetup(8, 2, 1)
    expect(piecesOnBoard(lvl1).has('N')).toBe(false)
    const lvl2 = skirmishSetup(8, 2, 2)
    expect(piecesOnBoard(lvl2).has('N')).toBe(true)
    // Still no bishops/rooks/queen in Act 2 at any level.
    for (let lvl = 1; lvl <= 8; lvl++) {
      const types = piecesOnBoard(skirmishSetup(8, 2, lvl))
      expect(types.has('B')).toBe(false)
      expect(types.has('R')).toBe(false)
      expect(types.has('Q')).toBe(false)
    }
  })

  it('later curriculum Acts keep earlier unlocked pieces (cumulative)', () => {
    const b = skirmishSetup(8, 4, 5) // Act 4 = P,N,B,R unlocked
    const types = piecesOnBoard(b)
    expect(types.has('N')).toBe(true)
    expect(types.has('B')).toBe(true)
    expect(types.has('R')).toBe(true)
    expect(types.has('Q')).toBe(false)
  })

  it('Act 5 (full curriculum) can place the Queen', () => {
    const b = skirmishSetup(8, 5, 2)
    expect(piecesOnBoard(b).has('Q')).toBe(true)
  })

  it('works for both supported board sizes without throwing', () => {
    expect(() => skirmishSetup(6, 3, 4)).not.toThrow()
    expect(() => skirmishSetup(8, 3, 4)).not.toThrow()
  })
})
