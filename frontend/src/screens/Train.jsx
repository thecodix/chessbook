import { useState, useEffect, useCallback, useRef } from 'react'
import Board from '../components/Board'
import { OPENINGS } from '../utils/repertoire'
import { buildHistory, fenToBoard, START_FEN } from '../utils/chess'

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

export default function Train({ drillTarget, onBack }) {
  const { openingKey, lineIdx } = drillTarget
  const opening = OPENINGS[openingKey]
  const line = opening?.lines[lineIdx]

  const [history, setHistory] = useState([])
  const [step, setStep] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [done, setDone] = useState(false)

  const boardWrapRef = useRef(null)
  const boardSize = useBoardSize(boardWrapRef)

  const playerColor = opening?.color || 'white'
  const isPlayerTurn = (step % 2 === 0) === (playerColor === 'white')

  useEffect(() => {
    if (!line) return
    setHistory(buildHistory(line.moves))
    setStep(0)
    setFeedback(null)
    setDone(false)
  }, [openingKey, lineIdx])

  useEffect(() => {
    if (done || feedback || !line || step >= line.moves.length) return
    if (!isPlayerTurn) {
      const t = setTimeout(() => setStep(s => s + 1), 700)
      return () => clearTimeout(t)
    }
  }, [step, isPlayerTurn, done, feedback, line])

  const handleMove = useCallback((fromR, fromC, toR, toC) => {
    if (!line || done || feedback || !isPlayerTurn) return
    if (step >= line.moves.length) return

    const cur = history[step]
    const next = history[step + 1]
    if (!next) return

    const piece = cur[fromR][fromC]
    const matchesDest = next[toR][toC] === piece
    const srcCleared = next[fromR][fromC] === null || (fromR === toR && fromC === toC)

    if (piece && matchesDest && (srcCleared || fromR !== toR || fromC !== toC)) {
      setFeedback('correct')
      setTimeout(() => {
        setFeedback(null)
        const nextStep = step + 1
        if (nextStep >= line.moves.length) setDone(true)
        else setStep(nextStep)
      }, 500)
    } else {
      setFeedback('wrong')
      setTimeout(() => setFeedback(null), 900)
    }
  }, [history, step, line, done, feedback, isPlayerTurn])

  if (!line) return <div style={{ padding: 20 }}>Opening not found.</div>

  const board = history[step] || fenToBoard(START_FEN)
  const prevMove = step > 0 ? line.moves[step - 1] : null
  const moveLabel = prevMove
    ? `${Math.floor((step - 1) / 2) + 1}${(step - 1) % 2 === 0 ? '.' : '…'} ${prevMove}`
    : 'Start'

  const statusText = done
    ? 'Line complete!'
    : feedback === 'correct' ? 'Correct!'
    : feedback === 'wrong' ? `Wrong — play ${line.moves[step]}`
    : isPlayerTurn ? `Your move (${playerColor})`
    : 'Opponent is responding…'

  const statusColor = (done || feedback === 'correct') ? 'var(--green)'
    : feedback === 'wrong' ? 'var(--red)'
    : 'var(--text3)'

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div className="board-area" style={{ padding: 12, gap: 8 }}>
        {/* Fills remaining vertical space; ResizeObserver drives board size */}
        <div
          ref={boardWrapRef}
          style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Board
            board={board}
            size={boardSize}
            flipped={playerColor === 'black'}
            onMove={handleMove}
            interactive={isPlayerTurn && !done && !feedback}
            layers={{ attacks: false, coverage: false, targets: false, hanging: false, winning: false, selection: true }}
          />
        </div>

        <div className="board-controls">
          <button className="bc-btn" onClick={() => setStep(s => Math.max(0, s - 1))}>‹</button>
          <div className="mv-display">{moveLabel}</div>
          <button className="bc-btn" onClick={() => setStep(s => Math.min(line.moves.length, s + 1))}>›</button>
        </div>

        <div style={{ fontSize: 13, color: statusColor, minHeight: 20, textAlign: 'center' }}>
          {statusText}
        </div>

        {done && (
          <button
            className="btn-green"
            style={{ width: 200 }}
            onClick={() => { setStep(0); setDone(false); setFeedback(null) }}
          >
            Drill again
          </button>
        )}
      </div>

      <div className="rpanel">
        <div className="rps">
          <div className="rpl">{opening.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>{line.label}</div>
          <div className="varpath">
            {line.moves.map((mv, i) => (
              <span
                key={i}
                className={`vpm${i === step - 1 ? ' cur' : ''}`}
                onClick={() => setStep(i + 1)}
              >
                {i % 2 === 0 && (
                  <span style={{ color: 'var(--text4)', marginRight: 2 }}>{Math.floor(i / 2) + 1}.</span>
                )}
                {mv}{' '}
              </span>
            ))}
          </div>
        </div>

        <div className="rps">
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Move {step} / {line.moves.length}
          </div>
        </div>

        <div style={{ padding: '10px 12px', marginTop: 'auto' }}>
          <button className="btn-ghost" onClick={onBack}>← Back to repertoire</button>
        </div>
      </div>
    </div>
  )
}
