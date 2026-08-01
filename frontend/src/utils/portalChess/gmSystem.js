// Player-side "Great Master" jokers for the Grandes Maestros roguelike
// (Version B). Ported from the portalchess.html prototype, generalized to
// work with an arbitrary board size N and the shared tileMap instead of
// module-level globals. Expanded (2026-08 redesign) with `rarity`,
// optional `scoreModifier(ctx, event)` hooks (used by the skirmish scoring
// system in scoring.js — return a bonus point total for a capture event),
// an optional `upgrade` variant (owned GM -> stronger "veteran" tier, kept
// in the same squad slot instead of taking a new one), and an optional
// `unlockRequirement: { minLevel }` gating some newer GMs behind
// meta-progression (see runMeta.js) — GMs with no `unlockRequirement` are
// always available, preserving today's roster for existing saves.
import { defaultPortalSquares } from './setup'

function eachOfColor(board, color, fn) {
  const N = board.length
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = board[r][c]
    if (p && p.color === color) fn(p, r, c)
  }
}

function recruitGuard(board, N, kr, kc, color, count = 1) {
  const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
  let added = 0
  for (const [dr, dc] of dirs) {
    if (added >= count) break
    const nr = kr + dr, nc = kc + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && !board[nr][nc]) { board[nr][nc] = { t: 'P', color, mods: [] }; added++ }
  }
  return added
}

const PIECE_VAL = { N: 300, B: 320, R: 500, Q: 900 }

export const SQUAD_CAP = 5

export const GMS = {
  arquitecto: {
    name: 'El Arquitecto', icon: '◎', cost: 0, rarity: 'common', archetype: 'portales',
    desc: 'Crea un par de portales en el tablero.',
    apply({ tileMap, N }) {
      const [[r1, c1], [r2, c2]] = defaultPortalSquares(N)
      tileMap.addPortalPair(r1, c1, r2, c2)
    },
    upgrade: {
      cost: 6,
      desc: 'Veterano: crea DOS pares de portales.',
      applyUpgraded({ tileMap, N }) {
        const [[r1, c1], [r2, c2]] = defaultPortalSquares(N)
        tileMap.addPortalPair(r1, c1, r2, c2)
        const mid = Math.floor(N / 2)
        if (!tileMap.tileType(0, mid)) tileMap.addPortalPair(0, mid, N - 1, mid)
      },
    },
  },
  cavador: {
    name: 'El Cavador', icon: '◍', cost: 4, rarity: 'common', archetype: 'portales',
    desc: 'Abre 2 agujeros temporales en el centro.',
    apply({ tileMap, N }) {
      const mid = Math.floor(N / 2)
      tileMap.addHole(mid - 1, mid - 1, 0)
      tileMap.addHole(mid, mid, 4)
    },
  },
  falange: {
    name: 'La Falange', icon: '♙', cost: 3, rarity: 'common', archetype: 'guardia',
    desc: 'Todos tus peones se blindan (Falange).',
    apply({ board }) { eachOfColor(board, 'w', p => { if (p.t === 'P') p.mods = ['phalanx'] }) },
  },
  jinete: {
    name: 'El Jinete', icon: '♞', cost: 4, rarity: 'common', archetype: 'caballeria', requiresPiece: 'N',
    desc: 'Tus caballos saltan dos veces.',
    apply({ board }) { eachOfColor(board, 'w', p => { if (p.t === 'N') p.mods = ['double'] }) },
  },
  berserker: {
    name: 'El Berserker', icon: '⚔', cost: 5, rarity: 'rare', archetype: 'ofensiva', requiresPiece: 'N',
    desc: 'Tu mejor pieza carga sin miedo (Berserker).',
    apply({ board }) {
      let best = null, bv = 0
      eachOfColor(board, 'w', p => {
        if (p.t !== 'P' && p.t !== 'K') { const v = PIECE_VAL[p.t] || 0; if (v > bv) { bv = v; best = p } }
      })
      if (best) best.mods = ['berserker']
    },
    scoreModifier({ event }) {
      return (event.piece && event.piece.mods && event.piece.mods.includes('berserker')) ? Math.round(event.baseScore * 0.5) : 0
    },
  },
  corona: {
    name: 'La Corona', icon: '♛', cost: 5, rarity: 'rare', archetype: 'guardia',
    desc: 'Tu rey gana un escudo extra.',
    apply({ board, N, findKing }) {
      const k = findKing(board, 'w')
      if (k) recruitGuard(board, N, k[0], k[1], 'w', 1)
    },
  },
  recluta: {
    name: 'El Recluta', icon: '♟', cost: 4, rarity: 'common', archetype: 'guardia',
    desc: '+1 peón en tu ejército.',
    apply({ board, N }) {
      const row = N - 2
      for (let c = 0; c < N; c++) { if (!board[row][c]) { board[row][c] = { t: 'P', color: 'w', mods: [] }; return } }
    },
  },
  saboteador: {
    name: 'El Saboteador', icon: '☠', cost: 4, rarity: 'common', archetype: 'ofensiva',
    desc: 'El rey rival pierde un escudo.',
    apply({ board, N, findKing }) {
      const k = findKing(board, 'b')
      if (!k) return
      const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
      for (const [dr, dc] of dirs) {
        const nr = k[0] + dr, nc = k[1] + dc
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
        const q = board[nr][nc]
        if (q && q.color === 'b' && q.t !== 'K') { board[nr][nc] = null; return }
      }
    },
  },
  mecenas: {
    name: 'El Mecenas', icon: '$', cost: 3, rarity: 'common', archetype: 'economia',
    desc: '+3 de oro al ganar cada nivel.',
    apply() { /* handled by the level-reward calculation in PortalChessGM.jsx */ },
  },
  centinela: {
    name: 'La Centinela', icon: '⏳', cost: 3, rarity: 'common', archetype: 'portales',
    desc: 'Abre un agujero de contención frente a tu rey.',
    apply({ board, N, findKing, tileMap }) {
      const k = findKing(board, 'w')
      if (!k) return
      const [kr, kc] = k
      const fwd = kr > N / 2 ? -1 : 1
      const nr = kr + fwd * 2
      if (nr >= 0 && nr < N && !board[nr][kc] && !tileMap.tileType(nr, kc)) tileMap.addHole(nr, kc, 0)
    },
  },
  torre_gemela: {
    name: 'La Torre Gemela', icon: '⛓', cost: 5, rarity: 'common', archetype: 'portales',
    desc: 'Conecta dos casillas de tu retaguardia con un portal.',
    apply({ tileMap, board, N }) {
      const row = N - 1
      const empties = []
      for (let c = 0; c < N; c++) if (!board[row][c] && !tileMap.tileType(row, c)) empties.push(c)
      if (empties.length >= 2) tileMap.addPortalPair(row, empties[0], row, empties[empties.length - 1])
    },
  },
  reina_sombra: {
    name: 'La Reina Sombra', icon: '♛', cost: 6, rarity: 'rare', archetype: 'ofensiva', requiresPiece: 'Q',
    desc: 'Tu reina se vuelve intocable en la carga (Berserker).',
    apply({ board }) { eachOfColor(board, 'w', p => { if (p.t === 'Q') p.mods = [...new Set([...(p.mods || []), 'berserker'])] }) },
  },
  medico_de_campana: {
    name: 'El Médico de Campaña', icon: '✚', cost: 4, rarity: 'common', archetype: 'guardia',
    desc: 'Tu rey recluta dos guardias extra.',
    apply({ board, N, findKing }) {
      const k = findKing(board, 'w')
      if (k) recruitGuard(board, N, k[0], k[1], 'w', 2)
    },
  },
  mercader_errante: {
    name: 'El Mercader Errante', icon: '⚖', cost: 3, rarity: 'common', archetype: 'economia',
    desc: 'La Tertulia te ofrece una opción extra.',
    apply() { /* handled by the shop-offer generation in PortalChessGM.jsx */ },
  },
  estratega: {
    name: 'El Estratega', icon: '♟︎', cost: 5, rarity: 'rare', archetype: 'puntuacion',
    desc: 'Tus capturas valen un 25% más en las escaramuzas.',
    apply() { /* pure scoreModifier, no board effect */ },
    scoreModifier({ event }) { return Math.round(event.baseScore * 0.25) },
  },
  campeon_veterano: {
    name: 'El Campeón Veterano', icon: '🏆', cost: 8, rarity: 'boss', archetype: 'puntuacion',
    desc: 'Tus jugadas decisivas (carga/finalización) valen un 50% más.',
    unlockRequirement: { minLevel: 5 },
    apply() { /* pure scoreModifier, no board effect */ },
    scoreModifier({ event }) { return (event.kind === 'kill' || event.kind === 'charge') ? Math.round(event.baseScore * 0.5) : 0 },
  },
  fanatico: {
    name: 'El Fanático', icon: '🔥', cost: 6, rarity: 'curse', archetype: 'ofensiva',
    desc: 'Tus capturas valen un 40% más, pero tu escuadra pierde un espacio mientras lo tengas.',
    unlockRequirement: { minLevel: 4 },
    drawback: { squadCapDelta: -1 },
    apply() { /* pure scoreModifier + drawback, no board effect */ },
    scoreModifier({ event }) { return Math.round(event.baseScore * 0.4) },
  },
}

export const START_GM_CHOICES = ['arquitecto', 'falange', 'jinete', 'corona', 'saboteador', 'recluta']

// `owned` is an array of `{ id, tier }` (tier 0 = base, 1 = veteran/upgraded).
export function hasGM(owned, id) { return owned.some(g => g.id === id) }
export function gmTier(owned, id) { const g = owned.find(x => x.id === id); return g ? g.tier : -1 }

// Archetype identity system: every GM belongs to a loose "build" tag so a
// squad can start to feel like it's becoming something (StS-style build
// identity) rather than just accumulating disconnected jokers. Owning 3+ of
// the same archetype unlocks a small passive synergy bonus (see
// SYNERGY_BONUSES below), applied once at combat setup alongside the
// regular per-GM `apply(ctx)` calls.
export const ARCHETYPE_META = {
  guardia: { label: 'Guardia', icon: '🛡' },
  caballeria: { label: 'Caballería', icon: '🐴' },
  ofensiva: { label: 'Ofensiva', icon: '⚔' },
  portales: { label: 'Portales', icon: '◎' },
  economia: { label: 'Economía', icon: '$' },
  puntuacion: { label: 'Puntuación', icon: '✦' },
}

export const SYNERGY_THRESHOLD = 3

export function archetypeCounts(owned) {
  return owned.reduce((acc, g) => {
    const a = GMS[g.id]?.archetype
    if (a) acc[a] = (acc[a] || 0) + 1
    return acc
  }, {})
}

// Archetype ids (of `owned`) that have reached the synergy threshold.
export function activeSynergies(owned) {
  const counts = archetypeCounts(owned)
  return Object.keys(counts).filter(a => counts[a] >= SYNERGY_THRESHOLD)
}

export const SYNERGY_BONUSES = {
  guardia: {
    label: 'Bastión (3+ Guardia)',
    apply({ board, N, findKing }) {
      const k = findKing(board, 'w')
      if (k) recruitGuard(board, N, k[0], k[1], 'w', 1)
    },
  },
  portales: {
    label: 'Red de Portales (3+ Portales)',
    apply({ tileMap, board, N }) {
      const empties = []
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!board[r][c] && !tileMap.tileType(r, c)) empties.push([r, c])
      if (empties.length >= 2) {
        const a = empties.splice(Math.floor(Math.random() * empties.length), 1)[0]
        const b = empties[Math.floor(Math.random() * empties.length)]
        if (a && b) tileMap.addPortalPair(a[0], a[1], b[0], b[1])
      }
    },
  },
  ofensiva: {
    label: 'Furia Total (3+ Ofensiva)',
    apply({ board }) { eachOfColor(board, 'w', p => { if (p.t === 'Q' || p.t === 'R') p.mods = [...new Set([...(p.mods || []), 'berserker'])] }) },
  },
  caballeria: {
    label: 'Caballería Ligera (3+ Caballería)',
    apply({ board }) { eachOfColor(board, 'w', p => { if (p.t === 'N') p.mods = [...new Set([...(p.mods || []), 'double'])] }) },
  },
  puntuacion: {
    label: 'Motor de Puntos (3+ Puntuación)',
    apply() { /* pure scoreModifier, no board effect */ },
    scoreModifier({ event }) { return Math.round(event.baseScore * 0.1) },
  },
  economia: {
    label: 'Gremio (3+ Economía)',
    apply() { /* handled by the level-reward calculation in PortalChessGM.jsx */ },
  },
}

// Every source whose optional `scoreModifier(ctx)` hook should be consulted
// for a capture event: each owned GM's definition, plus any active
// archetype synergy bonus that itself defines a `scoreModifier`.
export function scoreModifierSources(owned) {
  const base = owned.map(g => GMS[g.id])
  const synergyMods = activeSynergies(owned)
    .map(a => SYNERGY_BONUSES[a])
    .filter(s => typeof s?.scoreModifier === 'function')
  return [...base, ...synergyMods]
}

// The effective squad cap for the current roster — some cursed GMs (e.g.
// `fanatico`) carry a `drawback: { squadCapDelta }` that shrinks the usable
// squad size while owned, in exchange for a strong effect.
export function effectiveSquadCap(owned) {
  return owned.reduce((cap, g) => cap + (GMS[g.id]?.drawback?.squadCapDelta || 0), SQUAD_CAP)
}
