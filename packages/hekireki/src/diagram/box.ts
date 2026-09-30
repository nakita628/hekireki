// What the router, the track spreader and the caption placer all ask of a box: whether another
// meets it, what holds a few of them, and how much of a wire runs hidden inside them.
import type { Box, Point, Route } from '../types/index.js'

/** The smallest box holding them all, grown by a margin. */
export function around(boxes: readonly Box[], margin: number): Box {
  const x = Math.min(...boxes.map((box) => box.x)) - margin
  const y = Math.min(...boxes.map((box) => box.y)) - margin
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) + margin - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) + margin - y,
  }
}

/** The box two points span: a line's worth of box between two ends, or a point's for one. */
export function spanning(a: Point, b: Point = a): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** The box grown by `by` on every side, or shrunk by it where `by` is below zero. */
export function grow(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 }
}

/** Whether two boxes overlap; boxes that only touch do not meet. */
export function meets(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** How long a stretch of an axis-aligned segment runs inside a box. */
function insideBox(a: Point, b: Point, box: Box) {
  const horizontal = a.y === b.y
  // The segment is flat, so it is hidden only where the coordinate it does not travel along
  // falls within the box; along the one it does, the two spans simply overlap.
  const across = horizontal ? a.y : a.x
  const [acrossFrom, acrossTo] = horizontal
    ? [box.y, box.y + box.height]
    : [box.x, box.x + box.width]
  if (across <= acrossFrom || across >= acrossTo) return 0
  const [from, to] = horizontal
    ? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
    : [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  const [boxFrom, boxTo] = horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height]
  return Math.max(0, Math.min(to, boxTo) - Math.max(from, boxFrom))
}

/** How much of a route disappears behind the cards, and how long the route is. */
export function routeCost(points: Route, obstacles: readonly Box[]) {
  return points.slice(0, -1).reduce(
    (cost, a, index) => {
      const b = points[index + 1] ?? a
      return {
        hidden: cost.hidden + obstacles.reduce((sum, box) => sum + insideBox(a, b, box), 0),
        length: cost.length + Math.hypot(b.x - a.x, b.y - a.y),
      }
    },
    { hidden: 0, length: 0 },
  )
}
