import { describe, expect, it } from 'vite-plus/test'

import {
  captionBox,
  captionWidth,
  EDGE_OFFSET,
  placeCaptions,
  polylinePath,
  round,
  selfLoopPoints,
  SELF_LOOP_GAP,
  smoothStepPath,
  smoothStepPoints,
  routePoints,
} from './edge.js'
import type { Box, Point } from './edge.js'
import { NODE_ROW_HEIGHT } from './layout.js'

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

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Whether a chip covers any stretch of a wire, which is what hides the relation it names. */
function coversWire(box: Box, points: readonly Point[]) {
  return points.slice(0, -1).some((a, index) => {
    const b = points[index + 1] ?? a
    return overlaps(box, {
      x: Math.min(a.x, b.x) - 1,
      y: Math.min(a.y, b.y) - 1,
      width: Math.abs(b.x - a.x) + 2,
      height: Math.abs(b.y - a.y) + 2,
    })
  })
}

const source = { x: 340, y: 100 }

describe('routePoints', () => {
  it('runs straight between two models with nothing in the way', () => {
    expect(routePoints(source, { x: 700, y: 300 }, [])).toStrictEqual([
      { x: 340, y: 100 },
      { x: 360, y: 100 },
      { x: 520, y: 100 },
      { x: 520, y: 300 },
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
  it('crosses in a channel halfway between the two ends', () => {
    expect(smoothStepPoints(source, { x: 700, y: 300 })[2]).toStrictEqual({ x: 520, y: 100 })
  })

  it('answers with the same corners `smoothStepPath` draws, and their middle', () => {
    const drawn = smoothStepPath(source, { x: 700, y: 300 })
    expect(drawn.points).toStrictEqual(smoothStepPoints(source, { x: 700, y: 300 }))
    expect(drawn.path).toBe(polylinePath(drawn.points))
    expect(drawn.label).toStrictEqual({ x: 520, y: 200 })
  })
})

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

describe('placeCaptions', () => {
  const caption = ['one to many', 'on delete cascade']

  it('puts a caption beside its wire rather than across it', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const [placed] = placeCaptions([{ caption, points }], [])
    expect(placed).toBeDefined()
    // The channel the edge runs down is at x = 520; the chip clears it on one side.
    expect(placed && (placed.box.x > 520 || placed.box.x + placed.box.width < 520)).toBe(true)
  })

  it('keeps a caption off the models', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const card = { x: 450, y: 90, width: 200, height: 60 }
    const [placed] = placeCaptions([{ caption, points }], [card])
    expect(placed && overlaps(placed.box, card)).toBe(false)
  })

  it('fans two captions on the same wire apart', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const [first, second] = placeCaptions(
      [
        { caption, points },
        { caption: ['one to one'], points },
      ],
      [],
    )
    expect(first && second && overlaps(first.box, second.box)).toBe(false)
  })

  it('says nothing for an edge without a caption', () => {
    expect(
      placeCaptions([{ caption: [], points: selfLoopPoints(source, source) }], []),
    ).toStrictEqual([])
  })

  it('stays off a wire that belongs to another edge', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    // A second edge whose channel runs where the first one's caption would like to sit.
    const neighbour = routePoints({ x: 340, y: 160 }, { x: 700, y: 360 }, [])
    const [placed] = placeCaptions(
      [
        { caption, points },
        { caption: [], points: neighbour },
      ],
      [],
    )
    expect(placed).toBeDefined()
    expect(placed && coversWire(placed.box, neighbour)).toBe(false)
  })

  it('falls back to the middle of an edge with nowhere to put a caption', () => {
    // Two ends a few pixels apart: every segment is a corner, so no spot qualifies.
    const points = routePoints({ x: 0, y: 0 }, { x: 6, y: 2 }, [])
    const [placed] = placeCaptions([{ caption, points }], [])
    expect(placed?.box).toStrictEqual(captionBox(caption, { x: 3, y: 1 }))
  })

  it('sizes a chip from its longest line and its line count', () => {
    expect(captionWidth(['ab'])).toBeLessThan(captionWidth(['abcd']))
    expect(captionWidth(['ab', 'abcd'])).toBe(captionWidth(['abcd']))
    const [one, two] = [captionBox(['a'], source), captionBox(['a', 'b'], source)]
    expect(two.height).toBeGreaterThan(one.height)
    // The box is centred on the point it is given.
    expect(one.x + one.width / 2).toBe(source.x)
    expect(one.y + one.height / 2).toBe(source.y)
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
