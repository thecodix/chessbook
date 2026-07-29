import { useReducer, useState } from 'react'
import Board from '../components/Board'
import { getSparringNext, evaluateSparringMove } from '../utils/api'
import { initialSparringState, sparringReducer } from '../utils/sparringState'

const FEEDBACK_LABEL = {
  correct: 'Correct!',
  unknown: "Not in your repertoire — worth reviewing.",
}

export default function SparringMode() {
  const [color, setColor] = useState('white')
  const [state, dispatch] = useReducer(sparringReducer, initialSparringState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const start = async () => {
    setLoading(true)
    try {
      const next = await getSparringNext(color)
      dispatch({ type: 'started', payload: next })
      setError(null)
    } catch {
      setError('Could not load a position — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleMove = async (moveResult) => {
    if (state.status !== 'awaiting-move') return
    try {
      const evaluation = await evaluateSparringMove(state.lineId, state.plyIndex, moveResult.san)
      dispatch({ type: 'evaluated', payload: evaluation })
      setError(null)
      setTimeout(() => dispatch({ type: 'advanced' }), 900)
    } catch {
      setError('Could not submit your move — please try again.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
      {error && (
        <div role="alert" style={{ color: 'var(--red)' }}>{error}</div>
      )}

      {state.status === 'idle' && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setColor('white')} style={{ fontWeight: color === 'white' ? 700 : 400 }}>White</button>
            <button onClick={() => setColor('black')} style={{ fontWeight: color === 'black' ? 700 : 400 }}>Black</button>
          </div>
          <button className="btn-green" disabled={loading} onClick={start}>
            {loading ? 'Loading…' : 'Start sparring'}
          </button>
        </>
      )}

      {state.status !== 'idle' && (
        <>
          <div style={{ fontSize: 14, color: 'var(--text3)' }}>{state.openingName}</div>

          {state.status !== 'summary' && (
            <Board
              fen={state.fen}
              size={420}
              flipped={state.color === 'black'}
              interactive={state.status === 'awaiting-move'}
              onMove={handleMove}
              layers={{ attacks: false, coverage: false, targets: true, hanging: false, winning: false, selection: true }}
            />
          )}

          {state.feedback && (
            <div style={{ color: state.feedback === 'correct' ? 'var(--green)' : 'var(--red)' }}>
              {FEEDBACK_LABEL[state.feedback]}
            </div>
          )}

          {state.status === 'summary' && (
            <>
              <div>{state.sessionCorrect} / {state.sessionAttempts} correct this session</div>
              <button className="btn-green" onClick={start}>New position</button>
            </>
          )}
        </>
      )}
    </div>
  )
}
