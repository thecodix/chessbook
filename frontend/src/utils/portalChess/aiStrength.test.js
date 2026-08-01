// Automated "is the AI level actually stronger" sanity check for Portal
// Chess. There's no backend for this feature (client-side only), so this
// simulates many full AI-vs-AI games directly against engine.js — the exact
// function (`chooseMove`) that powers both screens' AI opponents — and
// asserts that a deeper search (a higher difficulty.js level) wins a clear
// majority of decisive games against a shallower one. This is the closest
// thing to an "API test" for a feature with no HTTP surface.
import { describe, it, expect } from 'vitest'
import { createEngine } from './engine'
import { classicSetup } from './setup'

// A symmetric 6x6 classic-flavored starting position (both sides get
// identical material and layout). Using the skirmish setup here would bias
// results because it deliberately hands White an extra reinforcement, which
// would swamp the depth signal this test relies on.
function startingBoard() { return classicSetup(6) }

function scoreFor(color, result) {
  if (result === 'draw') return 0.5
  return result === color ? 1 : 0
}

function playGame(engine, depthWhite, depthBlack, maxPlies = 60) {
  let board = startingBoard()
  for (let ply = 0; ply < maxPlies; ply++) {
    const turn = ply % 2 === 0 ? 'w' : 'b'
    if (!engine.findKing(board, 'w')) return 'b'
    if (!engine.findKing(board, 'b')) return 'w'
    const depth = turn === 'w' ? depthWhite : depthBlack
    const mv = engine.chooseMove(board, turn, depth, ply)
    if (!mv) return engine.material(board, 'w') >= engine.material(board, 'b') ? 'w' : 'b'
    const { board: nb, captured, kind } = engine.applyMove(board, mv, ply)
    if (kind === 'kill' || (captured && captured.t === 'K')) return turn
    board = nb
  }
  // No checkmate/no-move decision within the ply budget (common on these
  // sparse boards without forced captures) — fall back to whoever ended up
  // materially ahead, which is exactly the signal a stronger search should
  // produce even short of an outright mate.
  const delta = engine.material(board, 'w') - engine.material(board, 'b')
  if (Math.abs(delta) < 50) return 'draw'
  return delta > 0 ? 'w' : 'b'
}

function matchScore(engine, deepDepth, shallowDepth, games) {
  let scoreDeep = 0
  for (let i = 0; i < games; i++) {
    const deepIsWhite = i % 2 === 0
    const result = playGame(engine, deepIsWhite ? deepDepth : shallowDepth, deepIsWhite ? shallowDepth : deepDepth)
    scoreDeep += scoreFor(deepIsWhite ? 'w' : 'b', result)
  }
  return scoreDeep / games
}

describe('Portal Chess AI strength scales with search depth', () => {
  it('depth 3 (Hard) clearly outperforms depth 1 (Easy), no guarded kings (Version A ruleset)', () => {
    const engine = createEngine({ N: 6, world: null, rules: { guardedKings: false, mods: false } })
    const rate = matchScore(engine, 3, 1, 6)
    expect(rate).toBeGreaterThanOrEqual(0.65)
  }, 30000)

  it('depth 3 (Hard) clearly outperforms depth 1 (Easy), guarded kings (Version B ruleset)', () => {
    const engine = createEngine({ N: 6, world: null, rules: { guardedKings: true, mods: false } })
    const rate = matchScore(engine, 3, 1, 6)
    expect(rate).toBeGreaterThanOrEqual(0.6)
  }, 30000)

  it('depth scaling is monotonic: depth 2 (Medium) does not lose badly to depth 1 (Easy)', () => {
    const engine = createEngine({ N: 6, world: null, rules: { guardedKings: false, mods: false } })
    const rate = matchScore(engine, 2, 1, 4)
    expect(rate).toBeGreaterThanOrEqual(0.5)
  }, 20000)
})
