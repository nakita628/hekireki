import { describe, expect, it } from 'vite-plus/test'

import { around, meets, routeCost } from './box.js'

const card = { x: 100, y: 100, width: 200, height: 100 }

describe('meets', () => {
  it('finds two boxes that overlap', () => {
    expect(meets(card, { x: 250, y: 150, width: 100, height: 100 })).toBe(true)
  })

  it('does not count two boxes that only touch', () => {
    expect(meets(card, { x: 300, y: 100, width: 50, height: 50 })).toBe(false)
  })
})

describe('around', () => {
  it('holds every box, grown by the margin on every side', () => {
    const other = { x: 400, y: 50, width: 20, height: 20 }
    expect(around([card, other], 10)).toStrictEqual({ x: 90, y: 40, width: 340, height: 170 })
  })
})

describe('routeCost', () => {
  it('counts how much of a route runs inside the boxes, and how long it is', () => {
    // Across the card at y 150, then down clear of it.
    const route = [
      { x: 0, y: 150 },
      { x: 400, y: 150 },
      { x: 400, y: 300 },
    ]
    expect(routeCost(route, [card])).toStrictEqual({ hidden: 200, length: 550 })
  })

  it('does not count a route that only runs along an edge of a box', () => {
    const along = [
      { x: 0, y: 100 },
      { x: 400, y: 100 },
    ]
    expect(routeCost(along, [card]).hidden).toBe(0)
  })
})
