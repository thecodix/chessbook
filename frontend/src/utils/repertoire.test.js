import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { OPENINGS } from './repertoire'

describe('Blackmar-Diemer repertoire', () => {
  it('has fourteen legal lines', () => {
    const lines = OPENINGS.blackmar_diemer.lines

    expect(lines).toHaveLength(14)

    for (const line of lines) {
      const chess = new Chess()
      for (const move of line.moves) {
        expect(chess.move(move), `${line.label}: ${move}`).not.toBeNull()
      }
    }
  })
})