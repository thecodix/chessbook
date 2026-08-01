// A short recurring "voice" across Acts (Inscryption-style dread/escalation)
// for the Grandes Maestros roguelike. Shown once per act transition (see
// `completeNode()` in PortalChessGM.jsx, reusing the existing `toast()`
// mechanism — no new UI needed). Purely flavor text, no gameplay effect.
export const NARRATOR_LINES = {
  1: 'Otro aspirante. Los huesos del último todavía calientan la silla.',
  2: 'Empiezas a entender el patrón. Eso te hace más peligroso... por ahora.',
  3: '¿Cuántas veces más vas a hacerme perder mis mejores piezas?',
  4: 'No esperaba que llegaras tan lejos. Ajustaré las reglas.',
  5: 'Cada Gran Maestro que reclutas es uno menos que yo controlo.',
  6: 'Empiezo a recordar tu nombre. Eso nunca es buena señal para ti.',
  7: 'Esto ya no es un juego para mí. Nunca lo fue para ti.',
}

const MAX_ACT = Math.max(...Object.keys(NARRATOR_LINES).map(Number))

export function narratorLineForAct(actNumber) {
  if (actNumber <= MAX_ACT) return NARRATOR_LINES[actNumber]
  return NARRATOR_LINES[MAX_ACT]
}
