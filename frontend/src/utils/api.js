const BASE      = '/api'
const TOKEN_KEY = 'chessbook_token'

export const getToken   = ()  => localStorage.getItem(TOKEN_KEY)
export const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = ()  => localStorage.removeItem(TOKEN_KEY)

// The backend runs on Render's free instance type, which spins down after
// ~15 min of inactivity and takes up to ~a minute to spin back up. During
// that window requests can come back as a 502/503/504, or even a 200 with
// an HTML "waking up" placeholder body instead of real JSON — retry those
// transient failures with backoff instead of treating them as permanent
// (and instead of throwing an opaque JSON-parse error on the HTML body).
const RETRYABLE_STATUSES = new Set([502, 503, 504])
const MAX_RETRIES        = 8
const RETRY_DELAY_MS     = 5000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function req(path, opts = {}) {
  const token   = getToken()
  const headers = { ...(opts.headers || {}) }
  if (token)                                headers['Authorization']  = `Bearer ${token}`
  if (opts.body && !headers['Content-Type']) headers['Content-Type']  = 'application/json'

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res
    try {
      res = await fetch(BASE + path, { ...opts, headers })
    } catch (err) {
      // Network-level failure (offline, connection reset while the backend
      // is cold-starting, etc.)
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS); continue }
      throw new Error('Could not reach the server. Please check your connection and try again.')
    }

    if (res.status === 401) {
      clearToken()
      window.dispatchEvent(new Event('chessbook:logout'))
      throw new Error('Session expired — please sign in again.')
    }

    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS)
      continue
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(text || `HTTP ${res.status}`)
    }

    if (res.status === 204) return null

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS); continue }
      throw new Error('The server is still waking up — please try again in a moment.')
    }

    return res.json()
  }
  throw new Error('The server took too long to respond. Please try again.')
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const register = (data) =>
  req('/users/register', { method: 'POST', body: JSON.stringify(data) })

export const login = (username, password) =>
  req('/users/login',    { method: 'POST', body: JSON.stringify({ username, password }) })

export const getMe = () => req('/users/me')

export const updateRating = (rating) =>
  req(`/users/me/rating?rating=${rating}`, { method: 'PATCH' })

export const updateChesscomUsername = (chesscomUsername) =>
  req(`/users/me/chesscom-username?chesscom_username=${encodeURIComponent(chesscomUsername)}`, { method: 'PATCH' })

// ── Repertoire ─────────────────────────────────────────────────────────────────

export const getRepertoire = ()                               => req('/repertoire/')
export const getDue         = ()                               => req('/repertoire/due')
export const submitReview   = (openingId, lineId, quality)    =>
  req(`/repertoire/${openingId}/review`, {
    method: 'POST',
    body: JSON.stringify({ lineId, quality }),
  })
export const getCatalog     = ()                               => req('/repertoire/catalog')
export const getSelection   = ()                               => req('/repertoire/selection')
export const updateSelection = (openingIds) =>
  req('/repertoire/selection', {
    method: 'POST',
    body: JSON.stringify({ openingIds }),
  })

// ── Games ──────────────────────────────────────────────────────────────────────

export const importGames = (username, months = 2) =>
  req(`/games/import?username=${encodeURIComponent(username)}&months=${months}`)

export const getGames = (username) =>
  req(`/games/?username=${encodeURIComponent(username)}`)

export const getCoverageGaps = (username, limit = 300) =>
  req(`/games/coverage-gaps?username=${encodeURIComponent(username)}&limit=${limit}`)

// ── Analysis ───────────────────────────────────────────────────────────────────

export const getDeviationAnalysis = (gameId) =>
  req(`/analysis/deviation/${encodeURIComponent(gameId)}`)

// ── Problems ───────────────────────────────────────────────────────────────────

export const getProblemsProgress = () => req('/problems/progress')

export const updateProblemProgress = (puzzleId, solved) =>
  req(`/problems/progress/${encodeURIComponent(puzzleId)}`, {
    method: 'POST',
    body: JSON.stringify({ solved }),
  })

// ── Endgames ───────────────────────────────────────────────────────────────────

export const getEndgamesProgress = () => req('/endgames/progress')

export const updateEndgameProgress = (puzzleId, solved) =>
  req(`/endgames/progress/${encodeURIComponent(puzzleId)}`, {
    method: 'POST',
    body: JSON.stringify({ solved }),
  })

// ── Sparring ───────────────────────────────────────────────────────────────────

export const getSparringNext = (color) =>
  req(`/sparring/next?color=${encodeURIComponent(color)}`)

export const evaluateSparringMove = (lineId, plyIndex, movePlayed, movesSoFar) =>
  req('/sparring/evaluate', {
    method: 'POST',
    body: JSON.stringify({ lineId, plyIndex, movePlayed, movesSoFar }),
  })
