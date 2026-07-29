import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSparringNext, evaluateSparringMove, setToken } from './api'

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

describe('sparring api client', () => {
  it('getSparringNext calls GET /sparring/next with the color query param and auth header', async () => {
    global.fetch.mockReturnValue(jsonResponse({ lineId: 1 }))
    await getSparringNext('white')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sparring/next?color=white',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    )
  })

  it('evaluateSparringMove POSTs the move payload (incl. the real path so far) as camelCase JSON', async () => {
    global.fetch.mockReturnValue(jsonResponse({ result: 'correct' }))
    await evaluateSparringMove(7, 3, 'd6', ['e4', 'c5', 'Nf3'])
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/sparring/evaluate')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({
      lineId: 7, plyIndex: 3, movePlayed: 'd6', movesSoFar: ['e4', 'c5', 'Nf3'],
    })
  })
})
