// Shared AI difficulty presets for both Portal Chess versions. A "level"
// maps directly to the engine's negamax search depth (see engine.js
// `chooseMove(board, color, depth, ply)`), so picking a harder difficulty
// literally makes the AI search further ahead — see aiStrength.test.js for
// an automated check that deeper search actually plays stronger chess.
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', depth: 1, desc: 'Looks one move ahead. Great for learning the rules.' },
  { id: 'medium', label: 'Medium', depth: 2, desc: 'A reasonable club-level opponent.' },
  { id: 'hard', label: 'Hard', depth: 3, desc: 'Sees short tactics and traps.' },
  { id: 'master', label: 'Master', depth: 4, desc: 'Plans several moves ahead. Punishes mistakes.' },
]

export function depthForDifficulty(id) {
  const d = DIFFICULTIES.find(x => x.id === id)
  return d ? d.depth : DIFFICULTIES[1].depth
}

// Grandes Maestros (Version B) scales the base difficulty up slightly every
// few levels, capped so a single AI move never takes too long to compute.
export function depthForLevel(difficultyId, level) {
  const base = depthForDifficulty(difficultyId)
  return Math.min(5, base + Math.floor((level - 1) / 3))
}
