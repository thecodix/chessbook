import { useState } from 'react'
import { OPENING_LIST, OPENINGS } from '../utils/repertoire'

function retentionColor(n) {
  if (n >= 80) return 'var(--green)'
  if (n >= 60) return 'var(--amber)'
  return 'var(--red)'
}

function OpeningItem({ opening, active, onClick }) {
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
        <span>{opening.lines.length} line{opening.lines.length > 1 ? 's' : ''}</span>
        <span style={{ color: retentionColor(opening.retention) }}>{opening.retention}%</span>
      </div>
    </div>
  )
}

export default function Repertoire({ onDrill }) {
  const [selected, setSelected] = useState(OPENING_LIST[0].key)
  const opening = OPENINGS[selected]

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div className="sidebar">
        <div className="sidebar-head">
          <span style={{ fontSize: 13, fontWeight: 500 }}>Openings</span>
        </div>
        <div className="sidebar-section">White</div>
        {OPENING_LIST.filter(o => o.color === 'white').map(o => (
          <OpeningItem key={o.key} opening={o} active={selected === o.key} onClick={() => setSelected(o.key)} />
        ))}
        <div className="sidebar-section">Black</div>
        {OPENING_LIST.filter(o => o.color === 'black').map(o => (
          <OpeningItem key={o.key} opening={o} active={selected === o.key} onClick={() => setSelected(o.key)} />
        ))}
      </div>

      <div style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Opening header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600 }}>{opening.name}</h2>
            <span className={`tag ${opening.color === 'white' ? 'tag-green' : 'tag-amber'}`}>
              {opening.color}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text4)', marginLeft: 'auto' }}>
              Retention:{' '}
              <span style={{ color: retentionColor(opening.retention), fontWeight: 500 }}>
                {opening.retention}%
              </span>
            </span>
          </div>

          {/* Strategic description */}
          {opening.description && (
            <div style={{
              fontSize: 13, color: 'var(--text2)', lineHeight: 1.7,
              padding: '10px 13px', borderRadius: 8,
              background: 'var(--bg2)', border: '0.5px solid var(--border)',
            }}>
              {opening.description}
            </div>
          )}
        </div>

        {/* Lines */}
        {opening.lines.map((line, idx) => (
          <div key={idx} className="card">
            <div className="card-head" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{line.label}</span>
              <button
                className="btn-green"
                style={{ width: 'auto', padding: '5px 14px' }}
                onClick={() => onDrill(selected, idx)}
              >
                Drill
              </button>
            </div>

            {/* Move sequence */}
            <div className="varpath" style={{ marginBottom: line.idea ? 10 : 0 }}>
              {line.moves.map((mv, i) => (
                <span key={i} className="vpm">
                  {i % 2 === 0 && (
                    <span style={{ color: 'var(--text4)', marginRight: 2 }}>{Math.floor(i / 2) + 1}.</span>
                  )}
                  {mv}{' '}
                </span>
              ))}
            </div>

            {/* Line-specific idea */}
            {line.idea && (
              <div style={{
                fontSize: 12, color: 'var(--text3)', lineHeight: 1.7,
                padding: '8px 10px', borderRadius: 6, marginTop: 6,
                background: 'var(--bg3)', borderLeft: '2px solid var(--green-dim)',
              }}>
                {line.idea}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
