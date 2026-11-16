import { describe, expect, it } from 'vite-plus/test'

import { EDGE_OFFSET, NODE_ROW_HEIGHT } from '../constants/index.js'
import type { Box, Point } from '../types/index.js'
import { loopRoom, placeCaptions } from './caption.js'
import { routePoints, selfLoopPoints } from './route.js'

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

/** Whether a point lies inside a box, its edges included. */
function inside(point: Point, box: Box) {
  return (
    box.x <= point.x &&
    point.x <= box.x + box.width &&
    box.y <= point.y &&
    point.y <= box.y + box.height
  )
}

/** The box of the caption at `index`, which the case places. */
function boxAt(placed: readonly { readonly box: Box }[], index: number): Box {
  const caption = placed[index]
  if (caption === undefined) throw new Error(`no caption ${index} was placed`)
  return caption.box
}

/** The point of a route at `index`, which the route has. */
function pointAt(points: readonly Point[], index: number): Point {
  const point = points[index]
  if (point === undefined) throw new Error(`the route has no point ${index}`)
  return point
}

const source = { x: 340, y: 100 }

/** The chip a caption is given on a plain edge with nothing in its way: how big it draws. */
function chip(lines: readonly string[]): Box {
  const points = routePoints(source, { x: 700, y: 300 }, [])
  return (
    placeCaptions([{ caption: lines, points }], [])[0]?.box ?? { x: 0, y: 0, width: 0, height: 0 }
  )
}

describe('placeCaptions', () => {
  const caption = ['one to many', 'on delete cascade']
  const { height } = chip(caption)

  it('stands a caption on the stretch into its target, flush against the end symbol', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const box = boxAt(placeCaptions([{ caption, points }], []), 0)
    // Centred on the wire, so the relation it names runs under it; its right edge a gap of 6
    // short of the end symbol, which takes the last EDGE_OFFSET of the wire.
    expect(box.y).toBe(300 - height / 2)
    expect(box.x + box.width).toBe(700 - EDGE_OFFSET - 6)
  })

  it('stands the caption of the next row out, just left of the one it would cover', () => {
    // Two rows of one card, nearer each other than a chip is tall.
    const upper = routePoints(source, { x: 800, y: 300 }, [])
    const lower = routePoints({ x: 340, y: 500 }, { x: 800, y: 300 + NODE_ROW_HEIGHT }, [])
    const placed = placeCaptions(
      [
        { caption, points: upper },
        { caption, points: lower },
      ],
      [],
    )
    const second = boxAt(placed, 1)
    expect(second.y).toBe(300 + NODE_ROW_HEIGHT - height / 2)
    expect(second.x + second.width).toBe(boxAt(placed, 0).x - 6)
  })

  it('keeps a caption off the models', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const card = { x: 450, y: 90, width: 200, height: 60 }
    expect(overlaps(boxAt(placeCaptions([{ caption, points }], [card]), 0), card)).toBe(false)
  })

  it('fans two captions on the same wire apart', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const placed = placeCaptions(
      [
        { caption, points },
        { caption: ['one to one'], points },
      ],
      [],
    )
    expect(overlaps(boxAt(placed, 0), boxAt(placed, 1))).toBe(false)
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
    const placed = placeCaptions(
      [
        { caption, points },
        { caption: [], points: neighbour },
      ],
      [],
    )
    expect(coversWire(boxAt(placed, 0), neighbour)).toBe(false)
  })

  // Not merely off it: a wire is a box a pixel or two wide, so a chip that only avoids overlapping
  // one still ends up a hair from four others in a bus, near everything and naming nothing.
  it('keeps a margin from a wire that belongs to another edge', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const neighbour = routePoints({ x: 340, y: 160 }, { x: 700, y: 360 }, [])
    const room = boxAt(
      placeCaptions(
        [
          { caption, points },
          { caption: [], points: neighbour },
        ],
        [],
      ),
      0,
    )
    expect(
      coversWire(
        { x: room.x - 4, y: room.y - 4, width: room.width + 8, height: room.height + 8 },
        neighbour,
      ),
    ).toBe(false)
  })

  // The loop of a self relation between two neighbouring rows is shorter than the chip is wide,
  // so a chip centred on it would swallow the whole loop. It hangs off one side instead.
  it('writes the caption of a self relation on its loop without hiding the loop', () => {
    const points = selfLoopPoints(source, { x: 340, y: 122 })
    const box = boxAt(placeCaptions([{ caption: ['tree · one to many'], points }], []), 0)
    expect(coversWire(box, points)).toBe(true)
    expect(points.every((point) => inside(point, box))).toBe(false)
  })

  it('stands the caption of a self relation on its loop, out in the room the loop keeps', () => {
    const loop = selfLoopPoints({ x: 340, y: 100 }, { x: 340, y: 144 })
    const box = boxAt(placeCaptions([{ caption, points: loop }], []), 0)
    const room = loopRoom(loop, caption)
    const turn = pointAt(loop, 1).x
    // Clear of the card, on the loop, and inside the room the other wires are kept out of.
    expect(box.x).toBeGreaterThan(340)
    expect(box.x).toBeLessThan(turn)
    expect(turn).toBeLessThan(box.x + box.width)
    expect(box.x + box.width).toBeLessThanOrEqual(room.x + room.width)
  })

  it('keeps the room from the edge of the card out, so no wire slips between card and loop', () => {
    const loop = selfLoopPoints({ x: 340, y: 100 }, { x: 340, y: 144 })
    expect(loopRoom(loop, caption).x).toBe(340)
  })

  it('falls back to the middle of an edge with nowhere to put a caption', () => {
    // Two ends a few pixels apart: every segment is a corner, so no spot qualifies.
    const points = routePoints({ x: 0, y: 0 }, { x: 6, y: 2 }, [])
    const box = boxAt(placeCaptions([{ caption, points }], []), 0)
    expect({ x: box.x + box.width / 2, y: box.y + box.height / 2 }).toStrictEqual({ x: 3, y: 1 })
  })

  // A relation may be named in any language: `@relation("フォロー")` draws about twice as wide as
  // its character count suggests, and a chip sized from the count is too narrow for its own text.
  it('sizes a chip that holds full-width text to the width it draws at', () => {
    expect(chip(['あいう']).width).toBe(chip(['abcdef']).width)
    expect(chip(['あいう']).width).toBeGreaterThan(chip(['abc']).width)
  })

  it('sizes a chip from its longest line and its line count', () => {
    expect(chip(['ab']).width).toBeLessThan(chip(['abcd']).width)
    expect(chip(['ab', 'abcd']).width).toBe(chip(['abcd']).width)
    expect(chip(['a', 'b']).height).toBeGreaterThan(chip(['a']).height)
  })
})
