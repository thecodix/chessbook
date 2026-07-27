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

// Attempt to play a move by grid coordinates. `promotion` defaults to 'q'
// but callers (the promotion picker in Board.jsx) can pass 'r' | 'b' | 'n'
// once the player has chosen a piece.
// Returns { san, fen, promotion } on success, or null if the move is illegal.
export function applyClickMove(fen, fromR, fromC, toR, toC, promotion = 'q') {
  const chess = new Chess(fen)
  try {
    const move = chess.move({ from: rcToSquare(fromR, fromC), to: rcToSquare(toR, toC), promotion })
    if (!move) return null
    return { san: move.san, fen: chess.fen(), promotion: move.promotion || null }
  } catch {
    return null
  }
}

// Whether the (legal) move from (fromR,fromC) to (toR,toC) is a pawn
// promotion — used to show a piece picker instead of silently auto-queening.
export function isPromotionMove(fen, fromR, fromC, toR, toC) {
  const chess = new Chess(fen)
  const from = rcToSquare(fromR, fromC), to = rcToSquare(toR, toC)
  return chess.moves({ square: from, verbose: true }).some(m => m.to === to && m.promotion)
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

// Parse a UCI move string (e.g. "f6g7" or "e7e8q" for a promotion) into a
// chess.js move object.
export function uciToMove(uci) {
  return {
    from:       uci.slice(0, 2),
    to:         uci.slice(2, 4),
    promotion:  uci.length > 4 ? uci.slice(4) : 'q',
  }
}

// Like buildHistory, but starts from an arbitrary FEN (puzzle position) and
// plays a list of UCI moves (e.g. a Polgar puzzle's solution line) instead
// of SAN. Returns an array of FENs of length uciMoves.length + 1.
export function buildHistoryFromUci(fen, uciMoves) {
  const chess = new Chess(fen)
  const history = [chess.fen()]
  for (const uci of uciMoves) {
    try {
      chess.move(uciToMove(uci))
    } catch {
      break
    }
    history.push(chess.fen())
  }
  return history
}
