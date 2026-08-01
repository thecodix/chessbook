// Consumable one-shot tactical cards ("La Tertulia" card pack) — distinct
// from the permanent Great Master jokers in gmSystem.js/enemyFamilies.js.
// Cards are drawn into a hand and played mid-match by the human player;
// each is single-use and discarded once played. A card's `apply(ctx)`
// mutates a *fresh* board copy the caller already made (same convention as
// engine.applyMove / gmSystem.js), and may return a side-channel
// instruction the caller must honor:
//   { extraTurn: true } — grants one more move this turn (no turn switch)
//   { scoreBonus: N } — adds N points directly to the running skirmish
//     score (see scoring.js), used by cards that don't map to a capture
//   { selfDiscard: N } — discards N additional random cards from the hand
//     after this card resolves (used by high-value "curse" cards, e.g.
//     `pacto_de_sangre`, to create a real trade-off instead of pure upside)
//   Expanded (2026-08 redesign) with `rarity` and an optional
//   `unlockRequirement: { minLevel }` (see runMeta.js) for newer cards.

function findBackSquare(board, N, color) {
  const row = color === 'w' ? N - 2 : 1
  if (row < 0 || row >= N) return null
  for (let c = 0; c < N; c++) if (!board[row][c]) return [row, c]
  return null
}

function randomEmptySquare(board, N, rng, exclude = []) {
  const options = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!board[r][c] && !exclude.some(([er, ec]) => er === r && ec === c)) options.push([r, c])
  }
  if (!options.length) return null
  return options[Math.floor(rng() * options.length)]
}

const KING_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

export const CARDS = {
  segunda_movida: {
    name: 'Segunda Movida', icon: '⏩', targetType: 'none', rarity: 'common',
    desc: 'Juega otra vez sin ceder el turno.',
    apply() { return { extraTurn: true } },
  },
  refuerzo_instantaneo: {
    name: 'Refuerzo Instantáneo', icon: '♟', targetType: 'none', rarity: 'common',
    desc: 'Invoca un peón aliado en tu retaguardia.',
    apply({ board, N, color }) {
      const sq = findBackSquare(board, N, color)
      if (sq) board[sq[0]][sq[1]] = { t: 'P', color, mods: [] }
    },
  },
  golpe_de_suerte: {
    name: 'Golpe de Suerte', icon: '⚡', targetType: 'enemy', rarity: 'common',
    desc: 'Elimina una pieza enemiga (el rey no).',
    apply({ board, target }) { board[target.r][target.c] = null },
  },
  muro_temporal: {
    name: 'Muro Temporal', icon: '◍', targetType: 'empty', rarity: 'common',
    desc: 'Abre un agujero temporal en una casilla vacía.',
    apply({ tileMap, target, ply }) { tileMap.addHole(target.r, target.c, ply) },
  },
  portal_de_bolsillo: {
    name: 'Portal de Bolsillo', icon: '◎', targetType: 'empty', rarity: 'common',
    desc: 'Abre un par de portales entre esta casilla y otra al azar.',
    apply({ tileMap, target, board, N }) {
      const other = randomEmptySquare(board, N, Math.random, [[target.r, target.c]])
      if (other) tileMap.addPortalPair(target.r, target.c, other[0], other[1])
    },
  },
  escudo_de_emergencia: {
    name: 'Escudo de Emergencia', icon: '🛡', targetType: 'none', rarity: 'common',
    desc: 'Tu rey recluta un guardia adyacente.',
    apply({ board, N, findKing, color }) {
      const k = findKing(board, color)
      if (!k) return
      for (const [dr, dc] of KING_DIRS) {
        const nr = k[0] + dr, nc = k[1] + dc
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && !board[nr][nc]) { board[nr][nc] = { t: 'P', color, mods: [] }; break }
      }
    },
  },
  purga: {
    name: 'Purga', icon: '✦', targetType: 'tile', rarity: 'common',
    desc: 'Limpia el efecto de una casilla (portal o agujero).',
    apply({ tileMap, target }) { tileMap.clearSquare(target.r, target.c) },
  },
  berserk_momentaneo: {
    name: 'Berserk Momentáneo', icon: '⚔', targetType: 'ownMajor', rarity: 'rare',
    desc: 'Tu pieza mayor se vuelve Berserker.',
    apply({ board, target }) {
      const p = board[target.r][target.c]
      if (p) p.mods = [...new Set([...(p.mods || []), 'berserker'])]
    },
  },
  purga_total: {
    name: 'Purga Total', icon: '✦✦', targetType: 'none', rarity: 'rare',
    desc: 'Limpia todos los portales y agujeros del tablero.',
    apply({ tileMap, N }) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (tileMap.tileType(r, c)) tileMap.clearSquare(r, c)
    },
  },
  agujero_doble: {
    name: 'Agujero Doble', icon: '◍◍', targetType: 'empty', rarity: 'rare',
    desc: 'Abre dos agujeros temporales encadenados.',
    apply({ tileMap, target, board, N, ply }) {
      tileMap.addHole(target.r, target.c, ply)
      const other = randomEmptySquare(board, N, Math.random, [[target.r, target.c]])
      if (other) tileMap.addHole(other[0], other[1], ply + 2)
    },
  },
  bendicion_real: {
    name: 'Bendición Real', icon: '♔', targetType: 'none', rarity: 'rare',
    desc: 'Tu rey recluta guardias en todas las casillas vacías adyacentes.',
    apply({ board, N, findKing, color }) {
      const k = findKing(board, color)
      if (!k) return
      for (const [dr, dc] of KING_DIRS) {
        const nr = k[0] + dr, nc = k[1] + dc
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && !board[nr][nc]) board[nr][nc] = { t: 'P', color, mods: [] }
      }
    },
  },
  intercambio_arcano: {
    name: 'Intercambio Arcano', icon: '⇄', targetType: 'ownMajor', rarity: 'rare',
    desc: 'Teletransporta tu pieza mayor a una casilla vacía al azar.',
    apply({ board, N, target }) {
      const p = board[target.r][target.c]
      if (!p) return
      const dest = randomEmptySquare(board, N, Math.random, [[target.r, target.c]])
      if (dest) { board[target.r][target.c] = null; board[dest[0]][dest[1]] = p }
    },
  },
  carga_electrica: {
    name: 'Carga Eléctrica', icon: '⚡⚡', targetType: 'enemy', rarity: 'rare',
    desc: 'Añade puntos instantáneos a tu marcador de la escaramuza.',
    apply() { return { scoreBonus: 150 } },
  },
  mano_de_hierro: {
    name: 'Mano de Hierro', icon: '🛠', targetType: 'ownMajor', rarity: 'common',
    desc: 'Tu pieza mayor se blinda (Falange).',
    apply({ board, target }) {
      const p = board[target.r][target.c]
      if (p) p.mods = [...new Set([...(p.mods || []), 'phalanx'])]
    },
  },
  pacto_de_sangre: {
    name: 'Pacto de Sangre', icon: '🩸', targetType: 'none', rarity: 'curse',
    desc: 'Puntos instantáneos a cambio de otra carta de tu mano.',
    apply() { return { scoreBonus: 300, selfDiscard: 1 } },
  },
}

export const CARD_IDS = Object.keys(CARDS)
export const HAND_CAP = 5

export function drawCards(n, rng = Math.random, exclude = []) {
  const pool = CARD_IDS.filter(id => !exclude.includes(id))
  const p = [...pool]
  const picked = []
  for (let i = 0; i < n && p.length; i++) { const idx = Math.floor(rng() * p.length); picked.push(p.splice(idx, 1)[0]) }
  return picked
}

// Validates whether (r,c) is a legal target for a card, given the current
// board/tileMap/color/ply. `card.targetType === 'none'` never needs one.
export function isValidCardTarget(card, ctx, r, c) {
  const { board, tileMap, N, color, ply } = ctx
  if (r < 0 || r >= N || c < 0 || c >= N) return false
  const p = board[r][c]
  switch (card.targetType) {
    case 'empty':
      return !p && !(tileMap && tileMap.tileType(r, c)) && !(tileMap && tileMap.isVoid(r, c, ply))
    case 'enemy':
      return !!p && p.color !== color && p.t !== 'K'
    case 'tile':
      return !!(tileMap && tileMap.tileType(r, c))
    case 'ownMajor':
      return !!p && p.color === color && p.t !== 'P' && p.t !== 'K'
    default:
      return false
  }
}
