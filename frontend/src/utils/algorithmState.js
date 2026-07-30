export const initialAlgorithmState = {
  status: 'idle',   // 'idle' | 'awaiting-move' | 'thinking' | 'checkmate' | 'failed'
  positionId: null,
  label: null,
  fen: null,
  prevFen: null,     // fen before the user's most recent (unconfirmed) move — restored on 'failed'
  failReason: null, // 'stalemate' | 'draw' | 'insufficient_material' | null
  error: null,       // API-failure message, or null
}

export function algorithmReducer(state, action) {
  switch (action.type) {
    case 'started': {
      const p = action.payload
      return {
        ...initialAlgorithmState,
        status: 'awaiting-move',
        positionId: p.positionId, label: p.label, fen: p.fen,
      }
    }
    case 'moved':
      // Stash the pre-move fen so a later 'failed' can roll back to it — the
      // board otherwise stays on the post-move (Black-to-move) position even
      // though the move was never confirmed by the engine, letting the user
      // illegally move the engine's own king.
      return { ...state, status: 'thinking', prevFen: state.fen, fen: action.payload.fen, error: null }
    case 'replied': {
      const r = action.payload
      if (r.status === 'checkmate') {
        return { ...state, status: 'checkmate' }
      }
      if (r.status === 'stalemate' || r.status === 'draw' || r.status === 'insufficient_material') {
        return { ...state, status: 'failed', failReason: r.status }
      }
      return { ...state, status: 'awaiting-move', fen: r.fen }
    }
    case 'failed':
      return { ...state, status: 'awaiting-move', fen: state.prevFen, error: action.payload.message }
    case 'reset':
      return initialAlgorithmState
    default:
      return state
  }
}
