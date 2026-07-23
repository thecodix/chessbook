// Chess logic — thin wrapper around the `chess.js` library.
// Handles castling rights, en passant, promotion, pins and checks correctly
// (the previous hand-rolled move generator did not).
import { Chess } from 'chess.js'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function isWhite(p) { return p && p === p.toUpperCase() }
export function isBlack(p) { return p && p === p.toLowerCase() }
export function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8 }

const FILES = 'abcdefgh'

export function rcToSquare(r, c) { return FILES[c] + (8 - r) }
export function squareToRc(sq) { return [8 - parseInt(sq[1], 10), FILES.indexOf(sq[0])] }

// Strip check/mate annotations so SAN strings can be compared reliably
// (repertoire data doesn't include them, chess.js output does).
export function stripSan(san) { return san ? san.replace(/[+#]/g, '') : '' }

// 8x8 grid (row 0 = rank 8, matching FEN row order) of piece chars or null.
export function fenToBoard(fen) {
  const board = new Chess(fen).board()
  return board.map(row => row.map(cell => {
    if (!cell) return null
    return cell.color === 'w' ? cell.type.toUpperCase() : cell.type.toLowerCase()
  }))
}

// Legal destination [r, c] squares for the piece on (r, c), given a FEN.
// Fully respects castling rights, en passant, pins and checks.
export function legalMovesForPiece(fen, r, c) {
  const chess = new Chess(fen)
  const square = rcToSquare(r, c)
  return chess.moves({ square, verbose: true }).map(m => squareToRc(m.to))
}

// Attack maps used for the cosmetic overlay layers (attacks/coverage/hanging/winning).
// wa/ba[r][c] = number of white/black pieces attacking that square.
export function buildAttackMaps(fen) {
  const chess = new Chess(fen)
  const wa = Array.from({ length: 8 }, () => new Array(8).fill(0))
  const ba = Array.from({ length: 8 }, () => new Array(8).fill(0))
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const square = rcToSquare(r, c)
    wa[r][c] = chess.attackers(square, 'w').length
    ba[r][c] = chess.attackers(square, 'b').length
  }
  return { wa, ba }
}

// Attempt to play a move by grid coordinates (auto-queens promotions).
// Returns { san, fen } on success, or null if the move is illegal.
export function applyClickMove(fen, fromR, fromC, toR, toC) {
  const chess = new Chess(fen)
  try {
    const move = chess.move({ from: rcToSquare(fromR, fromC), to: rcToSquare(toR, toC), promotion: 'q' })
    if (!move) return null
    return { san: move.san, fen: chess.fen() }
  } catch {
    return null
  }
}

// Build the FEN after each SAN move in `moves`, starting from the initial
// position. Returns an array of FENs of length moves.length + 1 (history[0]
// is the starting position). Stops early if a move can't be parsed.
export function buildHistory(moves) {
  const chess = new Chess()
  const history = [chess.fen()]
  for (const mv of moves) {
    try {
      chess.move(mv)
    } catch {
      break
    }
    history.push(chess.fen())
  }
  return history
}
