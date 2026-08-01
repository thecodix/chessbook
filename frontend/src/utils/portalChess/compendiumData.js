// Aggregates all Portal Chess "Grandes Maestros" content into flat,
// display-ready entries for the Compendium screen (2026-08 redesign, Plan
// v3) — a browsable in-run/out-of-run wiki of every Great Master, card,
// enemy family joker, and modifier. Locked entries (gated behind a
// `unlockRequirement: { minLevel }`, see runMeta.js) are still returned
// here (with `unlocked: false`) so the UI can render a masked "???" card
// rather than omitting them outright — this is deliberate: knowing
// *something* is still locked is part of the Inscryption-style curiosity
// hook.
import { GMS, ARCHETYPE_META } from './gmSystem'
import { CARDS } from './cards'
import { ENEMY_FAMILIES } from './enemyFamilies'
import { MODIFIERS, ELITE_MODIFIERS } from './modifiers'
import { isUnlocked } from './runMeta'

function unlockedFor(entry) {
  return !entry.unlockRequirement || isUnlocked(entry.unlockRequirement)
}

export function getGMEntries() {
  return Object.entries(GMS).map(([id, gm]) => ({
    id,
    category: 'gm',
    name: gm.name,
    icon: gm.icon,
    desc: gm.desc,
    rarity: gm.rarity,
    cost: gm.cost,
    hasUpgrade: !!gm.upgrade,
    upgradeDesc: gm.upgrade ? gm.upgrade.desc : null,
    archetypeLabel: gm.archetype ? ARCHETYPE_META[gm.archetype]?.label : null,
    archetypeIcon: gm.archetype ? ARCHETYPE_META[gm.archetype]?.icon : null,
    drawbackLabel: gm.drawback?.squadCapDelta ? `Escuadra ${gm.drawback.squadCapDelta}` : null,
    unlocked: unlockedFor(gm),
  }))
}

export function getCardEntries() {
  return Object.entries(CARDS).map(([id, card]) => ({
    id,
    category: 'card',
    name: card.name,
    icon: card.icon,
    desc: card.desc,
    rarity: card.rarity,
    unlocked: unlockedFor(card),
  }))
}

export function getEnemyFamilyEntries() {
  const entries = []
  Object.entries(ENEMY_FAMILIES).forEach(([familyId, family]) => {
    Object.entries(family.jokers).forEach(([jokerId, joker]) => {
      entries.push({
        id: `${familyId}:${jokerId}`,
        category: 'enemy',
        name: joker.name,
        icon: joker.icon,
        desc: joker.desc,
        familyLabel: family.label,
        quote: family.quote,
        boss: false,
        unlocked: true,
      })
    })
    if (family.bossJokers) {
      Object.entries(family.bossJokers).forEach(([jokerId, joker]) => {
        entries.push({
          id: `${familyId}:${jokerId}`,
          category: 'enemy',
          name: joker.name,
          icon: joker.icon,
          desc: joker.desc,
          familyLabel: family.label,
          quote: family.quote,
          boss: true,
          unlocked: true,
        })
      })
    }
  })
  return entries
}

export function getModifierEntries() {
  const symmetric = Object.entries(MODIFIERS).map(([id, m]) => ({
    id, category: 'modifier', name: m.name, icon: m.icon, desc: m.desc, asymmetric: false, unlocked: true,
  }))
  const asymmetric = Object.entries(ELITE_MODIFIERS).map(([id, m]) => ({
    id, category: 'modifier', name: m.name, icon: m.icon, desc: m.desc, asymmetric: true, unlocked: true,
  }))
  return [...symmetric, ...asymmetric]
}

export const CATEGORIES = [
  { id: 'gm', label: 'Great Masters', getEntries: getGMEntries },
  { id: 'card', label: 'Cards', getEntries: getCardEntries },
  { id: 'enemy', label: 'Enemy Families', getEntries: getEnemyFamilyEntries },
  { id: 'modifier', label: 'Modifiers', getEntries: getModifierEntries },
]

export function getAllEntries() {
  return CATEGORIES.flatMap(cat => cat.getEntries().map(e => ({ ...e, categoryLabel: cat.label })))
}
