import { describe, it, expect } from 'vitest'
import { initialSparringState, sparringReducer } from './sparringState'

const NEXT_PAYLOAD = {
  lineId: 1, openingId: 'op1', openingName: 'Op1', plyIndex: 2, fen: 'FEN1', color: 'white',
  movesSoFar: ['e4', 'e5'],
}

describe('sparringReducer', () => {
  it('started sets the position from the /next response', () => {
    const next = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    expect(next.status).toBe('awaiting-move')
    expect(next.lineId).toBe(1)
    expect(next.plyIndex).toBe(2)
    expect(next.fen).toBe('FEN1')
    expect(next.feedback).toBe(null)
  })

  it('started captures movesSoFar (the real path) from the /next response', () => {
    const next = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    expect(next.movesSoFar).toEqual(['e4', 'e5'])
  })

  it('started defaults movesSoFar to [] when the response omits it', () => {
    const { movesSoFar, ...payloadWithoutMoves } = NEXT_PAYLOAD
    const next = sparringReducer(initialSparringState, { type: 'started', payload: payloadWithoutMoves })
    expect(next.movesSoFar).toEqual([])
  })

  it('moved renders the user\'s own move immediately and locks the board', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const moved = sparringReducer(started, { type: 'moved', payload: { fen: 'FEN-USER-MOVE' } })
    expect(moved.status).toBe('submitting')
    expect(moved.fen).toBe('FEN-USER-MOVE')
  })

  it('move-failed rolls the board back and re-enables interaction', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const moved = sparringReducer(started, { type: 'moved', payload: { fen: 'FEN-USER-MOVE' } })
    const failed = sparringReducer(moved, { type: 'move-failed', payload: { fen: 'FEN1' } })
    expect(failed.status).toBe('awaiting-move')
    expect(failed.fen).toBe('FEN1')
  })

  it('evaluated records correctness and stores the pending opponent reply', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'correct', opponentMove: 'd4', opponentFen: 'FEN2', sessionOver: false, movePlayed: 'Nf3' },
    })
    expect(evaluated.status).toBe('feedback')
    expect(evaluated.feedback).toBe('correct')
    expect(evaluated.sessionAttempts).toBe(1)
    expect(evaluated.sessionCorrect).toBe(1)
  })

  it('evaluated with an unknown result does not increment sessionCorrect', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'unknown', opponentMove: null, opponentFen: null, sessionOver: true, movePlayed: 'a6' },
    })
    expect(evaluated.sessionAttempts).toBe(1)
    expect(evaluated.sessionCorrect).toBe(0)
  })

  it('evaluated stashes pendingMovesSoFar as movesSoFar + movePlayed + opponentMove', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'correct', opponentMove: 'd4', opponentFen: 'FEN2', sessionOver: false, movePlayed: 'Nf3' },
    })
    expect(evaluated.pendingMovesSoFar).toEqual(['e4', 'e5', 'Nf3', 'd4'])
  })

  it('evaluated stashes pendingMovesSoFar without an opponent move when the session ends', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'unknown', opponentMove: null, opponentFen: null, sessionOver: true, movePlayed: 'a6' },
    })
    expect(evaluated.pendingMovesSoFar).toEqual(['e4', 'e5', 'a6'])
  })

  it('advanced moves to the opponent position when the session continues', () => {
    const state = {
      ...initialSparringState, status: 'feedback', plyIndex: 2, fen: 'FEN1',
      pendingOpponentFen: 'FEN2', pendingSessionOver: false,
    }
    const next = sparringReducer(state, { type: 'advanced' })
    expect(next.status).toBe('awaiting-move')
    expect(next.plyIndex).toBe(4)
    expect(next.fen).toBe('FEN2')
  })

  it('advanced adopts pendingMovesSoFar as the new movesSoFar when the session continues', () => {
    const state = {
      ...initialSparringState, status: 'feedback', plyIndex: 2, fen: 'FEN1',
      movesSoFar: ['e4', 'e5'], pendingMovesSoFar: ['e4', 'e5', 'Nf3', 'd4'],
      pendingOpponentFen: 'FEN2', pendingSessionOver: false,
    }
    const next = sparringReducer(state, { type: 'advanced' })
    expect(next.movesSoFar).toEqual(['e4', 'e5', 'Nf3', 'd4'])
  })

  it('advanced shows the summary once the session is over', () => {
    const state = { ...initialSparringState, status: 'feedback', pendingSessionOver: true }
    const next = sparringReducer(state, { type: 'advanced' })
    expect(next.status).toBe('summary')
  })

  it('reset returns to the initial idle state', () => {
    const dirty = { ...initialSparringState, status: 'summary', sessionAttempts: 5, sessionCorrect: 3 }
    expect(sparringReducer(dirty, { type: 'reset' })).toEqual(initialSparringState)
  })
})
