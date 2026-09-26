import { useEffect, useMemo, useReducer, useState } from 'react'
import { Chess } from 'chess.js'
import Board from '../components/Board'
import { evaluateSparringMove, getEngineMove, getRepertoire, getSparringNext } from '../utils/api'
import { START_FEN, stripSan } from '../utils/chess'
import { initialSparringState, sparringReducer } from '../utils/sparringState'

const FEEDBACK_LABEL = {
  correct: 'Correct!',
  unknown: "Not in your repertoire — worth reviewing.",
}

function PracticeTab() {
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
    const preMoveFen = state.fen
    // Render the user's own move (and lock the board) right away — chess.js
    // has already computed the resulting fen — instead of waiting for the
    // /evaluate round-trip to complete.
    dispatch({ type: 'moved', payload: { fen: moveResult.fen } })
    try {
      const evaluation = await evaluateSparringMove(state.lineId, state.plyIndex, moveResult.san, state.movesSoFar)
      dispatch({ type: 'evaluated', payload: { ...evaluation, movePlayed: moveResult.san } })
      setError(null)
      setTimeout(() => dispatch({ type: 'advanced' }), 900)
    } catch {
      dispatch({ type: 'move-failed', payload: { fen: preMoveFen } })
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

function PositionAnalysisTab() {
  const [openings, setOpenings] = useState([])
  const [openingId, setOpeningId] = useState('')
  const [timeline, setTimeline] = useState([{ fen: START_FEN, moves: [] }])
  const [timelineIndex, setTimelineIndex] = useState(0)
  const [fenDraft, setFenDraft] = useState(START_FEN)
  const [flipped, setFlipped] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRepertoire()
      .then(data => {
        setOpenings(data)
        setOpeningId(data[0]?.id ?? '')
      })
      .catch(() => setError('Could not load your openings — please try again.'))
  }, [])

  const opening = openings.find(item => item.id === openingId)
  const currentPosition = timeline[timelineIndex] ?? timeline[0]
  const fen = currentPosition?.fen ?? START_FEN
  const moves = currentPosition?.moves ?? null
  const repertoireLegend = useMemo(() => {
    if (!opening) return 'Choose an opening to compare your moves with its repertoire.'
    if (moves === null) return 'Custom FEN: repertoire matching is unavailable until you return to the starting position.'
    if (moves.length === 0) return `Ready to identify the variation in ${opening.name}.`

    const matching = opening.lines.filter(line =>
      moves.length <= line.moves.length && moves.every((move, index) => stripSan(line.moves[index]) === stripSan(move))
    )
    if (matching.length === 1) return `Following: ${matching[0].label}`
    if (matching.length > 1) return `In repertoire: ${matching.length} candidate variations remain.`

    const closestLine = opening.lines
      .map(line => ({ line, prefix: line.moves.findIndex((move, index) => stripSan(move) !== stripSan(moves[index])) }))
      .map(item => ({ ...item, matched: item.prefix === -1 ? item.line.moves.length : item.prefix }))
      .sort((a, b) => b.matched - a.matched)[0]
    const deviationMove = moves[closestLine?.matched] ?? moves.at(-1)
    return closestLine
      ? `Deviation from ${closestLine.line.label} at ${deviationMove}.`
      : 'This move path is outside the selected repertoire.'
  }, [opening, moves])

  const advantageLabel = useMemo(() => {
    const evaluation = suggestion?.evaluation
    if (typeof evaluation !== 'number') return 'Ask the engine to evaluate the position.'
    if (Math.abs(evaluation) < 0.15) return 'Equal position'
    return evaluation > 0
      ? `White is better (+${evaluation.toFixed(2)})`
      : `Black is better (+${Math.abs(evaluation).toFixed(2)})`
  }, [suggestion])

  const resetTimeline = (nextFen, nextMoves) => {
    setTimeline([{ fen: nextFen, moves: nextMoves }])
    setTimelineIndex(0)
  }

  const appendPosition = (nextFen, san) => {
    setTimeline(previous => {
      const branch = previous.slice(0, timelineIndex + 1)
      const branchMoves = branch.at(-1)?.moves
      return [...branch, { fen: nextFen, moves: branchMoves === null ? null : [...branchMoves, san] }]
    })
    setTimelineIndex(index => index + 1)
  }

  const moveTimeline = (offset) => {
    const nextIndex = Math.max(0, Math.min(timeline.length - 1, timelineIndex + offset))
    setTimelineIndex(nextIndex)
    setFenDraft(timeline[nextIndex]?.fen ?? START_FEN)
    setSuggestion(null)
    setError(null)
  }

  const selectOpening = (nextOpeningId) => {
    setOpeningId(nextOpeningId)
    resetTimeline(START_FEN, [])
    setFenDraft(START_FEN)
    setSuggestion(null)
    setError(null)
  }

  const applyFen = () => {
    try {
      const normalizedFen = new Chess(fenDraft).fen()
      resetTimeline(normalizedFen, null)
      setFenDraft(normalizedFen)
      setSuggestion(null)
      setError(null)
    } catch {
      setError('That FEN is not a legal chess position.')
    }
  }

  const handleMove = (moveResult) => {
    appendPosition(moveResult.fen, moveResult.san)
    setFenDraft(moveResult.fen)
    setSuggestion(null)
    setError(null)
  }

  const findBestMove = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getEngineMove(fen)
      setSuggestion(result)
    } catch (err) {
      setError(err.message || 'Could not analyse this position — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const applySuggestion = () => {
    if (!suggestion?.fen) return
    appendPosition(suggestion.fen, suggestion.engineMove)
    setFenDraft(suggestion.fen)
    setSuggestion(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
      {error && <div role="alert" style={{ color: 'var(--red)' }}>{error}</div>}

      <div className="analysis-picker">
        <label htmlFor="analysis-opening">Opening</label>
        <select id="analysis-opening" aria-label="Opening" value={openingId} onChange={event => selectOpening(event.target.value)}>
          {openings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>

      <div className="analysis-workspace">
        <div className="analysis-board-wrap">
          <Board
            fen={fen}
            size={420}
            flipped={flipped}
            interactive
            onMove={handleMove}
            layers={{ attacks: false, coverage: false, targets: true, hanging: false, winning: false, selection: true }}
          />
        </div>
        <aside className="analysis-panel" aria-live="polite">
          <div className="analysis-panel-label">Repertoire</div>
          <div className="analysis-legend">{repertoireLegend}</div>
          <div className="analysis-panel-label" style={{ marginTop: 18 }}>Engine choices</div>
          {suggestion?.bestMoves?.length ? (
            <ol className="analysis-moves">
              {suggestion.bestMoves.map((move, index) => <li key={`${move}-${index}`}>{move}</li>)}
            </ol>
          ) : (
            <div className="analysis-empty">Ask the engine to see its three best moves.</div>
          )}
          <div className="analysis-panel-label" style={{ marginTop: 18 }}>Evaluation</div>
          <div className={`analysis-evaluation${suggestion?.evaluation > 0.14 ? ' white' : suggestion?.evaluation < -0.14 ? ' black' : ''}`}>
            {advantageLabel}
          </div>
        </aside>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => moveTimeline(-1)} disabled={timelineIndex === 0}>
          Previous
        </button>
        <button className="btn-ghost" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => moveTimeline(1)} disabled={timelineIndex === timeline.length - 1}>
          Next
        </button>
        <button className="btn-ghost" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => setFlipped(value => !value)}>
          Flip board
        </button>
        <button className="btn-green" style={{ width: 'auto', padding: '8px 12px' }} disabled={loading} onClick={findBestMove}>
          {loading ? 'Analysing...' : 'Find best move'}
        </button>
      </div>
      <div className="analysis-timeline-label">Position {timelineIndex + 1} of {timeline.length}</div>

      {suggestion?.engineMove && (
        <div style={{ textAlign: 'center' }}>
          <button className="btn-ghost" style={{ width: 'auto', padding: '6px 10px', marginTop: 6 }} onClick={applySuggestion}>
            Play best move
          </button>
        </div>
      )}
      {suggestion && !suggestion.engineMove && (
        <div style={{ color: 'var(--text3)' }}>Position status: {suggestion.status.replaceAll('_', ' ')}</div>
      )}

      <div style={{ width: 'min(100%, 560px)' }}>
        <label htmlFor="position-fen" style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 5 }}>Position FEN</label>
        <textarea
          id="position-fen"
          value={fenDraft}
          onChange={event => setFenDraft(event.target.value)}
          rows={2}
          style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <button className="btn-ghost" style={{ width: 'auto', padding: '6px 10px', marginTop: 6 }} onClick={applyFen}>
          Load FEN
        </button>
      </div>
    </div>
  )
}

export default function SparringMode() {
  const [tab, setTab] = useState('practice')

  return (
    <div>
      <div className="sparring-tabs" role="tablist" aria-label="Sparring views">
        <button className="sparring-tab" role="tab" aria-selected={tab === 'practice'} onClick={() => setTab('practice')}>Sparring</button>
        <button className="sparring-tab" role="tab" aria-selected={tab === 'analysis'} onClick={() => setTab('analysis')}>Position analysis</button>
      </div>
      {tab === 'practice' ? <PracticeTab /> : <PositionAnalysisTab />}
    </div>
  )
}
