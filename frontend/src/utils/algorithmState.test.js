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

  it('failed sets an error message and unlocks the board', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, { type: 'failed', payload: { message: 'network down' } })
    expect(next.status).toBe('awaiting-move')
    expect(next.error).toBe('network down')
  })

  it('reset returns to the initial idle state', () => {
    const dirty = { ...initialAlgorithmState, status: 'checkmate', positionId: 'bishop-1' }
    expect(algorithmReducer(dirty, { type: 'reset' })).toEqual(initialAlgorithmState)
  })
})
