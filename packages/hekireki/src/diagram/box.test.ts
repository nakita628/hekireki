import { describe, expect, it } from 'vite-plus/test'

import { around, grow, meets, routeCost, spanning } from './box.js'

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

describe('spanning', () => {
  it('is the box between two points, whichever way round they come', () => {
    expect(spanning({ x: 50, y: 40 }, { x: 10, y: 0 })).toStrictEqual({
      x: 10,
      y: 0,
      width: 40,
      height: 40,
    })
  })

  it('is a point with no size for one point', () => {
    expect(spanning({ x: 5, y: 6 })).toStrictEqual({ x: 5, y: 6, width: 0, height: 0 })
  })
})

describe('grow', () => {
  it('grows a box on every side, and shrinks it for a negative amount', () => {
    expect(grow(card, 10)).toStrictEqual({ x: 90, y: 90, width: 220, height: 120 })
    expect(grow(card, -2)).toStrictEqual({ x: 102, y: 102, width: 196, height: 96 })
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
