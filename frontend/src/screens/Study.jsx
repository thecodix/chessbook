import { useState, useEffect, useRef, useCallback } from 'react'
import Board from '../components/Board'
import { OPENING_LIST, OPENINGS } from '../utils/repertoire'
import { buildHistory, fenToBoard, stripSan, START_FEN } from '../utils/chess'
import { getRepertoire, submitReview, getCatalog, getSelection, updateSelection } from '../utils/api'

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

function retentionColor(n) {
  if (n >= 80) return 'var(--green)'
  if (n >= 60) return 'var(--amber)'
  return 'var(--red)'
}

function changedSquares(prev, cur) {
  if (!prev || !cur) return []
  const sqs = []
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (prev[r][c] !== cur[r][c]) sqs.push([r, c])
  return sqs
}

// Convert API response to internal format
function apiToOpenings(apiData) {
  const openingsMap = {}
  const openingList = []
  for (const o of apiData) {
    const retention = o.lines.length
      ? Math.round(o.lines.reduce((s, l) => s + (l.retention ?? 50), 0) / o.lines.length)
      : 50
    openingsMap[o.id] = {
      name: o.name,
      color: o.color,
      description: o.description,
      retention,
      lines: o.lines.map(l => ({
        id: l.id,
        label: l.label,
        moves: l.moves,
        idea: l.idea,
        retention: l.retention ?? 50,
        intervalDays: l.intervalDays ?? 1,
        nextReview: l.nextReview,
      })),
    }
    openingList.push({ key: o.id, name: o.name, color: o.color, retention })
  }
  return { openingsMap, openingList }
}

function SidebarItem({ opening, active, onClick }) {
  return (
    <div className={`opening-item${active ? ' active' : ''}`} onClick={onClick}>
      <div className="oi-name">
        <span
          className="oi-dot"
          style={{ background: opening.color === 'white' ? '#ccc' : '#333', border: '1px solid #555' }}
        />
        {opening.name}
      </div>
      <div className="oi-meta">
        <span>{/* lines count hidden until loaded */}</span>
        <span style={{ color: retentionColor(opening.retention) }}>{opening.retention}%</span>
      </div>
    </div>
  )
}

const QUALITY_BTNS = [
  { label: 'Again', quality: 1, color: 'var(--red)',    bg: 'rgba(226,75,74,.12)',  border: 'rgba(226,75,74,.3)' },
  { label: 'Hard',  quality: 3, color: 'var(--amber)',  bg: 'rgba(255,181,0,.10)',  border: 'rgba(255,181,0,.3)' },
  { label: 'Good',  quality: 4, color: 'var(--green)',  bg: 'rgba(29,158,117,.12)', border: 'rgba(29,158,117,.3)' },
  { label: 'Easy',  quality: 5, color: 'var(--purple)', bg: 'rgba(160,70,210,.10)', border: 'rgba(160,70,210,.3)' },
]

function OpeningPicker({ catalog, initialSelection, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(initialSelection))
  const [saving, setSaving]     = useState(false)

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const save = async () => {
    setSaving(true)
    try {
      await onSave([...selected])
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const renderGroup = (color, label) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {catalog.filter(o => o.color === color).map(o => (
          <label
            key={o.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8,
              cursor: 'pointer',
              background: selected.has(o.id) ? 'var(--green-bg)' : 'var(--bg2)',
              border: `0.5px solid ${selected.has(o.id) ? 'var(--green-border)' : 'var(--border)'}`,
            }}
          >
            <input
              type='checkbox'
              checked={selected.has(o.id)}
              onChange={() => toggle(o.id)}
              style={{ marginTop: 3 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: selected.has(o.id) ? 'var(--green)' : 'var(--text1)' }}>
                {o.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>
                {o.lines.length} line{o.lines.length !== 1 ? 's' : ''}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <div className="solved-backdrop" onClick={onClose}>
      <div
        className="solved-card"
        onClick={e => e.stopPropagation()}
        style={{ width: 420, textAlign: 'left', padding: '22px 24px' }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Choose your openings</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
          Pick one or more openings for each color. Only selected openings show up in your repertoire.
        </div>
        <div style={{ maxHeight: '50vh', overflowY: 'auto', paddingRight: 4 }}>
          {renderGroup('white', 'White')}
          {renderGroup('black', 'Black')}
        </div>
        <div className="solved-actions" style={{ marginTop: 6 }}>
          <button className="btn-ghost" style={{ width: 'auto', padding: '8px 16px' }} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-green"
            style={{ width: 'auto', padding: '8px 18px' }}
            disabled={saving || selected.size === 0}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Study({ initialTarget = null }) {
  // Openings state — initialized from static, replaced by API when available
  const [openingList, setOpeningList] = useState(
    OPENING_LIST.map(o => ({ ...o, retention: OPENINGS[o.key]?.retention ?? 50 }))
  )
  const [openingsMap, setOpeningsMap] = useState(OPENINGS)
  const [apiLoaded, setApiLoaded] = useState(false)

  const [selectedKey, setSelectedKey]         = useState(OPENING_LIST[0].key)
  const [selectedLineIdx, setSelectedLineIdx] = useState(0)
  const [mode, setMode]                       = useState('study')
  const [step, setStep]                       = useState(0)
  const [history, setHistory]                 = useState([])
  const [feedback, setFeedback]               = useState(null)
  const [done, setDone]                       = useState(false)
  const [reviewResult, setReviewResult]       = useState(null) // { intervalDays, nextReview }
  const [reviewing, setReviewing]             = useState(false)
  const [hintLevel, setHintLevel]             = useState(0) // 0 = none, 1 = source square, 2 = full move

  const [showPicker, setShowPicker]           = useState(false)
  const [catalog, setCatalog]                 = useState(null)
  const [selection, setSelection]             = useState(null) // openingIds currently selected

  const boardWrapRef = useRef(null)
  const boardSize    = useBoardSize(boardWrapRef)

  const loadRepertoire = useCallback(() => {
    return getRepertoire()
      .then(data => {
        const { openingsMap: om, openingList: ol } = apiToOpenings(data)
        setOpeningsMap(om)
        setOpeningList(ol)
        if (ol.length) setSelectedKey(prev => (om[prev] ? prev : ol[0].key))
        setApiLoaded(true)
      })
      .catch(console.warn)
  }, [])

  const openPicker = () => {
    Promise.all([getCatalog(), getSelection()])
      .then(([catalogData, selectionData]) => {
        setCatalog(catalogData)
        setSelection(selectionData.openingIds)
        setShowPicker(true)
      })
      .catch(console.warn)
  }

  const saveSelection = async (openingIds) => {
    await updateSelection(openingIds)
    await loadRepertoire()
  }

  // Load from API
  useEffect(() => {
    loadRepertoire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const opening     = openingsMap[selectedKey]
  const line        = opening?.lines?.[selectedLineIdx]
  const totalMoves  = line?.moves?.length ?? 0
  const playerColor = opening?.color || 'white'
  const isPlayerTurn = mode === 'drill' && !done && !feedback &&
    (step % 2 === 0) === (playerColor === 'white')

  useEffect(() => {
    if (!line) return
    setHistory(buildHistory(line.moves))
    setStep(0)
    setFeedback(null)
    setDone(false)
    setReviewResult(null)
    setMode('study')
  }, [selectedKey, selectedLineIdx])

  // Auto-select + jump into drill mode for a due line handed down from the
  // Dashboard's "Start review session" button.
  useEffect(() => {
    if (!initialTarget || !apiLoaded) return
    const op = openingsMap[initialTarget.openingId]
    const idx = op?.lines?.findIndex(l => l.id === initialTarget.lineId) ?? -1
    if (idx === -1) return
    setSelectedKey(initialTarget.openingId)
    setSelectedLineIdx(idx)
    setMode('drill')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget, apiLoaded])

  // Opponent auto-response
  useEffect(() => {
    if (mode !== 'drill' || done || feedback || !line || step >= totalMoves) return
    if (!isPlayerTurn) {
      const t = setTimeout(() => setStep(s => s + 1), 700)
      return () => clearTimeout(t)
    }
  }, [step, isPlayerTurn, mode, done, feedback, line, totalMoves])

  // Every new move to guess starts with hints hidden again.
  useEffect(() => { setHintLevel(0) }, [step, mode, selectedKey, selectedLineIdx])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (mode === 'study') {
        if (e.key === 'ArrowRight') setStep(s => Math.min(totalMoves, s + 1))
        if (e.key === 'ArrowLeft')  setStep(s => Math.max(0, s - 1))
      }
      if (e.key === 'Escape' && mode === 'drill') enterStudy()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, totalMoves])

  const handleMove = useCallback((moveResult) => {
    if (!isPlayerTurn || step >= totalMoves) return
    const expected = line?.moves?.[step]
    const correct  = expected && stripSan(moveResult.san) === stripSan(expected)

    if (correct) {
      setFeedback('correct')
      setTimeout(() => {
        setFeedback(null)
        const nextStep = step + 1
        if (nextStep >= totalMoves) setDone(true)
        else setStep(nextStep)
      }, 500)
    } else {
      setFeedback('wrong')
      setTimeout(() => setFeedback(null), 900)
    }
  }, [line, step, totalMoves, isPlayerTurn])

  const handleRate = async (quality) => {
    if (reviewing) return
    setReviewing(true)
    try {
      if (apiLoaded && line?.id) {
        const res = await submitReview(selectedKey, line.id, quality)
        setReviewResult({ intervalDays: res.intervalDays, nextReview: res.nextReview })
        // Update local retention
        setOpeningsMap(prev => {
          const updated = { ...prev }
          const op = { ...updated[selectedKey] }
          const lines = [...op.lines]
          lines[selectedLineIdx] = { ...lines[selectedLineIdx], retention: res.retention }
          op.lines = lines
          op.retention = Math.round(lines.reduce((s, l) => s + (l.retention ?? 50), 0) / lines.length)
          updated[selectedKey] = op
          return updated
        })
      } else {
        setReviewResult({ intervalDays: quality >= 3 ? 6 : 1, nextReview: null })
      }
    } catch (e) {
      console.warn('submitReview failed', e)
      setReviewResult({ intervalDays: null, nextReview: null })
    } finally {
      setReviewing(false)
    }
  }

  const enterDrill = () => { setStep(0); setFeedback(null); setDone(false); setReviewResult(null); setMode('drill') }
  const enterStudy = () => { setStep(0); setFeedback(null); setDone(false); setReviewResult(null); setMode('study') }
  const selectOpening = (key) => { setSelectedKey(key); setSelectedLineIdx(0) }

  const fen          = history[step] || START_FEN
  const board        = fenToBoard(fen)
  const prevBoard    = history[step - 1] ? fenToBoard(history[step - 1]) : null
  const highlightSqs = step > 0 ? changedSquares(prevBoard, board) : []

  // Practice hints — diff the current position against the position after
  // the expected move to find which square(s) it touches. Level 1 reveals
  // just the source square (which piece to move); level 2 reveals the
  // whole move.
  const expectedBoard = isPlayerTurn && history[step + 1] ? fenToBoard(history[step + 1]) : null
  const hintMoveSqs   = expectedBoard ? changedSquares(board, expectedBoard) : []
  const hintFromSqs   = hintMoveSqs.filter(([r, c]) => board[r][c] && !expectedBoard[r][c])
  const hintSqs       = hintLevel === 2 ? hintMoveSqs : hintLevel === 1 ? hintFromSqs : []

  const prevMove  = step > 0 ? line?.moves[step - 1] : null
  const moveLabel = prevMove
    ? `${Math.floor((step - 1) / 2) + 1}${(step - 1) % 2 === 0 ? '.' : '…'} ${prevMove}`
    : 'Start'

  let statusText = '', statusColor = 'var(--text4)'
  if (mode === 'study') {
    statusText = step === 0 ? 'Study mode — click a move or use ← →' : `Move ${step} / ${totalMoves}`
  } else if (done) {
    statusText = 'Line complete!'; statusColor = 'var(--green)'
  } else if (feedback === 'correct') {
    statusText = 'Correct!'; statusColor = 'var(--green)'
  } else if (feedback === 'wrong') {
    statusText = `Wrong — the move is ${line?.moves[step]}`; statusColor = 'var(--red)'
  } else if (hintLevel === 2) {
    statusText = `Hint: play ${line?.moves[step]}`; statusColor = 'var(--amber)'
  } else if (hintLevel === 1) {
    statusText = 'Hint: move the highlighted piece'; statusColor = 'var(--amber)'
  } else if (isPlayerTurn) {
    statusText = `Your turn (${playerColor})`; statusColor = 'var(--text2)'
  } else {
    statusText = 'Opponent responding…'
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <div className="sidebar" data-tour="opening-sidebar">
        <div className="sidebar-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Openings</span>
          <button
            onClick={openPicker}
            title="Choose which openings appear in your repertoire"
            style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer',
              background: 'var(--bg2)', border: '0.5px solid var(--border)', color: 'var(--text3)',
            }}
          >
            Manage
          </button>
        </div>
        {apiLoaded && openingList.length === 0 ? (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text4)', lineHeight: 1.6 }}>
            No openings selected yet. Click <strong>Manage</strong> to add some.
          </div>
        ) : (
          <>
            <div className="sidebar-section">White</div>
            {openingList.filter(o => openingsMap[o.key]?.color === 'white').map(o => (
              <SidebarItem key={o.key} opening={{ ...o, ...openingsMap[o.key] }} active={selectedKey === o.key} onClick={() => selectOpening(o.key)} />
            ))}
            <div className="sidebar-section">Black</div>
            {openingList.filter(o => openingsMap[o.key]?.color === 'black').map(o => (
              <SidebarItem key={o.key} opening={{ ...o, ...openingsMap[o.key] }} active={selectedKey === o.key} onClick={() => selectOpening(o.key)} />
            ))}
          </>
        )}
      </div>

      {showPicker && catalog && selection && (
        <OpeningPicker
          catalog={catalog}
          initialSelection={selection}
          onSave={saveSelection}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* ── Board area ── */}
      <div className="board-area" data-tour="study-board" style={{ padding: 12, gap: 10 }}>
        <div
          ref={boardWrapRef}
          style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Board
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

        {/* Drill progress bar */}
        {mode === 'drill' && (
          <div style={{ width: '100%', maxWidth: boardSize }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text4)', marginBottom: 4 }}>
              <span>Progress</span>
              <span>{step} / {totalMoves}</span>
            </div>
            <div className="pbar-track" style={{ height: 5 }}>
              <div
                className="pbar-fill"
                style={{
                  width: `${totalMoves ? (step / totalMoves) * 100 : 0}%`,
                  background: done ? 'var(--green)' : 'var(--green-dim)',
                  transition: 'width .3s',
                }}
              />
            </div>
          </div>
        )}

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: boardSize }}>
          <div className="board-controls" style={{ flex: 1 }}>
            <button className="bc-btn" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={mode === 'drill'}>‹</button>
            <div className="mv-display">{moveLabel}</div>
            <button className="bc-btn" onClick={() => setStep(s => Math.min(totalMoves, s + 1))} disabled={mode === 'drill'}>›</button>
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
            onClick={mode === 'study' ? enterDrill : enterStudy}
            data-tour="drill-toggle"
            style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
              cursor: 'pointer', fontWeight: 500, transition: 'all .15s',
              background: mode === 'drill' ? 'var(--green-bg)' : 'var(--bg2)',
              border: `0.5px solid ${mode === 'drill' ? 'var(--green-border)' : 'var(--border)'}`,
              color: mode === 'drill' ? 'var(--green)' : 'var(--text2)',
            }}
          >
            {mode === 'study' ? '▶  Drill' : '←  Study'}
          </button>
        </div>

        <div style={{ fontSize: 13, color: statusColor, minHeight: 20, textAlign: 'center' }}>
          {statusText}
        </div>

        {/* SM-2 rating buttons — shown when drill is complete and no review result yet */}
        {done && mode === 'drill' && !reviewResult && (
          <div data-tour="quality-buttons" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%', maxWidth: boardSize }}>
            <div style={{ fontSize: 12, color: 'var(--text4)' }}>How well did you remember this line?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {QUALITY_BTNS.map(btn => (
                <button
                  key={btn.label}
                  disabled={reviewing}
                  onClick={() => handleRate(btn.quality)}
                  style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
                    cursor: 'pointer', fontWeight: 500,
                    color: btn.color, background: btn.bg, border: `0.5px solid ${btn.border}`,
                    opacity: reviewing ? 0.5 : 1,
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Review result */}
        {reviewResult && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', maxWidth: boardSize }}>
            <div style={{ fontSize: 13, color: 'var(--green)' }}>
              {reviewResult.intervalDays != null
                ? `Next review in ${reviewResult.intervalDays} day${reviewResult.intervalDays !== 1 ? 's' : ''}`
                : 'Review saved'}
              {reviewResult.nextReview ? ` · ${reviewResult.nextReview}` : ''}
            </div>
            <button className="btn-green" style={{ width: 200 }} onClick={enterDrill}>
              Drill again
            </button>
          </div>
        )}

        {done && mode === 'drill' && !reviewResult && (
          <button className="btn-green" style={{ width: 200 }} onClick={enterDrill}>
            Drill again
          </button>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="rpanel">
        <div className="rps">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="rpl" style={{ marginBottom: 0 }}>{opening?.name}</div>
            <span className={`tag ${opening?.color === 'white' ? 'tag-green' : 'tag-amber'}`}>{opening?.color}</span>
          </div>

          {/* Line tabs */}
          {opening && opening.lines?.length > 1 && (
            <div data-tour="line-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
              {opening.lines.map((l, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedLineIdx(i)}
                  style={{
                    textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12,
                    fontFamily: 'inherit', cursor: 'pointer',
                    background: selectedLineIdx === i ? 'var(--green-bg)' : 'transparent',
                    border: `0.5px solid ${selectedLineIdx === i ? 'var(--green-border)' : 'transparent'}`,
                    color: selectedLineIdx === i ? 'var(--green)' : 'var(--text3)',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {/* Move list */}
          <div className="varpath" data-tour="move-list">
            {line?.moves?.map((mv, i) => (
              <span
                key={i}
                className={`vpm${i === step - 1 ? ' cur' : ''}`}
                onClick={() => { if (mode === 'study') setStep(i + 1) }}
                style={{ cursor: mode === 'study' ? 'pointer' : 'default' }}
              >
                {i % 2 === 0 && (
                  <span style={{ color: 'var(--text4)', marginRight: 2 }}>{Math.floor(i / 2) + 1}.</span>
                )}
                {mv}{' '}
              </span>
            ))}
          </div>
        </div>

        {line?.idea && (
          <div className="rps" data-tour="idea-panel">
            <div className="rpl">Idea</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{line.idea}</div>
          </div>
        )}

        {opening?.description && (
          <div className="rps">
            <div className="rpl">About</div>
            <div style={{ fontSize: 12, color: 'var(--text4)', lineHeight: 1.7 }}>{opening.description}</div>
          </div>
        )}

        {/* Per-line SM-2 stats */}
        {line && (
          <div className="rps">
            <div className="rpl">Schedule</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text4)' }}>
              {line.nextReview && <div>Next review: <span style={{ color: 'var(--text2)' }}>{line.nextReview}</span></div>}
              {line.intervalDays != null && <div>Interval: <span style={{ color: 'var(--text2)' }}>{line.intervalDays}d</span></div>}
            </div>
          </div>
        )}

        <div className="rps" style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text4)', marginBottom: 5 }}>
            <span>Retention</span>
            <span style={{ color: retentionColor(opening?.retention) }}>{opening?.retention}%</span>
          </div>
          <div className="pbar-track">
            <div className="pbar-fill" style={{ width: `${opening?.retention ?? 0}%`, background: retentionColor(opening?.retention) }} />
          </div>
        </div>
      </div>

    </div>
  )
}
