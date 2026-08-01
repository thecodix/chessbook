// Act-based piece curriculum ("chapters" redesign). Instead of one flat,
// endless piece-count ramp across the whole run, each of the first
// CURRICULUM_LENGTH Acts hands the player (and the enemy) a strictly
// smaller, CUMULATIVE piece toolbox — Act 1 is pawns-only, and each
// following Act unlocks exactly one new piece type. This mirrors
// Inscryption's structure of every Act being a genuinely different
// ruleset ("a new chapter") rather than "the same game with bigger
// numbers," and it doubles as a natural tutorial curve (learn pawns
// deeply before knights are added, etc). Past the curriculum, Acts are
// "Maestría" (mastery) Acts: full roster forever, board complexity caps
// out, and the difficulty curve continues purely through enemy jokers/
// modifiers/curses — same accepted tradeoff already documented for the
// pre-curriculum endless scaling in setup.js.
export const ACT_CURRICULUM = [
  { pieces: ['P'], newPiece: null, label: 'Peones', theme: 'Solo peones. Domina la muralla antes de blandir una espada.' },
  { pieces: ['P', 'N'], newPiece: 'N', label: '+ Caballos', theme: 'El caballo salta reglas que ni los portales respetan.' },
  { pieces: ['P', 'N', 'B'], newPiece: 'B', label: '+ Alfiles', theme: 'El alfil nunca traiciona su color.' },
  { pieces: ['P', 'N', 'B', 'R'], newPiece: 'R', label: '+ Torres', theme: 'Las columnas abiertas no perdonan.' },
  { pieces: ['P', 'N', 'B', 'R', 'Q'], newPiece: 'Q', label: '+ Dama', theme: 'El arsenal está completo. Ahora, la maestría.' },
]

export const CURRICULUM_LENGTH = ACT_CURRICULUM.length

export function isMasteryAct(actNumber) {
  return actNumber > CURRICULUM_LENGTH
}

// The full theme entry for an Act (Mastery Acts reuse the final curriculum
// entry's piece set, but with their own label/theme line).
export function themeForAct(actNumber) {
  if (isMasteryAct(actNumber)) {
    return { pieces: ACT_CURRICULUM[CURRICULUM_LENGTH - 1].pieces, newPiece: null, label: 'Maestría', theme: 'Ya no hay reglas nuevas que aprender. Solo sobrevivir.' }
  }
  return ACT_CURRICULUM[Math.max(0, actNumber - 1)]
}

export function piecesForAct(actNumber) {
  return themeForAct(actNumber).pieces
}
