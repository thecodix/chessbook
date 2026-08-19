import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { register, forgotPassword, resetPassword } from './api'

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('register', () => {
  it('sends the email field alongside username and password', async () => {
    global.fetch.mockReturnValue(jsonResponse({ accessToken: 't', user: {} }))

    await register({ username: 'alice', password: 'pw', email: 'alice@example.com' })

    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toMatchObject({ email: 'alice@example.com' })
  })
})

describe('forgotPassword', () => {
  it('posts the email to /users/forgot-password', async () => {
    global.fetch.mockReturnValue(jsonResponse({ message: 'ok' }))

    await forgotPassword('alice@example.com')

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/users/forgot-password')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ email: 'alice@example.com' })
  })
})

describe('resetPassword', () => {
  it('posts the token and new password to /users/reset-password', async () => {
    global.fetch.mockReturnValue(jsonResponse({ message: 'ok' }))

    await resetPassword('the-token', 'newpw123')

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/users/reset-password')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ token: 'the-token', newPassword: 'newpw123' })
  })
})
