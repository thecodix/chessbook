// Version A — "Portal Chess": a focused single-match variant exploring
// portal mechanics only (no roguelike jokers/economy layer — see
// PortalChessGM.jsx for that). Supports 6x6/8x8 boards and four portal
// rulesets: Fixed, One-way, Decaying, and a Buckley-inspired Player-placed
// movable-portal mode (that last mode is local 2-player, no AI — see notes
// below).
import { useMemo, useState } from 'react'
import PortalBoard from '../components/PortalBoard'
import { createEngine, other } from '../utils/portalChess/engine'
import { createTileMap } from '../utils/portalChess/tiles'
import { classicSetup, defaultPortalSquares, portalPlacementRows } from '../utils/portalChess/setup'
import { SFX } from '../utils/portalChess/sound'
import { DIFFICULTIES, depthForDifficulty } from '../utils/portalChess/difficulty'
import { CARDS, drawCards, isValidCardTarget } from '../utils/portalChess/cards'
import { MODIFIERS, MODIFIER_IDS } from '../utils/portalChess/modifiers'
import '../components/portalChess.css'

const MODES = [
  { id: 'fixed', label: 'Fixed portals', desc: 'A permanent linked pair. Land on one, appear on the other.' },
  { id: 'oneway', label: 'One-way portal', desc: 'Enter the mouth, exit the other side — but never in reverse.' },
  { id: 'decaying', label: 'Decaying portal', desc: 'The pair vanishes after 16 plies. Use it before it closes.' },
  { id: 'playerplaced', label: 'Player-placed (2-player)', desc: 'Each player places & moves their own portal on their 4th rank. Two portals colliding rips open a black hole. Local 2-player — no AI in this mode.' },
]

function appendLog(setLog, html) { setLog(html) }

function findKingSimple(board, color, N) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const p = board[r][c]; if (p && p.color === color && p.t === 'K') return [r, c] }
  return null
}

export default function PortalChess() {
  const [N, setN] = useState(8)
  const [mode, setMode] = useState('fixed')
  const [difficulty, setDifficulty] = useState('hard')
  const [modifierId, setModifierId] = useState(null)
  const [phase, setPhase] = useState('setup') // setup | placing-w | placing-b | playing | over
  const [board, setBoard] = useState(null)
  const [tileMap, setTileMap] = useState(null)
  const [ply, setPly] = useState(0)
  const [turn, setTurn] = useState('w')
  const [selected, setSelected] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [lastMove, setLastMove] = useState(null)
  const [log, setLog] = useState('Configure a match and press Start.')
  const [busy, setBusy] = useState(false)
  const [winner, setWinner] = useState(null)
  const [pendingWhitePortal, setPendingWhitePortal] = useState(null)
  const [portalPairId, setPortalPairId] = useState(null)
  const [actionMode, setActionMode] = useState('piece') // piece | portal (playerplaced only)
  const [hand, setHand] = useState([])
  const [cardMode, setCardMode] = useState(null)
  const [bonusMoves, setBonusMoves] = useState(0)

  const depth = depthForDifficulty(difficulty)

  const engine = useMemo(() => (
    tileMap ? createEngine({ N, world: tileMap, rules: { guardedKings: false, mods: false } }) : null
  ), [N, tileMap])

  const isPlayerPlaced = mode === 'playerplaced'

  function startGame() {
    const b = classicSetup(N)
    const tm = createTileMap(N)
    if (!isPlayerPlaced) {
      const [[r1, c1], [r2, c2]] = defaultPortalSquares(N)
      tm.addPortalPair(r1, c1, r2, c2, { oneWay: mode === 'oneway', ttl: mode === 'decaying' ? 16 : null, ply: 0 })
    }
    if (modifierId) MODIFIERS[modifierId].apply({ board: b, tileMap: tm, N, findKing: (bd, col) => findKingSimple(bd, col, N) })
    setBoard(b)
    setTileMap(tm)
    setPly(0)
    setTurn('w')
    setSelected(null)
    setLegalMoves([])
    setLastMove(null)
    setWinner(null)
    setBusy(false)
    setActionMode('piece')
    setPendingWhitePortal(null)
    setPortalPairId(null)
    setHand(drawCards(2))
    setCardMode(null)
    setBonusMoves(0)
    if (isPlayerPlaced) {
      const { white } = portalPlacementRows(N)
      setPhase('placing-w')
      appendLog(setLog, `White: click any empty square on rank row ${N - white} to place your portal.`)
    } else {
      setPhase('playing')
      appendLog(setLog, 'Your move (White).')
    }
  }

  function handlePlacementClick(r, c) {
    const { white, black } = portalPlacementRows(N)
    if (phase === 'placing-w') {
      if (r !== white || board[r][c]) return
      setPendingWhitePortal([r, c])
      setPhase('placing-b')
      appendLog(setLog, `Black: click any empty square on your 4th rank to place your portal.`)
    } else if (phase === 'placing-b') {
      if (r !== black || board[r][c]) return
      const [wr, wc] = pendingWhitePortal
      const pairId = tileMap.addOwnedPortalPair(wr, wc, r, c)
      setPortalPairId(pairId)
      setPhase('playing')
      setTurn('w')
      appendLog(setLog, 'Both portals placed. White to move — choose to move a piece or your portal each turn.')
    }
  }

  function endGame(winnerColor) {
    setWinner(winnerColor)
    setPhase('over')
    setBusy(false)
    winnerColor ? SFX.win() : SFX.lose()
  }

  function playCard(id) {
    if (busy || (!isPlayerPlaced && turn !== 'w')) return
    const card = CARDS[id]
    if (!card) return
    if (cardMode === id) { setCardMode(null); return }
    if (card.targetType === 'none') { resolveCard(id, null); return }
    setCardMode(id)
  }

  function resolveCard(id, target) {
    const card = CARDS[id]
    const nb = board.map(row => row.map(x => (x ? { ...x } : null)))
    const result = card.apply({ board: nb, tileMap, N, findKing: engine.findKing, color: turn, ply, target }) || {}
    setBoard(nb)
    setHand(h => h.filter(x => x !== id))
    setCardMode(null)
    SFX.card()
    if (result.extraTurn) { setBonusMoves(b => b + 1); appendLog(setLog, `Carta jugada: <b>${card.name}</b>. ¡Juega otra vez!`) }
    else appendLog(setLog, `Carta jugada: <b>${card.name}</b>.`)
  }

  function handleCardTargetClick(r, c) {
    const card = CARDS[cardMode]
    if (!isValidCardTarget(card, { board, tileMap, N, color: turn, ply }, r, c)) {
      appendLog(setLog, 'Objetivo inválido para esta carta.')
      return
    }
    resolveCard(cardMode, { r, c })
  }

  function afterMoveCommon(nb, nextPly, moverColor) {
    setBoard(nb)
    setPly(nextPly)
    if (mode === 'decaying') tileMap.tickDecay(nextPly)
    if (!engine.findKing(nb, other(moverColor))) { endGame(moverColor); return true }
    return false
  }

  function aiMove(curBoard, curPly) {
    const mv = engine.chooseMove(curBoard, 'b', depth, curPly)
    if (!mv) {
      setBusy(false); setTurn('w')
      appendLog(setLog, '<span class="pc-en">Black</span> has no legal move. Your turn.')
      return
    }
    const { board: nb, captured, teleported } = engine.applyMove(curBoard, mv, curPly)
    setLastMove({ fr: mv.fr, fc: mv.fc, tr: mv.tr, tc: mv.tc, color: 'b', hit: !!captured })
    if (captured) SFX.capture(); else if (teleported) SFX.teleport(); else SFX.move()
    const nextPly = curPly + 1
    if (afterMoveCommon(nb, nextPly, 'b')) return
    appendLog(setLog, captured ? `<span class="pc-en">Black</span> captures.` : teleported ? `<span class="pc-en">Black</span> <span class="pc-po">teleports</span>.` : `<span class="pc-en">Black</span> moves.`)
    setTurn('w')
    setBusy(false)
  }

  function handlePieceSquareClick(r, c) {
    if (busy || turn !== 'w' && !isPlayerPlaced) return
    if (isPlayerPlaced && turn !== 'w' && turn !== 'b') return
    if (selected) {
      const mv = legalMoves.find(m => m.tr === r && m.tc === c)
      if (mv) {
        const fr = selected[0], fc = selected[1]
        const { board: nb, captured, teleported } = engine.applyMove(board, { fr, fc, tr: mv.tr, tc: mv.tc, kind: mv.kind }, ply)
        setLastMove({ fr, fc, tr: mv.tr, tc: mv.tc, color: turn, hit: !!captured })
        if (captured) SFX.capture(); else if (teleported) SFX.teleport(); else SFX.move()
        setSelected(null); setLegalMoves([])
        const nextPly = ply + 1
        const mover = turn
        if (afterMoveCommon(nb, nextPly, mover)) return
        appendLog(setLog, captured ? 'Capture!' : teleported ? '<span class="pc-po">Teleported</span> through the portal.' : 'Move played.')
        if (bonusMoves > 0) {
          setBonusMoves(b => b - 1)
          appendLog(setLog, 'Bonus move! Play again.')
        } else if (isPlayerPlaced) {
          setTurn(other(mover))
        } else {
          setTurn('b'); setBusy(true)
          setTimeout(() => aiMove(nb, nextPly), 380)
        }
        return
      }
    }
    const piece = board[r][c]
    if (piece && piece.color === turn) {
      setSelected([r, c])
      setLegalMoves(engine.genMoves(board, r, c, ply))
    } else {
      setSelected(null); setLegalMoves([])
    }
  }

  function handlePortalActionClick(r, c) {
    if (busy) return
    const rec = tileMap.portalRecords().find(p => p.pairId === portalPairId && p.role === turn)
    if (!rec) return
    const dist = Math.max(Math.abs(r - rec.r), Math.abs(c - rec.c))
    if (dist !== 1) { appendLog(setLog, 'Your portal can only move one square per turn.'); return }
    const result = tileMap.movePortalMarker(portalPairId, turn, r, c, board)
    if (!result.ok) { appendLog(setLog, 'Invalid portal move (destination blocked or partner occupied).'); return }
    let nb = board
    if (result.teleport) {
      nb = board.map(row => row.map(x => (x ? { ...x } : null)))
      const [fr, fc] = result.teleport.from, [tr, tc] = result.teleport.to
      nb[tr][tc] = nb[fr][fc]
      nb[fr][fc] = null
      SFX.teleport()
    }
    if (result.blackHoleAt) {
      nb = nb === board ? board.map(row => row.map(x => (x ? { ...x } : null))) : nb
      for (const [cr, cc] of result.cleared) nb[cr][cc] = null
      SFX.blackhole()
      appendLog(setLog, 'A <span class="pc-po">black hole</span> tore open, erasing everything nearby!')
    }
    const nextPly = ply + 1
    setBoard(nb)
    setPly(nextPly)
    if (!engine.findKing(nb, 'w')) { endGame('b'); return }
    if (!engine.findKing(nb, 'b')) { endGame('w'); return }
    setActionMode('piece')
    setTurn(other(turn))
  }

  function handleSquareClick(r, c) {
    if (cardMode) return handleCardTargetClick(r, c)
    if (phase === 'placing-w' || phase === 'placing-b') return handlePlacementClick(r, c)
    if (phase !== 'playing') return
    if (isPlayerPlaced && actionMode === 'portal') return handlePortalActionClick(r, c)
    return handlePieceSquareClick(r, c)
  }

  const portalMarkers = (isPlayerPlaced && tileMap && phase === 'playing')
    ? tileMap.portalRecords().map(rec => ({ r: rec.r, c: rec.c, role: rec.role, selectable: rec.role === turn && actionMode === 'portal' }))
    : []

  const cardTargetSquares = []
  if (cardMode && board) {
    const card = CARDS[cardMode]
    const ctx = { board, tileMap, N, color: turn, ply }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (isValidCardTarget(card, ctx, r, c)) cardTargetSquares.push({ r, c })
  }

  return (
    <div className="pc-app">
      <div className="pc-eyebrow">Chessbook · Variant</div>
      <div className="pc-title">Portal Chess</div>

      {phase === 'setup' && (
        <>
          <div className="pc-subtitle">Pick a board size and a portal ruleset, then start a match.</div>
          <div className="pc-panel">
            <div className="pc-label" style={{ marginBottom: 6 }}>Board size</div>
            <div className="pc-seg">
              <button className={N === 6 ? 'pc-active' : ''} onClick={() => setN(6)}>6×6</button>
              <button className={N === 8 ? 'pc-active' : ''} onClick={() => setN(8)}>8×8</button>
            </div>
          </div>
          <div className="pc-panel">
            <div className="pc-label" style={{ marginBottom: 6 }}>Portal ruleset</div>
            {MODES.map(m => (
              <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
                <input type="radio" name="pc-mode" checked={mode === m.id} onChange={() => setMode(m.id)} style={{ marginTop: 3 }} />
                <span>
                  <div style={{ fontWeight: 600, color: 'var(--pc-amber-bright)', fontSize: 12 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--pc-muted)' }}>{m.desc}</div>
                </span>
              </label>
            ))}
          </div>
          {!isPlayerPlaced && (
            <div className="pc-panel">
              <div className="pc-label" style={{ marginBottom: 6 }}>AI difficulty</div>
              <div className="pc-seg">
                {DIFFICULTIES.map(d => (
                  <button key={d.id} className={difficulty === d.id ? 'pc-active' : ''} title={d.desc} onClick={() => setDifficulty(d.id)}>{d.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="pc-panel">
            <div className="pc-label" style={{ marginBottom: 6 }}>Modifier (optional)</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
              <input type="radio" name="pc-modifier" checked={!modifierId} onChange={() => setModifierId(null)} style={{ marginTop: 3 }} />
              <span><div style={{ fontWeight: 600, color: 'var(--pc-amber-bright)', fontSize: 12 }}>None</div></span>
            </label>
            {MODIFIER_IDS.map(id => {
              const m = MODIFIERS[id]
              return (
                <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
                  <input type="radio" name="pc-modifier" checked={modifierId === id} onChange={() => setModifierId(id)} style={{ marginTop: 3 }} />
                  <span>
                    <div style={{ fontWeight: 600, color: 'var(--pc-amber-bright)', fontSize: 12 }}>{m.icon} {m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--pc-muted)' }}>{m.desc}</div>
                  </span>
                </label>
              )
            })}
          </div>
          <button className="pc-btn" onClick={startGame}>Start match</button>
        </>
      )}

      {phase !== 'setup' && (
        <>
          <div className="pc-statusbar">
            <div className={`pc-orb${turn === 'b' ? ' pc-enemy' : ''}`} />
            <div className="pc-log" dangerouslySetInnerHTML={{ __html: log }} />
          </div>

          {isPlayerPlaced && phase === 'playing' && (
            <div className="pc-row">
              <div className="pc-seg">
                <button className={actionMode === 'piece' ? 'pc-active' : ''} onClick={() => { setActionMode('piece'); setSelected(null); setLegalMoves([]) }}>Move a piece</button>
                <button className={actionMode === 'portal' ? 'pc-active' : ''} onClick={() => { setActionMode('portal'); setSelected(null); setLegalMoves([]) }}>Move my portal</button>
              </div>
            </div>
          )}

          <PortalBoard
            N={N}
            board={board}
            tileMap={tileMap}
            ply={ply}
            selected={selected}
            legalMoves={legalMoves}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
            interactive={phase === 'playing' || phase === 'placing-w' || phase === 'placing-b'}
            guardsEnabled={false}
            portalMarkers={portalMarkers}
            cardTargets={cardTargetSquares}
          />

          <div className="pc-legend">
            <span><i className="pc-move" /> move</span>
            <span><i className="pc-capture" /> capture</span>
          </div>

          {phase === 'playing' && hand.length > 0 && (!isPlayerPlaced ? turn === 'w' : true) && (
            <div className="pc-panel">
              <div className="pc-label" style={{ marginBottom: 6 }}>Cards</div>
              {cardMode && <div className="pc-cardhint">Choose a target on the board (or tap the card again to cancel).</div>}
              <div className="pc-cardrow">
                {hand.map(id => {
                  const c = CARDS[id]
                  return (
                    <button key={id} className={`pc-card${cardMode === id ? ' pc-active' : ''}`} title={c.desc} onClick={() => playCard(id)}>
                      <span className="pc-card-icon">{c.icon}</span>
                      <span className="pc-card-name">{c.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {phase === 'over' && (
            <div className="pc-overlay">
              <div className="pc-modal">
                <div className="pc-me">Match over</div>
                <h2 className={winner === 'b' ? 'pc-loss' : ''}>{winner === 'w' ? 'White wins!' : 'Black wins!'}</h2>
                <p>The {winner === 'w' ? 'black' : 'white'} king has fallen.</p>
                <button className="pc-btn" onClick={() => setPhase('setup')}>New match</button>
              </div>
            </div>
          )}

          {phase !== 'over' && (
            <button className="pc-btn pc-alt" onClick={() => setPhase('setup')}>Abandon match</button>
          )}
        </>
      )}
    </div>
  )
}
