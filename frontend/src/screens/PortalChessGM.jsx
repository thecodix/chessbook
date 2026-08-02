// Version B — "Portal Chess: Grandes Maestros": the full roguelike port of
// the portalchess.html prototype. 2026-08 core-loop redesign: a branching
// per-act map (mapGen.js) replaces the old always-linear
// `level -> shop -> level` flow; `match`/`elite` nodes are fast, scored
// skirmishes (scoring.js) instead of full games-to-checkmate; `boss` nodes
// (once per 8-level act) keep the original full-checkmate flow as the
// deliberate "epic" climax; cross-run meta-progression (runMeta.js) gates
// newer content behind "reach level N once" unlocks.
import { useEffect, useMemo, useRef, useState } from 'react'
import PortalBoard from '../components/PortalBoard'
import PortalMap from '../components/PortalMap'
import { createEngine, other } from '../utils/portalChess/engine'
import { createTileMap, restoreTileMap } from '../utils/portalChess/tiles'
import { skirmishSetup } from '../utils/portalChess/setup'
import { piecesForAct, themeForAct } from '../utils/portalChess/actThemes'
import {
  GMS, START_GM_CHOICES, hasGM, ARCHETYPE_META,
  archetypeCounts, activeSynergies, SYNERGY_BONUSES, scoreModifierSources, effectiveSquadCap,
} from '../utils/portalChess/gmSystem'
import { rollEnemyJokers } from '../utils/portalChess/enemyFamilies'
import { SFX } from '../utils/portalChess/sound'
import { DIFFICULTIES, depthForLevel } from '../utils/portalChess/difficulty'
import { CARDS, HAND_CAP, drawCards, isValidCardTarget } from '../utils/portalChess/cards'
import { MODIFIERS, modifierForLevel, randomEliteModifier } from '../utils/portalChess/modifiers'
import { scoreForCapture, targetScoreForLevel, turnLimitForLevel, applyScoreModifiers } from '../utils/portalChess/scoring'
import { ACT_LENGTH, generateAct } from '../utils/portalChess/mapGen'
import { randomEvent } from '../utils/portalChess/events'
import { narratorLineForAct } from '../utils/portalChess/narrator'
import * as runMeta from '../utils/portalChess/runMeta'
import '../components/portalChess.css'

const STORAGE_KEY = 'chessbook_portalchess_gm_run'
const PERSISTED_PHASES = ['map', 'level-intro', 'match', 'shop', 'event', 'rest']

function saveRun(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* storage unavailable/full — ignore */ } }
function loadRun() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null } catch { return null } }
function clearRun() { try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } }

function soundFor(kind, captured) {
  if (kind === 'charge') SFX.charge()
  else if (kind === 'kill' || (captured && captured.t === 'K')) SFX.kill()
  else if (captured) SFX.capture()
  else SFX.move()
}

export default function PortalChessGM() {
  const [runPhase, setRunPhase] = useState('intro') // intro | chooseStart | map | level-intro | match | shop | event | rest
  const [overlay, setOverlay] = useState(null) // null | 'win' | 'loss'
  const [hasSaved, setHasSaved] = useState(false)

  const [N, setN] = useState(6)
  const [difficulty, setDifficulty] = useState('medium')
  const [gms, setGms] = useState([]) // [{ id, tier }]
  const [money, setMoney] = useState(4)

  const [act, setAct] = useState(null)
  const [clearedNodeId, setClearedNodeId] = useState(null)
  const [currentNode, setCurrentNode] = useState(null)
  const [level, setLevel] = useState(1)
  const [modifierInfo, setModifierInfo] = useState(null)
  const [eventInfo, setEventInfo] = useState(null)

  const [streak, setStreak] = useState(0)
  const [totalWinsThisRun, setTotalWinsThisRun] = useState(0)
  const [score, setScore] = useState(0)
  const [scoreTarget, setScoreTarget] = useState(null)
  const [turnsLeft, setTurnsLeft] = useState(null)

  const [board, setBoard] = useState(null)
  const [tileMap, setTileMap] = useState(null)
  const [ply, setPly] = useState(0)
  const [turn, setTurn] = useState('w')
  const [playMode, setPlayMode] = useState('manual') // manual | auto
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [lastMove, setLastMove] = useState(null)
  const [log, setLog] = useState('—')
  const [enemyInfo, setEnemyInfo] = useState(null)
  const [pendingReward, setPendingReward] = useState(0)
  const [pendingCard, setPendingCard] = useState(null)
  const [offers, setOffers] = useState([])
  const [toastMsg, setToastMsg] = useState('')
  const [hand, setHand] = useState([])
  const [cardMode, setCardMode] = useState(null)
  const [bonusMoves, setBonusMoves] = useState(0)
  const [biggestSingleTurnScore, setBiggestSingleTurnScore] = useState(0)
  const [pendingFlawless, setPendingFlawless] = useState(false)
  const toastTimer = useRef(null)
  const tookDamageRef = useRef(false)
  const bossGimmickRef = useRef({})

  const engine = useMemo(
    () => (tileMap ? createEngine({ N, world: tileMap, rules: { guardedKings: true, mods: true } }) : null),
    [N, tileMap],
  )
  const isSkirmish = !!currentNode && currentNode.type !== 'boss'
  const meta = runMeta.getMetaState()
  const synergies = activeSynergies(gms)
  const danger = isSkirmish && scoreTarget != null && turnsLeft != null && turnsLeft <= 3 && score < scoreTarget

  useEffect(() => { setHasSaved(!!loadRun()) }, [])

  // Persist the active run after every meaningful state change.
  useEffect(() => {
    if (!PERSISTED_PHASES.includes(runPhase)) return
    saveRun({
      N, difficulty, gms, money, act, clearedNodeId, currentNode, level,
      board, tileMap: tileMap ? tileMap.serialize() : null, ply, turn, runPhase,
      enemyInfo, modifierInfo, hand, streak, totalWinsThisRun, score, scoreTarget, turnsLeft, eventInfo,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPhase, N, difficulty, gms, money, act, clearedNodeId, currentNode, level, board, tileMap, ply, turn, enemyInfo, modifierInfo, hand, streak, totalWinsThisRun, score, scoreTarget, turnsLeft, eventInfo])

  // Safety net: if we resumed mid-match with it being the AI's turn (saved
  // right after the human moved but before the AI replied), let the AI move.
  useEffect(() => {
    if (runPhase === 'match' && playMode === 'manual' && turn === 'b' && !busy && board && engine) {
      setBusy(true)
      const t = setTimeout(() => aiTurn(board, ply), 420)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPhase, playMode, turn, busy, board, engine])

  function toast(msg) {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 1600)
  }

  function resetRunState() {
    setGms([]); setMoney(4)
    setAct(null); setClearedNodeId(null); setCurrentNode(null); setLevel(1)
    setBoard(null); setTileMap(null); setPly(0); setTurn('w')
    setSelected(null); setLegalMoves([]); setLastMove(null)
    setBusy(false); setEnemyInfo(null); setModifierInfo(null); setOverlay(null)
    setPendingReward(0); setPendingCard(null); setHand([]); setCardMode(null); setBonusMoves(0)
    setStreak(0); setTotalWinsThisRun(0)
    setScore(0); setScoreTarget(null); setTurnsLeft(null); setEventInfo(null)
    setBiggestSingleTurnScore(0); setPendingFlawless(false)
  }

  function startNewRun() {
    clearRun(); setHasSaved(false)
    resetRunState()
    setRunPhase('chooseStart')
  }

  function resumeRun() {
    const data = loadRun()
    if (!data) return startNewRun()
    setN(data.N); setDifficulty(data.difficulty || 'medium')
    setGms((data.gms || []).map(g => (typeof g === 'string' ? { id: g, tier: 0 } : g)))
    setMoney(data.money)
    setAct(data.act || null); setClearedNodeId(data.clearedNodeId || null)
    setCurrentNode(data.currentNode || null); setLevel(data.level || 1)
    setBoard(data.board || null); setTileMap(data.tileMap ? restoreTileMap(data.tileMap) : null)
    setPly(data.ply || 0); setTurn(data.turn || 'w')
    setEnemyInfo(data.enemyInfo || null); setModifierInfo(data.modifierInfo || null)
    setHand(data.hand || [])
    setStreak(data.streak || 0); setTotalWinsThisRun(data.totalWinsThisRun || 0)
    setScore(data.score || 0); setScoreTarget(data.scoreTarget ?? null); setTurnsLeft(data.turnsLeft ?? null)
    setEventInfo(data.eventInfo || null)
    setSelected(null); setLegalMoves([]); setLastMove(null); setBusy(false); setOverlay(null)
    setCardMode(null); setBonusMoves(0)
    setPlayMode('manual')
    setRunPhase(PERSISTED_PHASES.includes(data.runPhase) && (data.act || data.runPhase === 'match' || data.runPhase === 'level-intro') ? data.runPhase : 'map')
    setLog('Run resumed.')
  }

  function pickStart(id) {
    setGms([{ id, tier: 0 }])
    setAct(generateAct(1, 1, Math.random))
    setClearedNodeId(null)
    setRunPhase('map')
  }

  function setupCombat(node) {
    const lvl = node.level
    const levelInAct = act ? lvl - act.startLevel + 1 : lvl
    const b = skirmishSetup(N, act ? act.actNumber : 1, levelInAct)
    const tm = createTileMap(N)
    const localEngine = createEngine({ N, world: tm, rules: { guardedKings: true, mods: true } })
    gms.forEach(g => {
      const gm = GMS[g.id]
      if (g.tier === 1 && gm.upgrade) gm.upgrade.applyUpgraded({ board: b, tileMap: tm, N, findKing: localEngine.findKing })
      else gm.apply({ board: b, tileMap: tm, N, findKing: localEngine.findKing })
    })
    activeSynergies(gms).forEach(a => {
      const bonus = SYNERGY_BONUSES[a]
      if (typeof bonus?.apply === 'function') bonus.apply({ board: b, tileMap: tm, N, findKing: localEngine.findKing })
    })
    const roll = rollEnemyJokers(lvl, Math.random, node.type)
    roll.jokers.forEach(j => j.apply({ board: b, tileMap: tm, N, findKing: localEngine.findKing }))

    let modInfo
    if (node.type === 'match') {
      const modId = modifierForLevel(lvl)
      MODIFIERS[modId].apply({ board: b, tileMap: tm, N, findKing: localEngine.findKing })
      modInfo = { id: modId, ...MODIFIERS[modId], asymmetric: false }
    } else {
      const em = randomEliteModifier(Math.random)
      em.apply({ board: b, tileMap: tm, N, findKing: localEngine.findKing })
      modInfo = { ...em, asymmetric: true }
    }

    setBoard(b); setTileMap(tm); setPly(0); setTurn('w')
    setLevel(lvl); setEnemyInfo(roll); setModifierInfo(modInfo)
    setSelected(null); setLegalMoves([]); setLastMove(null); setBusy(false); setOverlay(null)
    setCardMode(null); setBonusMoves(0)
    tookDamageRef.current = false; bossGimmickRef.current = {}
    setPendingFlawless(false)
    if (node.type === 'boss') { setScore(0); setScoreTarget(null); setTurnsLeft(null) }
    else { setScore(0); setScoreTarget(targetScoreForLevel(lvl, node.type)); setTurnsLeft(turnLimitForLevel(lvl, node.type)) }
    setRunPhase('level-intro')
    setLog(`Level ${lvl}. ${gms.length} Great Master(s) in your squad.`)
  }

  function selectNode(node) {
    setCurrentNode(node); setLevel(node.level)
    runMeta.noteLevelReached(node.level)
    if (node.type === 'match' || node.type === 'elite' || node.type === 'boss') setupCombat(node)
    else if (node.type === 'event') { setEventInfo(randomEvent(Math.random)); setRunPhase('event') }
    else if (node.type === 'rest') setRunPhase('rest')
    else if (node.type === 'shop') enterShop()
  }

  function completeNode() {
    setOverlay(null)
    const node = currentNode
    if (node && node.type === 'boss') {
      const finishedAct = act.actNumber
      const nextAct = generateAct(act.actNumber + 1, act.startLevel + ACT_LENGTH, Math.random)
      setAct(nextAct); setClearedNodeId(null); setCurrentNode(null)
      toast(`¡Acto ${finishedAct} superado! “${narratorLineForAct(nextAct.actNumber)}”`)
    } else if (node) {
      setClearedNodeId(node.id); setCurrentNode(null)
    }
    setRunPhase('map')
  }

  function resolveEvent(choice) {
    const eff = choice.effect || {}
    if (typeof eff.goldDelta === 'number') setMoney(m => Math.max(0, m + eff.goldDelta))
    if (eff.drawCards) {
      const n = Math.min(eff.drawCards, Math.max(0, HAND_CAP - hand.length))
      if (n > 0) setHand(h => [...h, ...drawCards(n)])
    }
    if (eff.discardCount) {
      setHand(h => {
        const copy = [...h]
        for (let i = 0; i < eff.discardCount && copy.length; i++) copy.splice(Math.floor(Math.random() * copy.length), 1)
        return copy
      })
    }
    if (eff.freeGM) {
      const ownedIds = gms.map(g => g.id)
      const allowedPieces = piecesForAct(act?.actNumber ?? 1)
      const pool = Object.keys(GMS).filter(id => (
        !ownedIds.includes(id) && GMS[id].rarity === 'common' &&
        (!GMS[id].requiresPiece || allowedPieces.includes(GMS[id].requiresPiece)) &&
        (!GMS[id].unlockRequirement || runMeta.isUnlocked(GMS[id].unlockRequirement))
      ))
      if (pool.length && gms.length < effectiveSquadCap(gms)) {
        const id = pool[Math.floor(Math.random() * pool.length)]
        setGms(list => [...list, { id, tier: 0 }])
        toast(`${GMS[id].name} se unió a tu escuadra`)
      }
    }
    setClearedNodeId(currentNode.id); setCurrentNode(null); setEventInfo(null)
    setRunPhase('map')
  }

  function resolveRest(choice) {
    if (choice === 'upgrade') {
      const candidate = gms.find(g => g.tier === 0 && GMS[g.id].upgrade)
      if (candidate) {
        setGms(list => list.map(g => (g.id === candidate.id ? { ...g, tier: 1 } : g)))
        toast(`${GMS[candidate.id].name} veterano!`)
      }
    } else {
      setMoney(m => m + 6)
    }
    setClearedNodeId(currentNode.id); setCurrentNode(null)
    setRunPhase('map')
  }

  function playManual() { setPlayMode('manual'); setRunPhase('match'); setLog('Your turn (White). Tap a piece.') }
  function playAuto() {
    setPlayMode('auto'); setRunPhase('match'); setLog('<span class="pc-accent">Autoplay</span> — the engine is resolving…')
    setTimeout(() => stepAuto(board, ply, 'w', score, turnsLeft), 650)
  }

  function matchEnd(win) {
    setBusy(false)
    if (!win) {
      setStreak(0)
      runMeta.noteRunEnded(totalWinsThisRun)
      setOverlay('loss'); SFX.lose(); return
    }
    const newStreak = streak + 1
    setStreak(newStreak)
    setTotalWinsThisRun(w => w + 1)
    const flawless = isSkirmish && !tookDamageRef.current
    const streakBonus = Math.min(newStreak - 1, 5)
    const reward = 5 + streakBonus + (flawless ? 4 : 0) + (hasGM(gms, 'mecenas') ? 3 : 0)
    setMoney(m => m + reward)
    setPendingReward(reward)
    setPendingFlawless(flawless)
    if (hand.length < HAND_CAP) {
      const [newCardId] = drawCards(1)
      if (newCardId) { setHand(h => [...h, newCardId]); setPendingCard(newCardId) } else setPendingCard(null)
    } else setPendingCard(null)
    setOverlay('win')
    if (flawless) SFX.flawless(); else SFX.win()
  }

  function stepAuto(curBoard, curPly, curTurn, curScore, curTurnsLeft) {
    if (!engine.findKing(curBoard, 'w')) return matchEnd(false)
    if (!engine.findKing(curBoard, 'b')) return matchEnd(true)
    const searchDepth = depthForLevel(difficulty, level)
    const mv = engine.chooseMove(curBoard, curTurn, searchDepth, curPly)
    if (!mv) {
      const opp = other(curTurn)
      const mv2 = engine.chooseMove(curBoard, opp, searchDepth, curPly)
      if (!mv2) return matchEnd(engine.material(curBoard, 'w') >= engine.material(curBoard, 'b'))
      setTurn(opp); setPly(curPly + 1)
      setTimeout(() => stepAuto(curBoard, curPly + 1, opp, curScore, curTurnsLeft), 220)
      return
    }
    const mover = curBoard[mv.fr][mv.fc]
    const { board: nb, captured, kind } = engine.applyMove(curBoard, mv, curPly)
    if (currentNode?.type === 'boss' && enemyInfo?.jokers) {
      enemyInfo.jokers.forEach(j => {
        if (typeof j.onAfterMove === 'function') j.onAfterMove({ board: nb, N, findKing: engine.findKing, captured, state: bossGimmickRef.current, rng: Math.random })
      })
    }
    if (curTurn === 'b' && captured) tookDamageRef.current = true
    setBoard(nb)
    setLastMove({ fr: mv.fr, fc: mv.fc, tr: mv.tr, tc: mv.tc, color: curTurn, hit: !!captured || kind === 'charge' })
    soundFor(kind, captured)

    let newScore = curScore
    if (isSkirmish && curTurn === 'w' && captured) {
      const base = scoreForCapture(captured, kind)
      const bonusTotal = applyScoreModifiers(base, { kind, captured, piece: mover }, scoreModifierSources(gms))
      newScore = curScore + bonusTotal
      setScore(newScore)
      setBiggestSingleTurnScore(b => Math.max(b, bonusTotal))
    }

    if (!engine.findKing(nb, 'b')) { setTimeout(() => matchEnd(true), 550); return }
    if (!engine.findKing(nb, 'w')) { setTimeout(() => matchEnd(false), 550); return }

    if (isSkirmish && curTurn === 'w' && newScore >= scoreTarget) { setTimeout(() => matchEnd(true), 550); return }

    const nextTurn = other(curTurn), nextPly = curPly + 1
    setTurn(nextTurn); setPly(nextPly)

    let newTurnsLeft = curTurnsLeft
    if (isSkirmish && curTurn === 'w') {
      newTurnsLeft = curTurnsLeft - 1
      setTurnsLeft(newTurnsLeft)
      if (newTurnsLeft <= 0) { setTimeout(() => matchEnd(false), 300); return }
    }

    if (!isSkirmish && nextPly >= 160) { setTimeout(() => matchEnd(engine.material(nb, 'w') >= engine.material(nb, 'b')), 300); return }
    setTimeout(() => stepAuto(nb, nextPly, nextTurn, newScore, newTurnsLeft), 480)
  }

  function manualClick(r, c) {
    if (busy || playMode !== 'manual' || turn !== 'w') return
    if (cardMode) return handleCardTargetClick(r, c)
    if (selected) {
      const mv = legalMoves.find(m => m.tr === r && m.tc === c)
      if (mv) { doHumanMove(mv); return }
    }
    const p = board[r][c]
    if (p && p.color === 'w') { setSelected([r, c]); setLegalMoves(engine.genMoves(board, r, c, ply)) }
    else { setSelected(null); setLegalMoves([]) }
  }

  function playCard(id) {
    if (busy || playMode !== 'manual' || turn !== 'w') return
    const card = CARDS[id]
    if (!card) return
    if (cardMode === id) { setCardMode(null); return }
    if (card.targetType === 'none') { resolveCard(id, null); return }
    setCardMode(id)
  }

  function resolveCard(id, target) {
    const card = CARDS[id]
    const nb = board.map(row => row.map(x => (x ? { ...x } : null)))
    const result = card.apply({ board: nb, tileMap, N, findKing: engine.findKing, color: 'w', ply, target }) || {}
    setBoard(nb)
    setHand(h => { const i = h.indexOf(id); if (i === -1) return h; const copy = [...h]; copy.splice(i, 1); return copy })
    setCardMode(null)
    SFX.card()
    if (result.extraTurn) { setBonusMoves(b => b + 1); setLog(`Carta jugada: <b>${card.name}</b>. ¡Juega otra vez!`) }
    else if (typeof result.scoreBonus === 'number' && isSkirmish) {
      setScore(s => s + result.scoreBonus)
      setBiggestSingleTurnScore(b => Math.max(b, result.scoreBonus))
      setLog(`Carta jugada: <b>${card.name}</b>. +${result.scoreBonus} pts.`)
    } else setLog(`Carta jugada: <b>${card.name}</b>.`)
    if (result.selfDiscard) {
      setHand(h => {
        const copy = [...h]
        for (let i = 0; i < result.selfDiscard && copy.length; i++) copy.splice(Math.floor(Math.random() * copy.length), 1)
        return copy
      })
    }
  }

  function handleCardTargetClick(r, c) {
    const card = CARDS[cardMode]
    if (!isValidCardTarget(card, { board, tileMap, N, color: 'w', ply }, r, c)) {
      setLog('Objetivo inválido para esta carta.')
      return
    }
    resolveCard(cardMode, { r, c })
  }

  function doHumanMove(mv) {
    const fr = selected[0], fc = selected[1]
    const mover = board[fr][fc]
    const { board: nb, captured, kind } = engine.applyMove(board, { fr, fc, tr: mv.tr, tc: mv.tc, kind: mv.kind }, ply)
    if (currentNode?.type === 'boss' && enemyInfo?.jokers) {
      enemyInfo.jokers.forEach(j => {
        if (typeof j.onAfterMove === 'function') j.onAfterMove({ board: nb, N, findKing: engine.findKing, captured, state: bossGimmickRef.current, rng: Math.random })
      })
    }
    setLastMove({ fr, fc, tr: mv.tr, tc: mv.tc, color: 'w', hit: !!captured || kind === 'charge' })
    soundFor(kind, captured)
    setSelected(null); setLegalMoves([])
    const nextPly = ply + 1
    setBoard(nb); setPly(nextPly)

    let newScore = score
    if (isSkirmish && captured) {
      const base = scoreForCapture(captured, kind)
      const bonusTotal = applyScoreModifiers(base, { kind, captured, piece: mover }, scoreModifierSources(gms))
      newScore = score + bonusTotal
      setScore(newScore)
      setBiggestSingleTurnScore(b => Math.max(b, bonusTotal))
    }

    if (!engine.findKing(nb, 'b')) { setTimeout(() => matchEnd(true), 450); return }
    if (bonusMoves > 0) { setBonusMoves(b => b - 1); setLog('Bonus move! Play again.'); return }

    if (isSkirmish) {
      if (newScore >= scoreTarget) { setTimeout(() => matchEnd(true), 450); return }
      const remaining = turnsLeft - 1
      setTurnsLeft(remaining)
      if (remaining <= 0) { setTimeout(() => matchEnd(false), 450); return }
    }

    setTurn('b')
    setLog('The rival is thinking…')
  }

  function aiTurn(curBoard, curPly) {
    const mv = engine.chooseMove(curBoard, 'b', depthForLevel(difficulty, level), curPly)
    if (!mv) { setBusy(false); setTurn('w'); setLog('The rival has no move. Your turn.'); return }
    const { board: nb, captured, kind } = engine.applyMove(curBoard, mv, curPly)
    if (currentNode?.type === 'boss' && enemyInfo?.jokers) {
      enemyInfo.jokers.forEach(j => {
        if (typeof j.onAfterMove === 'function') j.onAfterMove({ board: nb, N, findKing: engine.findKing, captured, state: bossGimmickRef.current, rng: Math.random })
      })
    }
    if (captured) tookDamageRef.current = true
    setLastMove({ fr: mv.fr, fc: mv.fc, tr: mv.tr, tc: mv.tc, color: 'b', hit: !!captured || kind === 'charge' })
    soundFor(kind, captured)
    const nextPly = curPly + 1
    setBoard(nb); setPly(nextPly)
    if (!engine.findKing(nb, 'w')) { setTimeout(() => matchEnd(false), 450); return }
    setTurn('w'); setBusy(false); setLog('Your turn.')
  }

  function enterShop() {
    setOverlay(null)
    const ownedIds = gms.map(g => g.id)
    const allowedPieces = piecesForAct(act?.actNumber ?? 1)
    const avail = Object.keys(GMS).filter(id => (
      !ownedIds.includes(id) &&
      (!GMS[id].requiresPiece || allowedPieces.includes(GMS[id].requiresPiece)) &&
      (!GMS[id].unlockRequirement || runMeta.isUnlocked(GMS[id].unlockRequirement))
    ))
    const offerCount = 5 + (hasGM(gms, 'mercader_errante') ? 1 : 0)
    const pool = [...avail]
    const picked = []
    for (let i = 0; i < offerCount && pool.length; i++) { const idx = Math.floor(Math.random() * pool.length); picked.push(pool.splice(idx, 1)[0]) }
    setOffers(picked)
    setRunPhase('shop')
  }

  function buyGM(id) {
    const g = GMS[id]
    if (money < g.cost) { toast('Not enough gold'); return }
    if (gms.length >= effectiveSquadCap(gms)) { toast('Squad is full'); return }
    setMoney(m => m - g.cost)
    setGms(list => [...list, { id, tier: 0 }])
    setOffers(list => list.map(o => (o === id ? null : o)))
    toast(`${g.name} recruited`)
    SFX.buy()
  }

  function buyUpgrade(id) {
    const g = GMS[id]
    const owned = gms.find(x => x.id === id)
    if (!owned || owned.tier !== 0 || !g.upgrade) return
    if (money < g.upgrade.cost) { toast('Not enough gold'); return }
    setMoney(m => m - g.upgrade.cost)
    setGms(list => list.map(x => (x.id === id ? { ...x, tier: 1 } : x)))
    toast(`${g.name} veterano!`)
    SFX.buy()
  }

  function leaveShop() {
    if (currentNode) setClearedNodeId(currentNode.id)
    setCurrentNode(null)
    setRunPhase('map')
  }

  function abandonRun() {
    runMeta.noteRunEnded(totalWinsThisRun)
    clearRun(); setHasSaved(false); resetRunState(); setRunPhase('intro')
  }

  function copyRunSummary() {
    const counts = archetypeCounts(gms)
    const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    const favoriteLabel = favorite ? ARCHETYPE_META[favorite[0]]?.label : '—'
    const squadNames = gms.map(g => GMS[g.id].name).join(', ') || '—'
    const summary = [
      'Portal Chess: Grandes Maestros — Run recap',
      `Acto ${act?.actNumber ?? 1}, Nivel ${level}`,
      `Mejor jugada individual: ${biggestSingleTurnScore} pts`,
      `Build favorito: ${favoriteLabel}`,
      `Escuadra final: ${squadNames}`,
      `Mejor nivel histórico: ${runMeta.getMetaState().highestLevel}`,
    ].join('\n')
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(summary).then(() => toast('Resumen copiado')).catch(() => toast('No se pudo copiar'))
    } else {
      toast('Portapapeles no disponible')
    }
  }

  const cardTargetSquares = []
  if (cardMode && board) {
    const card = CARDS[cardMode]
    const ctx = { board, tileMap, N, color: 'w', ply }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (isValidCardTarget(card, ctx, r, c)) cardTargetSquares.push({ r, c })
  }

  const upgradeable = gms.filter(g => g.tier === 0 && GMS[g.id].upgrade)

  return (
    <div className="pc-app">
      <div className="pc-eyebrow">Chessbook · Roguelike</div>
      <div className="pc-title">Grandes Maestros</div>

      {runPhase === 'intro' && (
        <>
          <div className="pc-subtitle">A chess-roguelike: portals, timed holes, guarded kings, and a shop full of jokers.</div>
          <div className="pc-panel">
            <div className="pc-label" style={{ marginBottom: 6 }}>🎯 Objective</div>
            <div className="pc-subtitle" style={{ textAlign: 'left' }}>
              There's no final level — the run is <b>endless</b>. Climb as far as you can through a
              branching map of Acts (8 levels each). Win <b>Combate</b>/<b>Élite</b> skirmishes by reaching
              the target score before your turns run out (or by checkmating early); defeat the <b>Jefe de
              Acto</b> boss by full checkmate to unlock the next Act. Recruit Great Masters and cards along
              the way to build your squad — one loss (checkmate, or running out of turns in a skirmish)
              ends the run. <b>Goal: beat your best level reached.</b> Each Act starts simple: Act 1 is
              <b> pawns only</b>, and every following Act unlocks exactly one new piece type (Knights,
              Bishops, Rooks, then the Queen) — master each one before the next joins the fight.
            </div>
            {(meta.totalRuns > 0) && (
              <div className="pc-subtitle" style={{ marginTop: 6 }}>
                🏆 Best level reached: <b>{meta.highestLevel}</b> · Runs played: {meta.totalRuns} · Wins: {meta.totalWins}
              </div>
            )}
          </div>
          <div className="pc-panel">
            <div className="pc-label" style={{ marginBottom: 6 }}>Board size</div>
            <div className="pc-seg">
              <button className={N === 6 ? 'pc-active' : ''} onClick={() => setN(6)}>6×6</button>
              <button className={N === 8 ? 'pc-active' : ''} onClick={() => setN(8)}>8×8</button>
            </div>
          </div>
          <div className="pc-panel">
            <div className="pc-label" style={{ marginBottom: 6 }}>AI difficulty (rises with each level)</div>
            <div className="pc-seg">
              {DIFFICULTIES.map(d => (
                <button key={d.id} className={difficulty === d.id ? 'pc-active' : ''} title={d.desc} onClick={() => setDifficulty(d.id)}>{d.label}</button>
              ))}
            </div>
          </div>
          {hasSaved && <button className="pc-btn" onClick={resumeRun}>Resume saved run</button>}
          <button className="pc-btn pc-alt" onClick={startNewRun}>Start new run</button>
        </>
      )}

      {runPhase === 'chooseStart' && (
        <div className="pc-overlay">
          <div className="pc-modal">
            <div className="pc-me">Your first Great Master</div>
            <h2 style={{ color: 'var(--pc-joker)' }}>Choose a Great Master</h2>
            <p>You'll begin your run with this joker already active.</p>
            <div className="pc-offers" style={{ maxHeight: '54vh', overflowY: 'auto' }}>
              {START_GM_CHOICES.map(id => {
                const g = GMS[id]
                return (
                  <div key={id} className="pc-offer" style={{ cursor: 'pointer' }} onClick={() => pickStart(id)}>
                    <div className="pc-oi">{g.icon}</div>
                    <div><div className="pc-on">{g.name}</div><div className="pc-od">{g.desc}</div></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {runPhase !== 'intro' && runPhase !== 'chooseStart' && (
        <>
          <div className="pc-topbar">
            <div className="pc-money"><span className="pc-coin" />{money}</div>
            {act && <div className="pc-progress" title="Your progress this run">Acto {act.actNumber} · Nv. {level}</div>}
            <div className="pc-gmtray">
              {gms.map((g, i) => <div key={g.id + i} className="pc-gm" title={`${GMS[g.id].name} (${ARCHETYPE_META[GMS[g.id].archetype]?.label || '—'}): ${GMS[g.id].desc}`}>{GMS[g.id].icon}{g.tier === 1 ? '★' : ''}</div>)}
            </div>
          </div>
          {synergies.length > 0 && (
            <div className="pc-synergy-row" title="Bono activo por tener 3+ Grandes Maestros del mismo tipo">
              {synergies.map(a => <span key={a} className="pc-synergy-badge">{ARCHETYPE_META[a].icon} {SYNERGY_BONUSES[a].label}</span>)}
            </div>
          )}

          {runPhase === 'map' && act && (
            <PortalMap act={act} clearedNodeId={clearedNodeId} onSelectNode={selectNode} />
          )}

          {runPhase === 'event' && eventInfo && (
            <div className="pc-panel">
              <div className="pc-shop-title">{eventInfo.icon} {eventInfo.title}</div>
              <div className="pc-subtitle">{eventInfo.prompt}</div>
              <div className="pc-row" style={{ marginTop: 10 }}>
                {eventInfo.choices.map((choice, i) => (
                  <button key={i} className="pc-btn pc-alt" onClick={() => resolveEvent(choice)}>{choice.label}</button>
                ))}
              </div>
            </div>
          )}

          {runPhase === 'rest' && (
            <div className="pc-panel">
              <div className="pc-shop-title">🏕 Descanso</div>
              <div className="pc-subtitle">Un respiro antes de seguir. Elige tu recompensa.</div>
              <div className="pc-row" style={{ marginTop: 10 }}>
                <button className="pc-btn" disabled={!gms.some(g => g.tier === 0 && GMS[g.id].upgrade)} onClick={() => resolveRest('upgrade')}>Mejorar un Gran Maestro</button>
                <button className="pc-btn pc-alt" onClick={() => resolveRest('gold')}>+6 de oro</button>
              </div>
            </div>
          )}

          {runPhase === 'level-intro' && currentNode && (
            <div className="pc-panel">
              <div className="pc-shop-title">
                {currentNode.type === 'boss' ? 'Jefe de Acto' : currentNode.type === 'elite' ? 'Combate de Élite' : 'Combate'} · Nv. {level}
              </div>
              {act && (
                <div style={{ textAlign: 'center', margin: '2px 0 8px' }}>
                  <span className="pc-act-theme">🎓 {themeForAct(act.actNumber).label}</span>
                  {(level - act.startLevel + 1) === 1 && (
                    <div className="pc-subtitle" style={{ fontStyle: 'italic', marginTop: 4 }}>{themeForAct(act.actNumber).theme}</div>
                  )}
                </div>
              )}
              {(enemyInfo || modifierInfo) && (
                <div style={{ textAlign: 'center', margin: '6px 0', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {enemyInfo && <span className="pc-family-badge">{enemyInfo.familyLabel}</span>}
                  {modifierInfo && <span className={`pc-modifier-badge${modifierInfo.asymmetric ? ' pc-modifier-danger' : ''}`}>{modifierInfo.icon} {modifierInfo.name}</span>}
                </div>
              )}
              {enemyInfo?.quote && <div className="pc-quote">“{enemyInfo.quote}”</div>}
              <div className="pc-subtitle">
                {enemyInfo && enemyInfo.jokers.length
                  ? `The enemy fields: ${enemyInfo.jokers.map(j => j.name).join(', ')}.`
                  : 'A basic enemy guard.'}
                {modifierInfo && ` Modifier: ${modifierInfo.desc}`}
              </div>
              {scoreTarget != null ? (
                <div className="pc-skirmish-brief">Objetivo: <b>{scoreTarget} pts</b> en <b>{turnsLeft} turnos</b> (o jaque mate). Si se acaban los turnos sin llegar al objetivo, pierdes la partida.</div>
              ) : (
                <div className="pc-skirmish-brief">Objetivo: <b>jaque mate</b>. Sin límite de turnos — vence al rey enemigo para superar el Acto {act?.actNumber}.</div>
              )}
              <div className="pc-row" style={{ marginTop: 10 }}>
                <button className="pc-btn" onClick={playManual}>🎮 Play</button>
                <button className="pc-btn pc-alt" onClick={playAuto}>▶ Auto</button>
              </div>
            </div>
          )}

          {(runPhase === 'match') && (
            <>
              <div className="pc-legend">
                <span><i className="pc-move" /> move</span>
                <span><i className="pc-capture" /> capture</span>
                <span><i className="pc-charge" /> charge</span>
                <span><i className="pc-kill" /> finish</span>
              </div>
              <div className="pc-statusbar">
                <div className={`pc-orb${(playMode === 'auto' ? turn === 'b' : busy) ? ' pc-enemy' : ''}`} />
                <div className="pc-log" dangerouslySetInnerHTML={{ __html: log }} />
              </div>
              {scoreTarget != null ? (
                <div className={`pc-skirmish-hud${danger ? ' pc-skirmish-hud-danger' : ''}`}>
                  <span>Puntos: <b>{score}</b> / {scoreTarget}</span>
                  <span>Turnos: <b>{turnsLeft}</b></span>
                </div>
              ) : (
                <div className="pc-skirmish-hud"><span>👑 Objetivo: jaque mate</span></div>
              )}
              <PortalBoard
                N={N}
                board={board}
                tileMap={tileMap}
                ply={ply}
                selected={selected}
                legalMoves={legalMoves}
                lastMove={lastMove}
                onSquareClick={(r, c) => playMode === 'manual' && manualClick(r, c)}
                interactive={playMode === 'manual'}
                guardsEnabled
                cardTargets={cardTargetSquares}
              />
              {playMode === 'manual' && turn === 'w' && hand.length > 0 && (
                <div className="pc-panel">
                  <div className="pc-label" style={{ marginBottom: 6 }}>Cards</div>
                  {cardMode && <div className="pc-cardhint">Choose a target on the board (or tap the card again to cancel).</div>}
                  <div className="pc-cardrow">
                    {hand.map((id, i) => {
                      const c = CARDS[id]
                      return (
                        <button key={id + i} className={`pc-card${cardMode === id ? ' pc-active' : ''}`} title={c.desc} onClick={() => playCard(id)}>
                          <span className="pc-card-icon">{c.icon}</span>
                          <span className="pc-card-name">{c.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {runPhase === 'shop' && (
            <div className="pc-panel">
              <div className="pc-shop-title">La Tertulia</div>
              <div className="pc-shop-sub">Recruit new Great Masters, or upgrade the ones you have.</div>
              {upgradeable.length > 0 && (
                <div className="pc-offers" style={{ marginBottom: 10 }}>
                  {upgradeable.map(g => {
                    const gm = GMS[g.id]
                    return (
                      <div key={g.id} className="pc-offer">
                        <div className="pc-oi">{gm.icon}</div>
                        <div><div className="pc-on">{gm.name} → Veterano</div><div className="pc-od">{gm.upgrade.desc}</div></div>
                        <button className="pc-buy" disabled={money < gm.upgrade.cost} onClick={() => buyUpgrade(g.id)}><span className="pc-coin" />{gm.upgrade.cost}</button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="pc-offers">
                {offers.map((id, i) => {
                  if (!id) return <div key={i} className="pc-offer pc-sold"><div className="pc-oi">✓</div><div><div className="pc-on">Recruited</div></div></div>
                  const g = GMS[id]
                  return (
                    <div key={id} className="pc-offer">
                      <div className="pc-oi">{g.icon}</div>
                      <div><div className="pc-on">{g.name}</div><div className="pc-od">{g.desc}</div></div>
                      <button className="pc-buy" disabled={money < g.cost || gms.length >= effectiveSquadCap(gms)} onClick={() => buyGM(id)}><span className="pc-coin" />{g.cost}</button>
                    </div>
                  )
                })}
              </div>
              <button className="pc-btn" style={{ marginTop: 11 }} onClick={leaveShop}>Volver al mapa ▸</button>
            </div>
          )}

          {overlay === 'win' && (
            <div className="pc-overlay">
              <div className="pc-modal">
                <div className="pc-me">Nivel {level}{streak > 1 ? ` · Racha x${streak}` : ''}</div>
                <h2>{currentNode?.type === 'boss' ? `¡Acto ${act?.actNumber} superado!` : 'Victoria'}</h2>
                {pendingFlawless && <div className="pc-flawless">✦ ¡Victoria perfecta! No perdiste ninguna pieza.</div>}
                <div className="pc-reward"><span className="pc-coin" />+{pendingReward}</div>
                {pendingCard && <p>Nueva carta: <b>{CARDS[pendingCard].icon} {CARDS[pendingCard].name}</b></p>}
                <p>Ganaste con {gms.length} Gran(des) Maestro(s) en tu escuadra.</p>
                <button className="pc-btn" onClick={completeNode}>Continuar ▸</button>
              </div>
            </div>
          )}

          {overlay === 'loss' && (
            <div className="pc-overlay">
              <div className="pc-modal">
                <div className="pc-me">Level {level}</div>
                <h2 className="pc-loss">Defeat</h2>
                <p>Your king has fallen, or time ran out. The run ends here.</p>
                <div className="pc-recap">
                  <div className="pc-recap-row"><span>Acto alcanzado</span><b>{act?.actNumber ?? 1}</b></div>
                  <div className="pc-recap-row"><span>Nivel alcanzado</span><b>{level}</b></div>
                  <div className="pc-recap-row"><span>Mejor jugada individual</span><b>{biggestSingleTurnScore} pts</b></div>
                  <div className="pc-recap-row"><span>Escuadra final</span><b>{gms.map(g => GMS[g.id].name).join(', ') || '—'}</b></div>
                  <div className="pc-recap-row"><span>Mejor nivel histórico</span><b>{runMeta.getMetaState().highestLevel}</b></div>
                </div>
                <div className="pc-row" style={{ marginTop: 10 }}>
                  <button className="pc-btn pc-alt" onClick={copyRunSummary}>📋 Copiar resumen</button>
                  <button className="pc-btn" onClick={startNewRun}>New run</button>
                </div>
              </div>
            </div>
          )}

          {runPhase !== 'shop' && !overlay && (
            <button className="pc-btn pc-alt" onClick={abandonRun}>Abandon run</button>
          )}
        </>
      )}

      <div className={`pc-toast${toastMsg ? ' pc-show' : ''}`}>{toastMsg}</div>
    </div>
  )
}
