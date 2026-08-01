// Shared move-generation / evaluation / search engine for both Portal Chess
// versions. Generalizes portalchess.html's vanilla-JS prototype engine:
// parameterized by board size N and a `rules` config instead of hardcoded
// 6x6 globals. Self-contained fairy-chess engine — no chess.js dependency,
// since portals/holes/mods/guarded-kings have no standard-chess equivalent.

export const VAL = { P: 100, N: 300, B: 320, R: 500, Q: 900, K: 100000 }
export const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }

const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const ALL8 = [...ORTH, ...DIAG]
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
const MATE = 1e7

export function other(color) { return color === 'w' ? 'b' : 'w' }
function hasMod(p, m) { return !!(p && p.mods && p.mods.includes(m)) }
function cheb(ar, ac, br, bc) { return Math.max(Math.abs(ar - br), Math.abs(ac - bc)) }

/**
 * Create a rules-aware engine bound to a board size and a `world` (tile map,
 * see tiles.js) that answers portal/hole/void queries.
 *
 * rules.guardedKings — enable the "guarded king -> charge instead of
 *   capture" system (Version B). When false, kings are captured directly
 *   (Version A: simpler, portal-focused ruleset, no shield economy).
 * rules.mods — whether piece.mods (berserker/phalanx/double) are honored.
 */
export function createEngine({ N, world, rules = {} }) {
  const guardedKings = !!rules.guardedKings
  const modsEnabled = !!rules.mods

  function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N }
  function isVoid(r, c, ply) { return world ? world.isVoid(r, c, ply) : false }
  function isPortal(r, c) { return world ? world.isPortal(r, c) : false }
  function portalTwin(r, c) { return world ? world.portalTwin(r, c) : null }
  function phasedAt(r, c, ply) { return isVoid(r, c, ply) }

  function findKing(board, color) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = board[r][c]
      if (p && p.color === color && p.t === 'K') return [r, c]
    }
    return null
  }

  function kingGuarded(board, kr, kc, ply) {
    if (!guardedKings) return false
    const col = board[kr][kc].color
    for (const [dr, dc] of ALL8) {
      const nr = kr + dr, nc = kc + dc
      if (inB(nr, nc) && !phasedAt(nr, nc, ply)) {
        const q = board[nr][nc]
        if (q && q.color === col && q.t !== 'K') return true
      }
    }
    return false
  }

  function adjacentGuards(board, kr, kc, ply) {
    const col = board[kr][kc].color, res = []
    for (const [dr, dc] of ALL8) {
      const nr = kr + dr, nc = kc + dc
      if (inB(nr, nc) && !phasedAt(nr, nc, ply)) {
        const q = board[nr][nc]
        if (q && q.color === col && q.t !== 'K') res.push([nr, nc, VAL[q.t]])
      }
    }
    return res
  }

  function moveKind(board, p, tr, tc, ply) {
    if (isVoid(tr, tc, ply)) return 'blocked'
    const t = board[tr][tc]
    if (!t) return 'move'
    if (t.color === p.color) return 'blocked'
    if (t.t === 'K') {
      if (kingGuarded(board, tr, tc, ply)) return 'charge'
      return (modsEnabled && hasMod(p, 'berserker')) ? 'blocked' : 'kill'
    }
    return 'capture'
  }

  function slide(board, r, c, dirs, p, out, ply) {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      while (inB(nr, nc)) {
        if (isVoid(nr, nc, ply)) { nr += dr; nc += dc; continue }
        const t = board[nr][nc]
        if (!t) { out.push({ tr: nr, tc: nc, kind: 'move' }) }
        else if (t.color === p.color) break
        else {
          const k = moveKind(board, p, nr, nc, ply)
          if (k === 'blocked') break
          out.push({ tr: nr, tc: nc, kind: k })
          break
        }
        nr += dr; nc += dc
      }
    }
  }

  function knightDests(board, r, c, p, dbl, ply) {
    const map = new Map()
    for (const [dr, dc] of KN) {
      const nr = r + dr, nc = c + dc
      if (!inB(nr, nc)) continue
      const k = moveKind(board, p, nr, nc, ply)
      if (k !== 'blocked') map.set(nr + ',' + nc, { tr: nr, tc: nc, kind: k })
    }
    if (dbl) {
      for (const [dr, dc] of KN) {
        const mr = r + dr, mc = c + dc
        if (inB(mr, mc) && !board[mr][mc] && !isVoid(mr, mc, ply)) {
          for (const [d2, e2] of KN) {
            const nr = mr + d2, nc = mc + e2
            if (inB(nr, nc) && !(nr === r && nc === c) && !board[nr][nc] && !isVoid(nr, nc, ply)) {
              map.set(nr + ',' + nc, { tr: nr, tc: nc, kind: 'move' })
            }
          }
        }
      }
    }
    return [...map.values()]
  }

  function genMoves(board, r, c, ply = 0) {
    if (phasedAt(r, c, ply)) return []
    const p = board[r][c]
    if (!p) return []
    const out = [], color = p.color, fwd = color === 'w' ? -1 : 1
    switch (p.t) {
      case 'P': {
        const nr = r + fwd
        if (inB(nr, c) && !board[nr][c] && !isVoid(nr, c, ply)) out.push({ tr: nr, tc: c, kind: 'move' })
        for (const dc of [-1, 1]) {
          const cc = c + dc
          if (inB(nr, cc)) {
            const k = moveKind(board, p, nr, cc, ply)
            if (k === 'capture' || k === 'charge' || k === 'kill') out.push({ tr: nr, tc: cc, kind: k })
          }
        }
        break
      }
      case 'N': return knightDests(board, r, c, p, modsEnabled && hasMod(p, 'double'), ply)
      case 'K':
        for (const [dr, dc] of ALL8) {
          const nr = r + dr, nc = c + dc
          if (inB(nr, nc)) { const k = moveKind(board, p, nr, nc, ply); if (k !== 'blocked') out.push({ tr: nr, tc: nc, kind: k }) }
        }
        break
      case 'B': slide(board, r, c, DIAG, p, out, ply); break
      case 'R': slide(board, r, c, ORTH, p, out, ply); break
      case 'Q': slide(board, r, c, ALL8, p, out, ply); break
      default: break
    }
    return out
  }

  function allMoves(board, color, ply = 0) {
    const list = []
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = board[r][c]
      if (!p || p.color !== color || phasedAt(r, c, ply)) continue
      for (const mv of genMoves(board, r, c, ply)) {
        let ord = 0
        if (mv.kind === 'kill') ord = 1e6
        else if (mv.kind === 'capture') ord = VAL[board[mv.tr][mv.tc].t]
        else if (mv.kind === 'charge') {
          const g = adjacentGuards(board, mv.tr, mv.tc, ply).sort((a, z) => a[2] - z[2])
          ord = (g[0] ? g[0][2] : 0) + 40
        }
        list.push({ fr: r, fc: c, tr: mv.tr, tc: mv.tc, kind: mv.kind, ord })
      }
    }
    return list
  }

  // Applies a move, mutating a fresh copy of `board`. Also resolves a
  // portal teleport if the destination square is a portal with a free twin.
  function applyMove(board, m, ply = 0) {
    const nb = board.map(row => row.map(x => (x ? { ...x } : null)))
    const p = nb[m.fr][m.fc]
    if (m.kind === 'charge') {
      const gs = adjacentGuards(nb, m.tr, m.tc, ply).sort((a, z) => a[2] - z[2])
      let cap = null
      if (gs.length) { const g = gs[0]; cap = nb[g[0]][g[1]]; nb[g[0]][g[1]] = null }
      if (!(modsEnabled && hasMod(p, 'berserker'))) nb[m.fr][m.fc] = null
      return { board: nb, captured: cap, kind: 'charge', teleported: false }
    }
    const cap = nb[m.tr][m.tc]
    nb[m.tr][m.tc] = p
    nb[m.fr][m.fc] = null
    let fr = m.tr, fc = m.tc
    if (p.t === 'P' && ((p.color === 'w' && fr === 0) || (p.color === 'b' && fr === N - 1))) p.t = 'Q'
    let teleported = false
    if (isPortal(fr, fc)) {
      const tw = portalTwin(fr, fc)
      if (tw && !nb[tw[0]][tw[1]] && !isVoid(tw[0], tw[1], ply)) {
        nb[fr][fc] = null
        nb[tw[0]][tw[1]] = p
        teleported = true
      }
    }
    return { board: nb, captured: cap, kind: m.kind, teleported }
  }

  function material(board, color) {
    let s = 0
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = board[r][c]
      if (p && p.color === color && p.t !== 'K') s += VAL[p.t]
    }
    return s
  }

  function makeGrid() { return Array.from({ length: N }, () => Array(N).fill(0)) }

  function addControl(board, r, c, grid, ply) {
    if (phasedAt(r, c, ply)) return
    const p = board[r][c], color = p.color, fwd = color === 'w' ? -1 : 1
    const push = (nr, nc) => { if (inB(nr, nc)) grid[nr][nc]++ }
    switch (p.t) {
      case 'P': push(r + fwd, c - 1); push(r + fwd, c + 1); break
      case 'N': for (const [dr, dc] of KN) push(r + dr, c + dc); break
      case 'K': for (const [dr, dc] of ALL8) push(r + dr, c + dc); break
      case 'B': case 'R': case 'Q': {
        const dirs = p.t === 'B' ? DIAG : p.t === 'R' ? ORTH : ALL8
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc
          while (inB(nr, nc)) {
            if (isVoid(nr, nc, ply)) { nr += dr; nc += dc; continue }
            grid[nr][nc]++
            if (board[nr][nc]) break
            nr += dr; nc += dc
          }
        }
        break
      }
      default: break
    }
  }

  function kingSafety(board, ksq, side, me, cW, cB) {
    if (!ksq) return 0
    const own = side === 'w' ? cW : cB, foe = side === 'w' ? cB : cW
    let atk = 0, def = 0, guards = 0
    for (const [dr, dc] of [[0, 0], ...ALL8]) {
      const zr = ksq[0] + dr, zc = ksq[1] + dc
      if (!inB(zr, zc)) continue
      atk += foe[zr][zc]; def += own[zr][zc]
      if (!(dr === 0 && dc === 0)) {
        const q = board[zr][zc]
        if (q && q.color === side && q.t !== 'K') guards++
      }
    }
    return (side === me ? 1 : -1) * (def * 6 - atk * 16 + guards * (guardedKings ? 24 : 8))
  }

  function evaluate(board, me, ply = 0) {
    const opp = other(me)
    const wk = findKing(board, 'w'), bk = findKing(board, 'b')
    if (!findKing(board, me)) return -MATE
    if (!findKing(board, opp)) return MATE
    const cW = makeGrid(), cB = makeGrid()
    let s = 0
    const half = Math.max(4, N - 2)
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = board[r][c]
      if (!p) continue
      p.color === 'w' ? addControl(board, r, c, cW, ply) : addControl(board, r, c, cB, ply)
      if (p.t === 'K' || phasedAt(r, c, ply)) continue
      const sign = p.color === me ? 1 : -1
      let v = VAL[p.t]
      if (modsEnabled && hasMod(p, 'berserker')) v *= 0.45
      s += sign * v
      const ek = p.color === 'w' ? bk : wk
      if (ek) { const w = (modsEnabled && hasMod(p, 'berserker')) ? 12 : 4; s += sign * (half - cheb(r, c, ek[0], ek[1])) * w }
      if (p.t === 'P') {
        const adv = p.color === 'w' ? (N - 1 - r) : r
        s += sign * adv * 5
        if (modsEnabled && hasMod(p, 'phalanx')) {
          for (const dc of [-1, 1]) {
            const q = inB(r, c + dc) ? board[r][c + dc] : null
            if (q && q.t === 'P' && q.color === p.color) s += sign * 20
          }
        }
      }
    }
    s += kingSafety(board, wk, 'w', me, cW, cB)
    s += kingSafety(board, bk, 'b', me, cW, cB)
    return s
  }

  function order(board, color, ply) { return allMoves(board, color, ply).sort((a, z) => z.ord - a.ord) }

  // NOTE: `ply` is held constant through a single search call (matching the
  // prototype's behaviour of reading one fixed global ply throughout a
  // think) — hole/portal timing only advances between real moves.
  function qsearch(board, color, alpha, beta, qd, ply) {
    const stand = evaluate(board, color, ply)
    if (stand >= beta) return beta
    if (stand > alpha) alpha = stand
    if (qd <= 0) return alpha
    const caps = allMoves(board, color, ply).filter(m => m.kind !== 'move').sort((a, z) => z.ord - a.ord)
    for (const m of caps) {
      const { board: nb, captured } = applyMove(board, m, ply)
      let v
      if (captured && captured.t === 'K') v = MATE
      else v = -qsearch(nb, other(color), -beta, -alpha, qd - 1, ply)
      if (v >= beta) return beta
      if (v > alpha) alpha = v
    }
    return alpha
  }

  function negamax(board, color, depth, alpha, beta, maxDepth, ply) {
    if (!findKing(board, color)) return -MATE + (maxDepth - depth)
    if (!findKing(board, other(color))) return MATE - (maxDepth - depth)
    if (depth === 0) return qsearch(board, color, alpha, beta, 6, ply)
    const moves = order(board, color, ply)
    if (!moves.length) return evaluate(board, color, ply)
    let best = -Infinity
    for (const m of moves) {
      const { board: nb, captured, kind } = applyMove(board, m, ply)
      let v
      if (kind === 'kill' || (captured && captured.t === 'K')) v = MATE - (maxDepth - depth)
      else v = -negamax(nb, other(color), depth - 1, -beta, -alpha, maxDepth, ply)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  }

  function chooseMove(board, color, depth = 3, ply = 0) {
    const moves = order(board, color, ply)
    if (!moves.length) return null
    let best = moves[0], bv = -Infinity, alpha = -Infinity
    for (const m of moves) {
      const { board: nb, captured, kind } = applyMove(board, m, ply)
      let v
      if (kind === 'kill' || (captured && captured.t === 'K')) v = MATE
      else v = -negamax(nb, other(color), depth - 1, -Infinity, -alpha, depth, ply)
      if (v > bv) { bv = v; best = m }
      if (v > alpha) alpha = v
    }
    return best
  }

  return {
    N, VAL, GLYPH, inB, findKing, genMoves, allMoves, applyMove, evaluate,
    chooseMove, material, moveKind, kingGuarded, adjacentGuards,
  }
}
