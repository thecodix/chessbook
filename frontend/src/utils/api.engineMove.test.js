import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getEngineMove, setToken } from './api'

function jsonResponse(body) {
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  setToken('test-token')
  global.fetch = vi.fn()
})

describe('getEngineMove', () => {
  it('POSTs the fen to /endgames/engine-move', async () => {
    global.fetch.mockReturnValue(jsonResponse({ status: 'in_progress', engineMove: 'e5', fen: 'FEN' }))
    await getEngineMove('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/endgames/engine-move')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    })
  })
})
