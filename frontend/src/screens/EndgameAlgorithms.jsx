import { useState, useEffect, useReducer, useRef, useCallback } from 'react'
import Board from '../components/Board'
import { getEngineMove, getEndgamesProgress, updateEndgameProgress } from '../utils/api'
import { initialAlgorithmState, algorithmReducer } from '../utils/algorithmState'

function useBoardSize(ref) {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize(Math.max(200, Math.floor(Math.min(width, height))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

const FAIL_MESSAGE = {
  stalemate: 'Stalemate — the lone king had no legal move but wasn’t in check. Avoid boxing it in without checking it.',
  draw: 'Draw by the 75-move rule — you weren’t making progress toward mate.',
  insufficient_material: 'You lost a bishop — a king and a single bishop can never force checkmate alone.',
}

const FAILURE_STATUSES = new Set(['stalemate', 'draw', 'insufficient_material'])

export default function EndgameAlgorithms() {
  const [data, setData] = useState(null)
  const [progress, setProgress] = useState({})
  // Set when saving progress against the backend fails after a
  // checkmate/stalemate/draw — surfaced to the user instead of being
  // silently swallowed, since a swallowed save failure looks like "my win
  // wasn't recorded" the next time the page loads. Deliberately separate
  // from `state.error` (algorithmState's move/engine-reply failure path) —
  // same separation-of-concerns principle as `error` vs `failReason` in the
  // reducer: this tracks the progress-save path, not the move path.
  const [progressError, setProgressError] = useState(null)
  const [state, dispatch] = useReducer(algorithmReducer, initialAlgorithmState)
  const boardWrapRef = useRef(null)
  const boardSize = useBoardSize(boardWrapRef)

  useEffect(() => {
    fetch('/algorithms.json').then(r => r.json()).then(setData).catch(console.warn)
  }, [])

  useEffect(() => {
    getEndgamesProgress()
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.puzzleId] = { solved: r.solved, attempts: r.attempts, wins: r.wins, winStreak: r.winStreak } })
        setProgress(map)
      })
      .catch(console.warn)
  }, [])

  const selectPosition = useCallback((position) => {
    dispatch({ type: 'started', payload: { positionId: position.id, label: position.label, fen: position.fen } })
  }, [])

  const markProgress = useCallback((positionId, solved) => {
    updateEndgameProgress(positionId, solved, { trackStreak: true })
      .then(res => {
        setProgress(p => ({ ...p, [positionId]: { solved: res.solved, attempts: res.attempts, wins: res.wins, winStreak: res.winStreak } }))
        setProgressError(null)
      })
      .catch(err => setProgressError(`Couldn't save your progress — it wasn't recorded: ${err.message}`))
  }, [])

  const handleMove = useCallback(async (moveResult) => {
    if (state.status !== 'awaiting-move') return
    dispatch({ type: 'moved', payload: { fen: moveResult.fen } })
    try {
      const reply = await getEngineMove(moveResult.fen)
      dispatch({ type: 'replied', payload: reply })
      if (reply.status === 'checkmate') {
        markProgress(state.positionId, true)
      } else if (FAILURE_STATUSES.has(reply.status)) {
        markProgress(state.positionId, false)
      }
    } catch (err) {
      dispatch({ type: 'failed', payload: { message: err.message || 'Could not reach the server — please try again.' } })
    }
  }, [state.status, state.positionId, markProgress])

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div className="sidebar">
        <div className="sidebar-head"><span style={{ fontSize: 13, fontWeight: 500 }}>Algorithms</span></div>
        {data?.categories?.map(cat => (
          <div key={cat.id}>
            <div className="sidebar-section">{cat.title}</div>
            {cat.positions.map(pos => (
              <div
                key={pos.id}
                className={`opening-item${state.positionId === pos.id ? ' active' : ''}`}
                onClick={() => selectPosition(pos)}
              >
                <div className="oi-name">{pos.label}</div>
                <div className="oi-meta">
                  <span>{progress[pos.id]?.solved ? '✓ solved' : ''}</span>
                  <span>{progress[pos.id]?.wins ? ` · ${progress[pos.id].wins} win${progress[pos.id].wins === 1 ? '' : 's'}` : ''}</span>
                  <span>{progress[pos.id]?.winStreak ? ` · streak ${progress[pos.id].winStreak}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="board-area" style={{ padding: 12, gap: 10 }}>
        {progressError && (
          <div
            style={{
              width: '100%', maxWidth: boardSize, fontSize: 12, color: 'var(--red)',
              background: 'rgba(226,75,74,0.1)', border: '1px solid var(--red)',
              borderRadius: 6, padding: '6px 10px', display: 'flex',
              justifyContent: 'space-between', gap: 8, alignItems: 'center',
            }}
          >
            <span>{progressError}</span>
            <button className="btn-ghost" style={{ width: 'auto', padding: '2px 8px', fontSize: 11 }} onClick={() => setProgressError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {state.error && (
          <div style={{ width: '100%', maxWidth: boardSize, fontSize: 12, color: 'var(--red)' }}>
            {state.error}
          </div>
        )}

        {state.status !== 'idle' && (
          <div
            ref={boardWrapRef}
            style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Board
              fen={state.fen}
              size={boardSize}
              flipped={false}
              interactive={state.status === 'awaiting-move'}
              onMove={handleMove}
              layers={{ attacks: false, coverage: false, targets: true, hanging: false, winning: false, selection: true }}
            />
          </div>
        )}

        {state.status === 'awaiting-move' && <div style={{ fontSize: 13, textAlign: 'center' }}>White to move</div>}
        {state.status === 'thinking' && <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--text4)' }}>Engine thinking…</div>}
        {state.status === 'checkmate' && (
          <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--green)' }}>
            Checkmate! 🎉
            <div style={{ fontSize: 12, color: 'var(--text4)', marginTop: 4 }}>
              Win streak: {progress[state.positionId]?.winStreak ?? 0} · {progress[state.positionId]?.wins ?? 0} wins total
            </div>
            <div><button className="btn-green" onClick={() => dispatch({ type: 'reset' })}>Back to positions</button></div>
          </div>
        )}
        {state.status === 'failed' && (
          <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--red)' }}>
            <div style={{ fontWeight: 600 }}>Failed</div>
            <div>{FAIL_MESSAGE[state.failReason]}</div>
            <div><button className="btn-green" onClick={() => selectPosition({ id: state.positionId, label: state.label, fen: data.categories.flatMap(c => c.positions).find(p => p.id === state.positionId)?.fen })}>Retry</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
