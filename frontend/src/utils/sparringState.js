export const initialSparringState = {
  status: 'idle',   // 'idle' | 'awaiting-move' | 'submitting' | 'feedback' | 'summary'
  lineId: null,
  openingId: null,
  openingName: null,
  plyIndex: null,
  fen: null,
  color: null,
  movesSoFar: [],          // the ACTUAL path played this session (not the seed line's)
  feedback: null,   // 'correct' | 'unknown' | null
  pendingOpponentFen: null,
  pendingMovesSoFar: [],
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
        movesSoFar: n.movesSoFar ?? [],
        sessionCorrect: state.sessionCorrect, sessionAttempts: state.sessionAttempts,
      }
    }
    case 'moved': {
      // Render the user's own move immediately (chess.js already computed
      // its resulting fen in the component) instead of waiting for the
      // /evaluate round-trip — otherwise the board never reflects the move
      // at all on a wrong answer, and shows a dead period even when right.
      return {
        ...state,
        status: 'submitting',
        fen: action.payload.fen,
      }
    }
    case 'move-failed': {
      // The /evaluate call itself failed (network error, etc — distinct
      // from a wrong-move 'unknown' result, which IS a successful response).
      // Roll the board back to the pre-move position and re-enable
      // interaction so the user can retry, instead of leaving it stuck in
      // 'submitting' forever.
      return {
        ...state,
        status: 'awaiting-move',
        fen: action.payload.fen,
      }
    }
    case 'evaluated': {
      const r = action.payload
      const pendingMovesSoFar = [
        ...state.movesSoFar,
        r.movePlayed,
        ...(r.opponentMove ? [r.opponentMove] : []),
      ]
      return {
        ...state,
        status: 'feedback',
        feedback: r.result,
        sessionAttempts: state.sessionAttempts + 1,
        sessionCorrect: state.sessionCorrect + (r.result === 'correct' ? 1 : 0),
        pendingOpponentFen: r.opponentFen ?? null,
        pendingMovesSoFar,
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
        movesSoFar: state.pendingMovesSoFar,
      }
    }
    case 'reset':
      return initialSparringState
    default:
      return state
  }
}
