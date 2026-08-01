// Tile system shared by both Portal Chess versions: portals (linked
// teleport pairs, optionally one-way or decaying) and holes (cyclic
// phase-voids, used by Version B). A "black hole" is a permanent void
// created when two portal endpoints of the same movable/owned pair are
// collapsed onto one square (Buckley-variant inspired).

let uid = 0

export function createTileMap(N) {
  const grid = Array.from({ length: N }, () => Array(N).fill(null))
  // portal record: { r, c, pairId, oneWay, role, ttl, bornPly }
  //   role is used two ways depending on mode:
  //     - one-way portals: 'in' (entry mouth) | 'out' (exit mouth)
  //     - player-owned movable portals (Buckley mode): 'w' | 'b'
  let portals = []

  const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N

  function tileAt(r, c) { return inB(r, c) ? grid[r][c] : null }
  function tileType(r, c) { const t = tileAt(r, c); return t ? t.type : null }
  function isPortal(r, c) { return tileType(r, c) === 'portal' }
  function isBlackHole(r, c) { return tileType(r, c) === 'blackhole' }

  function isHoleOpen(r, c, ply = 0) {
    const t = tileAt(r, c)
    if (!t || t.type !== 'hole') return false
    return ((ply || 0) + t.offset) % 8 >= 4
  }

  // "Void" squares block landing/movement: open holes + permanent black holes.
  function isVoid(r, c, ply = 0) { return isHoleOpen(r, c, ply) || isBlackHole(r, c) }

  function clearSquare(r, c) {
    if (!inB(r, c)) return
    grid[r][c] = null
    portals = portals.filter(p => !(p.r === r && p.c === c))
  }

  function addPortalPair(r1, c1, r2, c2, { oneWay = false, ttl = null, ply = 0 } = {}) {
    const pairId = uid++
    grid[r1][c1] = { type: 'portal', pairId }
    grid[r2][c2] = { type: 'portal', pairId }
    portals.push(
      { r: r1, c: c1, pairId, oneWay, role: oneWay ? 'in' : null, ttl, bornPly: ply },
      { r: r2, c: c2, pairId, oneWay, role: oneWay ? 'out' : null, ttl, bornPly: ply },
    )
    return pairId
  }

  // Player-owned movable portal pair for the Buckley-style mode: `role` is
  // 'w' / 'b' identifying which player may move that endpoint.
  function addOwnedPortalPair(rw, cw, rb, cb) {
    const pairId = uid++
    grid[rw][cw] = { type: 'portal', pairId }
    grid[rb][cb] = { type: 'portal', pairId }
    portals.push(
      { r: rw, c: cw, pairId, oneWay: false, role: 'w', ttl: null, bornPly: 0 },
      { r: rb, c: cb, pairId, oneWay: false, role: 'b', ttl: null, bornPly: 0 },
    )
    return pairId
  }

  function addHole(r, c, offset = 0) { grid[r][c] = { type: 'hole', offset } }

  // Where does a piece landing on (r,c) come out? null if blocked/not a portal.
  function portalTwin(r, c) {
    const t = tileAt(r, c)
    if (!t || t.type !== 'portal') return null
    const here = portals.find(p => p.r === r && p.c === c)
    if (here && here.oneWay && here.role === 'out') return null // can't enter from the exit mouth
    const twin = portals.find(p => p.pairId === t.pairId && !(p.r === r && p.c === c))
    return twin ? [twin.r, twin.c] : null
  }

  function tickDecay(ply) {
    const expired = portals.filter(p => p.ttl != null && ply - p.bornPly >= p.ttl)
    for (const p of expired) clearSquare(p.r, p.c)
    return expired.map(p => [p.r, p.c])
  }

  // Move a single, player-owned movable portal marker (Buckley-style) one
  // step to (tr, tc). If a piece occupies the destination it teleports that
  // piece to the marker's partner square (unless the partner square is
  // itself occupied, in which case the move is illegal). If the marker
  // lands on its twin's square, both collapse into a permanent black hole
  // that clears the surrounding 8 squares and locks in place.
  function movePortalMarker(pairId, role, tr, tc, board) {
    const mine = portals.find(p => p.pairId === pairId && p.role === role)
    if (!mine) return { ok: false }
    const twin = portals.find(p => p.pairId === pairId && p.role !== role)
    if (twin && twin.r === tr && twin.c === tc) {
      clearSquare(mine.r, mine.c)
      clearSquare(tr, tc)
      grid[tr][tc] = { type: 'blackhole' }
      const cleared = []
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = tr + dr, nc = tc + dc
        if (inB(nr, nc)) cleared.push([nr, nc])
      }
      return { ok: true, blackHoleAt: [tr, tc], cleared }
    }
    const occupant = board[tr] && board[tr][tc]
    if (occupant && (!twin || board[twin.r][twin.c])) return { ok: false } // no partner (or partner occupied): can't teleport onto it
    grid[mine.r][mine.c] = null
    mine.r = tr; mine.c = tc
    grid[tr][tc] = { type: 'portal', pairId }
    if (occupant && twin) return { ok: true, teleport: { from: [tr, tc], to: [twin.r, twin.c] } }
    return { ok: true }
  }

  function serialize() {
    return {
      N,
      grid: grid.map(row => row.map(x => (x ? { ...x } : null))),
      portals: portals.map(p => ({ ...p })),
    }
  }

  function load(data) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c] = data.grid[r][c] ? { ...data.grid[r][c] } : null
    portals = (data.portals || []).map(p => ({ ...p }))
  }

  return {
    N, tileAt, tileType, isPortal, isBlackHole, isHoleOpen, isVoid,
    portalTwin, addPortalPair, addOwnedPortalPair, addHole, clearSquare,
    tickDecay, movePortalMarker, serialize, load,
    portalRecords: () => portals.slice(),
  }
}

export function restoreTileMap(data) {
  const tm = createTileMap(data.N)
  tm.load(data)
  return tm
}
