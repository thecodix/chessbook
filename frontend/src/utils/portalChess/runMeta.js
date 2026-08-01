// Cross-run persistent meta-progression for the Grandes Maestros roguelike
// (Version B only). Distinct from the per-run save in PortalChessGM.jsx
// (`chessbook_portalchess_gm_run`, cleared every "New run") — this key
// survives death, tracking the deepest level ever reached and lifetime
// stats, and gates a subset of new GMs/cards/enemy jokers behind
// `unlockRequirement: { minLevel }` so the pool grows the more you play
// (Inscryption-style meta layer), while everything that existed before this
// system stays unlocked by default for backward compatibility.
const META_KEY = 'chessbook_portalchess_gm_meta'

function defaultMeta() {
  return { highestLevel: 0, totalWins: 0, totalRuns: 0 }
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return defaultMeta()
    const parsed = JSON.parse(raw)
    return { ...defaultMeta(), ...parsed }
  } catch {
    return defaultMeta()
  }
}

function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)) } catch { /* storage unavailable/full — ignore */ }
}

export function getMetaState() {
  return loadMeta()
}

// Call whenever the run's level counter advances (win a node) — updates the
// permanent "highest level reached" watermark immediately, so unlocks can
// kick in for the rest of THIS run too, not only future ones.
export function noteLevelReached(level) {
  const m = loadMeta()
  if (level > m.highestLevel) { m.highestLevel = level; saveMeta(m) }
  return m
}

export function noteRunEnded(wins = 0) {
  const m = loadMeta()
  m.totalRuns += 1
  m.totalWins += wins
  saveMeta(m)
  return m
}

// `requirement` is an optional `{ minLevel }` object attached to new
// GM/card/enemy-joker entries. Entries with no requirement are always
// unlocked (keeps existing content available from a fresh install).
export function isUnlocked(requirement) {
  if (!requirement) return true
  const m = loadMeta()
  if (requirement.minLevel != null) return m.highestLevel >= requirement.minLevel
  return true
}

export function resetMeta() {
  saveMeta(defaultMeta())
}
