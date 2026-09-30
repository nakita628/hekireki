import { describe, expect, it } from 'vite-plus/test'

import { EDGE_OFFSET, NODE_ROW_HEIGHT } from '../constants/index.js'
import type { Box, Point } from '../types/index.js'
import { captionBox, captionWidth, loopRoom, placeCaptions } from './caption.js'
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

const source = { x: 340, y: 100 }

describe('placeCaptions', () => {
  const caption = ['one to many', 'on delete cascade']
  const { height } = captionBox(caption, { x: 0, y: 0 })

  it('stands a caption on the stretch into its target, flush against the end symbol', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const [placed] = placeCaptions([{ caption, points }], [])
    // Centred on the wire, so the relation it names runs under it; its right edge a gap of 6
    // short of the end symbol, which takes the last EDGE_OFFSET of the wire.
    expect(placed?.box.y).toBe(300 - height / 2)
    expect((placed?.box.x ?? 0) + (placed?.box.width ?? 0)).toBe(700 - EDGE_OFFSET - 6)
  })

  it('stands the caption of the next row out, just left of the one it would cover', () => {
    // Two rows of one card, nearer each other than a chip is tall.
    const upper = routePoints(source, { x: 800, y: 300 }, [])
    const lower = routePoints({ x: 340, y: 500 }, { x: 800, y: 300 + NODE_ROW_HEIGHT }, [])
    const [first, second] = placeCaptions(
      [
        { caption, points: upper },
        { caption, points: lower },
      ],
      [],
    )
    expect(second?.box.y).toBe(300 + NODE_ROW_HEIGHT - height / 2)
    expect((second?.box.x ?? 0) + (second?.box.width ?? 0)).toBe((first?.box.x ?? 0) - 6)
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

  // Not merely off it: a wire is a box a pixel or two wide, so a chip that only avoids overlapping
  // one still ends up a hair from four others in a bus, near everything and naming nothing.
  it('keeps a margin from a wire that belongs to another edge', () => {
    const points = routePoints(source, { x: 700, y: 300 }, [])
    const neighbour = routePoints({ x: 340, y: 160 }, { x: 700, y: 360 }, [])
    const [placed] = placeCaptions(
      [
        { caption, points },
        { caption: [], points: neighbour },
      ],
      [],
    )
    expect(placed).toBeDefined()
    const room = placed === undefined ? null : { ...placed.box }
    expect(
      room &&
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
    const [placed] = placeCaptions([{ caption: ['tree · one to many'], points }], [])
    expect(placed).toBeDefined()
    expect(placed && coversWire(placed.box, points)).toBe(true)
    const inside = (point: { x: number; y: number }, box: Box) =>
      box.x <= point.x &&
      point.x <= box.x + box.width &&
      box.y <= point.y &&
      point.y <= box.y + box.height
    expect(placed && points.every((point) => inside(point, placed.box))).toBe(false)
  })

  it('stands the caption of a self relation on its loop, out in the room the loop keeps', () => {
    const loop = selfLoopPoints({ x: 340, y: 100 }, { x: 340, y: 144 })
    const [placed] = placeCaptions([{ caption, points: loop }], [])
    const room = loopRoom(loop, caption)
    const turn = loop[1]?.x ?? 0
    const box = placed?.box ?? { x: 0, y: 0, width: 0, height: 0 }
    // Clear of the card, on the loop, and inside the room the other wires are kept out of.
    expect(box.x).toBeGreaterThan(340)
    expect(box.x < turn && turn < box.x + box.width).toBe(true)
    expect(box.x + box.width).toBeLessThanOrEqual(room.x + room.width)
  })

  it('keeps the room from the edge of the card out, so no wire slips between card and loop', () => {
    const loop = selfLoopPoints({ x: 340, y: 100 }, { x: 340, y: 144 })
    expect(loopRoom(loop, caption).x).toBe(340)
  })

  it('falls back to the middle of an edge with nowhere to put a caption', () => {
    // Two ends a few pixels apart: every segment is a corner, so no spot qualifies.
    const points = routePoints({ x: 0, y: 0 }, { x: 6, y: 2 }, [])
    const [placed] = placeCaptions([{ caption, points }], [])
    expect(placed?.box).toStrictEqual(captionBox(caption, { x: 3, y: 1 }))
  })

  // A relation may be named in any language: `@relation("フォロー")` draws about twice as wide as
  // its character count suggests, and a chip sized from the count is too narrow for its own text.
  it('sizes a chip that holds full-width text to the width it draws at', () => {
    expect(captionWidth(['あいう'])).toBe(captionWidth(['abcdef']))
    expect(captionWidth(['あいう'])).toBeGreaterThan(captionWidth(['abc']))
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
