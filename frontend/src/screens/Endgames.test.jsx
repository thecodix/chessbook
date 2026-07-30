import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Endgames from './Endgames'

vi.mock('./EndgamePuzzles', () => ({ default: () => <div>puzzles-mode</div> }))
vi.mock('./EndgameAlgorithms', () => ({ default: () => <div>algorithms-mode</div> }))

describe('Endgames mode dispatcher', () => {
  it('shows Puzzles mode by default and switches to Algorithms on click', () => {
    render(<Endgames />)
    expect(screen.getByText('puzzles-mode')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Algorithms/i))
    expect(screen.getByText('algorithms-mode')).toBeInTheDocument()
  })
})
