import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SparringMode from './SparringMode'
import * as api from '../utils/api'

vi.mock('../utils/api')

// Board itself is exercised by its own tests; here we only need a stand-in
// that lets us trigger onMove and inspect the fen/interactive props
// SparringMode passes down, without simulating real canvas clicks.
vi.mock('../components/Board', () => ({
  default: ({ fen, interactive, onMove }) => (
    <div>
      <div data-testid="board-fen">{fen}</div>
      <div data-testid="board-interactive">{String(interactive)}</div>
      <button onClick={() => onMove({ san: 'Nf3', fen: 'FEN-AFTER-USER-MOVE' })}>Play Nf3</button>
    </div>
  ),
}))

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

  it('shows an error message when fetching the next position fails', async () => {
    api.getSparringNext.mockRejectedValue(new Error('network down'))

    render(<SparringMode />)
    fireEvent.click(screen.getByText(/start/i))

    await waitFor(() => expect(api.getSparringNext).toHaveBeenCalled())
    expect(await screen.findByText(/could not load a position/i)).toBeInTheDocument()
  })

  it('renders the user\'s own move immediately, locks the board, and sends the real path so far to /evaluate', async () => {
    api.getSparringNext.mockResolvedValue({
      lineId: 1, openingId: 'op1', openingName: 'Sicilian', plyIndex: 2,
      fen: 'START-FEN', color: 'white', movesSoFar: ['e4', 'e5'],
    })
    let resolveEvaluate
    api.evaluateSparringMove.mockReturnValue(new Promise((res) => { resolveEvaluate = res }))

    render(<SparringMode />)
    fireEvent.click(screen.getByText(/start/i))
    await waitFor(() => expect(api.getSparringNext).toHaveBeenCalled())

    fireEvent.click(screen.getByText('Play Nf3'))

    // The board reflects the user's own move right away (before the
    // /evaluate round-trip resolves) and is locked against further input.
    await waitFor(() => expect(screen.getByTestId('board-fen').textContent).toBe('FEN-AFTER-USER-MOVE'))
    expect(screen.getByTestId('board-interactive').textContent).toBe('false')

    expect(api.evaluateSparringMove).toHaveBeenCalledWith(1, 2, 'Nf3', ['e4', 'e5'])

    resolveEvaluate({ result: 'correct', opponentMove: 'Nc3', opponentFen: 'FEN2', sessionOver: false })
    expect(await screen.findByText(/correct/i)).toBeInTheDocument()
  })

  it('rolls the board back and re-enables it if the /evaluate call fails', async () => {
    api.getSparringNext.mockResolvedValue({
      lineId: 1, openingId: 'op1', openingName: 'Sicilian', plyIndex: 2,
      fen: 'START-FEN', color: 'white', movesSoFar: ['e4', 'e5'],
    })
    api.evaluateSparringMove.mockRejectedValue(new Error('network down'))

    render(<SparringMode />)
    fireEvent.click(screen.getByText(/start/i))
    await waitFor(() => expect(api.getSparringNext).toHaveBeenCalled())

    fireEvent.click(screen.getByText('Play Nf3'))

    expect(await screen.findByText(/could not submit your move/i)).toBeInTheDocument()
    expect(screen.getByTestId('board-fen').textContent).toBe('START-FEN')
    expect(screen.getByTestId('board-interactive').textContent).toBe('true')
  })
})
