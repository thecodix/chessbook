// Chess logic — move generation, attack maps, FEN parsing
// Drop-in from the Chessbook demo. Replace with chess.js for production
// (handles castling rights, en passant, pins properly).

export function fenToBoard(fen) {
  return fen.split(' ')[0].split('/').map(row => {
    const arr = []
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) arr.push(null)
      else arr.push(ch)
    }
    return arr
  })
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function isWhite(p) { return p && p === p.toUpperCase() }
export function isBlack(p) { return p && p === p.toLowerCase() }
export function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8 }

// Squares a piece attacks (pawns = diagonals only, sliding = stops at blocker)
export function attackedByPiece(board, r, c) {
  const p = board[r][c]
  if (!p) return []
  const type = p.toLowerCase()
  const white = isWhite(p)
  const sqs = []

  if (type === 'p') {
    const dir = white ? -1 : 1
    for (const dc of [-1, 1]) if (inBounds(r + dir, c + dc)) sqs.push([r + dir, c + dc])
    return sqs
  }

  const slide = dirs => {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      while (inBounds(nr, nc)) {
        sqs.push([nr, nc])
        if (board[nr][nc]) break
        nr += dr; nc += dc
      }
    }
  }

  if (type === 'n') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
      if (inBounds(r+dr, c+dc)) sqs.push([r+dr, c+dc])
  } else if (type === 'b') slide([[-1,-1],[-1,1],[1,-1],[1,1]])
  else if (type === 'r') slide([[-1,0],[1,0],[0,-1],[0,1]])
  else if (type === 'q') slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]])
  else if (type === 'k') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
      if (inBounds(r+dr, c+dc)) sqs.push([r+dr, c+dc])
  }
  return sqs
}

// Build white/black attack count maps over the whole board
export function buildAttackMaps(board) {
  const wa = Array.from({ length: 8 }, () => new Array(8).fill(0))
  const ba = Array.from({ length: 8 }, () => new Array(8).fill(0))
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]
    if (!p) continue
    const map = isWhite(p) ? wa : ba
    for (const [nr, nc] of attackedByPiece(board, r, c)) map[nr][nc]++
  }
  return { wa, ba }
}

// Legal moves for a piece (used for click-to-select)
export function legalMovesForPiece(board, r, c) {
  const p = board[r][c]
  if (!p) return []
  const type = p.toLowerCase()
  const white = isWhite(p)
  const moves = []
  const friend = sq => sq && (white ? isWhite(sq) : isBlack(sq))
  const enemy  = sq => sq && (white ? isBlack(sq) : isWhite(sq))

  if (type === 'p') {
    const dir = white ? -1 : 1, startRow = white ? 6 : 1
    if (inBounds(r+dir, c) && !board[r+dir][c]) {
      moves.push([r+dir, c])
      if (r === startRow && !board[r+dir*2][c]) moves.push([r+dir*2, c])
    }
    for (const dc of [-1, 1])
      if (inBounds(r+dir, c+dc) && enemy(board[r+dir][c+dc])) moves.push([r+dir, c+dc])
    return moves
  }

  const slide = dirs => {
    for (const [dr, dc] of dirs) {
      let nr = r+dr, nc = c+dc
      while (inBounds(nr, nc)) {
        if (friend(board[nr][nc])) break
        moves.push([nr, nc])
        if (board[nr][nc]) break
        nr += dr; nc += dc
      }
    }
  }

  if (type === 'n') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
      if (inBounds(r+dr, c+dc) && !friend(board[r+dr][c+dc])) moves.push([r+dr, c+dc])
  } else if (type === 'b') slide([[-1,-1],[-1,1],[1,-1],[1,1]])
  else if (type === 'r') slide([[-1,0],[1,0],[0,-1],[0,1]])
  else if (type === 'q') slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]])
  else if (type === 'k') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
      if (inBounds(r+dr, c+dc) && !friend(board[r+dr][c+dc])) moves.push([r+dr, c+dc])
  }
  return moves
}

// Apply a SAN move to a board, returns new board
// NOTE: simplified — no en passant or castling rights tracking
// Replace with chess.js for production
export function applyMove(board, san, whiteToMove) {
  const nb = board.map(r => [...r])
  const clean = san.replace(/[+#x=]/g, '')

  if (clean === 'O-O') {
    const r = whiteToMove ? 7 : 0
    nb[r][6] = nb[r][4]; nb[r][4] = null
    nb[r][5] = nb[r][7]; nb[r][7] = null
    return nb
  }
  if (clean === 'O-O-O') {
    const r = whiteToMove ? 7 : 0
    nb[r][2] = nb[r][4]; nb[r][4] = null
    nb[r][3] = nb[r][0]; nb[r][0] = null
    return nb
  }

  const files = 'abcdefgh'
  let piece = 'P', s = clean, fromFile = null, fromRank = null

  if (/^[KQRBN]/.test(s)) { piece = s[0]; s = s.slice(1) }
  if (piece === 'P' && s.length > 2 && /[a-h]/.test(s[0]) && /[a-h]/.test(s[1])) {
    fromFile = files.indexOf(s[0]); s = s.slice(1)
  }

  const dest = s.slice(-2)
  const toFile = files.indexOf(dest[0]), toRank = 8 - parseInt(dest[1])
  const disamb = s.slice(0, -2)

  if (disamb.length === 1) {
    if (/[a-h]/.test(disamb)) fromFile = files.indexOf(disamb)
    else fromRank = 8 - parseInt(disamb)
  } else if (disamb.length === 2) {
    fromFile = files.indexOf(disamb[0])
    fromRank = 8 - parseInt(disamb[1])
  }

  const pieceChar = whiteToMove ? piece : piece.toLowerCase()

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (nb[r][c] !== pieceChar) continue
    if (fromFile !== null && c !== fromFile) continue
    if (fromRank !== null && r !== fromRank) continue
    if (legalMovesForPiece(nb, r, c).some(([mr, mc]) => mr === toRank && mc === toFile)) {
      nb[toRank][toFile] = nb[r][c]; nb[r][c] = null
      if (piece === 'P' && (toRank === 0 || toRank === 7))
        nb[toRank][toFile] = whiteToMove ? 'Q' : 'q'
      return nb
    }
  }
  return nb
}

// Build full board history from a move list (SAN strings)
export function buildHistory(moves) {
  let board = fenToBoard(START_FEN)
  const history = [board.map(r => [...r])]
  let white = true
  for (const mv of moves) {
    board = applyMove(board, mv, white)
    history.push(board.map(r => [...r]))
    white = !white
  }
  return history
}
