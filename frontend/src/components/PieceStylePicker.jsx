import { useEffect, useRef } from 'react'
import { usePieceStyle } from '../hooks/usePieceStyle'

const LIGHT_SQ = '#F0D9B5'
const DARK_SQ  = '#B58863'

// Draws a small live preview of a piece style: a white knight on a light
// square and a black knight on a dark square, using the exact same
// fill/stroke logic as the real board so the preview matches 1:1.
function StylePreview({ style, size = 120 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (style.type === 'image') return // rendered as plain <img> tags below
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = (size * 0.5) * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size * 0.5}px`
    ctx.scale(dpr, dpr)
    const sq = size / 2

    ctx.fillStyle = LIGHT_SQ
    ctx.fillRect(0, 0, sq, sq * 0.5)
    ctx.fillStyle = DARK_SQ
    ctx.fillRect(sq, 0, sq, sq * 0.5)

    const drawPiece = (glyph, white, x, y) => {
      ctx.font = `${sq * 0.66}px ${style.font}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      const strokeW = Math.max(1, sq * 0.02 * (style.strokeScale ?? 1))
      const fill = white ? style.whiteFill : style.blackFill
      const stroke = white ? style.whiteStroke : style.blackStroke
      if (style.filled !== false) { ctx.fillStyle = fill; ctx.fillText(glyph, x, y) }
      ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.strokeText(glyph, x, y)
    }

    drawPiece('♘', true, sq / 2, sq * 0.25)
    drawPiece('♞', false, sq + sq / 2, sq * 0.25)
  }, [style, size])

  if (style.type === 'image') {
    const sq = size / 2
    const ext = style.ext ?? 'svg'
    return (
      <div style={{ width: size, height: sq, display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ flex: 1, background: LIGHT_SQ, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={`/pieces/${style.set}/wN.${ext}`} alt="" style={{ width: sq * 0.78, height: sq * 0.78 }} />
        </div>
        <div style={{ flex: 1, background: DARK_SQ, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={`/pieces/${style.set}/bN.${ext}`} alt="" style={{ width: sq * 0.78, height: sq * 0.78 }} />
        </div>
      </div>
    )
  }

  return <canvas ref={ref} style={{ borderRadius: 6, display: 'block' }} />
}

// Modal for browsing and selecting a canvas piece-rendering style. Applies
// immediately (and persists to localStorage) so the boards on screen behind
// it update live as you click through options.
export default function PieceStylePicker({ onClose }) {
  const [current, setStyle, allStyles] = usePieceStyle()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 12,
          padding: 20, width: 520, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Piece style</div>
          <button
            onClick={onClose}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', border: '0.5px solid var(--border)', color: 'var(--text4)',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {allStyles.map(s => {
            const selected = s.id === current.id
            return (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: 10, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  background: selected ? 'var(--green-bg, rgba(93,202,165,0.12))' : 'var(--bg3)',
                  border: selected ? '1.5px solid var(--green)' : '0.5px solid var(--border)',
                }}
              >
                <StylePreview style={s} />
                <span style={{ fontSize: 12, color: selected ? 'var(--green)' : 'var(--text2)', fontWeight: selected ? 600 : 400 }}>
                  {s.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
