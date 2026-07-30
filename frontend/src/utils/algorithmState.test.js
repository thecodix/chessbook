import { describe, it, expect } from 'vitest'
import { initialAlgorithmState, algorithmReducer } from './algorithmState'

const START = { positionId: 'bishop-1', label: 'Bishops beside the king', fen: 'FEN0' }

describe('algorithmReducer', () => {
  it('started sets the position and enters awaiting-move', () => {
    const next = algorithmReducer(initialAlgorithmState, { type: 'started', payload: START })
    expect(next.status).toBe('awaiting-move')
    expect(next.positionId).toBe('bishop-1')
    expect(next.fen).toBe('FEN0')
    expect(next.error).toBe(null)
  })

  it('moved shows the users move immediately and locks the board', () => {
    const started = algorithmReducer(initialAlgorithmState, { type: 'started', payload: START })
    const moved = algorithmReducer(started, { type: 'moved', payload: { fen: 'FEN1' } })
    expect(moved.status).toBe('thinking')
    expect(moved.fen).toBe('FEN1')
  })

  it('moved stashes the pre-move fen into prevFen', () => {
    const started = algorithmReducer(initialAlgorithmState, { type: 'started', payload: START })
    expect(started.fen).toBe('FEN0')
    const moved = algorithmReducer(started, { type: 'moved', payload: { fen: 'FEN1' } })
    expect(moved.prevFen).toBe('FEN0')
    expect(moved.fen).toBe('FEN1')
  })

  it('replied with in_progress applies the engine move and returns to awaiting-move', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', positionId: 'bishop-1', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'in_progress', engineMove: 'Kd6', fen: 'FEN2' },
    })
    expect(next.status).toBe('awaiting-move')
    expect(next.fen).toBe('FEN2')
  })

  it('replied with checkmate enters the checkmate status', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'checkmate', engineMove: null, fen: null },
    })
    expect(next.status).toBe('checkmate')
  })

  it('replied with stalemate enters failed with the specific reason', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'stalemate', engineMove: null, fen: null },
    })
    expect(next.status).toBe('failed')
    expect(next.failReason).toBe('stalemate')
  })

  it('replied with draw enters failed with the draw reason', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'draw', engineMove: null, fen: null },
    })
    expect(next.status).toBe('failed')
    expect(next.failReason).toBe('draw')
  })

  it('replied with insufficient_material enters failed with the specific reason', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'insufficient_material', engineMove: null, fen: null },
    })
    expect(next.status).toBe('failed')
    expect(next.failReason).toBe('insufficient_material')
  })

  it('failed sets an error message and unlocks the board', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, { type: 'failed', payload: { message: 'network down' } })
    expect(next.status).toBe('awaiting-move')
    expect(next.error).toBe('network down')
  })

  it('failed rolls the fen back to the position before the users unconfirmed move', () => {
    // Guards against the user illegally moving the engine's own king on an
    // API failure: 'moved' shows FEN_AFTER_MOVE (Black to move) optimistically,
    // but if the engine call fails, the board must revert to FEN_BEFORE_MOVE
    // rather than staying on a position the user was never confirmed into.
    const thinking = {
      ...initialAlgorithmState,
      status: 'thinking',
      fen: 'FEN_AFTER_MOVE',
      prevFen: 'FEN_BEFORE_MOVE',
    }
    const next = algorithmReducer(thinking, { type: 'failed', payload: { message: 'network down' } })
    expect(next.status).toBe('awaiting-move')
    expect(next.fen).toBe('FEN_BEFORE_MOVE')
    expect(next.error).toBe('network down')
  })

  it('reset returns to the initial idle state', () => {
    const dirty = { ...initialAlgorithmState, status: 'checkmate', positionId: 'bishop-1' }
    expect(algorithmReducer(dirty, { type: 'reset' })).toEqual(initialAlgorithmState)
  })

  it('started from failed status clears failReason and error', () => {
    const failed = { ...initialAlgorithmState, status: 'failed', failReason: 'stalemate', error: 'some error' }
    const next = algorithmReducer(failed, { type: 'started', payload: START })
    expect(next.status).toBe('awaiting-move')
    expect(next.failReason).toBe(null)
    expect(next.error).toBe(null)
    expect(next.positionId).toBe('bishop-1')
    expect(next.fen).toBe('FEN0')
  })

  it('unrecognized action type returns state unchanged', () => {
    const state = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(state, { type: 'unknown-action' })
    expect(next).toEqual(state)
  })
})
