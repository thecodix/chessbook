import { describe, it, expect } from 'vitest'
import {
  GMS, SQUAD_CAP, ARCHETYPE_META, SYNERGY_THRESHOLD,
  archetypeCounts, activeSynergies, SYNERGY_BONUSES, scoreModifierSources, effectiveSquadCap,
} from './gmSystem'

function owned(...ids) {
  return ids.map(id => ({ id, tier: 0 }))
}

describe('archetypeCounts', () => {
  it('tallies owned GMs by archetype, ignoring GMs without one', () => {
    const counts = archetypeCounts(owned('falange', 'corona', 'jinete'))
    expect(counts).toEqual({ guardia: 2, caballeria: 1 })
  })

  it('returns an empty object for an empty squad', () => {
    expect(archetypeCounts([])).toEqual({})
  })
})

describe('activeSynergies', () => {
  it('is empty below the synergy threshold', () => {
    expect(activeSynergies(owned('falange', 'corona'))).toEqual([])
  })

  it('activates once an archetype reaches the threshold', () => {
    // falange, corona, recluta, medico_de_campana are all "guardia"
    const squad = owned('falange', 'corona', 'recluta')
    expect(squad.length).toBe(SYNERGY_THRESHOLD)
    expect(activeSynergies(squad)).toContain('guardia')
  })

  it('every active synergy id has a matching SYNERGY_BONUSES entry and ARCHETYPE_META label', () => {
    const squad = owned('falange', 'corona', 'recluta', 'medico_de_campana')
    activeSynergies(squad).forEach(a => {
      expect(SYNERGY_BONUSES[a]).toBeTruthy()
      expect(ARCHETYPE_META[a]).toBeTruthy()
    })
  })
})

describe('scoreModifierSources', () => {
  it('includes each owned GM definition', () => {
    const squad = owned('estratega', 'falange')
    const sources = scoreModifierSources(squad)
    expect(sources).toContain(GMS.estratega)
    expect(sources).toContain(GMS.falange)
  })

  it('includes active synergy bonuses that define a scoreModifier', () => {
    // guardia's synergy bonus has no scoreModifier, so it should not appear
    // as a scoreModifier source even when active.
    const squad = owned('falange', 'corona', 'recluta')
    const sources = scoreModifierSources(squad)
    expect(sources.some(s => typeof s.scoreModifier === 'function')).toBe(false)
  })

  it("estratega's scoreModifier boosts capture score by 25%", () => {
    const [estratega] = scoreModifierSources(owned('estratega'))
    expect(estratega.scoreModifier({ event: { baseScore: 100 } })).toBe(25)
  })
})

describe('fanatico (cursed GM)', () => {
  it('is tagged as a curse with a squad-cap drawback', () => {
    expect(GMS.fanatico.rarity).toBe('curse')
    expect(GMS.fanatico.drawback).toEqual({ squadCapDelta: -1 })
  })

  it('boosts capture score by 40% via scoreModifier', () => {
    expect(GMS.fanatico.scoreModifier({ event: { baseScore: 100 } })).toBe(40)
  })
})

describe('effectiveSquadCap', () => {
  it('equals SQUAD_CAP with no drawback GMs owned', () => {
    expect(effectiveSquadCap(owned('falange', 'corona'))).toBe(SQUAD_CAP)
  })

  it('is reduced by cursed GMs carrying a squadCapDelta drawback', () => {
    expect(effectiveSquadCap(owned('falange', 'fanatico'))).toBe(SQUAD_CAP - 1)
  })
})
