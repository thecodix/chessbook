// Anatomy-themed families of enemy-only jokers for the Grandes Maestros
// roguelike (Version B). Distinct flavor from the player's chess-themed
// Great Masters roster — the enemy's jokers are grouped into "body system"
// families. Each level scripts a family theme (predictable difficulty
// curve); the specific joker(s) drawn from that family are randomized.
// Expanded (2026-08 redesign): 5 families (was 3), each with a `quote`
// (flavor line shown on the level-intro screen — the first bit of "enemy
// personality"/atmosphere) and one `bossJokers` entry — a stronger,
// family-exclusive joker only drawn on `elite`/`boss` map nodes. Two boss
// jokers (`coloso_oseo`, `cerebro_maestro`) additionally define an optional
// `onAfterMove({ board, N, findKing, captured, state, rng })` hook — called
// once per ply, boss nodes only, right after a move is applied (see
// `bossGimmickRef` in PortalChessGM.jsx) — for reactive, rule-breaking
// gimmicks (e.g. reconstructing a captured pawn) rather than a one-time
// stat bump applied only at combat setup.
const PIECE_VAL = { N: 300, B: 320, R: 500, Q: 900 }

function eachOfColor(board, color, fn) {
  const N = board.length
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = board[r][c]
    if (p && p.color === color) fn(p, r, c)
  }
}

function bestPiece(board, color) {
  let best = null, bv = 0
  eachOfColor(board, color, p => {
    if (p.t !== 'P' && p.t !== 'K') { const v = PIECE_VAL[p.t] || 0; if (v > bv) { bv = v; best = p } }
  })
  return best
}

function recruitGuard(board, N, kr, kc, color, count = 1) {
  const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
  let added = 0
  for (const [dr, dc] of dirs) {
    if (added >= count) break
    const nr = kr + dr, nc = kc + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && !board[nr][nc]) { board[nr][nc] = { t: 'P', color, mods: [] }; added++ }
  }
}

export const ENEMY_FAMILIES = {
  skeletal: {
    label: 'Osario (Skeletal)',
    quote: 'Los huesos no sienten miedo.',
    jokers: {
      osteoblasto: {
        name: 'Osteoblasto', icon: '🦴',
        desc: "Enemy pawns automatically brace into a phalanx.",
        apply({ board }) { eachOfColor(board, 'b', p => { if (p.t === 'P') p.mods = ['phalanx'] }) },
      },
      escudo_oseo: {
        name: 'Escudo Óseo', icon: '🛡',
        desc: 'The enemy king recruits an extra guardian pawn.',
        apply({ board, N, findKing }) {
          const k = findKing(board, 'b')
          if (k) recruitGuard(board, N, k[0], k[1], 'b', 1)
        },
      },
    },
    bossJokers: {
      coloso_oseo: {
        name: 'Coloso Óseo', icon: '🦴👑',
        desc: 'All enemy pawns brace into a phalanx AND the enemy gains an extra pawn. Once per match, a captured enemy pawn is reconstructed from bone.',
        apply({ board, N }) {
          eachOfColor(board, 'b', p => { if (p.t === 'P') p.mods = ['phalanx'] })
          const row = 1
          for (let c = 0; c < N; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'b', mods: [] }; return } }
        },
        // Boss-only reactive gimmick (not a stat bump): the first time a
        // black pawn is captured this match, it's reconstructed on an
        // empty square of black's back rank. `state` is a fresh per-match
        // mutable bag threaded in by PortalChessGM.jsx (bossGimmickRef).
        onAfterMove({ board, N, captured, state, rng = Math.random }) {
          if (state.reconstructed || !captured || captured.color !== 'b' || captured.t !== 'P') return
          const candidates = []
          for (let c = 0; c < N; c++) if (!board[1][c]) candidates.push(c)
          if (!candidates.length) return
          const c = candidates[Math.floor(rng() * candidates.length)]
          board[1][c] = { t: 'P', color: 'b', mods: [] }
          state.reconstructed = true
        },
      },
    },
  },
  neural: {
    label: 'Sinapsis (Neural)',
    quote: 'Cada movimiento ya estaba previsto.',
    jokers: {
      amigdala: {
        name: 'Amígdala', icon: '🧠',
        desc: "The enemy's best piece charges without fear (Berserker).",
        apply({ board }) { const best = bestPiece(board, 'b'); if (best) best.mods = ['berserker'] },
      },
      hipocampo: {
        name: 'Hipocampo', icon: '🌀',
        desc: 'Opens 2 timed holes near the center.',
        apply({ tileMap, N }) {
          const mid = Math.floor(N / 2)
          tileMap.addHole(mid - 1, Math.max(0, mid - 2), 2)
          tileMap.addHole(mid, Math.min(N - 1, mid + 1), 6)
        },
      },
    },
    bossJokers: {
      cerebro_maestro: {
        name: 'Cerebro Maestro', icon: '🧠👑',
        desc: "The enemy's best piece goes Berserker AND a second hole pair opens near the center. If that piece falls, the next-best piece inherits Berserker once.",
        apply({ board, tileMap, N }) {
          const best = bestPiece(board, 'b'); if (best) best.mods = ['berserker']
          const mid = Math.floor(N / 2)
          tileMap.addHole(mid - 1, Math.max(0, mid - 2), 2)
          tileMap.addHole(mid, Math.min(N - 1, mid + 1), 6)
        },
        // Boss-only reactive gimmick: once per match, if the berserker-marked
        // piece is captured, the "neural link" transfers Berserker to the
        // next-best surviving black piece — a rule-breaking reaction rather
        // than a static bonus.
        onAfterMove({ board, N, captured, state }) {
          if (state.transferred || !captured || captured.color !== 'b' || !captured.mods?.includes('berserker')) return
          let best = null, bv = 0
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const p = board[r][c]
            if (p && p.color === 'b' && p.t !== 'P' && p.t !== 'K' && !p.mods?.includes('berserker')) {
              const v = PIECE_VAL[p.t] || 0
              if (v > bv) { bv = v; best = p }
            }
          }
          if (best) { best.mods = [...new Set([...(best.mods || []), 'berserker'])]; state.transferred = true }
        },
      },
    },
  },
  muscular: {
    label: 'Fascia (Muscular / Psoas)',
    quote: 'La fuerza bruta no necesita estrategia.',
    jokers: {
      psoas: {
        name: 'Psoas', icon: '💪',
        desc: 'Enemy knights jump twice.',
        apply({ board }) { eachOfColor(board, 'b', p => { if (p.t === 'N') p.mods = ['double'] }) },
      },
      recluta_oscuro: {
        name: 'Recluta Oscuro', icon: '♟',
        desc: '+1 pawn in the enemy army.',
        apply({ board, N }) {
          const row = 1
          for (let c = 0; c < N; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'b', mods: [] }; return } }
        },
      },
    },
    bossJokers: {
      titan_fascial: {
        name: 'Titán Fascial', icon: '💪👑',
        desc: 'Enemy knights jump twice AND the enemy gains an extra pawn.',
        apply({ board, N }) {
          eachOfColor(board, 'b', p => { if (p.t === 'N') p.mods = ['double'] })
          const row = 1
          for (let c = 0; c < N; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'b', mods: [] }; return } }
        },
      },
    },
  },
  circulatory: {
    label: 'Arteria (Circulatory)',
    quote: 'Sentimos tu pulso acelerarse.',
    jokers: {
      taquicardia: {
        name: 'Taquicardia', icon: '💓',
        desc: "The enemy's best piece jumps twice (Double).",
        apply({ board }) { const best = bestPiece(board, 'b'); if (best && best.t === 'N') best.mods = ['double'] },
      },
      coagulo: {
        name: 'Coágulo', icon: '🩸',
        desc: 'A timed hole opens to block your advance.',
        apply({ tileMap, N }) {
          const mid = Math.floor(N / 2)
          tileMap.addHole(Math.min(N - 1, mid + 2), mid, 0)
        },
      },
    },
    bossJokers: {
      corazon_de_hierro: {
        name: 'Corazón de Hierro', icon: '💓👑',
        desc: 'The enemy king recruits two guardians and the best piece goes Berserker.',
        apply({ board, N, findKing }) {
          const k = findKing(board, 'b')
          if (k) recruitGuard(board, N, k[0], k[1], 'b', 2)
          const best = bestPiece(board, 'b'); if (best) best.mods = ['berserker']
        },
      },
    },
  },
  respiratory: {
    label: 'Bronquio (Respiratory)',
    quote: 'Contén la respiración.',
    jokers: {
      hiperventilacion: {
        name: 'Hiperventilación', icon: '🫁',
        desc: '+1 pawn in the enemy army.',
        apply({ board, N }) {
          const row = 1
          for (let c = 0; c < N; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'b', mods: [] }; return } }
        },
      },
      apnea: {
        name: 'Apnea', icon: '⏸',
        desc: 'A long-timed hole pair stalls your advance.',
        apply({ tileMap, N }) {
          const mid = Math.floor(N / 2)
          tileMap.addHole(mid - 1, Math.max(0, mid - 1), 1)
          tileMap.addHole(mid + 1 < N ? mid + 1 : mid, Math.min(N - 1, mid + 1), 5)
        },
      },
    },
    bossJokers: {
      pulmon_de_acero: {
        name: 'Pulmón de Acero', icon: '🫁👑',
        desc: '+2 pawns in the enemy army and a stalling hole pair.',
        apply({ board, N, tileMap }) {
          const row = 1
          let added = 0
          for (let c = 0; c < N && added < 2; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'b', mods: [] }; added++ } }
          const mid = Math.floor(N / 2)
          tileMap.addHole(mid - 1, Math.max(0, mid - 1), 1)
        },
      },
    },
  },
}

export const FAMILY_IDS = Object.keys(ENEMY_FAMILIES)

// Scripted per-level theme (predictable curve) — level index is 1-based.
export function familyForLevel(level) {
  return FAMILY_IDS[(level - 1) % FAMILY_IDS.length]
}

// The family per level is scripted; the specific joker(s) drawn from it are
// randomized, and the count grows slowly with level. `nodeType` 'elite' or
// 'boss' draws the family's single, stronger `bossJokers` entry instead of
// the regular pool (creates a real difficulty spike for those map nodes).
export function rollEnemyJokers(level, rng = Math.random, nodeType = 'match') {
  const familyId = familyForLevel(level)
  const family = ENEMY_FAMILIES[familyId]
  if ((nodeType === 'elite' || nodeType === 'boss') && family.bossJokers) {
    const bossIds = Object.keys(family.bossJokers)
    const id = bossIds[Math.floor(rng() * bossIds.length)]
    return { familyId, familyLabel: family.label, quote: family.quote, jokers: [{ id, ...family.bossJokers[id] }] }
  }
  const jokerIds = Object.keys(family.jokers)
  const count = Math.min(jokerIds.length, 1 + Math.floor((level - 1) / 2))
  const pool = [...jokerIds]
  const picked = []
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return { familyId, familyLabel: family.label, quote: family.quote, jokers: picked.map(id => ({ id, ...family.jokers[id] })) }
}
