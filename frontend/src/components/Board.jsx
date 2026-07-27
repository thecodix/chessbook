import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { buildAttackMaps, legalMovesForPiece, applyClickMove, isPromotionMove, fenToBoard, isWhite, isBlack, inBounds } from '../utils/chess'
import { usePieceStyle } from '../hooks/usePieceStyle'

const GLYPHS = {
  K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'
}

const PROMO_PIECES = ['q', 'r', 'b', 'n']

// Small overlay shown when a player's move lands a pawn on the last rank —
// lets them pick which piece to promote to instead of silently auto-queening.
// Rendered as a column of 4 squares starting at the destination square and
// running toward the middle of the board (so it never runs off the edge).
function PromotionPicker({ pendingPromotion, board, flipped, sq, pieceStyle, onPick, onCancel }) {
  const { from, to } = pendingPromotion
  const white = isWhite(board[from[0]][from[1]])
  const dr = flipped ? 7 - to[0] : to[0]
  const dc = flipped ? 7 - to[1] : to[1]
  const goingDown = dr <= 3
  const rows = goingDown ? [dr, dr + 1, dr + 2, dr + 3] : [dr, dr - 1, dr - 2, dr - 3]

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', cursor: 'pointer', zIndex: 1 }}
      />
      {rows.map((r, i) => {
        const piece = PROMO_PIECES[i]
        const glyphKey = white ? piece.toUpperCase() : piece
        return (
          <div
            key={piece}
            onClick={e => { e.stopPropagation(); onPick(piece) }}
            style={{
              position: 'absolute', left: dc * sq, top: r * sq, width: sq, height: sq, zIndex: 2,
              background: white ? '#f0f0f0' : '#2a2a2e',
              border: '1px solid rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            {pieceStyle.type === 'image' ? (
              <img
                src={`/pieces/${pieceStyle.set}/${white ? 'w' : 'b'}${piece.toUpperCase()}.${pieceStyle.ext ?? 'svg'}`}
                alt={piece}
                style={{ width: sq * 0.8, height: sq * 0.8 }}
              />
            ) : (
              <span style={{ fontSize: sq * 0.7, fontFamily: pieceStyle.font, color: white ? (pieceStyle.whiteFill ?? '#fff') : (pieceStyle.blackFill ?? '#000') }}>
                {GLYPHS[glyphKey]}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── SVG piece image cache ───────────────────────────────────────────────────
// Shared across every <Board> instance so each piece image is only fetched
// once per page load, no matter how many boards are on screen.
const IMAGE_CACHE   = new Map()   // key `${set}/${file}` -> { img, loaded }
const IMAGE_WAITERS = new Map()   // key -> Set<() => void>, fired once on load

function pieceFileName(p) { return `${isWhite(p) ? 'w' : 'b'}${p.toUpperCase()}` }

function getPieceImage(set, file, ext, onReady) {
  const key = `${set}/${file}.${ext}`
  let entry = IMAGE_CACHE.get(key)
  if (!entry) {
    const img = new Image()
    entry = { img, loaded: false }
    IMAGE_CACHE.set(key, entry)
    img.onload = () => {
      entry.loaded = true
      const waiters = IMAGE_WAITERS.get(key)
      if (waiters) { waiters.forEach(fn => fn()); IMAGE_WAITERS.delete(key) }
    }
    img.src = `/pieces/${set}/${file}.${ext}`
  }
  if (!entry.loaded) {
    if (!IMAGE_WAITERS.has(key)) IMAGE_WAITERS.set(key, new Set())
    IMAGE_WAITERS.get(key).add(onReady)
  }
  return entry
}

// Classic wood board palette (cream / walnut-brown squares). Piece colors
// and rendering (font, fill, outline) come from the selectable piece style
// — see utils/pieceStyles.js and hooks/usePieceStyle.js.
const LIGHT_SQ = '#F0D9B5'
const DARK_SQ  = '#B58863'

const HINT_SQ = 'rgba(239,159,39,0.34)'

const ANIM_MS = 170

const EMPTY_ATTACKS = { wa: Array.from({ length: 8 }, () => new Array(8).fill(0)), ba: Array.from({ length: 8 }, () => new Array(8).fill(0)) }

const easeOutCubic = t => 1 - Math.pow(1 - t, 3)

// Diff two board matrices to find which piece(s) moved, so the caller can
// animate them sliding from their old square to their new one instead of
// popping instantly. Handles simple moves, captures, castling (2 movers)
// and promotions (piece type changes at the destination).
function diffMovers(prevBoard, nextBoard) {
  const vanished = [], appeared = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pv = prevBoard[r][c], nv = nextBoard[r][c]
    if (pv && !nv) vanished.push({ r, c, piece: pv })
    else if (nv && pv !== nv) appeared.push({ r, c, piece: nv })
  }
  const used = new Set()
  const movers = []
  // Pass 1: match identical piece (normal moves, castling rook + king)
  appeared.forEach(a => {
    const idx = vanished.findIndex((v, i) => !used.has(i) && v.piece === a.piece)
    if (idx !== -1) { used.add(idx); movers.push({ piece: a.piece, fr: vanished[idx].r, fc: vanished[idx].c, tr: a.r, tc: a.c }); a._matched = true }
  })
  // Pass 2: promotions — same color, different piece type
  appeared.filter(a => !a._matched).forEach(a => {
    const idx = vanished.findIndex((v, i) => !used.has(i) && isWhite(v.piece) === isWhite(a.piece))
    if (idx !== -1) { used.add(idx); movers.push({ piece: a.piece, fr: vanished[idx].r, fc: vanished[idx].c, tr: a.r, tc: a.c }) }
  })
  return movers
}

/**
 * Board component — renders canvas with heatmap overlays.
 *
 * Props:
 *   board        — 8x8 array of piece chars / null (used when `fen` isn't given, e.g. static display)
 *   fen          — FEN string; when provided, drives rendering AND move legality via chess.js
 *   size         — canvas size in px (default 360)
 *   flipped      — boolean
 *   highlightSqs — [[r,c], ...] teal highlight (last move, target squares)
 *   hintSqs      — [[r,c], ...] amber highlight (practice hints)
 *   layers       — { attacks, coverage, targets, hanging, winning, selection }
 *   onMove       — called with { san, fen, from: [r,c], to: [r,c] } when the user
 *                   completes a legal move by click (requires `fen` + `interactive`)
 *   interactive  — whether clicks select pieces and allow moves (default true)
 *   onSquareClick — called with (r, c) on any click, regardless of `interactive`
 *                   (used e.g. for clicking heatmap squares on a non-interactive board)
 */
export default function Board({
  board: boardProp,
  fen = null,
  size = 360,
  flipped = false,
  highlightSqs = [],
  hintSqs = [],
  layers = { attacks: true, coverage: true, targets: true, hanging: true, winning: true, selection: true },
  onMove,
  interactive = true,
  heatmap = null,   // 8x8 array of [0-1] intensities → red overlay
  onSquareClick = null,
  selectedSquare = null,   // [r, c] — draws a highlight ring, independent of move-selection
}) {
  const canvasRef = useRef(null)
  const [selSq, setSelSq] = useState(null)
  const [selMoves, setSelMoves] = useState([])
  // { from: [r,c], to: [r,c] } while waiting for the player to pick a
  // promotion piece; the move isn't applied until they choose.
  const [pendingPromotion, setPendingPromotion] = useState(null)
  const sq = size / 8
  const [pieceStyle] = usePieceStyle()

  const board = useMemo(() => (fen ? fenToBoard(fen) : boardProp), [fen, boardProp])

  const drawPieceAt = (ctx, p, x, y) => {
    if (pieceStyle.type === 'image') {
      const entry = getPieceImage(pieceStyle.set, pieceFileName(p), pieceStyle.ext ?? 'svg', () => {
        if (!animatingRef.current) draw()
      })
      if (!entry.loaded) return
      const s = sq * 0.86
      ctx.drawImage(entry.img, x - s / 2, y - s / 2, s, s)
      return
    }

    ctx.font = `${sq * 0.74}px ${pieceStyle.font}`
    ctx.lineJoin = 'round'
    // Keep the outline moderate — unicode glyphs have thin detail lines,
    // so too heavy a stroke swallows the fill entirely instead of framing it.
    const strokeW = Math.max(1, sq * 0.02 * (pieceStyle.strokeScale ?? 1))
    const white = isWhite(p)
    const fill = white ? pieceStyle.whiteFill : pieceStyle.blackFill
    const stroke = white ? pieceStyle.whiteStroke : pieceStyle.blackStroke
    // Fill first (unless the style is a hollow outline) for a solid interior,
    // then stroke the outline on top so the border reads clearly.
    if (pieceStyle.filled !== false) { ctx.fillStyle = fill; ctx.fillText(GLYPHS[p], x, y) }
    ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.strokeText(GLYPHS[p], x, y)
  }

  const draw = useCallback((movers = [], t = 1) => {
    const canvas = canvasRef.current
    if (!canvas || !board) return
    const ctx = canvas.getContext('2d')
    const { wa, ba } = fen ? buildAttackMaps(fen) : EMPTY_ATTACKS
    const movingTo = movers.length ? new Set(movers.map(m => `${m.tr},${m.tc}`)) : null

    // Base squares
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT_SQ : DARK_SQ
      ctx.fillRect(dc*sq, dr*sq, sq, sq)
    }

    // Target squares
    if (layers.targets) highlightSqs.forEach(([r, c]) => {
      const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      ctx.fillStyle = 'rgba(29,158,117,0.28)'
      ctx.fillRect(dc*sq, dr*sq, sq, sq)
    })

    // Practice hint squares
    if (hintSqs?.length) hintSqs.forEach(([r, c]) => {
      const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      ctx.fillStyle = HINT_SQ
      ctx.fillRect(dc*sq, dr*sq, sq, sq)
    })

    // Deviation heatmap overlay
    if (heatmap) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const intensity = heatmap[r]?.[c] ?? 0
        if (intensity <= 0) continue
        const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
        ctx.fillStyle = `rgba(226,75,74,${Math.min(0.12 + intensity * 0.72, 0.85)})`
        ctx.fillRect(dc*sq, dr*sq, sq, sq)
      }
    }

    // Attack heatmaps
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      if (layers.attacks) {
        const v = ba[r][c]
        if (v > 0) { ctx.fillStyle = `rgba(226,75,74,${Math.min(.12+v*.15,.78)})`; ctx.fillRect(dc*sq, dr*sq, sq, sq) }
      }
      if (layers.coverage) {
        const v = wa[r][c]
        if (v > 0) { ctx.fillStyle = `rgba(55,138,221,${Math.min(.08+v*.11,.55)})`; ctx.fillRect(dc*sq, dr*sq, sq, sq) }
      }
    }

    // Piece alerts
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c], dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      if (!p) continue
      if (layers.hanging && isWhite(p) && ba[r][c] > wa[r][c]) {
        ctx.fillStyle = 'rgba(255,140,0,0.78)'; ctx.fillRect(dc*sq, dr*sq, sq, sq)
      }
      if (layers.winning && isBlack(p) && wa[r][c] > ba[r][c]) {
        ctx.fillStyle = 'rgba(160,70,210,0.68)'; ctx.fillRect(dc*sq, dr*sq, sq, sq)
      }
    }

    // Externally controlled selected square (e.g. clicked heatmap square)
    if (selectedSquare) {
      const [sr, sc] = selectedSquare
      const dr = flipped ? 7-sr : sr, dc = flipped ? 7-sc : sc
      ctx.strokeStyle = 'rgba(255,220,0,0.9)'; ctx.lineWidth = 2.5
      ctx.strokeRect(dc*sq+1.25, dr*sq+1.25, sq-2.5, sq-2.5)
    }

    // Selection + legal moves
    if (layers.selection && selSq) {
      const [sr, sc] = selSq
      const dr = flipped ? 7-sr : sr, dc = flipped ? 7-sc : sc
      ctx.fillStyle = 'rgba(255,220,0,0.45)'; ctx.fillRect(dc*sq, dr*sq, sq, sq)
      for (const [mr, mc] of selMoves) {
        const dmr = flipped ? 7-mr : mr, dmc = flipped ? 7-mc : mc
        if (board[mr][mc]) {
          ctx.strokeStyle = 'rgba(255,190,0,0.88)'; ctx.lineWidth = 2.5
          ctx.strokeRect(dmc*sq+1.25, dmr*sq+1.25, sq-2.5, sq-2.5)
        } else {
          ctx.fillStyle = 'rgba(255,220,0,0.38)'
          ctx.beginPath(); ctx.arc(dmc*sq+sq/2, dmr*sq+sq/2, sq*0.14, 0, Math.PI*2); ctx.fill()
        }
      }
    }

    // Pieces (static — pieces mid-flight in `movers` are skipped here and
    // drawn separately below at their interpolated position)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c]; if (!p) continue
      if (movingTo?.has(`${r},${c}`)) continue
      const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      drawPieceAt(ctx, p, dc*sq + sq/2, dr*sq + sq/2)
    }

    // Animating pieces, sliding from their previous square to their new one
    movers.forEach(m => {
      const dfr = flipped ? 7-m.fr : m.fr, dfc = flipped ? 7-m.fc : m.fc
      const dtr = flipped ? 7-m.tr : m.tr, dtc = flipped ? 7-m.tc : m.tc
      const curR = dfr + (dtr - dfr) * t
      const curC = dfc + (dtc - dfc) * t
      drawPieceAt(ctx, m.piece, curC*sq + sq/2, curR*sq + sq/2)
    })

    // Coordinates — outlined so they stay legible on both square colors
    const files = 'abcdefgh'
    ctx.font = `${sq * 0.2}px sans-serif`
    ctx.lineWidth = 2.2
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    for (let i = 0; i < 8; i++) {
      const fi = flipped ? 7-i : i
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.strokeText(files[fi], i*sq + 2, sq*8 - 2)
      ctx.fillText(files[fi], i*sq + 2, sq*8 - 2)
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.strokeText(flipped ? i+1 : 8-i, sq*8 - 2, i*sq + 2)
      ctx.fillText(flipped ? i+1 : 8-i, sq*8 - 2, i*sq + 2)
    }
  }, [board, fen, flipped, selSq, selMoves, highlightSqs, hintSqs, layers, heatmap, selectedSquare, sq, pieceStyle])

  // Redraw immediately for anything other than the board's own content
  // changing (selection, highlights, hints, layer toggles, resize, etc.) —
  // unless a move-animation is currently in flight, in which case its own
  // rAF loop owns drawing until it finishes.
  const animatingRef = useRef(false)
  useEffect(() => {
    if (!animatingRef.current) draw()
  }, [draw])

  // Animate the moving piece(s) whenever the board's content actually
  // changes (a move was made / a step was taken), instead of popping the
  // new position in instantly.
  const prevBoardRef = useRef(null)
  useEffect(() => {
    const prevBoard = prevBoardRef.current
    prevBoardRef.current = board
    if (!prevBoard || !board) return

    const movers = diffMovers(prevBoard, board)
    // Skip animating multi-ply jumps (e.g. clicking far ahead in the move
    // list) — only animate what looks like a single move.
    if (!movers.length || movers.length > 2) return

    animatingRef.current = true
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ANIM_MS)
      draw(movers, easeOutCubic(t))
      if (t < 1) raf = requestAnimationFrame(tick)
      else { animatingRef.current = false; draw() }
    }
    raf = requestAnimationFrame(tick)
    return () => { animatingRef.current = false; if (raf) cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board])

  // Clear selection when board changes externally
  useEffect(() => { setSelSq(null); setSelMoves([]); setPendingPromotion(null) }, [board])

  const resolvePromotion = useCallback((piece) => {
    if (pendingPromotion && fen) {
      const { from, to } = pendingPromotion
      const result = applyClickMove(fen, from[0], from[1], to[0], to[1], piece)
      if (result) onMove?.({ ...result, from, to })
    }
    setPendingPromotion(null)
  }, [pendingPromotion, fen, onMove])

  const cancelPromotion = useCallback(() => setPendingPromotion(null), [])

  const handleClick = useCallback(e => {
    if (!board) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height
    let c = Math.floor((e.clientX - rect.left) * scaleX / sq)
    let r = Math.floor((e.clientY - rect.top)  * scaleY / sq)
    if (flipped) { r = 7 - r; c = 7 - c }
    if (!inBounds(r, c)) return

    onSquareClick?.(r, c)

    if (!interactive || !fen) return

    if (selSq) {
      const mv = selMoves.find(([mr, mc]) => mr === r && mc === c)
      if (mv) {
        if (isPromotionMove(fen, selSq[0], selSq[1], r, c)) {
          setPendingPromotion({ from: selSq, to: [r, c] })
          setSelSq(null); setSelMoves([])
          return
        }
        const result = applyClickMove(fen, selSq[0], selSq[1], r, c)
        if (result) onMove?.({ ...result, from: selSq, to: [r, c] })
        setSelSq(null); setSelMoves([])
        return
      }
    }

    const p = board[r][c]
    if (p) {
      setSelSq([r, c])
      setSelMoves(legalMovesForPiece(fen, r, c))
    } else {
      setSelSq(null); setSelMoves([])
    }
  }, [board, fen, flipped, interactive, selSq, selMoves, onMove, onSquareClick, sq])

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onClick={handleClick}
        style={{ display: 'block', borderRadius: 4, border: '0.5px solid #2a2a2e', cursor: (interactive || onSquareClick) ? 'pointer' : 'default' }}
      />
      {pendingPromotion && (
        <PromotionPicker
          pendingPromotion={pendingPromotion}
          board={board}
          flipped={flipped}
          sq={sq}
          pieceStyle={pieceStyle}
          onPick={resolvePromotion}
          onCancel={cancelPromotion}
        />
      )}
    </div>
  )
}
