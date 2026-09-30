import { describe, expect, it } from 'vite-plus/test'

import { EDGE_OFFSET, GRID, NODE_ROW_HEIGHT, SELF_LOOP_GAP } from '../constants/index.js'
import type { Box, Point } from '../types/index.js'
import { routePoints, selfLoopPoints, smoothStepPoints } from './route.js'

/** How far a polyline runs inside a box, so a route can be checked for what it hides. */
function hiddenLength(points: readonly Point[], box: Box) {
  return points.slice(0, -1).reduce((sum, a, index) => {
    const b = points[index + 1] ?? a
    const across = a.y === b.y ? a.y : a.x
    const [from, to] = a.y === b.y ? [box.y, box.y + box.height] : [box.x, box.x + box.width]
    if (across <= from || across >= to) return sum
    const span =
      a.y === b.y
        ? Math.min(Math.max(a.x, b.x), box.x + box.width) - Math.max(Math.min(a.x, b.x), box.x)
        : Math.min(Math.max(a.y, b.y), box.y + box.height) - Math.max(Math.min(a.y, b.y), box.y)
    return sum + Math.max(0, span)
  }, 0)
}

const source = { x: 340, y: 100 }

describe('routePoints', () => {
  it('runs straight between two models with nothing in the way', () => {
    expect(routePoints(source, { x: 700, y: 300 }, [])).toStrictEqual([
      { x: 340, y: 100 },
      { x: 360, y: 100 },
      { x: 380, y: 100 },
      { x: 380, y: 300 },
      { x: 680, y: 300 },
      { x: 700, y: 300 },
    ])
  })

  it('leaves a model between its ends alone when the plain route already misses it', () => {
    const aside = { x: 450, y: 400, width: 200, height: 100 }
    expect(routePoints(source, { x: 700, y: 300 }, [aside])).toStrictEqual(
      routePoints(source, { x: 700, y: 300 }, []),
    )
  })

  it('goes around a model the plain route would disappear behind', () => {
    const between = { x: 450, y: 50, width: 200, height: 300 }
    const points = routePoints(source, { x: 700, y: 300 }, [between])
    expect(hiddenLength(points, between)).toBe(0)
  })

  it('crosses along a lane when every channel down the canvas is blocked', () => {
    // Two cards stacked between the ends leave no clear column, but the gap between them is a
    // lane the edge can cross in.
    const upper = { x: 400, y: 0, width: 300, height: 160 }
    const lower = { x: 400, y: 240, width: 300, height: 200 }
    const points = routePoints(source, { x: 900, y: 400 }, [upper, lower])
    expect(hiddenLength(points, upper) + hiddenLength(points, lower)).toBe(0)
  })

  it('comes down from a lane in the channel nearest its target, not right in front of it', () => {
    // Every edge the lane carries shares the descent, so the stretch into the target is the part
    // of the edge that is its own, and it has to be long enough to hold a caption.
    const upper = { x: 400, y: 0, width: 300, height: 160 }
    const lower = { x: 400, y: 240, width: 300, height: 200 }
    const points = routePoints(source, { x: 900, y: 400 }, [upper, lower])
    expect(points.slice(-3)).toStrictEqual([
      { x: 720, y: 180 },
      { x: 720, y: 400 },
      { x: 900, y: 400 },
    ])
  })

  it('comes down past the cards it clears, however near the target its handle is measured', () => {
    // The canvas measures a handle a few pixels inside its card, which puts the channel in front
    // of a neighbour in the target's own rank just short of the target's doorstep.
    const upper = { x: 400, y: 0, width: 300, height: 160 }
    const lower = { x: 400, y: 240, width: 300, height: 200 }
    const neighbour = { x: 900, y: 60, width: 300, height: 150 }
    const points = routePoints(source, { x: 903, y: 400 }, [upper, lower, neighbour])
    expect(points.at(-3)?.x).toBe(upper.x + upper.width + EDGE_OFFSET)
  })

  it('keeps the plain route when nothing clears the models', () => {
    const wall = { x: 0, y: -1000, width: 2000, height: 3000 }
    expect(routePoints(source, { x: 700, y: 300 }, [wall])).toStrictEqual(
      routePoints(source, { x: 700, y: 300 }, []),
    )
  })

  it('takes the shorter of two ways round the same model', () => {
    // The card sits just below the two ends, so going over it is much shorter than under it.
    const below = { x: 450, y: 130, width: 200, height: 400 }
    const points = routePoints(source, { x: 700, y: 110 }, [below])
    expect(hiddenLength(points, below)).toBe(0)
    expect(Math.max(...points.map((point) => point.y))).toBeLessThan(below.y)
  })

  it('doubles back along a lane when the target is to the left of its source', () => {
    const points = routePoints(source, { x: 100, y: 300 }, [])
    // No channel to cross in, so the edge leaves right, runs the lane, and comes back.
    expect(points[1]).toStrictEqual({ x: source.x + EDGE_OFFSET, y: source.y })
    expect(points[2]?.y).toBe(200)
    expect(points.at(-1)).toStrictEqual({ x: 100, y: 300 })
  })

  it('routes a backward edge around a model too', () => {
    const between = { x: 150, y: 150, width: 300, height: 100 }
    expect(hiddenLength(routePoints(source, { x: 100, y: 300 }, [between]), between)).toBe(0)
  })
})

describe('smoothStepPoints', () => {
  it('crosses in a channel a step of the grid past the end of its stub', () => {
    expect(smoothStepPoints(source, { x: 700, y: 300 })[2]).toStrictEqual({
      x: source.x + EDGE_OFFSET + GRID,
      y: 100,
    })
  })

  it('crosses in the middle of a gap too narrow for that', () => {
    expect(smoothStepPoints(source, { x: 410, y: 300 })[2]).toStrictEqual({ x: 375, y: 100 })
  })
})

describe('selfLoopPoints', () => {
  it('pulls two ends that share a row a row apart, so the loop is not a flat line', () => {
    expect(selfLoopPoints(source, { x: 340, y: 100 })).toStrictEqual([
      { x: 340, y: 100 },
      { x: 340 + SELF_LOOP_GAP, y: 100 },
      { x: 340 + SELF_LOOP_GAP, y: 100 + NODE_ROW_HEIGHT },
      { x: 340, y: 100 + NODE_ROW_HEIGHT },
    ])
  })

  it('meets the row the other end is on when they are already apart', () => {
    expect(selfLoopPoints(source, { x: 340, y: 200 }).at(-1)).toStrictEqual({ x: 340, y: 200 })
  })

  it('turns clear of the card, whichever way the loop runs', () => {
    for (const target of [
      { x: 340, y: 60 },
      { x: 340, y: 200 },
    ]) {
      const points = selfLoopPoints(source, target)
      expect(points.every((point) => point.x >= 340)).toBe(true)
      expect(Math.max(...points.map((point) => point.x))).toBe(340 + SELF_LOOP_GAP)
    }
  })
})
