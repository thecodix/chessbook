import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResetPassword from './ResetPassword'
import * as api from '../utils/api'

vi.mock('../utils/api')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResetPassword', () => {
  it('reads the token from the URL and submits it with the new password', async () => {
    window.history.pushState({}, '', '/reset-password?token=abc123')
    api.resetPassword.mockResolvedValue({ message: 'Password updated — you can now sign in.' })

    render(<ResetPassword onDone={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'newpw123' } })
    fireEvent.click(screen.getByText('Reset password'))

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith('abc123', 'newpw123'))
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
  })

  it('shows an error when the reset fails', async () => {
    window.history.pushState({}, '', '/reset-password?token=bad')
    api.resetPassword.mockRejectedValue(new Error('Invalid or expired reset link'))

    render(<ResetPassword onDone={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'newpw123' } })
    fireEvent.click(screen.getByText('Reset password'))

    expect(await screen.findByText('Invalid or expired reset link')).toBeInTheDocument()
  })
})
