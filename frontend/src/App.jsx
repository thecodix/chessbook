import { useState, useEffect } from 'react'
import Dashboard  from './screens/Dashboard'
import Study      from './screens/Study'
import Problems   from './screens/Problems'
import Endgames   from './screens/Endgames'
import Import     from './screens/Import'
import SparringMode from './screens/SparringMode'
import PortalChess   from './screens/PortalChess'
import PortalChessGM from './screens/PortalChessGM'
import Compendium    from './screens/Compendium'
import Login      from './screens/Login'
import Tour       from './components/Tour'
import PieceStylePicker from './components/PieceStylePicker'
import { getMe, clearToken, updateRating } from './utils/api'
import { TOUR_STEPS } from './utils/tourSteps'
import './app.css'

const TOUR_DONE_KEY = 'chessbook_tour_done'

const SCREENS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'sparring',   label: 'Sparring' },
  { id: 'problems',   label: 'Problems' },
  { id: 'endgames',   label: 'Endgames' },
  { id: 'import',     label: 'Import games' },
  { id: 'portalchess',   label: 'Portal Chess' },
  { id: 'portalchess-gm', label: 'Grandes Maestros' },
  { id: 'compendium', label: 'Compendio' },
]

function RatingEditor({ user, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(user.platformRating ?? 1500)
  const [saving,  setSaving]  = useState(false)

  if (!editing) {
    return (
      <div
        onClick={() => { setValue(user.platformRating ?? 1500); setEditing(true) }}
        style={{ fontSize: 11, color: 'var(--text4)', cursor: 'pointer' }}
        title="Click to update your rating"
      >
        {user.platformRating ? `${user.platformRating} rated` : 'set rating'}
      </div>
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await updateRating(Number(value))
      onUpdated(updated)
      setEditing(false)
    } catch (e) {
      console.warn('Failed to update rating', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        min={100}
        max={3000}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus
        style={{
          width: 60, fontSize: 11, padding: '2px 5px', borderRadius: 5,
          background: 'var(--bg2)', border: '0.5px solid var(--border)', color: 'var(--text1)',
        }}
      />
      <button
        onClick={save}
        disabled={saving}
        style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
          background: 'var(--green-bg)', border: '0.5px solid var(--green-border)', color: 'var(--green)',
        }}
      >
        {saving ? '…' : 'Save'}
      </button>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState('repertoire')
  const [user,   setUser]   = useState(undefined)   // undefined = loading, null = logged out
  const [reviewTarget, setReviewTarget] = useState(null) // { openingId, lineId } — due line to auto-select in Study
  const [tourStep, setTourStep] = useState(null) // null = tour inactive, else index into TOUR_STEPS
  const [showPieceStyles, setShowPieceStyles] = useState(false)

  // Restore session on mount
  useEffect(() => {
    getMe()
      .then(u => setUser(u))
      .catch(() => setUser(null))
  }, [])

  // Auto-start the guided tour for first-time users once logged in
  useEffect(() => {
    if (user && !localStorage.getItem(TOUR_DONE_KEY)) setTourStep(0)
  }, [user])

  // Switch screens as the tour advances into a step that lives on another screen
  useEffect(() => {
    if (tourStep == null) return
    const step = TOUR_STEPS[tourStep]
    if (step?.screen) setScreen(step.screen)
  }, [tourStep])

  const nextTourStep  = () => setTourStep(s => Math.min(TOUR_STEPS.length - 1, s + 1))
  const prevTourStep  = () => setTourStep(s => Math.max(0, s - 1))
  const finishTour    = () => { localStorage.setItem(TOUR_DONE_KEY, '1'); setTourStep(null) }
  const restartTour   = () => setTourStep(0)

  // Listen for token expiry (dispatched by api.js on 401)
  useEffect(() => {
    const handler = () => setUser(null)
    window.addEventListener('chessbook:logout', handler)
    return () => window.removeEventListener('chessbook:logout', handler)
  }, [])

  function handleLoginSuccess(u) {
    setUser(u)
    // Pre-fill Chess.com username for the Import screen
    if (u.chesscomUsername) {
      localStorage.setItem('chessbook_username', u.chesscomUsername)
    }
  }

  function handleLogout() {
    clearToken()
    setUser(null)
  }

  // Loading splash
  if (user === undefined) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg0)', color: 'var(--text4)', fontSize: 13,
      }}>
        ♟
      </div>
    )
  }

  // Not authenticated
  if (user === null) {
    return <Login onSuccess={handleLoginSuccess} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">♟ Chessbook</span>

        <nav className="nav" data-tour="main-nav">
          {SCREENS.map(s => (
            <button
              key={s.id}
              className={`tab${screen === s.id ? ' active' : ''}`}
              onClick={() => setScreen(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* User badge */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div data-tour="user-badge" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'var(--text1)', fontWeight: 500 }}>{user.username}</div>
            <RatingEditor user={user} onUpdated={setUser} />
          </div>
          <button
            onClick={() => setShowPieceStyles(true)}
            title="Choose a piece style"
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6,
              background: 'transparent', border: '0.5px solid var(--border)',
              color: 'var(--text4)', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text4)'}
          >
            ♞ Pieces
          </button>
          <button
            onClick={restartTour}
            title="Replay the guided tour"
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6,
              background: 'transparent', border: '0.5px solid var(--border)',
              color: 'var(--text4)', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text4)'}
          >
            ? Help
          </button>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6,
              background: 'transparent', border: '0.5px solid var(--border)',
              color: 'var(--text4)', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text4)'}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        {screen === 'dashboard'  && (
          <Dashboard
            user={user}
            onStartReview={(dueLine) => {
              setReviewTarget(dueLine ? { openingId: dueLine.openingId, lineId: dueLine.id } : null)
              setScreen('repertoire')
            }}
          />
        )}
        {screen === 'repertoire' && <Study initialTarget={reviewTarget} />}
        {screen === 'sparring'   && <SparringMode />}
        {screen === 'problems'   && <Problems />}
        {screen === 'endgames'   && <Endgames />}
        {screen === 'import'     && <Import />}
        {screen === 'portalchess'    && <PortalChess />}
        {screen === 'portalchess-gm' && <PortalChessGM />}
        {screen === 'compendium'     && <Compendium />}
      </main>

      {tourStep != null && (
        <Tour
          steps={TOUR_STEPS}
          stepIndex={tourStep}
          onNext={nextTourStep}
          onPrev={prevTourStep}
          onSkip={finishTour}
          onFinish={finishTour}
        />
      )}

      {showPieceStyles && <PieceStylePicker onClose={() => setShowPieceStyles(false)} />}
    </div>
  )
}
