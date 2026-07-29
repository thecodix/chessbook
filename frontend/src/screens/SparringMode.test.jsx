import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SparringMode from './SparringMode'
import * as api from '../utils/api'

vi.mock('../utils/api')

beforeEach(() => { vi.clearAllMocks() })

describe('SparringMode', () => {
  it('fetches and displays a position after picking a color and starting', async () => {
    api.getSparringNext.mockResolvedValue({
      lineId: 1, openingId: 'op1', openingName: 'Sicilian Dragon', plyIndex: 3,
      fen: 'rnbqkb1r/pp2pppp/3p1n2/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4',
      color: 'black',
    })

    render(<SparringMode />)
    fireEvent.click(screen.getByText(/black/i))
    fireEvent.click(screen.getByText(/start/i))

    await waitFor(() => expect(api.getSparringNext).toHaveBeenCalledWith('black'))
    expect(await screen.findByText(/Sicilian Dragon/i)).toBeInTheDocument()
  })
})
