export const initialSparringState = {
  status: 'idle',   // 'idle' | 'awaiting-move' | 'feedback' | 'summary'
  lineId: null,
  openingId: null,
  openingName: null,
  plyIndex: null,
  fen: null,
  color: null,
  feedback: null,   // 'correct' | 'unknown' | null
  pendingOpponentFen: null,
  pendingSessionOver: false,
  sessionCorrect: 0,
  sessionAttempts: 0,
}

export function sparringReducer(state, action) {
  switch (action.type) {
    case 'started': {
      const n = action.payload
      return {
        ...initialSparringState,
        status: 'awaiting-move',
        lineId: n.lineId, openingId: n.openingId, openingName: n.openingName,
        plyIndex: n.plyIndex, fen: n.fen, color: n.color,
        sessionCorrect: state.sessionCorrect, sessionAttempts: state.sessionAttempts,
      }
    }
    case 'evaluated': {
      const r = action.payload
      return {
        ...state,
        status: 'feedback',
        feedback: r.result,
        sessionAttempts: state.sessionAttempts + 1,
        sessionCorrect: state.sessionCorrect + (r.result === 'correct' ? 1 : 0),
        pendingOpponentFen: r.opponentFen ?? null,
        pendingSessionOver: r.sessionOver,
      }
    }
    case 'advanced': {
      if (state.pendingSessionOver) {
        return { ...state, status: 'summary', feedback: null }
      }
      return {
        ...state,
        status: 'awaiting-move',
        feedback: null,
        plyIndex: state.plyIndex + 2,
        fen: state.pendingOpponentFen,
      }
    }
    case 'reset':
      return initialSparringState
    default:
      return state
  }
}
