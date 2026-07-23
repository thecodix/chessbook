import { useState, useEffect } from 'react'
import Dashboard  from './screens/Dashboard'
import Study      from './screens/Study'
import Import     from './screens/Import'
import Login      from './screens/Login'
import { getMe, clearToken } from './utils/api'
import './app.css'

const SCREENS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'import',     label: 'Import games' },
]

export default function App() {
  const [screen, setScreen] = useState('repertoire')
  const [user,   setUser]   = useState(undefined)   // undefined = loading, null = logged out

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
            {user.platformRating && (
              <div style={{ fontSize: 11, color: 'var(--text4)' }}>{user.platformRating} rated</div>
            )}
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
        {screen === 'dashboard'  && <Dashboard user={user} onStartReview={() => setScreen('repertoire')} />}
        {screen === 'repertoire' && <Study />}
        {screen === 'import'     && <Import />}
      </main>
    </div>
  )
}
