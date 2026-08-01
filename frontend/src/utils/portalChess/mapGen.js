// Branching map generator for the Grandes Maestros roguelike (Version B),
// 2026-08 redesign. Replaces the old 100%-linear `level -> shop -> level`
// flow: an "act" is a sequence of layers, each offering 2-3 node choices
// (StS/Balatro-style meaningful pick every level), ending in a single
// mandatory `boss` node. Simplified graph model (documented tradeoff): all
// nodes in a layer are reachable from any node in the previous layer (no
// per-edge constraints) — still a genuine "branching map" in the sense
// that matters here (a real choice every level), just without hand-drawn
// connecting lines between specific node pairs.
export const ACT_LENGTH = 8 // levels per act, last one is always the boss

// Per-layer-index candidate node types (index 0 = first level of the act).
// `elite` only appears from layer 3 onward (mirrors the old depth-scaling
// cadence of "things get harder every 3 levels").
const LAYER_TEMPLATES = [
  ['match', 'match'],
  ['shop', 'match'],
  ['event', 'match'],
  ['elite', 'match'],
  ['rest', 'shop'],
  ['event', 'elite'],
  ['match', 'elite', 'shop'],
]

function pickWidth(candidates, rng) {
  // Occasionally add a 3rd slot (falls back to 'match') for extra variety.
  const width = candidates.length
  return rng() < 0.3 && width < 3 ? width + 1 : width
}

export function generateAct(actNumber, startLevel, rng = Math.random) {
  const layers = []
  for (let i = 0; i < ACT_LENGTH - 1; i++) {
    const level = startLevel + i
    const template = LAYER_TEMPLATES[i % LAYER_TEMPLATES.length]
    const width = pickWidth(template, rng)
    const types = []
    for (let w = 0; w < width; w++) types.push(template[w] ?? 'match')
    layers.push({
      level,
      nodes: types.map((t, idx) => ({ id: `L${level}-${idx}`, type: t, level })),
    })
  }
  const bossLevel = startLevel + ACT_LENGTH - 1
  layers.push({ level: bossLevel, nodes: [{ id: `L${bossLevel}-boss`, type: 'boss', level: bossLevel }] })
  return { actNumber, startLevel, layers }
}

export function findNode(act, nodeId) {
  for (const layer of act.layers) {
    const n = layer.nodes.find(x => x.id === nodeId)
    if (n) return n
  }
  return null
}

export function layerIndexOfNode(act, nodeId) {
  return act.layers.findIndex(layer => layer.nodes.some(n => n.id === nodeId))
}

// The reachable layer for a fresh act (nothing cleared yet) is layer 0; once
// `clearedNodeId` is given, the next reachable layer is the one right after it.
export function nextLayerIndex(act, clearedNodeId) {
  if (!clearedNodeId) return 0
  const idx = layerIndexOfNode(act, clearedNodeId)
  return idx === -1 ? 0 : idx + 1
}

export function isActComplete(act, clearedNodeId) {
  const idx = layerIndexOfNode(act, clearedNodeId)
  return idx === act.layers.length - 1
}
