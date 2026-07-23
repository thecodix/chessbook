import { useEffect, useRef, useState, useCallback } from 'react'
import { buildAttackMaps, legalMovesForPiece, isWhite, isBlack, inBounds } from '../utils/chess'

const GLYPHS = {
  K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'
}

const LIGHT_SQ = '#3e3e52'
const DARK_SQ  = '#1e1e2e'

/**
 * Board component — renders canvas with heatmap overlays.
 *
 * Props:
 *   board        — 8x8 array of piece chars / null
 *   size         — canvas size in px (default 360)
 *   flipped      — boolean
 *   highlightSqs — [[r,c], ...] teal highlight (last move, target squares)
 *   layers       — { attacks, coverage, targets, hanging, winning, selection }
 *   onMove       — called with (fromR, fromC, toR, toC) when user drags/clicks a move
 *   interactive  — whether clicks select pieces (default true)
 *   onSquareClick — called with (r, c) on any click, regardless of `interactive`
 *                   (used e.g. for clicking heatmap squares on a non-interactive board)
 */
export default function Board({
  board,
  size = 360,
  flipped = false,
  highlightSqs = [],
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
  const sq = size / 8

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !board) return
    const ctx = canvas.getContext('2d')
    const { wa, ba } = buildAttackMaps(board)

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

    // Pieces
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c]; if (!p) continue
      const dr = flipped ? 7-r : r, dc = flipped ? 7-c : c
      ctx.font = `${sq * 0.74}px serif`
      const x = dc*sq + sq/2, y = dr*sq + sq/2
      if (isWhite(p)) {
        ctx.fillStyle = '#fff'; ctx.fillText(GLYPHS[p], x, y)
        ctx.strokeStyle = '#222'; ctx.lineWidth = 0.6; ctx.strokeText(GLYPHS[p], x, y)
      } else {
        ctx.fillStyle = '#1a1a1a'; ctx.fillText(GLYPHS[p], x, y)
      }
    }

    // Coordinates
    const files = 'abcdefgh'
    ctx.font = `${sq * 0.2}px sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.22)'
    for (let i = 0; i < 8; i++) {
      const fi = flipped ? 7-i : i
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText(files[fi], i*sq + 2, sq*8 - 2)
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(flipped ? i+1 : 8-i, sq*8 - 2, i*sq + 2)
    }
  }, [board, flipped, selSq, selMoves, highlightSqs, layers, heatmap, selectedSquare, sq])

  useEffect(() => { draw() }, [draw])

  // Clear selection when board changes externally
  useEffect(() => { setSelSq(null); setSelMoves([]) }, [board])

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

    if (!interactive) return

    if (selSq) {
      const mv = selMoves.find(([mr, mc]) => mr === r && mc === c)
      if (mv) {
        onMove?.(selSq[0], selSq[1], r, c)
        setSelSq(null); setSelMoves([])
        return
      }
    }

    const p = board[r][c]
    if (p) {
      setSelSq([r, c])
      setSelMoves(legalMovesForPiece(board, r, c))
    } else {
      setSelSq(null); setSelMoves([])
    }
  }, [board, flipped, interactive, selSq, selMoves, onMove, onSquareClick, sq])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={handleClick}
      style={{ display: 'block', borderRadius: 4, border: '0.5px solid #2a2a2e', cursor: (interactive || onSquareClick) ? 'pointer' : 'default' }}
    />
  )
}
