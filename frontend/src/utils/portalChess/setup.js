// Initial board layouts for Portal Chess. Version A ("Portal Chess") uses a
// classic-flavored setup; Version B ("Grandes Maestros") uses a compact
// skirmish setup that scales with the roguelike run's Act (piece
// curriculum) and level-within-act (formation complexity).
import { themeForAct } from './actThemes'

function empty(N) { return Array.from({ length: N }, () => Array(N).fill(null)) }
const piece = (t, color) => ({ t, color, mods: [] })

// Classic-flavored setup used by Version A. 8x8 is standard chess; 6x6 drops
// one rook and one bishop per side to fit the smaller board.
export function classicSetup(N) {
  const b = empty(N)
  const back8 = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  const back6 = ['R', 'N', 'B', 'Q', 'K', 'N']
  const back = N === 8 ? back8 : back6
  for (let c = 0; c < N; c++) {
    b[0][c] = piece(back[c], 'b')
    b[1][c] = piece('P', 'b')
    b[N - 2][c] = piece('P', 'w')
    b[N - 1][c] = piece(back[c], 'w')
  }
  return b
}

// Fixed relative offsets from `mid` for each non-pawn piece's single copy,
// chosen so they resolve to distinct columns (after clamping) for both
// supported board sizes (N=6 and N=8) — see actThemes.js for the
// per-Act curriculum that decides WHICH of these actually gets placed.
const PIECE_OFFSET = { N: -2, B: 2, R: -4, Q: 1 }

// Compact skirmish setup used by Version B's roguelike. `actNumber` selects
// the Act's piece curriculum (see actThemes.js — Act 1 is pawns-only, each
// following curriculum Act adds exactly one new piece type, Mastery Acts
// past the curriculum keep the full roster). `levelInAct` (1-based, 1..
// ACT_LENGTH) scales PAWN-STRUCTURE complexity within the Act — real
// tactical variety (doubled/isolated/advanced pawns) rather than just a
// growing headcount, so an all-pawns Act 1 stays interesting across all of
// its levels — plus reveals the Act's one new piece from level 2 onward.
export function skirmishSetup(N, actNumber = 1, levelInAct = 1) {
  const b = empty(N)
  const mid = Math.floor(N / 2)
  const clampCol = c => Math.max(0, Math.min(N - 1, c))
  const { pieces: allowed, newPiece } = themeForAct(actNumber)
  const has = t => allowed.includes(t)

  b[N - 1][mid] = piece('K', 'w')
  b[0][mid] = piece('K', 'b')

  // Core 3-pawn wall, present from level 1 of every Act.
  ;[mid - 1, mid, mid + 1].forEach(c => {
    if (c >= 0 && c < N) { b[N - 2][c] = piece('P', 'w'); b[1][c] = piece('P', 'b') }
  })

  // Pawn-structure escalation across a single Act's levels: each tier adds
  // a genuinely different tactical wrinkle instead of just another pawn.
  if (levelInAct >= 2) b[1][clampCol(mid - 3)] = piece('P', 'b') // extra flank pawn
  if (levelInAct >= 3) b[N - 2][clampCol(mid + 3)] = piece('P', 'w') // matching flank pawn
  if (levelInAct >= 4) {
    b[1][clampCol(mid + 3)] = piece('P', 'b')
    b[N - 3][clampCol(mid - 1)] = piece('P', 'w') // advanced runner: promotion pressure
  }
  if (levelInAct >= 5) {
    b[N - 2][clampCol(mid - 3)] = piece('P', 'w')
    b[2][clampCol(mid + 1)] = piece('P', 'b') // matching advanced runner
  }
  if (levelInAct >= 6) {
    b[1][clampCol(mid - 4)] = piece('P', 'b') // isolated far-flank pawn
    b[N - 2][clampCol(mid + 4)] = piece('P', 'w')
  }
  if (levelInAct >= 7) {
    b[N - 3][clampCol(mid + 1)] = piece('P', 'w') // second runner: dual promotion race
    b[2][clampCol(mid - 1)] = piece('P', 'b')
  }

  // Each unlocked non-pawn piece type gets exactly one copy per side,
  // revealed from level 2 of the Act that introduces it onward (cumulative
  // across later Acts). Keeping it to one copy each avoids offset
  // collisions and keeps the curriculum's "one new toy per Act" framing
  // clean; further scaling within an Act comes from the pawn structure
  // above, and Mastery Acts intentionally cap board complexity here and
  // let enemy jokers/modifiers carry the curve further (same tradeoff
  // already accepted for the pre-curriculum endless scaling).
  ;['N', 'B', 'R', 'Q'].forEach(t => {
    if (!has(t)) return
    if (t === newPiece && levelInAct < 2) return // this Act's new piece appears from level 2
    const off = PIECE_OFFSET[t]
    b[N - 1][clampCol(mid + off)] = piece(t, 'w')
    b[0][clampCol(mid - off)] = piece(t, 'b')
  })

  return b
}


// Default symmetric portal placement (Version A's Fixed/One-way/Decaying
// modes): one pair roughly a knight's-move off-center on each half.
export function defaultPortalSquares(N) {
  const r1 = Math.floor(N / 2) - 1, c1 = 1
  const r2 = Math.floor(N / 2), c2 = N - 2
  return [[r1, c1], [r2, c2]]
}

// Rows eligible for Buckley-style pre-game portal placement ("4th rank from
// each player's own side"), generalized for any N >= 4.
export function portalPlacementRows(N) {
  return { white: N - 4, black: 3 }
}
