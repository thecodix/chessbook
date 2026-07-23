const BASE      = '/api'
const TOKEN_KEY = 'chessbook_token'

export const getToken   = ()  => localStorage.getItem(TOKEN_KEY)
export const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = ()  => localStorage.removeItem(TOKEN_KEY)

async function req(path, opts = {}) {
  const token   = getToken()
  const headers = { ...(opts.headers || {}) }
  if (token)                                headers['Authorization']  = `Bearer ${token}`
  if (opts.body && !headers['Content-Type']) headers['Content-Type']  = 'application/json'

  const res = await fetch(BASE + path, { ...opts, headers })

  if (res.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('chessbook:logout'))
    throw new Error('Session expired — please sign in again.')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const register = (data) =>
  req('/users/register', { method: 'POST', body: JSON.stringify(data) })

export const login = (username, password) =>
  req('/users/login',    { method: 'POST', body: JSON.stringify({ username, password }) })

export const getMe = () => req('/users/me')

export const updateRating = (rating) =>
  req(`/users/me/rating?rating=${rating}`, { method: 'PATCH' })

// ── Repertoire ─────────────────────────────────────────────────────────────────

export const getRepertoire = ()                               => req('/repertoire/')
export const getDue         = ()                               => req('/repertoire/due')
export const submitReview   = (openingId, lineId, quality)    =>
  req(`/repertoire/${openingId}/review`, {
    method: 'POST',
    body: JSON.stringify({ lineId, quality }),
  })

// ── Games ──────────────────────────────────────────────────────────────────────

export const importGames = (username, months = 2) =>
  req(`/games/import?username=${encodeURIComponent(username)}&months=${months}`)

export const getGames = (username) =>
  req(`/games/?username=${encodeURIComponent(username)}`)

export const getCoverageGaps = (username, limit = 300) =>
  req(`/games/coverage-gaps?username=${encodeURIComponent(username)}&limit=${limit}`)
