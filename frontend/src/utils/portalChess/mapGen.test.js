import { describe, it, expect } from 'vitest'
import { ACT_LENGTH, generateAct, findNode, layerIndexOfNode, nextLayerIndex, isActComplete } from './mapGen'

function seededRng(seed) {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

describe('generateAct', () => {
  it('produces ACT_LENGTH layers, ending in a single boss node', () => {
    const act = generateAct(1, 1, seededRng(1))
    expect(act.layers).toHaveLength(ACT_LENGTH)
    const lastLayer = act.layers[act.layers.length - 1]
    expect(lastLayer.nodes).toHaveLength(1)
    expect(lastLayer.nodes[0].type).toBe('boss')
  })

  it('every non-boss layer offers at least 2 node choices', () => {
    const act = generateAct(1, 1, seededRng(7))
    act.layers.slice(0, -1).forEach(layer => {
      expect(layer.nodes.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('levels increment sequentially starting at startLevel', () => {
    const act = generateAct(2, 9, seededRng(3))
    expect(act.layers[0].level).toBe(9)
    expect(act.layers[act.layers.length - 1].level).toBe(9 + ACT_LENGTH - 1)
  })
})

describe('map navigation helpers', () => {
  it('nextLayerIndex is 0 for a fresh act', () => {
    const act = generateAct(1, 1, seededRng(2))
    expect(nextLayerIndex(act, null)).toBe(0)
  })

  it('nextLayerIndex advances past a cleared node', () => {
    const act = generateAct(1, 1, seededRng(2))
    const firstNodeId = act.layers[0].nodes[0].id
    expect(nextLayerIndex(act, firstNodeId)).toBe(1)
  })

  it('findNode and layerIndexOfNode locate a node by id', () => {
    const act = generateAct(1, 1, seededRng(4))
    const bossId = act.layers[act.layers.length - 1].nodes[0].id
    expect(findNode(act, bossId).type).toBe('boss')
    expect(layerIndexOfNode(act, bossId)).toBe(act.layers.length - 1)
  })

  it('isActComplete is true only once the boss node is cleared', () => {
    const act = generateAct(1, 1, seededRng(5))
    const bossId = act.layers[act.layers.length - 1].nodes[0].id
    const firstNodeId = act.layers[0].nodes[0].id
    expect(isActComplete(act, firstNodeId)).toBe(false)
    expect(isActComplete(act, bossId)).toBe(true)
  })
})
