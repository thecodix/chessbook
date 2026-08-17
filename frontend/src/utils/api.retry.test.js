import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getMe, setToken } from './api'

beforeEach(() => {
  setToken('test-token')
  global.fetch = vi.fn(() => Promise.reject(new Error('network down')))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('req retry window', () => {
  it('keeps retrying a cold-starting backend for at least 60 seconds before giving up', async () => {
    vi.useFakeTimers()
    const pending = getMe()
    const assertion = expect(pending).rejects.toThrow(
      'Could not reach the server. Please check your connection and try again.'
    )
    await vi.advanceTimersByTimeAsync(70_000)
    await assertion
    expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(15)
  })
})
