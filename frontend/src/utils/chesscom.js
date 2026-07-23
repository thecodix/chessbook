/**
 * Chess.com game import
 *
 * Real API: https://api.chess.com/pub/player/{username}/games/{year}/{month}
 * No auth required — public API.
 */

const CHESSCOM_BASE = 'https://api.chess.com/pub/player'

export async function fetchChessComGames(username, year, month) {
  const url = `${CHESSCOM_BASE}/${username.toLowerCase()}/games/${year}/${String(month).padStart(2, '0')}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Chessbook/0.1 (learning app)' }
  })
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)
  const data = await res.json()
  return data.games || []
}

export async function fetchRecentGames(username, monthsBack = 2) {
  const now = new Date()
  const results = []
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    try {
      const games = await fetchChessComGames(username, d.getFullYear(), d.getMonth() + 1)
      results.push(...games)
    } catch (e) {
      console.warn(`Failed to fetch ${d.getFullYear()}/${d.getMonth() + 1}:`, e)
    }
  }
  return results
}

export function parseChessComGame(raw, username) {
  const white = raw.white?.username?.toLowerCase()
  const isWhite = white === username.toLowerCase()

  const result = raw.white?.result === 'win' ? '1-0'
    : raw.black?.result === 'win' ? '0-1'
    : '1/2-1/2'

  // Detailed result reason (resigned, timeout, checkmated, agreed, etc.)
  const myResult  = isWhite ? raw.white?.result  : raw.black?.result
  const oppResult = isWhite ? raw.black?.result  : raw.white?.result

  // Extract ECO code and opening name from the opening URL
  // e.g. "https://www.chess.com/openings/Queens-Gambit-Declined" → "Queens Gambit Declined"
  const ecoUrl  = raw.opening || ''
  const opening = ecoUrl ? ecoUrl.split('/').pop().replace(/-/g, ' ') : 'Unknown'

  const moves = extractMovesFromPgn(raw.pgn || '')

  return {
    id:           raw.uuid || raw.url?.split('/').pop() || Math.random().toString(36).slice(2),
    white:        raw.white?.username || '?',
    black:        raw.black?.username || '?',
    whiteRating:  raw.white?.rating  ?? null,
    blackRating:  raw.black?.rating  ?? null,
    isWhite,
    result,
    myResult,     // "win" | "resigned" | "timeout" | "checkmated" | "agreed" | "repetition" | ...
    oppResult,
    opening,
    ecoUrl,
    moves,
    date:         raw.end_time ? new Date(raw.end_time * 1000).toISOString().split('T')[0] : '?',
    timeControl:  raw.time_control  || '?',
    timeClass:    raw.time_class    || null,   // "bullet" | "blitz" | "rapid" | "classical" | "daily"
    rated:        raw.rated !== false,
    accuracy:     raw.accuracies    || null,   // { white: float, black: float }
    gameUrl:      raw.url           || null,
    pgn:          raw.pgn           || null,
    tournament:   raw.tournament    || null,
    match:        raw.match         || null,
    rules:        raw.rules         || 'chess',
    initialFen:   raw.initial_setup || null,   // non-null for Chess960 / variants
    endFen:       raw.fen           || null,
  }
}

function extractMovesFromPgn(pgn) {
  const body = pgn
    .replace(/\[.*?\]\n?/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+\.\.\./g, '')
    .replace(/\d+\./g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return body
    .split(' ')
    .filter(t => t && !['1-0', '0-1', '1/2-1/2', '*'].includes(t))
    .slice(0, 20)
}

export function findDeviation(gameMoves, repertoireLines) {
  for (const line of repertoireLines) {
    const lineLen = Math.min(line.moves.length, gameMoves.length)
    for (let i = 0; i < lineLen; i++) {
      if (stripAnnotations(gameMoves[i]) !== stripAnnotations(line.moves[i])) {
        return {
          move:     Math.floor(i / 2) + 1,
          expected: line.moves[i],
          played:   gameMoves[i],
          lineName: line.label,
        }
      }
    }
    if (lineLen === line.moves.length || lineLen === gameMoves.length) return null
  }
  return { move: 1, expected: 'Not in repertoire', played: gameMoves[0] }
}

function stripAnnotations(move) {
  return move?.replace(/[+#!?]/g, '') || ''
}

export const MOCK_GAMES = [
  {
    id: 'demo1', white: 'You', black: 'opponent1', isWhite: true,
    whiteRating: 1842, blackRating: 1756,
    result: '1-0', myResult: 'win', oppResult: 'resigned',
    opening: 'Sicilian Dragon', timeControl: '10+0', timeClass: 'blitz', rated: true,
    accuracy: { white: 91.4, black: 76.2 },
    moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','g6'],
    deviation: null, date: '2026-06-18',
    gameUrl: null, tournament: null, match: null, rules: 'chess',
  },
  {
    id: 'demo2', white: 'opponent2', black: 'You', isWhite: false,
    whiteRating: 1803, blackRating: 1842,
    result: '0-1', myResult: 'win', oppResult: 'checkmated',
    opening: 'London System', timeControl: '10+0', timeClass: 'blitz', rated: true,
    accuracy: { white: 68.1, black: 88.5 },
    moves: ['d4','d5','Bf4','Nf6','e3','e6','Nf3','Be7','c4'],
    deviation: {
      move: 9, expected: 'Bd3', played: 'c4', lineName: 'Main line',
      note: 'c4 gives up the strong bishop on f4 prematurely. Bd3 keeps the tension.',
    },
    date: '2026-06-17', gameUrl: null, tournament: null, match: null, rules: 'chess',
  },
  {
    id: 'demo3', white: 'You', black: 'opponent3', isWhite: true,
    whiteRating: 1842, blackRating: 1779,
    result: '1-0', myResult: 'win', oppResult: 'timeout',
    opening: 'Italian Game', timeControl: '5+3', timeClass: 'blitz', rated: true,
    accuracy: { white: 84.7, black: 81.3 },
    moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d4'],
    deviation: null, date: '2026-06-16',
    gameUrl: null, tournament: null, match: null, rules: 'chess',
  },
  {
    id: 'demo4', white: 'opponent4', black: 'You', isWhite: false,
    whiteRating: 1901, blackRating: 1842,
    result: '1-0', myResult: 'checkmated', oppResult: 'win',
    opening: 'Caro-Kann', timeControl: '10+0', timeClass: 'blitz', rated: true,
    accuracy: { white: 93.2, black: 71.8 },
    moves: ['e4','c6','d4','d5','Nc3','dxe4','Nxe4','Nd7'],
    deviation: {
      move: 8, expected: 'Bf5', played: 'Nd7', lineName: 'Classical',
      note: 'Nd7 is passive. Bf5 is the critical move that activates the bishop immediately.',
    },
    date: '2026-06-15', gameUrl: null, tournament: null, match: null, rules: 'chess',
  },
  {
    id: 'demo5', white: 'You', black: 'opponent5', isWhite: true,
    whiteRating: 1842, blackRating: 1688,
    result: '0-1', myResult: 'resigned', oppResult: 'win',
    opening: 'Unknown', timeControl: '3+2', timeClass: 'bullet', rated: true,
    accuracy: { white: 62.4, black: 79.1 },
    moves: ['e4','e5','Nf3','f6'],
    deviation: {
      move: 1, expected: 'Not in repertoire', played: 'e4',
      note: 'This game went into an opening not in your repertoire. Consider adding the Open Game.',
    },
    date: '2026-06-14', gameUrl: null, tournament: null, match: null, rules: 'chess',
  },
  {
    id: 'demo6', white: 'opponent6', black: 'You', isWhite: false,
    whiteRating: 1815, blackRating: 1842,
    result: '1/2-1/2', myResult: 'agreed', oppResult: 'agreed',
    opening: 'French Defense', timeControl: '10+0', timeClass: 'blitz', rated: true,
    accuracy: { white: 88.9, black: 90.1 },
    moves: ['e4','e6','d4','d5','Nc3','Nf6','e5','Nfd7','Bg5'],
    deviation: {
      move: 9, expected: 'f4', played: 'Bg5', lineName: 'Advance variation',
      note: 'f4 is the mainline supporting the center. Bg5 is playable but less precise.',
    },
    date: '2026-06-13', gameUrl: null, tournament: null, match: null, rules: 'chess',
  },
]
