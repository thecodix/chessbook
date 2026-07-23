import { useState, useEffect, useMemo } from 'react'
import { importGames, getGames } from '../utils/api'

const TIME_CLASS_ICONS = { bullet: '⚡', blitz: '⏱', rapid: '🕐', classical: '♟', daily: '📅' }

function resultLabel(g) {
  if (g.result === '1-0') return g.isWhite ? 'Win' : 'Loss'
  if (g.result === '0-1') return g.isWhite ? 'Loss' : 'Win'
  return 'Draw'
}
function resultTagClass(g) {
  const l = resultLabel(g)
  return l === 'Win' ? 'tag-green' : l === 'Loss' ? 'tag-red' : 'tag-amber'
}

const RESULT_REASON = {
  win: null, lose: null,
  resigned: 'resigned', timeout: 'on time', checkmated: 'checkmated',
  agreed: 'draw agreed', repetition: 'repetition', stalemate: 'stalemate',
  insufficient: 'insufficient material', '50move': '50-move rule',
  timevsinsufficient: 'time vs insufficient', abandoned: 'abandoned',
}

// ── Stats computation ──────────────────────────────────────────────────────

function computeStats(games) {
  const openingMap = {}

  for (const g of games) {
    const key = g.opening || 'Unknown'
    if (!openingMap[key]) openingMap[key] = { name: key, wins: 0, draws: 0, losses: 0, total: 0, eloSum: 0 }
    const label = resultLabel(g)
    if (label === 'Win') openingMap[key].wins++
    else if (label === 'Draw') openingMap[key].draws++
    else openingMap[key].losses++
    openingMap[key].total++
  }

  // Elo delta: group by time class, sort by date, attribute consecutive deltas to the opening played
  const withRating = games.filter(g => (g.isWhite ? g.whiteRating : g.blackRating) != null)
  const byClass = {}
  for (const g of withRating) {
    const tc = g.timeClass || 'unknown'
    if (!byClass[tc]) byClass[tc] = []
    byClass[tc].push(g)
  }
  for (const gms of Object.values(byClass)) {
    gms.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    for (let i = 1; i < gms.length; i++) {
      const prev = gms[i - 1], cur = gms[i]
      const prevR = prev.isWhite ? prev.whiteRating : prev.blackRating
      const curR  = cur.isWhite ? cur.whiteRating : cur.blackRating
      if (prevR == null || curR == null) continue
      const key = prev.opening || 'Unknown'
      if (openingMap[key]) openingMap[key].eloSum += curR - prevR
    }
  }

  const topOpenings = Object.values(openingMap).sort((a, b) => b.total - a.total).slice(0, 3)

  // Timeline per time class (for elo chart)
  const timelines = {}
  for (const [tc, gms] of Object.entries(byClass)) {
    timelines[tc] = gms.map(g => ({
      date: g.date,
      rating: g.isWhite ? g.whiteRating : g.blackRating,
      result: resultLabel(g),
      opening: g.opening,
    }))
  }

  return { topOpenings, timelines }
}

// ── Opening card ───────────────────────────────────────────────────────────

function OpeningCard({ op, rank }) {
  const winPct = op.total ? Math.round(op.wins / op.total * 100) : 0
  const eloPos = op.eloSum >= 0
  const eloStr = `${eloPos ? '+' : ''}${Math.round(op.eloSum)}`

  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 3 }}>#{rank} most played</div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {op.name}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: eloPos ? 'var(--green)' : 'var(--red)', lineHeight: 1 }}>
            {eloStr}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text4)', marginTop: 2 }}>elo delta</div>
        </div>
      </div>

      {/* Stacked W/D/L bar */}
      <div style={{ height: 5, borderRadius: 3, display: 'flex', overflow: 'hidden', marginBottom: 8, background: 'var(--bg2)' }}>
        {op.wins > 0   && <div style={{ flex: op.wins,   background: '#1d9e75' }} />}
        {op.draws > 0  && <div style={{ flex: op.draws,  background: '#ffb500' }} />}
        {op.losses > 0 && <div style={{ flex: op.losses, background: '#e24b4a' }} />}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text4)' }}>
        <span><span style={{ color: '#1d9e75', fontWeight: 600 }}>{op.wins}W</span> · <span style={{ color: '#ffb500' }}>{op.draws}D</span> · <span style={{ color: '#e24b4a' }}>{op.losses}L</span></span>
        <span>{op.total}g · <span style={{ color: winPct >= 55 ? '#1d9e75' : winPct >= 45 ? '#ffb500' : '#e24b4a' }}>{winPct}%</span></span>
      </div>
    </div>
  )
}

// ── Results by month (stacked bar chart) ───────────────────────────────────

function ResultsChart({ games }) {
  const byMonth = {}
  for (const g of games) {
    const month = (g.date || '').slice(0, 7)
    if (!month) continue
    if (!byMonth[month]) byMonth[month] = { wins: 0, draws: 0, losses: 0 }
    const l = resultLabel(g)
    if (l === 'Win') byMonth[month].wins++
    else if (l === 'Draw') byMonth[month].draws++
    else byMonth[month].losses++
  }

  const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))
  if (!months.length) return null

  const maxTotal = Math.max(...months.map(([, m]) => m.wins + m.draws + m.losses))

  const W = 560, H = 110
  const PAD = { top: 8, right: 10, bottom: 26, left: 30 }
  const CW = W - PAD.left - PAD.right
  const CH = H - PAD.top - PAD.bottom

  const barW = Math.max(6, Math.min(36, CW / months.length - 4))
  const totalBarSpan = barW * months.length
  const spacing = months.length > 1 ? (CW - totalBarSpan) / (months.length - 1) : 0

  // Y axis labels
  const yLabels = [0, Math.ceil(maxTotal / 2), maxTotal]
  const py = (v) => PAD.top + CH - (v / maxTotal) * CH

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Grid */}
      {yLabels.map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={py(v)} x2={W - PAD.right} y2={py(v)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={PAD.left - 4} y={py(v)} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.25)" fontSize="9">{v}</text>
        </g>
      ))}

      {/* Bars */}
      {months.map(([month, m], i) => {
        const bx = PAD.left + i * (barW + spacing)
        const segments = []
        let baseY = PAD.top + CH

        for (const [cnt, color] of [[m.losses, '#e24b4a'], [m.draws, '#ffb500'], [m.wins, '#1d9e75']]) {
          if (!cnt) continue
          const h = (cnt / maxTotal) * CH
          baseY -= h
          segments.push(<rect key={color} x={bx} y={baseY} width={barW} height={h} fill={color} rx="1.5" opacity="0.88" />)
        }

        return (
          <g key={month}>
            {segments}
            <text x={bx + barW / 2} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize="9">
              {month.slice(5)}
            </text>
          </g>
        )
      })}

      {/* Legend */}
      {[['W', '#1d9e75'], ['D', '#ffb500'], ['L', '#e24b4a']].map(([l, c], i) => (
        <g key={l} transform={`translate(${W - PAD.right - 90 + i * 30}, ${PAD.top + 2})`}>
          <rect width="8" height="8" rx="1.5" fill={c} opacity="0.88" />
          <text x="11" y="6" dominantBaseline="middle" fill="rgba(255,255,255,0.35)" fontSize="9">{l}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Elo progression (line chart) ───────────────────────────────────────────

function EloChart({ games }) {
  const withRating = games.filter(g => (g.isWhite ? g.whiteRating : g.blackRating) != null)

  // Group by time class, pick the most common one
  const tcCounts = {}
  for (const g of withRating) {
    const tc = g.timeClass || 'unknown'
    tcCounts[tc] = (tcCounts[tc] || 0) + 1
  }
  const timeclasses = Object.entries(tcCounts).sort((a, b) => b[1] - a[1]).map(([tc]) => tc)
  const [activeTc, setActiveTc] = useState(timeclasses[0] || 'unknown')

  // Reset to top time class when games change after a new import
  useEffect(() => {
    if (timeclasses.length && !timeclasses.includes(activeTc)) setActiveTc(timeclasses[0])
  }, [timeclasses.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const data = withRating
    .filter(g => (g.timeClass || 'unknown') === activeTc)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  if (!data.length) return (
    <div style={{ fontSize: 12, color: 'var(--text4)', padding: 8 }}>
      No rated games found for {activeTc}.
    </div>
  )

  if (data.length < 2) return (
    <div style={{ fontSize: 12, color: 'var(--text4)', padding: 8 }}>
      Not enough games ({data.length}) for this time class.
    </div>
  )

  const W = 560, H = 150
  const PAD = { top: 12, right: 16, bottom: 28, left: 44 }
  const CW = W - PAD.left - PAD.right
  const CH = H - PAD.top - PAD.bottom

  const rVals = data.map(g => g.isWhite ? g.whiteRating : g.blackRating)
  const minR = Math.min(...rVals) - 10
  const maxR = Math.max(...rVals) + 10
  const range = Math.max(maxR - minR, 30)

  const px = i => PAD.left + (i / Math.max(data.length - 1, 1)) * CW
  const py = r => PAD.top + CH - ((r - minR) / range) * CH

  const pathD = data.map((g, i) => {
    const r = g.isWhite ? g.whiteRating : g.blackRating
    return `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(r).toFixed(1)}`
  }).join(' ')

  // Y axis: ~4 grid lines
  const yStep = Math.ceil(range / 4 / 20) * 20
  const yStart = Math.floor(minR / yStep) * yStep
  const yLines = []
  for (let r = yStart; r <= maxR + yStep; r += yStep) if (r >= minR - 5) yLines.push(r)

  // X labels: up to 6
  const xStep = Math.max(1, Math.floor(data.length / 5))
  const xLabels = data.reduce((acc, g, i) => {
    if (i % xStep === 0 || i === data.length - 1) acc.push({ i, label: g.date.slice(0, 7) })
    return acc
  }, [])

  const dotColor = { Win: '#1d9e75', Draw: '#ffb500', Loss: '#e24b4a' }

  return (
    <div>
      {/* Time class tabs */}
      {timeclasses.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {timeclasses.map(tc => (
            <button
              key={tc}
              onClick={() => setActiveTc(tc)}
              style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                cursor: 'pointer',
                background: activeTc === tc ? 'var(--green-bg)' : 'var(--bg2)',
                border: `0.5px solid ${activeTc === tc ? 'var(--green-border)' : 'var(--border)'}`,
                color: activeTc === tc ? 'var(--green)' : 'var(--text4)',
              }}
            >
              {TIME_CLASS_ICONS[tc] || ''} {tc} · {tcCounts[tc]}g
            </button>
          ))}
        </div>
      )}

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        {/* Grid */}
        {yLines.map(r => (
          <g key={r}>
            <line x1={PAD.left} y1={py(r)} x2={W - PAD.right} y2={py(r)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.left - 5} y={py(r)} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.28)" fontSize="9.5">{r}</text>
          </g>
        ))}
        {/* Axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

        {/* Area fill */}
        <defs>
          <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d9e75" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1d9e75" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {data.length > 1 && (
          <path
            d={`${pathD} L${px(data.length - 1).toFixed(1)},${(PAD.top + CH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + CH).toFixed(1)} Z`}
            fill="url(#eloGrad)"
          />
        )}

        {/* Line */}
        <path d={pathD} fill="none" stroke="rgba(29,158,117,0.55)" strokeWidth="1.8" strokeLinejoin="round" />

        {/* Dots */}
        {data.map((g, i) => {
          const r = g.isWhite ? g.whiteRating : g.blackRating
          const res = resultLabel(g)
          return (
            <circle key={i} cx={px(i)} cy={py(r)} r="3.5" fill={dotColor[res]} opacity="0.9" stroke="var(--bg1)" strokeWidth="0.8" />
          )
        })}

        {/* X labels */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={px(i)} y={H - 5} textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize="9.5">{label}</text>
        ))}

        {/* Legend */}
        {[['Win', '#1d9e75'], ['Draw', '#ffb500'], ['Loss', '#e24b4a']].map(([l, c], i) => (
          <g key={l} transform={`translate(${W - PAD.right - 110 + i * 38}, ${PAD.top})`}>
            <circle r="3.5" fill={c} opacity="0.9" cx="3.5" cy="3.5" />
            <text x="10" y="7" fill="rgba(255,255,255,0.35)" fontSize="9" dominantBaseline="middle">{l}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Analytics section ──────────────────────────────────────────────────────

function Analytics({ games }) {
  const { topOpenings } = useMemo(() => computeStats(games), [games])

  if (!games.length) return null

  return (
    <>
      {/* Top 3 openings */}
      <div className="card">
        <div className="card-head">Top openings <span style={{ fontSize: 11, color: 'var(--text4)', textTransform: 'none' }}>win rate · elo delta</span></div>
        <div style={{ display: 'flex', gap: 10 }}>
          {topOpenings.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text4)' }}>No data yet.</div>
            : topOpenings.map((op, i) => <OpeningCard key={op.name} op={op} rank={i + 1} />)
          }
        </div>
      </div>

      {/* Results by month */}
      <div className="card">
        <div className="card-head">Results by month</div>
        <ResultsChart games={games} />
      </div>

      {/* Rating progression */}
      <div className="card">
        <div className="card-head">Rating progression</div>
        <EloChart games={games} />
      </div>
    </>
  )
}

// ── Accuracy badge ─────────────────────────────────────────────────────────

function AccuracyBadge({ value, label }) {
  if (value == null) return null
  const color = value >= 85 ? 'var(--green)' : value >= 70 ? 'var(--amber)' : 'var(--red)'
  return (
    <span style={{ fontSize: 11, color, fontWeight: 500 }} title={`${label} accuracy`}>
      {value.toFixed(1)}%
    </span>
  )
}

// ── Game card ──────────────────────────────────────────────────────────────

function GameCard({ g }) {
  const myRating  = g.isWhite ? g.whiteRating  : g.blackRating
  const oppRating = g.isWhite ? g.blackRating  : g.whiteRating
  const myAcc     = g.accuracy ? (g.isWhite ? g.accuracy.white : g.accuracy.black) : null
  const oppAcc    = g.accuracy ? (g.isWhite ? g.accuracy.black : g.accuracy.white) : null
  const myName    = g.isWhite ? g.white : g.black
  const oppName   = g.isWhite ? g.black : g.white
  const endReason = g.myResult ? RESULT_REASON[g.myResult] : null
  const icon      = TIME_CLASS_ICONS[g.timeClass] || ''

  return (
    <div className="card" style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Row 1: opening + tags */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {g.opening}
          </span>
          {g.rules && g.rules !== 'chess' && <span className="tag tag-purple">{g.rules}</span>}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          {g.rated === false && <span className="tag tag-amber">Unrated</span>}
          {g.tournament    && <span className="tag tag-purple">Tournament</span>}
          <span className={`tag ${resultTagClass(g)}`}>{resultLabel(g)}</span>
        </div>
      </div>

      {/* Row 2: players */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text1)', fontWeight: 500 }}>{myName}</span>
            {myRating  != null && <span style={{ fontSize: 11, color: 'var(--text4)' }}>{myRating}</span>}
            <AccuracyBadge value={myAcc}  label="My" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>vs {oppName}</span>
            {oppRating != null && <span style={{ fontSize: 11, color: 'var(--text4)' }}>{oppRating}</span>}
            <AccuracyBadge value={oppAcc} label="Opponent" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text4)' }}>
            {icon} {g.timeControl}{g.timeClass ? ` · ${g.timeClass}` : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text4)' }}>{g.date}</span>
          {endReason && <span style={{ fontSize: 10, color: 'var(--text4)', fontStyle: 'italic' }}>{endReason}</span>}
        </div>
      </div>

      {/* Row 3: deviation or on-book */}
      {g.deviation ? (
        <div style={{
          padding: '7px 9px', borderRadius: 6,
          background: 'rgba(226,75,74,.08)', border: '0.5px solid rgba(226,75,74,.2)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: g.deviation.note ? 4 : 0 }}>
            Move {g.deviation.move}: played <strong>{g.deviation.played}</strong> instead of{' '}
            <strong style={{ color: 'var(--green)' }}>{g.deviation.expected}</strong>
            {g.deviation.lineName && (
              <span style={{ color: 'var(--text4)', fontWeight: 400 }}> · {g.deviation.lineName}</span>
            )}
          </div>
          {g.deviation.note && (
            <div style={{ fontSize: 11, color: 'var(--text4)', lineHeight: 1.5 }}>{g.deviation.note}</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--green)' }}>On book</div>
      )}

      {/* Row 4: game link */}
      {g.gameUrl && (
        <a
          href={g.gameUrl} target="_blank" rel="noreferrer"
          style={{ fontSize: 11, color: 'var(--text4)', textDecoration: 'none' }}
          onMouseEnter={e => e.target.style.color = 'var(--green)'}
          onMouseLeave={e => e.target.style.color = 'var(--text4)'}
        >
          View on Chess.com →
        </a>
      )}
    </div>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function Import() {
  const [username, setUsername]   = useState(localStorage.getItem('chessbook_username') || '')
  const [games,    setGames]      = useState([])
  const [loading,  setLoading]    = useState(false)
  const [importing,setImporting]  = useState(false)
  const [error,    setError]      = useState(null)
  const [months,   setMonths]     = useState(2)
  const [dbCount,  setDbCount]    = useState(null)  // count loaded from DB on mount

  // Load persisted games on mount
  useEffect(() => {
    const saved = localStorage.getItem('chessbook_username')
    if (!saved) return
    setLoading(true)
    getGames(saved)
      .then(data => {
        if (data?.length) { setGames(data); setDbCount(data.length) }
      })
      .catch(console.warn)
      .finally(() => setLoading(false))
  }, [])

  const handleImport = async () => {
    const u = username.trim()
    if (!u) return
    setImporting(true)
    setError(null)
    try {
      const data = await importGames(u, months)
      setGames(data)
      setDbCount(null)
      localStorage.setItem('chessbook_username', u)
    } catch (e) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const deviations = games.filter(g => g.deviation)
  const onBook     = games.filter(g => !g.deviation)
  const avgMyAcc   = (() => {
    const vals = games
      .map(g => g.accuracy ? (g.isWhite ? g.accuracy.white : g.accuracy.black) : null)
      .filter(v => v != null)
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
  })()

  return (
    <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>

      {/* Import bar */}
      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Chess.com username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleImport()}
          style={{ flex: 1 }}
        />
        <select
          value={months}
          onChange={e => setMonths(Number(e.target.value))}
          style={{
            background: 'var(--bg2)', color: 'var(--text2)', border: '0.5px solid var(--border)',
            borderRadius: 7, padding: '7px 8px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {[1, 2, 3, 6].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
        </select>
        <button
          className="btn-green"
          style={{ width: 'auto', padding: '7px 18px' }}
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>

      {/* Status messages */}
      {error  && <div style={{ color: 'var(--red)',   fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: 'var(--text4)', fontSize: 12 }}>Loading saved games…</div>}
      {dbCount != null && !loading && (
        <div style={{ color: 'var(--text4)', fontSize: 12 }}>
          Loaded <span style={{ color: 'var(--green)' }}>{dbCount}</span> saved games from history.
        </div>
      )}

      {/* Summary stats */}
      {games.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'games',      value: games.length,      color: 'var(--text0)' },
            { label: 'deviations', value: deviations.length, color: 'var(--red)'   },
            { label: 'on book',    value: onBook.length,     color: 'var(--green)' },
            ...(avgMyAcc ? [{ label: 'avg accuracy', value: `${avgMyAcc}%`, color: 'var(--purple)' }] : []),
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Analytics */}
      <Analytics games={games} />

      {/* Game list */}
      {games.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {games.map(g => <GameCard key={g.id} g={g} />)}
        </div>
      )}

      {!games.length && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text4)', fontSize: 13 }}>
          Enter your Chess.com username and click Import to load your games.
        </div>
      )}
    </div>
  )
}
