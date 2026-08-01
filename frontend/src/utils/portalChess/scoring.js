// Skirmish scoring for the Grandes Maestros roguelike (Version B),
// 2026-08 core-loop redesign. `match`/`elite` map nodes are no longer
// played to checkmate — they're fast, scored skirmishes: reach the target
// score before the turn limit runs out (Balatro's "beat the blind"
// tension, chess-native). Outright checkmate/king-capture still wins
// instantly. `boss` nodes are the deliberate exception and keep the
// original full-match-to-checkmate flow (see PortalChessGM.jsx).
export const PIECE_SCORE = { P: 10, N: 30, B: 32, R: 50, Q: 90 }

// Base points for capturing `piece`, weighted by the engine's move `kind`
// classification — "special" kills (finishing a charge past a guarded
// king, or a charge itself) are the flashy, high-value plays.
export function scoreForCapture(piece, kind) {
  if (!piece) return 0
  let base = PIECE_SCORE[piece.t] || 0
  if (kind === 'kill') base *= 3
  else if (kind === 'charge') base *= 2
  return base
}

export function targetScoreForLevel(level, nodeType = 'match') {
  const base = 120 + (level - 1) * 30
  return nodeType === 'elite' ? Math.round(base * 1.6) : base
}

export function turnLimitForLevel(level, nodeType = 'match') {
  const base = Math.min(16 + Math.floor((level - 1) / 2), 30)
  return nodeType === 'elite' ? base + 6 : base
}

// Runs every owned GM's / hand card's optional `scoreModifier(ctx, event)`
// hook against a capture event and sums the bonus on top of the base
// score. `event` = { kind, captured (piece), piece (mover), baseScore }.
export function applyScoreModifiers(baseScore, event, sources) {
  let total = baseScore
  for (const source of sources) {
    if (typeof source?.scoreModifier === 'function') {
      const bonus = source.scoreModifier({ event: { ...event, baseScore } })
      if (typeof bonus === 'number' && !Number.isNaN(bonus)) total += bonus
    }
  }
  return total
}
