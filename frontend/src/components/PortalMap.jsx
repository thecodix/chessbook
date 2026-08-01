// Branching map screen for the Grandes Maestros roguelike (Version B),
// 2026-08 redesign. Renders one "act" (see mapGen.js) as a vertical list of
// layers; only the layer right after the last cleared node is clickable —
// earlier layers render as cleared/dimmed, later layers render locked.
import { layerIndexOfNode, nextLayerIndex } from '../utils/portalChess/mapGen'

const NODE_META = {
  match: { icon: '⚔', label: 'Combate', desc: 'Escaramuza: alcanza el objetivo de puntos antes de quedarte sin turnos (o da jaque mate).' },
  elite: { icon: '🔥', label: 'Élite', desc: 'Escaramuza más dura, con un modificador que favorece al enemigo. Mejor recompensa.' },
  event: { icon: '🕯', label: 'Evento', desc: 'Elección narrativa: oro, cartas o un Gran Maestro gratis, sin combate.' },
  rest: { icon: '🏕', label: 'Descanso', desc: 'Mejora un Gran Maestro o gana oro extra, sin riesgo.' },
  shop: { icon: '🛒', label: 'La Tertulia', desc: 'Recluta nuevos Grandes Maestros o mejora los que ya tienes.' },
  boss: { icon: '👑', label: 'Jefe de Acto', desc: 'Combate completo a jaque mate, sin límite de turnos. Supera el Acto.' },
}

export default function PortalMap({ act, clearedNodeId, onSelectNode }) {
  const reachableLayer = nextLayerIndex(act, clearedNodeId)
  const clearedLayer = clearedNodeId ? layerIndexOfNode(act, clearedNodeId) : -1

  return (
    <div className="pc-panel pc-map">
      <div className="pc-shop-title">Acto {act.actNumber}</div>
      <div className="pc-shop-sub">Elige tu próximo destino. Llega al 👑 Jefe para superar el Acto.</div>
      <div className="pc-map-legend">
        {Object.entries(NODE_META).map(([type, meta]) => (
          <span key={type} className="pc-map-legend-item" title={meta.desc}>{meta.icon} {meta.label}</span>
        ))}
      </div>
      <div className="pc-map-layers">
        {act.layers.map((layer, i) => {
          const state = i < reachableLayer ? 'cleared' : i === reachableLayer ? 'active' : 'locked'
          return (
            <div key={layer.level} className={`pc-map-layer pc-map-${state}`}>
              <div className="pc-map-layer-label">Nv. {layer.level}</div>
              <div className="pc-map-nodes">
                {layer.nodes.map(node => {
                  const meta = NODE_META[node.type]
                  const clickable = state === 'active'
                  const wasCleared = i <= clearedLayer && i === layerIndexOfNode(act, clearedNodeId)
                  return (
                    <button
                      key={node.id}
                      className={`pc-map-node pc-map-node-${node.type}${clickable ? ' pc-map-clickable' : ''}${wasCleared ? ' pc-map-node-done' : ''}`}
                      disabled={!clickable}
                      onClick={() => clickable && onSelectNode(node)}
                      title={meta.desc}
                    >
                      <span className="pc-map-node-icon">{meta.icon}</span>
                      <span className="pc-map-node-label">{meta.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
