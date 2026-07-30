import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EndgameAlgorithms from './EndgameAlgorithms'
import * as api from '../utils/api'

vi.mock('../utils/api')

// Board itself is exercised by its own tests; here we only need a stand-in
// that lets us trigger onMove directly, sidestepping the canvas-click
// simulation problem (see SparringMode.test.jsx for the same precedent),
// while still exercising EndgameAlgorithms' real move-handling wiring.
vi.mock('../components/Board', () => ({
  default: ({ fen, interactive, onMove }) => (
    <div>
      <div data-testid="board-fen">{fen}</div>
      <div data-testid="board-interactive">{String(interactive)}</div>
      <button onClick={() => onMove({ fen: 'FEN-AFTER-USER-MOVE' })}>Play move</button>
    </div>
  ),
}))

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

  it('shows an error and re-enables the board when the engine-move call fails', async () => {
    api.getEngineMove.mockRejectedValue(new Error('network down'))

    render(<EndgameAlgorithms />)
    await screen.findByText(/Two Bishops Checkmate/i)
    fireEvent.click(screen.getByText(/Bishops beside the king/i))
    await screen.findByText(/White to move/i)

    fireEvent.click(screen.getByText('Play move'))

    expect(await screen.findByText(/network down/i)).toBeInTheDocument()
    expect(screen.getByTestId('board-interactive').textContent).toBe('true')
  })

  it('records progress and shows the checkmate UI when the engine replies with checkmate', async () => {
    api.getEngineMove.mockResolvedValue({ status: 'checkmate', engineMove: null, fen: null })
    api.updateEndgameProgress.mockResolvedValue({ solved: true, attempts: 1 })

    render(<EndgameAlgorithms />)
    await screen.findByText(/Two Bishops Checkmate/i)
    fireEvent.click(screen.getByText(/Bishops beside the king/i))
    await screen.findByText(/White to move/i)

    fireEvent.click(screen.getByText('Play move'))

    await waitFor(() => expect(api.updateEndgameProgress).toHaveBeenCalledWith('bishop-1', true))
    expect(await screen.findByText(/Checkmate!/)).toBeInTheDocument()
  })
})
