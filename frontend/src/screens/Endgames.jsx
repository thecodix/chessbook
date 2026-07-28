import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Board from '../components/Board'
import { buildHistoryFromUci, fenToBoard, rcToSquare, START_FEN } from '../utils/chess'
import { getEndgamesProgress, updateEndgameProgress } from '../utils/api'

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

function changedSquares(prev, cur) {
  if (!prev || !cur) return []
  const sqs = []
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (prev[r][c] !== cur[r][c]) sqs.push([r, c])
  return sqs
}

function ChapterItem({ chapter, active, solvedCount, onClick }) {
  return (
    <div className={`opening-item${active ? ' active' : ''}`} onClick={onClick}>
      <div className="oi-name">{chapter.title}</div>
      <div className="oi-meta">
        <span style={{ color: solvedCount === chapter.puzzles.length ? 'var(--green)' : 'var(--text4)' }}>
          {solvedCount} / {chapter.puzzles.length}
        </span>
      </div>
    </div>
  )
}

const CONFETTI_EMOJI = ['🎉', '✨', '⭐', '🏆', '♟️']

// Purely decorative burst of falling emoji, randomized once per mount so it
// never repeats identically — sits behind the card content via z-index/overflow.
function ConfettiBurst() {
  const pieces = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.1 + Math.random() * 0.8,
      size: 14 + Math.random() * 14,
      emoji: CONFETTI_EMOJI[i % CONFETTI_EMOJI.length],
    }))
  ), [])
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {pieces.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`, fontSize: p.size,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}

// Friendly "you solved it" popup shown when a puzzle is completed — offers a
// clear, single next action instead of relying on the small inline status text.
function SolvedModal({ puzzle, onNext, onClose }) {
  return (
    <div className="solved-backdrop" onClick={onClose}>
      <div className="solved-card" onClick={e => e.stopPropagation()}>
        <ConfettiBurst />
        <div className="solved-emoji">🎉</div>
        <div className="solved-title">Solved!</div>
        <div className="solved-meta">
          {puzzle ? `${puzzle.type} · Puzzle ${puzzle.puzzle_id}` : ''}
        </div>
        <div className="solved-actions">
          <button className="btn-ghost" style={{ width: 'auto', padding: '8px 16px' }} onClick={onClose}>
            Stay here
          </button>
          <button className="btn-green" style={{ width: 'auto', padding: '8px 18px' }} onClick={onNext} autoFocus>
            Next endgame ›
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Endgames() {
  const [data, setData]           = useState(null)
  const [progress, setProgress]   = useState({}) // puzzleId -> { solved, attempts }
  const [chapterIdx, setChapterIdx] = useState(0)
  const [puzzleIdx, setPuzzleIdx]   = useState(0)
  const [step, setStep]           = useState(0)
  const [feedback, setFeedback]   = useState(null)
  const [done, setDone]           = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  // Whether the "Solved!" celebration popup is currently visible. Separate
  // from `done` so dismissing the popup ("Stay here") doesn't lose the
  // solved status shown in the inline status line.
  const [celebrate, setCelebrate] = useState(false)
  // Bumped whenever the board's position is *reset* rather than advanced by
  // a real move (switching puzzle, retrying). Used to force <Board> to
  // remount so its slide-animation logic never treats a reset (e.g. retry
  // jumping back from the mate position to the start) as a forward move —
  // which would otherwise animate the piece sliding backwards and spoil it.
  const [resetToken, setResetToken] = useState(0)
  // Set when loading or saving progress against the backend ultimately
  // fails (e.g. the Render free-tier backend is unreachable even after
  // retries) — surfaced to the user instead of being silently swallowed,
  // since a swallowed save failure looks like "my progress got lost" the
  // next time the page loads.
  const [progressError, setProgressError] = useState(null)

  const boardWrapRef = useRef(null)
  const boardSize    = useBoardSize(boardWrapRef)

  useEffect(() => {
    fetch('/endgames.json').then(r => r.json()).then(setData).catch(console.warn)
  }, [])

  useEffect(() => {
    getEndgamesProgress()
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.puzzleId] = { solved: r.solved, attempts: r.attempts } })
        setProgress(map)
        setProgressError(null)
      })
      .catch(err => setProgressError(`Couldn't load your saved progress: ${err.message}`))
  }, [])

  const chapter = data?.chapters?.[chapterIdx]
  const puzzle  = chapter?.puzzles?.[puzzleIdx]
  const solutionMoves = useMemo(() => puzzle?.moves?.[0] ?? [], [puzzle])
  const totalMoves = solutionMoves.length

  const history = useMemo(() => (
    puzzle ? buildHistoryFromUci(puzzle.fen, solutionMoves) : [START_FEN]
  ), [puzzle, solutionMoves])

  // Reset solving state whenever the selected puzzle changes
  useEffect(() => {
    setStep(0); setFeedback(null); setDone(false); setHintLevel(0); setCelebrate(false)
    setResetToken(t => t + 1)
  }, [chapterIdx, puzzleIdx])

  useEffect(() => { setHintLevel(0) }, [step])

  const isPlayerTurn = !!puzzle && !done && !feedback && step % 2 === 0

  // Opponent's forced reply auto-plays after a short delay
  useEffect(() => {
    if (!puzzle || done || feedback) return
    if (step > 0 && step < totalMoves && step % 2 === 1) {
      const t = setTimeout(() => setStep(s => s + 1), 600)
      return () => clearTimeout(t)
    }
  }, [step, puzzle, done, feedback, totalMoves])

  const markProgress = useCallback((puzzleId, solved) => {
    updateEndgameProgress(puzzleId, solved)
      .then(res => {
        setProgress(p => ({ ...p, [puzzleId]: { solved: res.solved, attempts: res.attempts } }))
        setProgressError(null)
      })
      .catch(err => setProgressError(`Couldn't save your progress — it wasn't recorded: ${err.message}`))
  }, [])

  const handleMove = useCallback((moveResult) => {
    if (!isPlayerTurn || !puzzle || step >= totalMoves) return
    const expected          = solutionMoves[step]
    const expectedFrom       = expected.slice(0, 2)
    const expectedTo         = expected.slice(2, 4)
    const expectedPromotion  = expected.length > 4 ? expected.slice(4) : null
    const playedFrom         = rcToSquare(moveResult.from[0], moveResult.from[1])
    const playedTo           = rcToSquare(moveResult.to[0], moveResult.to[1])
    const correct            = playedFrom === expectedFrom && playedTo === expectedTo
      && (moveResult.promotion || null) === expectedPromotion

    if (correct) {
      // Update the board to reflect the move immediately, then show the
      // correct/solved feedback on top of the already-updated position.
      const nextStep = step + 1
      setStep(nextStep)
      setFeedback('correct')
      setTimeout(() => {
        setFeedback(null)
        if (nextStep >= totalMoves) {
          setDone(true)
          setCelebrate(true)
          markProgress(puzzle.puzzle_id, true)
        }
      }, 400)
    } else {
      setFeedback('wrong')
      markProgress(puzzle.puzzle_id, false)
      setTimeout(() => setFeedback(null), 900)
    }
  }, [isPlayerTurn, puzzle, step, totalMoves, solutionMoves, markProgress])

  const selectChapter = (idx) => { setChapterIdx(idx); setPuzzleIdx(0) }

  const nextPuzzle = () => {
    if (!chapter || !data) return
    if (puzzleIdx + 1 < chapter.puzzles.length) {
      setPuzzleIdx(puzzleIdx + 1)
    } else if (chapterIdx + 1 < data.chapters.length) {
      setChapterIdx(chapterIdx + 1)
      setPuzzleIdx(0)
    }
  }

  const retryPuzzle = () => {
    setStep(0); setFeedback(null); setDone(false); setHintLevel(0); setCelebrate(false)
    setResetToken(t => t + 1)
  }

  const fen       = history[step] || puzzle?.fen || START_FEN
  const board     = fenToBoard(fen)
  const prevBoard = step > 0 && history[step - 1] ? fenToBoard(history[step - 1]) : null
  const highlightSqs = step > 0 ? changedSquares(prevBoard, board) : []

  const expectedBoard = isPlayerTurn && history[step + 1] ? fenToBoard(history[step + 1]) : null
  const hintMoveSqs   = expectedBoard ? changedSquares(board, expectedBoard) : []
  const hintFromSqs   = hintMoveSqs.filter(([r, c]) => board[r][c] && !expectedBoard[r][c])
  const hintSqs       = hintLevel === 2 ? hintMoveSqs : hintLevel === 1 ? hintFromSqs : []

  // The solving side is fixed by the puzzle's starting position — derive it
  // once from `puzzle.fen`, not from the current step's fen, which flips
  // side-to-move after every single ply and would otherwise flip the board
  // on every move.
  const playerColor = puzzle ? (puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black') : 'white'

  let statusText = '', statusColor = 'var(--text4)'
  if (!puzzle) {
    statusText = 'Loading endgames…'
  } else if (done) {
    statusText = 'Solved! 🎉'; statusColor = 'var(--green)'
  } else if (feedback === 'correct') {
    statusText = 'Correct!'; statusColor = 'var(--green)'
  } else if (feedback === 'wrong') {
    statusText = 'Not quite — try again'; statusColor = 'var(--red)'
  } else if (hintLevel === 2) {
    statusText = `Hint: play ${solutionMoves[step]?.slice(0, 2)}-${solutionMoves[step]?.slice(2, 4)}`; statusColor = 'var(--amber)'
  } else if (hintLevel === 1) {
    statusText = 'Hint: move the highlighted piece'; statusColor = 'var(--amber)'
  } else if (isPlayerTurn) {
    statusText = `${puzzle.type} — your move (${playerColor})`; statusColor = 'var(--text2)'
  } else {
    statusText = 'Opponent responding…'
  }

  const chapterSolvedCounts = useMemo(() => {
    if (!data) return []
    return data.chapters.map(c => c.puzzles.filter(p => progress[p.puzzle_id]?.solved).length)
  }, [data, progress])

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {celebrate && (
        <SolvedModal
          puzzle={puzzle}
          onNext={() => { setCelebrate(false); nextPuzzle() }}
          onClose={() => setCelebrate(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className="sidebar">
        <div className="sidebar-head">
          <span style={{ fontSize: 13, fontWeight: 500 }}>Lichess Endgames</span>
        </div>
        <div className="sidebar-section">Chapters</div>
        {data?.chapters?.map((c, idx) => (
          <ChapterItem
            key={c.title}
            chapter={c}
            active={chapterIdx === idx}
            solvedCount={chapterSolvedCounts[idx] ?? 0}
            onClick={() => selectChapter(idx)}
          />
        ))}
      </div>

      {/* ── Board area ── */}
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

        {/* Puzzle number picker for the current chapter */}
        {chapter && (
          <div className="puzzle-grid scroll-region" style={{ width: '100%', maxWidth: boardSize }}>
            {chapter.puzzles.map((p, idx) => {
              const solved = !!progress[p.puzzle_id]?.solved
              return (
                <div
                  key={p.puzzle_id}
                  className={`puzzle-cell${solved ? ' solved' : ''}${idx === puzzleIdx ? ' active' : ''}`}
                  title={`Puzzle ${p.puzzle_id}`}
                  onClick={() => setPuzzleIdx(idx)}
                >
                  {idx + 1}
                </div>
              )
            })}
          </div>
        )}

        <div
          ref={boardWrapRef}
          style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Board
            key={`${puzzle?.puzzle_id ?? 'none'}-${resetToken}`}
            fen={fen}
            size={boardSize}
            flipped={playerColor === 'black'}
            highlightSqs={highlightSqs}
            hintSqs={hintSqs}
            onMove={handleMove}
            interactive={isPlayerTurn}
            layers={{ attacks: false, coverage: false, targets: true, hanging: false, winning: false, selection: true }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: boardSize }}>
          <div className="board-controls" style={{ flex: 1 }}>
            <span className="mv-display">
              {puzzle ? `Puzzle ${puzzle.puzzle_id} · ${step} / ${totalMoves}` : ''}
            </span>
          </div>

          {isPlayerTurn && hintLevel < 2 && (
            <button
              onClick={() => setHintLevel(h => Math.min(2, h + 1))}
              title={hintLevel === 0 ? 'Reveal which piece to move' : 'Reveal the full move'}
              style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
                cursor: 'pointer', fontWeight: 500,
                background: 'rgba(239,159,39,.10)', border: '0.5px solid rgba(239,159,39,.3)', color: 'var(--amber)',
              }}
            >
              💡 {hintLevel === 0 ? 'Hint' : 'Reveal move'}
            </button>
          )}

          <button
            onClick={retryPuzzle}
            style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
              cursor: 'pointer', fontWeight: 500,
              background: 'var(--bg2)', border: '0.5px solid var(--border)', color: 'var(--text2)',
            }}
          >
            ↺ Retry
          </button>

          <button
            onClick={nextPuzzle}
            style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
              cursor: 'pointer', fontWeight: 500,
              background: done ? 'var(--green-bg)' : 'var(--bg2)',
              border: `0.5px solid ${done ? 'var(--green-border)' : 'var(--border)'}`,
              color: done ? 'var(--green)' : 'var(--text2)',
            }}
          >
            Next ›
          </button>
        </div>

        <div style={{ fontSize: 13, color: statusColor, minHeight: 20, textAlign: 'center' }}>
          {statusText}
        </div>
      </div>
    </div>
  )
}
