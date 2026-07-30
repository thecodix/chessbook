import { useState } from 'react'
import EndgamePuzzles from './EndgamePuzzles'
import EndgameAlgorithms from './EndgameAlgorithms'

export default function Endgames() {
  const [mode, setMode] = useState('puzzles') // 'puzzles' | 'algorithms'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '0.5px solid var(--border)' }}>
        <button
          onClick={() => setMode('puzzles')}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
            background: mode === 'puzzles' ? 'var(--green-bg)' : 'var(--bg2)',
            border: `0.5px solid ${mode === 'puzzles' ? 'var(--green-border)' : 'var(--border)'}`,
            color: mode === 'puzzles' ? 'var(--green)' : 'var(--text2)',
          }}
        >
          Puzzles
        </button>
        <button
          onClick={() => setMode('algorithms')}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
            background: mode === 'algorithms' ? 'var(--green-bg)' : 'var(--bg2)',
            border: `0.5px solid ${mode === 'algorithms' ? 'var(--green-border)' : 'var(--border)'}`,
            color: mode === 'algorithms' ? 'var(--green)' : 'var(--text2)',
          }}
        >
          Algorithms
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {mode === 'puzzles' ? <EndgamePuzzles /> : <EndgameAlgorithms />}
      </div>
    </div>
  )
}
