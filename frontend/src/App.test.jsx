import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './utils/api'

vi.mock('./utils/api')

beforeEach(() => {
  vi.clearAllMocks()
  api.getMe.mockResolvedValue(null) // keeps the test on the Login screen, no further setup needed
  global.fetch = vi.fn(() => Promise.resolve({ ok: true }))
})

describe('App', () => {
  it('pings /api/health on mount to start waking a sleeping Render backend early', async () => {
    render(<App />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/health'))
  })
})
