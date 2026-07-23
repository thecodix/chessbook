import { useState } from 'react'
import { login as apiLogin, register as apiRegister, setToken } from '../utils/api'

const RATING_LABELS = [
  [800,  'Beginner'],
  [1200, 'Casual'],
  [1500, 'Club player'],
  [1800, 'Advanced'],
  [2100, 'Expert'],
  [2400, 'Master'],
]

function ratingHint(r) {
  for (let i = RATING_LABELS.length - 1; i >= 0; i--) {
    if (r >= RATING_LABELS[i][0]) return RATING_LABELS[i][1]
  }
  return 'Beginner'
}

export default function Login({ onSuccess }) {
  const [mode,    setMode]    = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [chesscom, setChesscom] = useState('')
  const [rating,   setRating]   = useState(1500)
  const [error,    setError]    = useState(null)
  const [busy,     setBusy]     = useState(false)

  async function handleSubmit() {
    if (!username.trim() || !password) return
    setBusy(true); setError(null)
    try {
      let data
      if (mode === 'login') {
        data = await apiLogin(username.trim(), password)
      } else {
        data = await apiRegister({
          username:          username.trim(),
          password,
          chesscomUsername:  chesscom.trim() || null,
          platformRating:    rating,
        })
      }
      setToken(data.accessToken)
      onSuccess(data.user)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function onKey(e) { if (e.key === 'Enter') handleSubmit() }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg0)',
    }}>
      <div className="card" style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', paddingBottom: 4 }}>
          <div style={{ fontSize: 30, color: 'var(--green)' }}>♟</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text0)', marginTop: 4 }}>Chessbook</div>
          <div style={{ fontSize: 12, color: 'var(--text4)', marginTop: 3 }}>opening repertoire trainer</div>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', gap: 3, background: 'var(--bg3)',
          borderRadius: 8, padding: 3,
        }}>
          {[['login', 'Sign in'], ['register', 'Create account']].map(([m, label]) => (
            <button
              key={m} onClick={() => { setMode(m); setError(null) }}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6, border: 'none',
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                background: mode === m ? 'var(--bg2)' : 'transparent',
                color:      mode === m ? 'var(--text0)' : 'var(--text4)',
                transition: 'background .15s',
              }}
            >{label}</button>
          ))}
        </div>

        {/* Fields */}
        <input
          type="text" placeholder="Username" autoFocus
          value={username} onChange={e => setUsername(e.target.value)} onKeyDown={onKey}
          style={{ width: '100%' }}
        />
        <input
          type="password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
          style={{ width: '100%' }}
        />

        {mode === 'register' && (
          <>
            <div>
              <input
                type="text" placeholder="Chess.com username (optional)"
                value={chesscom} onChange={e => setChesscom(e.target.value)}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 4 }}>
                Pre-fills the Import screen so you can load your games faster
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Your rating</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>
                  {rating} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text4)' }}>· {ratingHint(rating)}</span>
                </span>
              </div>
              <input
                type="range" min="800" max="2500" step="100"
                value={rating} onChange={e => setRating(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--green)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text4)', marginTop: 3 }}>
                <span>800</span><span>1200</span><span>1600</span><span>2000</span><span>2500</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 6 }}>
                Determines which Lichess rating band to use for coverage frequencies. You can change this later.
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center', lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        <button
          className="btn-green"
          onClick={handleSubmit}
          disabled={busy || !username.trim() || !password}
          style={{ marginTop: 4 }}
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </div>
    </div>
  )
}
