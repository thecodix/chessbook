import { useEffect, useState } from 'react'
import Board from '../components/Board'
import { fenToBoard, START_FEN } from '../utils/chess'
import { getDue, getGames, getCoverageGaps } from '../utils/api'
import { MOCK_GAMES } from '../utils/chesscom'

function retentionColor(n) {
  if (n >= 80) return 'var(--green)'
  if (n >= 60) return 'var(--amber)'
  return 'var(--red)'
}

function sanToSquare(san) {
  if (!san || san.startsWith('O-O')) return null
  const clean = san.replace(/[+#!?x]/g, '').replace(/=.*/, '')
  const dest = clean.slice(-2)
  if (/^[a-h][1-8]$/.test(dest)) {
    return [8 - parseInt(dest[1]), dest.charCodeAt(0) - 97]
  }
  return null
}

function buildHeatmap(games) {
  const counts = Array.from({ length: 8 }, () => new Array(8).fill(0))
  let max = 0
  for (const g of games) {
    if (!g.deviation) continue
    const sq = sanToSquare(g.deviation.played)
    if (sq) { counts[sq[0]][sq[1]]++; max = Math.max(max, counts[sq[0]][sq[1]]) }
  }
  if (!max) return null
  return counts.map(row => row.map(v => v / max))
}

function StatCard({ label, value, color, sub }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || 'var(--green)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text4)', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Coverage gaps ──────────────────────────────────────────────────────────────

function freqLabel(frequency) {
  if (frequency == null) return null
  if (!frequency) return '—'
  const n = Math.round(1 / frequency)
  if (n > 50) return '<2%'
  if (n <= 1) return 'every game'
  return `1 in ${n}`
}

function gapTier(frequency) {
  if (frequency >= 0.33) return 'main'
  if (frequency >= 0.1)  return 'secondary'
  return 'rare'
}

function formatPrefix(prefix) {
  if (!prefix.length) return 'Start'
  const parts = []
  for (let i = 0; i < prefix.length; i++) {
    const mn = Math.floor(i / 2) + 1
    if (i % 2 === 0) parts.push(`${mn}.${prefix[i]}`)
    else             parts.push(prefix[i])
  }
  return parts.join(' ')
}

function CoverageEntryRow({ entry }) {
  const tier    = gapTier(entry.frequency)
  const myFreq  = freqLabel(entry.frequency)
  const lxFreq  = freqLabel(entry.lichessFrequency)
  const isMain  = tier === 'main'
  const isSec   = tier === 'secondary'

  const iconColor = entry.covered
    ? 'var(--green)'
    : isMain ? 'var(--red)' : isSec ? 'var(--amber)' : 'var(--text4)'

  const labelColor = entry.covered ? (isMain ? 'var(--green)' : 'var(--text3)') : iconColor

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '4px 0',
      opacity: !entry.covered && tier === 'rare' ? 0.55 : 1,
    }}>
      <span style={{ fontSize: 13, color: iconColor, width: 14, flexShrink: 0 }}>
        {entry.covered ? '✓' : '✗'}
      </span>

      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text0)', minWidth: 40 }}>
        {entry.move}
      </span>

      {/* Frequency columns */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'baseline', minWidth: 140 }}>
        <span style={{ fontSize: 9, color: 'var(--text4)' }}>you</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 42 }}>{myFreq}</span>
        {lxFreq && <>
          <span style={{ fontSize: 9, color: 'var(--text4)', marginLeft: 4 }}>~1800</span>
          <span style={{ fontSize: 11, color: 'var(--text4)', minWidth: 42 }}>{lxFreq}</span>
        </>}
      </div>

      {/* Tier pill */}
      {isMain && (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 600,
          background: entry.covered ? 'rgba(29,158,117,.15)' : 'rgba(226,75,74,.12)',
          color: entry.covered ? 'var(--green)' : 'var(--red)',
          border: `0.5px solid ${entry.covered ? 'rgba(29,158,117,.3)' : 'rgba(226,75,74,.25)'}`,
        }}>main</span>
      )}
      {isSec && !entry.covered && (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 600,
          background: 'rgba(255,181,0,.1)', color: 'var(--amber)',
          border: '0.5px solid rgba(255,181,0,.25)',
        }}>secondary</span>
      )}

      {/* Detail */}
      {entry.covered && entry.coveredBy?.length > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text4)', fontStyle: 'italic' }}>
          {entry.coveredBy.join(' · ')}
        </span>
      )}
      {!entry.covered && (
        <span style={{ fontSize: 10, color: labelColor }}>unprepared</span>
      )}
    </div>
  )
}

function CoveragePositionBlock({ pos }) {
  const label = formatPrefix(pos.prefix)
  const hasGaps = pos.entries.some(e => !e.covered)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10, color: 'var(--text4)', fontFamily: 'monospace',
        marginBottom: 4, letterSpacing: '0.03em',
      }}>
        After {label}
        {hasGaps && (
          <span style={{ color: 'var(--red)', marginLeft: 6 }}>
            {pos.entries.filter(e => !e.covered).length} gap{pos.entries.filter(e => !e.covered).length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ paddingLeft: 8, borderLeft: '1.5px solid var(--bg3)' }}>
        {pos.entries.map(e => (
          <CoverageEntryRow key={e.move} entry={e} />
        ))}
      </div>
    </div>
  )
}

function CoverageOpeningBlock({ opening }) {
  const totalGaps = opening.positions.reduce(
    (acc, p) => acc + p.entries.filter(e => !e.covered).length, 0
  )
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>
          {opening.openingName}
        </span>
        <span style={{
          fontSize: 10, padding: '1px 5px', borderRadius: 4,
          background: 'var(--bg3)', color: 'var(--text4)',
        }}>
          {opening.color}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text4)' }}>
          {opening.gamesAnalyzed} games
        </span>
        {totalGaps > 0 && (
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 600,
            background: 'rgba(226,75,74,.1)', color: 'var(--red)',
            border: '0.5px solid rgba(226,75,74,.22)', marginLeft: 'auto',
          }}>
            {totalGaps} unprepared
          </span>
        )}
      </div>
      {opening.positions.map(pos => (
        <CoveragePositionBlock key={pos.prefix.join(',')} pos={pos} />
      ))}
    </div>
  )
}

function CoverageGaps({ username, user }) {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!username) return
    setLoading(true)
    getCoverageGaps(username).then(setData).catch(console.warn).finally(() => setLoading(false))
  }, [username])

  if (!username || (!loading && !data.length)) return null

  const totalGaps  = data.reduce(
    (acc, o) => acc + o.positions.reduce((a, p) => a + p.entries.filter(e => !e.covered).length, 0), 0
  )
  const ratingBand = user?.platformRating ? `~${user.platformRating}` : '~1800'

  return (
    <div className="card">
      <div className="card-head">
        Coverage gaps
        <span style={{ fontSize: 11, color: 'var(--text4)', textTransform: 'none' }}>
          {loading
            ? 'analysing…'
            : totalGaps === 0
              ? `fully covered · Lichess ${ratingBand}`
              : `${totalGaps} unprepared · Lichess ${ratingBand}`}
        </span>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text4)' }}>Analysing your last 300 games…</div>
      ) : (
        data.map(o => <CoverageOpeningBlock key={o.openingId} opening={o} />)
      )}
    </div>
  )
}


export default function Dashboard({ user, onStartReview }) {
  const [due,   setDue]   = useState([])
  const [games, setGames] = useState(MOCK_GAMES)
  const [loading, setLoading] = useState(true)
  const [selectedSq, setSelectedSq] = useState(null) // [r, c] — clicked heatmap square

  const username = localStorage.getItem('chessbook_username')

  useEffect(() => {
    getDue().then(setDue).catch(console.warn)
    const src = username ? getGames(username) : Promise.resolve(MOCK_GAMES)
    src.then(setGames).catch(() => setGames(MOCK_GAMES)).finally(() => setLoading(false))
  }, [username])

  const heatmap    = buildHeatmap(games)
  const deviations = games.filter(g => g.deviation)
  const onBook     = games.filter(g => !g.deviation)
  const avgAcc     = (() => {
    const vals = games
      .map(g => g.accuracy ? (g.isWhite ? g.accuracy.white : g.accuracy.black) : null)
      .filter(v => v != null)
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
  })()

  const shownDeviations = selectedSq
    ? deviations.filter(g => {
        const sq = sanToSquare(g.deviation.played)
        return sq && sq[0] === selectedSq[0] && sq[1] === selectedSq[1]
      })
    : deviations

  const handleHeatmapSquareClick = (r, c) => {
    setSelectedSq(prev => (prev && prev[0] === r && prev[1] === c) ? null : [r, c])
  }

  const board = fenToBoard(START_FEN)

  return (
    <div style={{ display: 'flex', gap: 12, padding: 12, flex: 1, overflow: 'auto' }}>

      {/* Left column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <StatCard label="games" value={games.length} color="var(--text0)" />
          <StatCard label="deviations" value={deviations.length} color="var(--red)" />
          <StatCard label="on book" value={onBook.length} color="var(--green)" />
          {avgAcc && <StatCard label="avg accuracy" value={`${avgAcc}%`} color="var(--purple)" />}
        </div>

        {/* Due today */}
        <div className="card">
          <div className="card-head">
            Due for review
            <span style={{ color: due.length > 0 ? 'var(--amber)' : 'var(--green)' }}>
              {due.length} line{due.length !== 1 ? 's' : ''}
            </span>
          </div>
          {due.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text4)' }}>All caught up — nothing due today.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {due.map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 13, color: 'var(--text1)' }}>{l.openingName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text4)', marginLeft: 6 }}>{l.label}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text4)' }}>
                    {l.nextReview ? `due ${l.nextReview}` : 'now'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {due.length > 0 && (
            <button className="btn-green" style={{ marginTop: 10 }} onClick={onStartReview}>
              Start review session
            </button>
          )}
        </div>

        {/* Coverage gaps */}
        <CoverageGaps username={username} user={user} />

        {/* Deviation heatmap */}
        <div className="card">
          <div className="card-head">
            Deviation heatmap
            <span style={{ fontSize: 12, color: 'var(--text4)', textTransform: 'none' }}>
              {heatmap ? `${deviations.length} games analysed` : 'no deviations found'}
            </span>
          </div>
          {heatmap ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <Board
                board={board}
                size={200}
                interactive={false}
                heatmap={heatmap}
                selectedSquare={selectedSq}
                onSquareClick={handleHeatmapSquareClick}
                layers={{ attacks: false, coverage: false, targets: false, hanging: false, winning: false, selection: false }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                  Red squares show where you deviate most often. Darker = more frequent.
                  Click a square to filter deviations by that square.
                </div>
                {selectedSq && (
                  <button
                    onClick={() => setSelectedSq(null)}
                    style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6, marginBottom: 8,
                      background: 'rgba(255,220,0,.1)', border: '0.5px solid rgba(255,220,0,.35)',
                      color: 'var(--amber)', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Clear square filter ({shownDeviations.length})
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {shownDeviations.slice(0, 4).map(g => (
                    <div key={g.id} style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--text3)' }}>{g.opening}</span>
                      <span style={{ color: 'var(--text4)', marginLeft: 6 }}>
                        move {g.deviation.move}: <span style={{ color: 'var(--amber)' }}>{g.deviation.played}</span>
                        {' '}→ <span style={{ color: 'var(--green)' }}>{g.deviation.expected}</span>
                      </span>
                    </div>
                  ))}
                  {shownDeviations.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text4)' }}>No deviations on this square.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text4)' }}>
              Import games to see where you deviate most on the board.
            </div>
          )}
        </div>
      </div>

      {/* Right column — recent deviations */}
      <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="card-head" style={{ paddingTop: 2 }}>
          Recent deviations
          {selectedSq && (
            <span style={{ fontSize: 11, color: 'var(--amber)', textTransform: 'none' }}>
              filtered by square
            </span>
          )}
        </div>
        {loading && <div style={{ fontSize: 13, color: 'var(--text4)' }}>Loading…</div>}
        {!loading && shownDeviations.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text4)' }}>No deviations to show.</div>
        )}
        {shownDeviations.slice(0, 8).map(g => (
          <div key={g.id} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: 'var(--text1)', fontWeight: 500 }}>{g.opening}</span>
              <span style={{ fontSize: 11, color: 'var(--text4)' }}>{g.date}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Move {g.deviation.move}:{' '}
              <span style={{ color: 'var(--amber)' }}>{g.deviation.played}</span>
              {' '}instead of{' '}
              <span style={{ color: 'var(--green)' }}>{g.deviation.expected}</span>
            </div>
            {g.deviation.note && (
              <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 5, lineHeight: 1.5 }}>
                {g.deviation.note}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  )
}
