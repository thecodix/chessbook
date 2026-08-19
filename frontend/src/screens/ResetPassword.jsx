import { useState } from 'react'
import { resetPassword as apiResetPassword } from '../utils/api'

export default function ResetPassword({ onDone }) {
  const token = new URLSearchParams(window.location.search).get('token')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [done,     setDone]     = useState(null)
  const [busy,     setBusy]     = useState(false)

  async function handleSubmit() {
    if (!password) return
    setBusy(true); setError(null)
    try {
      const data = await apiResetPassword(token, password)
      setDone(data.message)
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
        <div style={{ textAlign: 'center', paddingBottom: 4 }}>
          <div style={{ fontSize: 30, color: 'var(--green)' }}>♟</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text0)', marginTop: 4 }}>Reset your password</div>
        </div>

        {done ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--green)', textAlign: 'center', lineHeight: 1.4 }}>
              {done}
            </div>
            <button className="btn-green" onClick={onDone} style={{ marginTop: 4 }}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <input
              type="password" placeholder="New password" autoFocus
              value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
              style={{ width: '100%' }}
            />

            {error && (
              <div style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center', lineHeight: 1.4 }}>
                {error}
              </div>
            )}

            <button
              className="btn-green"
              onClick={handleSubmit}
              disabled={busy || !password}
              style={{ marginTop: 4 }}
            >
              {busy ? '…' : 'Reset password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
