// Shared N x N board renderer for both Portal Chess versions. Deliberately
// NOT built on the existing canvas-based Board.jsx (frontend/src/components/
// Board.jsx) — that component is tightly coupled to chess.js/standard chess
// semantics (FEN, castling, checks), while Portal Chess has custom move
// kinds (move/capture/charge/kill), a variable board size, portal/hole
// tiles, and piece modifiers with no standard-chess equivalent.
import { GLYPH } from '../utils/portalChess/engine'
import './portalChess.css'

export default function PortalBoard({
  N, board, tileMap, ply = 0, selected, legalMoves = [], lastMove,
  onSquareClick, interactive = true, guardsEnabled = false, flipped = false,
  portalMarkers = [], cardTargets = [],
}) {
  const legalByKey = new Map(legalMoves.map(m => [`${m.tr},${m.tc}`, m.kind]))
  const markerByKey = new Map(portalMarkers.map(m => [`${m.r},${m.c}`, m]))
  const cardTargetSet = new Set(cardTargets.map(t => `${t.r},${t.c}`))

  const order = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) order.push([r, c])
  const cells = flipped ? order.slice().reverse() : order

  function kingGuarded(r, c) {
    if (!guardsEnabled) return false
    const p = board[r][c]
    if (!p || p.t !== 'K') return false
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr, nc = c + dc
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
      const q = board[nr][nc]
      if (q && q.color === p.color && q.t !== 'K') return true
    }
    return false
  }

  return (
    <div className="pc-board-frame">
      <div className="pc-board" style={{ gridTemplateColumns: `repeat(${N},1fr)`, gridTemplateRows: `repeat(${N},1fr)` }}>
        {cells.map(([r, c]) => {
          const key = `${r},${c}`
          const p = board[r][c]
          const tt = tileMap ? tileMap.tileType(r, c) : null
          const holeOpen = tt === 'hole' && tileMap.isHoleOpen(r, c, ply)
          const isSel = selected && selected[0] === r && selected[1] === c
          const legalKind = legalByKey.get(key)
          const marker = markerByKey.get(key)
          const isFrom = lastMove && lastMove.fr === r && lastMove.fc === c
          const isTo = lastMove && lastMove.tr === r && lastMove.tc === c
          const guarded = kingGuarded(r, c)
          const classes = [
            'pc-sq', (r + c) % 2 === 0 ? 'pc-light' : 'pc-dark',
            tt === 'portal' ? 'pc-t-portal' : '',
            tt === 'hole' ? `pc-t-hole ${holeOpen ? 'pc-open' : 'pc-solid'}` : '',
            tt === 'blackhole' ? 'pc-t-blackhole' : '',
            isSel ? 'pc-selected' : '',
            isFrom ? 'pc-mv-from' : '',
            isTo ? `pc-mv-to${lastMove.color === 'b' ? ' pc-enemymove' : ''}${lastMove.hit ? ' pc-hit' : ''}` : '',
          ].filter(Boolean).join(' ')

          return (
            <div key={key} className={classes} onClick={() => interactive && onSquareClick && onSquareClick(r, c)}>
              {tt === 'portal' && <div className="pc-tmark pc-sym">◎</div>}
              {marker && <div className="pc-tmark" style={{ top: 'auto', bottom: 1, right: 2, color: marker.role === 'w' ? 'var(--pc-amber-bright)' : 'var(--pc-steel)' }}>◎</div>}
              {p && (
                <div className={`pc-piece pc-${p.color}${p.t === 'K' ? ' pc-king' : ''}${guarded ? ' pc-guarded' : ''}${p.mods && p.mods.length ? ' pc-ring-' + p.mods[0] : ''}`}>
                  {GLYPH[p.t]}
                  {guarded && <span className="pc-shieldmark" />}
                </div>
              )}
              {legalKind && <div className={`pc-tg pc-${legalKind}`} />}
              {!legalKind && cardTargetSet.has(key) && <div className="pc-tg pc-card-target" />}
              {!legalKind && marker && marker.selectable && <div className="pc-tg pc-portal-target" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
