import { describe, it, expect } from 'vitest'
import { ENEMY_FAMILIES } from './enemyFamilies'

const { coloso_oseo } = ENEMY_FAMILIES.skeletal.bossJokers
const { cerebro_maestro } = ENEMY_FAMILIES.neural.bossJokers

function emptyBoard(n = 8) {
  return Array.from({ length: n }, () => Array(n).fill(null))
}

describe('coloso_oseo.onAfterMove (skeletal boss gimmick)', () => {
  it('reconstructs a captured black pawn on an empty square of the back rank', () => {
    const board = emptyBoard()
    board[1][3] = { t: 'P', color: 'b', mods: [] } // occupy one square so we can assert the other is picked
    const state = {}
    const captured = { t: 'P', color: 'b', mods: [] }
    coloso_oseo.onAfterMove({ board, N: 8, captured, state, rng: () => 0 })
    expect(state.reconstructed).toBe(true)
    // rng() = 0 always picks the first available candidate column
    const filledCols = board[1].map((p, c) => (p ? c : null)).filter(c => c !== null)
    expect(filledCols.length).toBe(2)
  })

  it('does nothing if the captured piece is not a black pawn', () => {
    const board = emptyBoard()
    const state = {}
    coloso_oseo.onAfterMove({ board, N: 8, captured: { t: 'Q', color: 'b', mods: [] }, state, rng: () => 0 })
    expect(state.reconstructed).toBeFalsy()
    coloso_oseo.onAfterMove({ board, N: 8, captured: { t: 'P', color: 'w', mods: [] }, state, rng: () => 0 })
    expect(state.reconstructed).toBeFalsy()
  })

  it('only triggers once per match', () => {
    const board = emptyBoard()
    const state = { reconstructed: true }
    coloso_oseo.onAfterMove({ board, N: 8, captured: { t: 'P', color: 'b', mods: [] }, state, rng: () => 0 })
    expect(board.flat().every(sq => sq === null)).toBe(true)
  })

  it('is a no-op if there is no captured piece', () => {
    const board = emptyBoard()
    const state = {}
    coloso_oseo.onAfterMove({ board, N: 8, captured: null, state, rng: () => 0 })
    expect(state.reconstructed).toBeFalsy()
  })
})

describe('cerebro_maestro.onAfterMove (neural boss gimmick)', () => {
  it('transfers berserker to the next-best surviving black piece when the berserker piece falls', () => {
    const board = emptyBoard()
    board[0][0] = { t: 'R', color: 'b', mods: [] } // rook (500) — should receive berserker
    board[0][1] = { t: 'N', color: 'b', mods: [] } // knight (300) — lower value, should not
    const state = {}
    const captured = { t: 'Q', color: 'b', mods: ['berserker'] }
    cerebro_maestro.onAfterMove({ board, N: 8, captured, state })
    expect(state.transferred).toBe(true)
    expect(board[0][0].mods).toContain('berserker')
    expect(board[0][1].mods).not.toContain('berserker')
  })

  it('does nothing if the captured piece was not the berserker carrier', () => {
    const board = emptyBoard()
    board[0][0] = { t: 'R', color: 'b', mods: [] }
    const state = {}
    cerebro_maestro.onAfterMove({ board, N: 8, captured: { t: 'Q', color: 'b', mods: [] }, state })
    expect(state.transferred).toBeFalsy()
    expect(board[0][0].mods).not.toContain('berserker')
  })

  it('only triggers once per match', () => {
    const board = emptyBoard()
    board[0][0] = { t: 'R', color: 'b', mods: [] }
    const state = { transferred: true }
    cerebro_maestro.onAfterMove({ board, N: 8, captured: { t: 'Q', color: 'b', mods: ['berserker'] }, state })
    expect(board[0][0].mods).not.toContain('berserker')
  })
})
