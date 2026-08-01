// Match-wide rule "modifiers" (mutators) — applied symmetrically to BOTH
// colors at match/level start, orthogonal to the portal ruleset (Version A)
// and the Great Master jokers (Version B). Reuses the same board/tileMap
// mutation primitives as gmSystem.js and enemyFamilies.js.
const PIECE_VAL = { N: 300, B: 320, R: 500, Q: 900 }
const KING_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

function eachPiece(board, fn) {
  const N = board.length
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const p = board[r][c]; if (p) fn(p, r, c) }
}
function addMod(p, mod) { p.mods = [...new Set([...(p.mods || []), mod])] }

export const MODIFIERS = {
  caballeros_nocturnos: {
    name: 'Caballeros Nocturnos', icon: '♞',
    desc: 'Todos los caballos saltan dos veces por turno.',
    apply({ board }) { eachPiece(board, p => { if (p.t === 'N') addMod(p, 'double') }) },
  },
  falange_total: {
    name: 'Falange Total', icon: '♙',
    desc: 'Todos los peones se blindan (Falange).',
    apply({ board }) { eachPiece(board, p => { if (p.t === 'P') addMod(p, 'phalanx') }) },
  },
  furia_ciega: {
    name: 'Furia Ciega', icon: '⚔',
    desc: 'La pieza mayor de cada bando se vuelve Berserker.',
    apply({ board, N }) {
      for (const color of ['w', 'b']) {
        let best = null, bv = 0
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const p = board[r][c]
          if (p && p.color === color && p.t !== 'P' && p.t !== 'K') {
            const v = PIECE_VAL[p.t] || 0
            if (v > bv) { bv = v; best = p }
          }
        }
        if (best) addMod(best, 'berserker')
      }
    },
  },
  marea_de_portales: {
    name: 'Marea de Portales', icon: '◎',
    desc: 'Se abre un par extra de portales en el tablero.',
    apply({ tileMap, board, N }) {
      const empties = []
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!board[r][c] && !tileMap.tileType(r, c)) empties.push([r, c])
      if (empties.length >= 2) {
        const a = empties.splice(Math.floor(Math.random() * empties.length), 1)[0]
        const b = empties.splice(Math.floor(Math.random() * empties.length), 1)[0]
        tileMap.addPortalPair(a[0], a[1], b[0], b[1])
      }
    },
  },
  campo_de_agujeros: {
    name: 'Campo de Agujeros', icon: '◍',
    desc: 'Se abren varios agujeros temporales cerca del centro.',
    apply({ tileMap, N }) {
      const mid = Math.floor(N / 2)
      const offsets = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      offsets.forEach(([dr, dc], i) => {
        const r = mid + dr, c = mid + dc
        if (r >= 0 && r < N && c >= 0 && c < N) tileMap.addHole(r, c, i * 2)
      })
    },
  },
  refuerzos_dobles: {
    name: 'Refuerzos Dobles', icon: '♟',
    desc: 'Ambos bandos reciben un peón extra.',
    apply({ board, N }) {
      for (const color of ['w', 'b']) {
        const row = color === 'w' ? N - 2 : 1
        if (row < 0 || row >= N) continue
        for (let c = 0; c < N; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color, mods: [] }; break } }
      }
    },
  },
  reyes_acorazados: {
    name: 'Reyes Acorazados', icon: '♚',
    desc: 'Ambos reyes reclutan un guardia extra.',
    apply({ board, N, findKing }) {
      for (const color of ['w', 'b']) {
        const k = findKing(board, color)
        if (!k) continue
        for (const [dr, dc] of KING_DIRS) {
          const nr = k[0] + dr, nc = k[1] + dc
          if (nr >= 0 && nr < N && nc >= 0 && nc < N && !board[nr][nc]) { board[nr][nc] = { t: 'P', color, mods: [] }; break }
        }
      }
    },
  },
}

export const MODIFIER_IDS = Object.keys(MODIFIERS)

// Scripted per-level rotation (predictable, mirrors enemyFamilies.js).
export function modifierForLevel(level) {
  return MODIFIER_IDS[(level - 1) % MODIFIER_IDS.length]
}

export function randomModifier(rng = Math.random) {
  return MODIFIER_IDS[Math.floor(rng() * MODIFIER_IDS.length)]
}

// Asymmetric, enemy-favoring modifiers — reserved for `elite`/`boss` map
// nodes only (2026-08 redesign). Unlike the symmetric MODIFIERS above,
// these apply exclusively to black, creating a real, telegraphed spike in
// difficulty rather than a neutral rule tweak (mirrors StS elite fights /
// Balatro boss blinds).
export const ELITE_MODIFIERS = {
  mano_negra: {
    name: 'Mano Negra', icon: '🖤',
    desc: 'La mejor pieza rival se vuelve Berserker y su rey recluta un guardia extra.',
    apply({ board, N, findKing }) {
      let best = null, bv = 0
      const N2 = board.length
      for (let r = 0; r < N2; r++) for (let c = 0; c < N2; c++) {
        const p = board[r][c]
        if (p && p.color === 'b' && p.t !== 'P' && p.t !== 'K') {
          const v = PIECE_VAL[p.t] || 0
          if (v > bv) { bv = v; best = p }
        }
      }
      if (best) addMod(best, 'berserker')
      const k = findKing(board, 'b')
      if (!k) return
      for (const [dr, dc] of KING_DIRS) {
        const nr = k[0] + dr, nc = k[1] + dc
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && !board[nr][nc]) { board[nr][nc] = { t: 'P', color: 'b', mods: [] }; break }
      }
    },
  },
  tormenta_de_agujeros: {
    name: 'Tormenta de Agujeros', icon: '🌪',
    desc: 'Varios agujeros temporales se abren en tu mitad del tablero.',
    apply({ tileMap, N }) {
      const startRow = Math.floor(N / 2)
      const offsets = [[1, -1], [1, 1], [2, 0]]
      offsets.forEach(([dr, dc], i) => {
        const r = startRow + dr, c = Math.floor(N / 2) + dc
        if (r >= 0 && r < N && c >= 0 && c < N) tileMap.addHole(r, c, i * 2)
      })
    },
  },
  refuerzos_ocultos: {
    name: 'Refuerzos Ocultos', icon: '♟🖤',
    desc: 'El enemigo recibe dos peones extra.',
    apply({ board, N }) {
      const row = 1
      let added = 0
      for (let c = 0; c < N && added < 2; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'b', mods: [] }; added++ } }
    },
  },
}

export const ELITE_MODIFIER_IDS = Object.keys(ELITE_MODIFIERS)

export function randomEliteModifier(rng = Math.random) {
  const id = ELITE_MODIFIER_IDS[Math.floor(rng() * ELITE_MODIFIER_IDS.length)]
  return { id, ...ELITE_MODIFIERS[id] }
}
