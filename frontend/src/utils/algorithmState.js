export const initialAlgorithmState = {
  status: 'idle',   // 'idle' | 'awaiting-move' | 'thinking' | 'checkmate' | 'failed'
  positionId: null,
  label: null,
  fen: null,
  failReason: null, // 'stalemate' | 'draw' | null
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
      return { ...state, status: 'thinking', fen: action.payload.fen, error: null }
    case 'replied': {
      const r = action.payload
      if (r.status === 'checkmate') {
        return { ...state, status: 'checkmate' }
      }
      if (r.status === 'stalemate' || r.status === 'draw') {
        return { ...state, status: 'failed', failReason: r.status }
      }
      return { ...state, status: 'awaiting-move', fen: r.fen }
    }
    case 'failed':
      return { ...state, status: 'awaiting-move', error: action.payload.message }
    case 'reset':
      return initialAlgorithmState
    default:
      return state
  }
}
