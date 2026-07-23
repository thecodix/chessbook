import { useState, useEffect } from 'react'
import Dashboard  from './screens/Dashboard'
import Study      from './screens/Study'
import Import     from './screens/Import'
import Login      from './screens/Login'
import { getMe, clearToken, updateRating } from './utils/api'
import './app.css'

const SCREENS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'import',     label: 'Import games' },
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

  // Restore session on mount
  useEffect(() => {
    getMe()
      .then(u => setUser(u))
      .catch(() => setUser(null))
  }, [])

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

        <nav className="nav">
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
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'var(--text1)', fontWeight: 500 }}>{user.username}</div>
            <RatingEditor user={user} onUpdated={setUser} />
          </div>
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
        {screen === 'import'     && <Import />}
      </main>
    </div>
  )
}
