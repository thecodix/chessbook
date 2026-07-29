import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EndgameAlgorithms from './EndgameAlgorithms'
import * as api from '../utils/api'

vi.mock('../utils/api')

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      categories: [{
        id: 'bishop-mate', title: 'Two Bishops Checkmate',
        positions: [{ id: 'bishop-1', label: 'Bishops beside the king', fen: '4k3/8/8/3BBK2/8/8/8/8 w - - 0 1' }],
      }],
    }),
  })
  api.getEndgamesProgress.mockResolvedValue([])
})

describe('EndgameAlgorithms', () => {
  it('loads categories and renders the board after picking a position', async () => {
    render(<EndgameAlgorithms />)
    expect(await screen.findByText(/Two Bishops Checkmate/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Bishops beside the king/i))

    expect(await screen.findByText(/White to move/i)).toBeInTheDocument()
  })
})
