// Selectable visual styles for chess piece rendering on the canvas board.
// Two kinds of style:
//  - "svg" styles draw pre-rendered piece images (vendored static assets
//    under frontend/public/pieces/{set}/{w,b}{P,N,B,R,Q,K}.svg) — these read
//    far more clearly than unicode glyphs and are the recommended default.
//  - "font" styles draw unicode chess glyphs in a chosen generic CSS font
//    family (serif/sans-serif/fantasy/cursive render meaningfully different
//    glyph shapes/weights across browsers/OSes), with a fill/stroke color
//    treatment layered on top.
export const PIECE_STYLES = [
  {
    id: 'standard',
    name: 'Standard',
    type: 'image',
    set: 'standard',
    ext: 'png',
    // Wikimedia Commons "standard transparent" chess set by Colin M. L.
    // Burnett (dual-licensed GFDL / CC-BY-SA 3.0), vendored as static PNGs
    // for this personal project.
  },
  {
    id: 'classic',
    name: 'Classic (Unicode)',
    type: 'font',
    font: 'serif',
    strokeScale: 1,
    filled: true,
    whiteFill: '#FFFFFF', whiteStroke: '#000000',
    blackFill: '#262421', blackStroke: '#000000',
  },
  {
    id: 'modern',
    name: 'Modern',
    type: 'font',
    font: 'sans-serif',
    strokeScale: 1,
    filled: true,
    whiteFill: '#FFFFFF', whiteStroke: '#000000',
    blackFill: '#262421', blackStroke: '#000000',
  },
  {
    id: 'bold',
    name: 'Bold Contrast',
    type: 'font',
    font: 'serif',
    strokeScale: 1.8,
    filled: true,
    whiteFill: '#FFFFFF', whiteStroke: '#000000',
    blackFill: '#000000', blackStroke: '#000000',
  },
  {
    id: 'wood',
    name: 'Wood Tones',
    type: 'font',
    font: 'serif',
    strokeScale: 1,
    filled: true,
    whiteFill: '#F5EBD8', whiteStroke: '#3B2A1A',
    blackFill: '#6B4A30', blackStroke: '#000000',
  },
  {
    id: 'outline',
    name: 'Outline',
    type: 'font',
    font: 'serif',
    strokeScale: 1.6,
    filled: false,
    whiteFill: 'transparent', whiteStroke: '#FFFFFF',
    blackFill: 'transparent', blackStroke: '#141414',
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    type: 'font',
    font: 'fantasy',
    strokeScale: 1,
    filled: true,
    whiteFill: '#FFFFFF', whiteStroke: '#000000',
    blackFill: '#262421', blackStroke: '#000000',
  },
]

export const DEFAULT_PIECE_STYLE_ID = 'standard'

export function getPieceStyle(id) {
  return PIECE_STYLES.find(s => s.id === id) || PIECE_STYLES[0]
}
