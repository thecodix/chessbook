import { describe, it, expect } from 'vitest'
import { stripSan } from './chess'

describe('stripSan', () => {
  it('removes check and mate suffixes', () => {
    expect(stripSan('Nxd4+')).toBe('Nxd4')
    expect(stripSan('Qh5#')).toBe('Qh5')
  })

  it('leaves moves without suffixes untouched', () => {
    expect(stripSan('cxd4')).toBe('cxd4')
  })

  it('handles empty input', () => {
    expect(stripSan('')).toBe('')
  })
})
