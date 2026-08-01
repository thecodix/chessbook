// Compendium screen (Plan v3) — a simple, navigable reference for every
// Great Master, card, enemy family joker, and modifier in the Grandes
// Maestros roguelike. Independent of any active run; reads static content
// definitions plus the cross-run meta-progression watermark (runMeta.js)
// to decide what's still locked.
import { useMemo, useState } from 'react'
import CompendiumEntry from '../components/CompendiumEntry'
import { CATEGORIES } from '../utils/portalChess/compendiumData'
import '../components/portalChess.css'

export default function Compendium() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id)
  const [query, setQuery] = useState('')

  const category = CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0]
  const entries = useMemo(() => category.getEntries(), [category])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e => (
      (e.unlocked && e.name.toLowerCase().includes(q)) ||
      (e.unlocked && e.desc && e.desc.toLowerCase().includes(q))
    ))
  }, [entries, query])

  return (
    <div className="pc-app">
      <div className="pc-eyebrow">Chessbook · Roguelike</div>
      <div className="pc-title">Compendio</div>
      <div className="pc-subtitle">Todos los Grandes Maestros, cartas, familias enemigas y modificadores conocidos.</div>

      <div className="pc-panel">
        <div className="pc-seg" style={{ flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} className={activeCategory === c.id ? 'pc-active' : ''} onClick={() => setActiveCategory(c.id)}>{c.label}</button>
          ))}
        </div>
        <input
          className="pc-comp-search"
          type="text"
          placeholder="Buscar…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="pc-offers">
        {filtered.map(entry => <CompendiumEntry key={entry.id} entry={entry} />)}
        {filtered.length === 0 && <div className="pc-subtitle">Sin resultados.</div>}
      </div>
    </div>
  )
}
