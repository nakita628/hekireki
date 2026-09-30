import { describe, expect, it } from 'vite-plus/test'

import { polylinePath, round } from './path.js'

describe('polylinePath', () => {
  it('writes a two-point line with no curve in it', () => {
    expect(
      polylinePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M0 0L10 0')
  })

  it('rounds every corner it turns', () => {
    const path = polylinePath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])
    expect(path.startsWith('M0 0')).toBe(true)
    expect(path).toContain('Q')
    expect(path.endsWith('L100 100')).toBe(true)
  })

  it('runs three points on one line straight through', () => {
    expect(
      polylinePath([
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe('M0 0L50 0L100 0')
  })
})

describe('round', () => {
  it('keeps two decimals, which is all a coordinate needs', () => {
    expect(round(1.2345)).toBe(1.23)
    expect(round(1.236)).toBe(1.24)
    expect(round(-1.236)).toBe(-1.24)
    expect(round(340)).toBe(340)
  })
})
