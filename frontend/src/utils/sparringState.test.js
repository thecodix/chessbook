import { describe, it, expect } from 'vitest'
import { initialSparringState, sparringReducer } from './sparringState'

const NEXT_PAYLOAD = { lineId: 1, openingId: 'op1', openingName: 'Op1', plyIndex: 2, fen: 'FEN1', color: 'white' }

describe('sparringReducer', () => {
  it('started sets the position from the /next response', () => {
    const next = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    expect(next.status).toBe('awaiting-move')
    expect(next.lineId).toBe(1)
    expect(next.plyIndex).toBe(2)
    expect(next.fen).toBe('FEN1')
    expect(next.feedback).toBe(null)
  })

  it('evaluated records correctness and stores the pending opponent reply', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'correct', opponentMove: 'd4', opponentFen: 'FEN2', sessionOver: false },
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
      payload: { result: 'unknown', opponentMove: null, opponentFen: null, sessionOver: true },
    })
    expect(evaluated.sessionAttempts).toBe(1)
    expect(evaluated.sessionCorrect).toBe(0)
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
