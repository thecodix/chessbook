import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import * as api from './utils/api'

vi.mock('./utils/api')
vi.mock('./screens/ResetPassword', () => ({ default: () => <div>reset-password-screen</div> }))

beforeEach(() => {
  vi.clearAllMocks()
  api.getMe.mockResolvedValue(null)
  global.fetch = vi.fn(() => Promise.resolve({ ok: true }))
})

describe('App routing', () => {
  it('renders the ResetPassword screen when the path is /reset-password, without waiting on auth', () => {
    window.history.pushState({}, '', '/reset-password?token=abc')
    render(<App />)
    expect(screen.getByText('reset-password-screen')).toBeInTheDocument()
  })
})
