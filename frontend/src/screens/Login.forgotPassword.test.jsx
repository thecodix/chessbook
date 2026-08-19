import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Login from './Login'
import * as api from '../utils/api'

vi.mock('../utils/api')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Login — register mode', () => {
  it('requires an email field and submits it on register', async () => {
    api.register.mockResolvedValue({ accessToken: 't', user: { username: 'alice' } })
    render(<Login onSuccess={() => {}} />)

    fireEvent.click(screen.getByText('Create account'))
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw123456' } })
    const createAccountButtons = screen.getAllByText('Create account')
    fireEvent.click(createAccountButtons[createAccountButtons.length - 1])

    await waitFor(() => expect(api.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@example.com' })
    ))
  })
})

describe('Login — forgot password mode', () => {
  it('switches to a forgot-password form and submits the email', async () => {
    api.forgotPassword.mockResolvedValue({ message: 'If that email is registered, a reset link has been sent.' })
    render(<Login onSuccess={() => {}} />)

    fireEvent.click(screen.getByText('Forgot password?'))
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByText('Send reset link'))

    await waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith('alice@example.com'))
    expect(await screen.findByText(/reset link has been sent/i)).toBeInTheDocument()
  })
})
