// Narrative "event" map nodes for the Grandes Maestros roguelike (Version
// B), 2026-08 redesign — the first injection of Inscryption-style flavor:
// a short prompt + two risk/reward choices, resolved instantly (no board
// involved). Each choice is declarative (`effect`) so the screen component
// can apply it without any bespoke per-event logic:
//   goldDelta      — add/subtract gold (can go negative, clamped at 0)
//   drawCards      — draw N cards into the hand (respecting HAND_CAP)
//   discardCount   — discard N random cards from the hand (if any)
//   freeGM         — grant a random unowned common-rarity GM for free
//     (ignored if the squad is already at SQUAD_CAP)
export const EVENTS = {
  mercado_negro: {
    title: 'Mercado Negro',
    icon: '🕯',
    prompt: 'Un comerciante encapuchado ofrece una carta a cambio de tu oro.',
    choices: [
      { label: 'Pagar 4 de oro', effect: { goldDelta: -4, drawCards: 1 } },
      { label: 'Rechazar la oferta', effect: { goldDelta: 2 } },
    ],
  },
  ofrenda_de_sangre: {
    title: 'Ofrenda de Sangre',
    icon: '🩸',
    prompt: 'Un altar antiguo pide un sacrificio a cambio de poder.',
    choices: [
      { label: 'Sacrificar una carta al azar', effect: { discardCount: 1, drawCards: 2 } },
      { label: 'Alejarse', effect: { goldDelta: 1 } },
    ],
  },
  reclutador_errante: {
    title: 'Reclutador Errante',
    icon: '🚩',
    prompt: 'Un aspirante a Gran Maestro se ofrece a unirse a tu escuadra sin costo.',
    choices: [
      { label: 'Aceptarlo', effect: { freeGM: true } },
      { label: 'Rechazarlo por oro', effect: { goldDelta: 3 } },
    ],
  },
  ruinas_olvidadas: {
    title: 'Ruinas Olvidadas',
    icon: '🏚',
    prompt: 'Entre los escombros encuentras cofres sin abrir.',
    choices: [
      { label: 'Registrar todo (arriesgado)', effect: { goldDelta: 6 } },
      { label: 'Tomar solo lo seguro', effect: { goldDelta: 2, drawCards: 1 } },
    ],
  },
  vidente_ciega: {
    title: 'La Vidente Ciega',
    icon: '👁',
    prompt: 'Ella ve el hilo de tu destino, pero su ayuda tiene un precio.',
    choices: [
      { label: 'Pagar por una visión', effect: { goldDelta: -3, drawCards: 2 } },
      { label: 'Confiar en tu instinto', effect: { goldDelta: 0 } },
    ],
  },
  campamento_abandonado: {
    title: 'Campamento Abandonado',
    icon: '⛺',
    prompt: 'Restos de un campamento rival — quizá quede algo de valor.',
    choices: [
      { label: 'Buscar provisiones', effect: { goldDelta: 4 } },
      { label: 'Seguir de largo', effect: { drawCards: 1 } },
    ],
  },
}

export const EVENT_IDS = Object.keys(EVENTS)

export function randomEvent(rng = Math.random) {
  const id = EVENT_IDS[Math.floor(rng() * EVENT_IDS.length)]
  return { id, ...EVENTS[id] }
}
