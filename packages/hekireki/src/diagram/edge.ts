// How a relation is drawn between two cards and where its caption sits, shared by the exported
// SVG (svg.ts) and the Studio canvas (studio/client/features/schema) so the two agree.
import {
  EDGE_BEND_RADIUS,
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_PADDING,
  EDGE_OFFSET,
  GRID,
  MONO_ADVANCE,
  NODE_ROW_HEIGHT,
  SELF_LOOP_GAP,
} from '../constants/index.js'
import type { Box, Point } from '../types/index.js'
import { textUnits } from './text.js'

// The room either side of the widest line of a caption, inside its chip.
const EDGE_LABEL_PADDING_X = 5
// The room a caption keeps between itself and the wire it labels when it sits beside one.
const CAPTION_GAP = 6

/** Two decimals is as precise as a coordinate in the drawing ever needs to be. */
export function round(value: number) {
  return Math.round(value * 100) / 100
}

function bend(a: Point, b: Point, c: Point) {
  const size = Math.min(
    Math.hypot(a.x - b.x, a.y - b.y) / 2,
    Math.hypot(b.x - c.x, b.y - c.y) / 2,
    EDGE_BEND_RADIUS,
  )
  const { x, y } = b
  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) return `L${round(x)} ${round(y)}`
  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1
    const yDir = a.y < c.y ? 1 : -1
    return `L ${round(x + size * xDir)},${round(y)}Q ${round(x)},${round(y)} ${round(x)},${round(y + size * yDir)}`
  }
  const xDir = a.x < c.x ? 1 : -1
  const yDir = a.y < c.y ? -1 : 1
  return `L ${round(x)},${round(y + size * yDir)}Q ${round(x)},${round(y)} ${round(x + size * xDir)},${round(y)}`
}

/** The polyline through the points, with a rounded corner wherever it turns. */
export function polylinePath(points: readonly Point[]) {
  return points
    .map((point, index) => {
      const previous = points[index - 1]
      const next = points[index + 1]
      if (previous && next) return bend(previous, point, next)
      return `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`
    })
    .join('')
}

/** An edge that crosses the gap in a channel down the canvas at `x`. */
function throughChannel(source: Point, target: Point, x: number): readonly Point[] {
  return [
    source,
    { x: source.x + EDGE_OFFSET, y: source.y },
    { x, y: source.y },
    { x, y: target.y },
    { x: target.x - EDGE_OFFSET, y: target.y },
    target,
  ]
}

/**
 * An edge that leaves its models first, crosses along a lane across the canvas at `y`, and comes
 * down to its target in a channel at `x`.
 */
function alongLane(source: Point, target: Point, y: number, x: number): readonly Point[] {
  return [
    source,
    { x: source.x + EDGE_OFFSET, y: source.y },
    { x: source.x + EDGE_OFFSET, y },
    { x, y },
    { x, y: target.y },
    target,
  ]
}

/** The corners of an edge from a source on the right of a node to a target on the left of another. */
export function smoothStepPoints(source: Point, target: Point): readonly Point[] {
  const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  // The channel runs a step of the grid past the end of the source's stub, and leaves the rest of
  // the gap to the captions in front of the target; a gap too narrow for that is crossed in its
  // middle. A target to the left of its source has no channel to cross in, so the edge doubles
  // back along a lane instead.
  return source.x + EDGE_OFFSET < target.x - EDGE_OFFSET
    ? throughChannel(source, target, Math.min(source.x + EDGE_OFFSET + GRID, center.x))
    : alongLane(source, target, center.y, target.x - EDGE_OFFSET)
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
function routeCost(points: readonly Point[], obstacles: readonly Box[]) {
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

// A route is nudged aside by this much so it clears the card it was running through.
const CLEARANCE = EDGE_OFFSET
// The cards are shrunk before a route is scored against them: an edge ends on a card's border,
// and touching one there is what it is meant to do.
const CARD_INSET = 2

/**
 * The corners of an edge, routed around the cards it would otherwise vanish behind: the plain
 * smoothstep is kept whenever it is already in the clear, and only a blocked one looks for
 * another channel down the canvas or another lane across it.
 */
export function routePoints(source: Point, target: Point, cards: readonly Box[]): readonly Point[] {
  const obstacles = cards.map((card) => ({
    x: card.x + CARD_INSET,
    y: card.y + CARD_INSET,
    width: card.width - CARD_INSET * 2,
    height: card.height - CARD_INSET * 2,
  }))
  const direct = smoothStepPoints(source, target)
  const corridor = {
    x: Math.min(source.x, target.x) - EDGE_OFFSET,
    y: Math.min(source.y, target.y) - EDGE_OFFSET,
    width: Math.abs(target.x - source.x) + EDGE_OFFSET * 2,
    height: Math.abs(target.y - source.y) + EDGE_OFFSET * 2,
  }
  // The plain route stays in the corridor between the two ends, so only a card that reaches into
  // it can be in the way.
  const inTheWay = cards.filter((card) => meets(corridor, card))
  const blocking = obstacles.filter((box) => meets(corridor, box))
  if (routeCost(direct, blocking).hidden === 0) return direct
  // Only those cards suggest a way round, and every way round runs no further than a clearance
  // past them, so what lies beyond has no say in which one is taken.
  const reach = around([corridor, ...inTheWay], CLEARANCE)
  const nearby = obstacles.filter((box) => meets(reach, box))
  const channels = inTheWay
    .flatMap((card) => [card.x - CLEARANCE, card.x + card.width + CLEARANCE])
    .filter((x) => x > source.x + EDGE_OFFSET && x < target.x - EDGE_OFFSET)
  const lanes = inTheWay.flatMap((card) => [card.y - CLEARANCE, card.y + card.height + CLEARANCE])
  // Where a lane comes down: the channel nearest the target first, right in front of it last.
  // They cost the same, and of two equal routes the first is kept, so the edge comes down early
  // and keeps a stretch into its target that no other edge on the lane shares — where its
  // caption can say which edge it is.
  const descents = [...channels.toSorted((a, b) => b - a), target.x - EDGE_OFFSET]
  return [
    direct,
    ...channels.map((x) => throughChannel(source, target, x)),
    ...lanes.flatMap((y) => descents.map((x) => alongLane(source, target, y, x))),
  ]
    .map((points) => ({ points, cost: routeCost(points, nearby) }))
    .reduce((best, candidate) =>
      candidate.cost.hidden < best.cost.hidden ||
      (candidate.cost.hidden === best.cost.hidden && candidate.cost.length < best.cost.length)
        ? candidate
        : best,
    ).points
}

// How far apart two wires are drawn where they would otherwise run on top of each other: half a
// step of the grid, so a channel down the middle of a gap and the tracks beside it stay on it.
const TRACK = GRID / 2

/** A vertical segment of a route, from `points[index]` to `points[index + 1]`. */
type Stretch = {
  readonly route: number
  readonly points: readonly Point[]
  readonly index: number
  readonly x: number
  readonly from: number
  readonly to: number
  /** Whether it turns in at one end and out at the other, so it can shift sideways. */
  readonly free: boolean
}

function verticals(routes: readonly (readonly Point[])[]): readonly Stretch[] {
  return routes.flatMap((points, route) =>
    points.flatMap((a, index) => {
      const b = points[index + 1]
      if (!(b && a.x === b.x && a.y !== b.y)) return []
      const before = points[index - 1]
      const after = points[index + 2]
      const free =
        before !== undefined &&
        after !== undefined &&
        before.y === a.y &&
        before.x !== a.x &&
        after.y === b.y &&
        after.x !== b.x
      const from = Math.min(a.y, b.y)
      const to = Math.max(a.y, b.y)
      return [{ route, points, index, x: a.x, from, to, free }]
    }),
  )
}

/** The items in groups, each the items reachable from one another by `linked`. */
function components<T>(
  items: readonly T[],
  linked: (a: T, b: T) => boolean,
): readonly (readonly T[])[] {
  return items.reduce<readonly (readonly T[])[]>((groups, item) => {
    const joined = groups.filter((group) => group.some((other) => linked(item, other)))
    const apart = groups.filter((group) => !joined.includes(group))
    return [...apart, [...joined.flat(), item]]
  }, [])
}

/**
 * How many times the stretches of `left` and `right` cross when `left` is drawn to the left: a
 * wire leaving `left` towards the right crosses every stretch of `right` it passes, and one
 * leaving `right` towards the left every stretch of `left`.
 */
function crossings(left: readonly Stretch[], right: readonly Stretch[]) {
  const leaving = (bundle: readonly Stretch[], side: number) =>
    bundle.flatMap((stretch) =>
      [stretch.points[stretch.index - 1], stretch.points[stretch.index + 2]].flatMap((end) =>
        end !== undefined && Math.sign(end.x - stretch.x) === side ? [end.y] : [],
      ),
    )
  const passes = (ys: readonly number[], bundle: readonly Stretch[]) =>
    ys.filter((y) => bundle.some((stretch) => stretch.from < y && y < stretch.to)).length
  return passes(leaving(left, 1), right) + passes(leaving(right, -1), left)
}

/** The bundles in the order that crosses least, each put where it adds the fewest crossings. */
function leastCrossing(bundles: readonly (readonly Stretch[])[]) {
  const total = (order: readonly (readonly Stretch[])[]) =>
    order.reduce(
      (sum, left, index) =>
        sum + order.slice(index + 1).reduce((more, right) => more + crossings(left, right), 0),
      0,
    )
  return bundles.reduce<readonly (readonly Stretch[])[]>((order, bundle) => {
    const options = Array.from({ length: order.length + 1 }, (_, index) =>
      order.toSpliced(index, 0, bundle),
    )
    return options.reduce((best, option) => (total(option) < total(best) ? option : best))
  }, [])
}

/** The route with the stretch at `index` moved sideways to `x`. */
function shifted(points: readonly Point[], index: number, x: number): readonly Point[] {
  return points.map((point, at) => (at === index || at === index + 1 ? { x, y: point.y } : point))
}

/** The part of a stretch's route that moves with it: the stretch at `x`, and the wires in and out. */
function turned({ points, index }: Stretch, x: number): readonly Point[] {
  return points
    .slice(index - 1, index + 3)
    .map((point, at) => (at === 1 || at === 2 ? { x, y: point.y } : point))
}

/**
 * What it costs to move a stretch to `x`: how much of what moves with it then runs too near a card
 * or a wire that cannot move. A move that turns a wire into or out of the stretch back on itself,
 * or leaves an end symbol less than its room, is not made at all.
 */
function shiftCost(stretch: Stretch, x: number, near: readonly Box[]) {
  const { points } = stretch
  const keeps = [stretch.index - 1, stretch.index + 2].every((at) => {
    const end = points[at]
    if (end === undefined) return false
    const room = at === 0 || at === points.length - 1 ? EDGE_OFFSET : 0
    return Math.sign(end.x - x) === Math.sign(end.x - stretch.x) && Math.abs(end.x - x) >= room
  })
  return keeps ? routeCost(turned(stretch, x), near).hidden : Infinity
}

/**
 * Draws apart the vertical stretches that would run on top of, or too close to, one another:
 * each group of them gets a track of its own, `TRACK` apart, in the order that crosses least.
 * Edges that leave from the same point, or arrive at the same point, are one wire forking and
 * keep one track between them.
 */
function spreadVertical(
  routes: readonly (readonly Point[])[],
  cards: readonly Box[],
): readonly (readonly Point[])[] {
  const all = verticals(routes)
  // What a stretch keeps its distance from: half a track from the cards, and a whole one from the
  // wires of other routes that cannot move out of its way, as far as from a track beside it.
  const obstacles = [
    ...cards.map((card) => ({
      route: null,
      box: {
        x: card.x - TRACK / 2,
        y: card.y - TRACK / 2,
        width: card.width + TRACK,
        height: card.height + TRACK,
      },
    })),
    ...all
      .filter((stretch) => !stretch.free)
      .map((stretch) => ({
        route: stretch.route,
        box: {
          x: stretch.x - TRACK,
          y: stretch.from,
          width: TRACK * 2,
          height: stretch.to - stretch.from,
        },
      })),
  ]
  const moves = components(
    all.filter((stretch) => stretch.free),
    (a, b) => Math.abs(a.x - b.x) < TRACK && a.from < b.to && b.from < a.to,
  ).flatMap((group) => {
    const bundles = components(
      group,
      (a, b) =>
        a.x === b.x &&
        [0, -1].some((at) => {
          const one = a.points.at(at)
          const other = b.points.at(at)
          return one?.x === other?.x && one?.y === other?.y
        }),
    )
    const order = leastCrossing(bundles.toSorted((a, b) => (a[0]?.x ?? 0) - (b[0]?.x ?? 0)))
    // Every edge comes into its target from the left, and the stretch between its track and the
    // target is where its caption goes, so the tracks are laid out rightwards from the leftmost
    // stretch rather than either side of them. They slide over together, half a track at a time,
    // where that keeps them clearer of the cards and the wires that cannot move: a turn just
    // outside a card has no room to move towards it.
    const first = Math.min(...group.map((stretch) => stretch.x))
    const tracks = order.map((_, index) => first + index * TRACK)
    const layouts = Array.from({ length: order.length * 2 + 1 }, (_, step) => {
      const slide = (Math.ceil(step / 2) * (step % 2 === 0 ? -TRACK : TRACK)) / 2
      return tracks.map((x) => x + slide)
    })
    // Whatever layout is taken, what moves stays within the wires into and out of the group and
    // the tracks it can be given, so only what lies near those can make one cost more.
    const moved = group.flatMap((stretch) => turned(stretch, stretch.x))
    const spanX = [...moved.map((point) => point.x), ...layouts.flat()]
    const spanY = moved.map((point) => point.y)
    const reach = {
      x: Math.min(...spanX) - TRACK,
      y: Math.min(...spanY) - TRACK,
      width: Math.max(...spanX) - Math.min(...spanX) + TRACK * 2,
      height: Math.max(...spanY) - Math.min(...spanY) + TRACK * 2,
    }
    const near = obstacles.filter((obstacle) => meets(reach, obstacle.box))
    const cost = (bundle: readonly Stretch[], x: number) =>
      bundle.reduce(
        (sum, stretch) =>
          sum +
          shiftCost(
            stretch,
            x,
            near.filter((obstacle) => obstacle.route !== stretch.route).map(({ box }) => box),
          ),
        0,
      )
    const costs = layouts.map((xs) =>
      order.reduce((sum, bundle, index) => sum + cost(bundle, xs[index] ?? 0), 0),
    )
    const layout = layouts[costs.indexOf(Math.min(...costs))] ?? []
    // Where no layout suits them all, a bundle that cannot take its track keeps its place.
    return order.flatMap((bundle, index) => {
      const x = layout[index] ?? 0
      return Number.isFinite(cost(bundle, x)) ? bundle.map((stretch) => ({ stretch, x })) : []
    })
  })
  return routes.map((points, route) =>
    moves
      .filter((move) => move.stretch.route === route)
      .reduce((moved, move) => shifted(moved, move.stretch.index, move.x), points),
  )
}

function transposed(point: Point): Point {
  return { x: point.y, y: point.x }
}

/**
 * The routes with the stretches that different edges would draw on top of each other moved apart,
 * down the canvas first and then across it, so every wire can be followed on its own.
 */
export function separateRoutes(
  routes: readonly (readonly Point[])[],
  cards: readonly Box[],
): readonly (readonly Point[])[] {
  const across = cards.map((card) => ({
    x: card.y,
    y: card.x,
    width: card.height,
    height: card.width,
  }))
  // A stretch moved onto its track can land beside one that was not in its group, so the passes
  // run again on what they drew until they move nothing — no more often than there are routes,
  // each pass having settled at least one of them.
  const settle = (
    current: readonly (readonly Point[])[],
    passes: number,
  ): readonly (readonly Point[])[] => {
    const next = spreadVertical(
      spreadVertical(current, cards).map((points) => points.map(transposed)),
      across,
    ).map((points) => points.map(transposed))
    const moved = next.some((points, route) =>
      points.some((point, index) => {
        const before = current[route]?.[index]
        return point.x !== before?.x || point.y !== before.y
      }),
    )
    return moved && passes > 1 ? settle(next, passes - 1) : next
  }
  return settle(routes, routes.length)
}

// The corners of a relation that returns to the node it started from, looped off its right side.
// Two ends of the same row would flatten the loop into an invisible line, so they are pulled a
// row apart — a self many-to-many hangs both of its ends off the header.
export function selfLoopPoints(source: Point, target: Point): readonly Point[] {
  const flat = Math.abs(target.y - source.y) < NODE_ROW_HEIGHT / 2
  const end = { x: target.x, y: flat ? source.y + NODE_ROW_HEIGHT : target.y }
  const turn = source.x + SELF_LOOP_GAP
  return [source, { x: turn, y: source.y }, { x: turn, y: end.y }, end]
}

export function captionWidth(caption: readonly string[]) {
  // A relation may be named in any language — `@relation("フォロー")` — so the chip is measured
  // the way a card measures a name, or a caption in Japanese draws half again as wide as its box.
  return (
    Math.max(...caption.map((line) => textUnits(line) * EDGE_LABEL_FONT_SIZE * MONO_ADVANCE)) +
    EDGE_LABEL_PADDING_X * 2
  )
}

function captionHeight(caption: readonly string[]) {
  return caption.length * EDGE_LABEL_LINE_HEIGHT + EDGE_LABEL_PADDING
}

export function captionBox(caption: readonly string[], center: Point): Box {
  const width = captionWidth(caption)
  const height = captionHeight(caption)
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

/** How far two boxes lie apart, zero once they touch. */
function boxGap(a: Box, b: Box) {
  const x = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0)
  const y = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0)
  return Math.hypot(x, y)
}

/** How much of two boxes cover each other, counting the breathing room around them. */
function overlapArea(a: Box, b: Box, margin: number) {
  const width = Math.min(a.x + a.width, b.x + b.width + margin) - Math.max(a.x, b.x - margin)
  const height = Math.min(a.y + a.height, b.y + b.height + margin) - Math.max(a.y, b.y - margin)
  return width > 0 && height > 0 ? width * height : 0
}

// A horizontal stretch has to be long enough to write along; a vertical one only has to be long
// enough to stand a chip next to, and the vertical of a self relation between neighbouring rows
// is one row tall. Below these, a segment is a corner rather than somewhere a caption can live.
const ALONG_WIRE = 24
const BESIDE_WIRE = 12
// How far inside the chip the wire runs when the chip hangs off to one side instead of straddling
// the wire in the middle. Far enough in to read as "this line", near enough the edge to leave the
// chip somewhere else to be.
const EDGE_INSET = 12

// Where along a segment a caption may sit: the middle first, then outwards a twentieth of the
// segment at a time, to a tenth of it from either end. A chip whose middle is taken slides along
// its own wire rather than stepping off it, which is what keeps it on the line it names — the
// offsets below are the last resort, not this.
const CAPTION_STEP = 1 / 20
const CAPTION_END = 1 / 10
const CAPTION_STOPS = Array.from(
  { length: Math.round((1 - CAPTION_END * 2) / CAPTION_STEP) + 1 },
  (_, index) => {
    const step = Math.ceil(index / 2) * CAPTION_STEP
    return 1 / 2 + (index % 2 === 0 ? -step : step)
  },
)

// Where a caption may sit: along the segments of its own edge, the vertical ones first — they are
// the part of a smoothstep edge that belongs to it alone, so the labels of a shared bus fan out.
// Off the wire counts too — beside a vertical stretch for a label too wide to straddle it, above
// or below a horizontal one — which is what a caption needs where several edges run the same
// corridor and every spot on the wire is already somebody's.
function captionSpots(
  points: readonly Point[],
  width: number,
  height: number,
): readonly (readonly Point[])[] {
  const segments = points
    .slice(0, -1)
    .map((a, index) => {
      const b = points[index + 1] ?? a
      return { a, b, vertical: a.x === b.x, length: Math.hypot(b.x - a.x, b.y - a.y) }
    })
    .filter((segment) => segment.length > (segment.vertical ? BESIDE_WIRE : ALONG_WIRE))
    .toSorted((a, b) =>
      a.vertical === b.vertical ? b.length - a.length : Number(b.vertical) - Number(a.vertical),
    )
  const beside = width / 2 + CAPTION_GAP
  const clear = height / 2 + CAPTION_GAP
  // Hanging the chip off to one side with the wire still under it, near its edge rather than its
  // middle. A self relation loops a short way out of its own node, so a chip centred on the loop
  // reaches back over the model; hung to the outside it stays on the wire and off the card.
  const hugs = [width / 2 - EDGE_INSET, height / 2 - EDGE_INSET].map((half) =>
    half > EDGE_INSET ? [half, -half] : [],
  )
  // Two rings out from the wire, not one: in a corridor where several edges run together the
  // first ring is still inside the bus, and a label with nowhere clear to go settles among wires
  // it does not name. The second ring clears a whole chip's width, which is enough to leave it.
  const rings = [0, height + CAPTION_GAP]
  // How far off the wire a spot sits, across a vertical stretch or along a horizontal one. Zero
  // comes first in both: a chip written on its own wire says which relation it names without the
  // reader having to guess, which is what a label beside a bus of parallel wires cannot do. The
  // chip is opaque, so the line it names runs under it and out the other side. The offsets are
  // what it falls back to when the wire is somewhere it cannot sit — over a model, or over a
  // label already placed.
  const across = [
    0,
    ...(hugs[0] ?? []),
    ...rings.flatMap((ring) => [beside + ring, -beside - ring]),
  ]
  const along = [0, ...(hugs[1] ?? []), ...rings.flatMap((ring) => [-clear - ring, clear + ring])]
  return segments.map((segment) =>
    CAPTION_STOPS.flatMap((t) => {
      const on = {
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: segment.a.y + (segment.b.y - segment.a.y) * t,
      }
      return segment.vertical
        ? across.map((offset) => ({ x: on.x + offset, y: on.y }))
        : along.map((offset) => ({ x: on.x, y: on.y + offset }))
    }),
  )
}

function midpoint(points: readonly Point[]): Point {
  return {
    x: ((points[0]?.x ?? 0) + (points.at(-1)?.x ?? 0)) / 2,
    y: ((points[0]?.y ?? 0) + (points.at(-1)?.y ?? 0)) / 2,
  }
}

type CaptionedEdge = {
  readonly caption: readonly string[]
  readonly points: readonly Point[]
}

type PlacedCaption<E extends CaptionedEdge> = {
  readonly edge: E
  readonly caption: readonly string[]
  readonly box: Box
}

// The breathing room a chip keeps from a model and from another chip: a chip that only touches
// one still reads as crowding it.
const CARD_MARGIN = 4
const CAPTION_MARGIN = 2
// A wire as a box: a pixel either side of its line, about the width it is drawn at.
const WIRE_HALF_WIDTH = 1
// What a pixel of a model costs a caption that covers it. A row buried under a chip is the one
// thing the reader loses outright — the chip still reads, the field under it does not — so this
// outweighs sitting off the wire, which only costs the reader a moment's tracing.
const CARD_CLASH = 3
// How much worse it is to cover a caption already placed than to cover a model: two labels on top
// of each other read as neither, while a chip over a model still reads as itself.
const CAPTION_CLASH = 4
// A caption that straddles another edge's wire hides the relation that one names, so covering it
// costs this much more per pixel than covering a model does. Its own wire is free: sitting on the
// edge it names is what the chip is for. It stays below the
// price of burying a model row, which a reader loses outright.
const WIRE_CLASH = 5
// The clearance a caption keeps from somebody else's wire, and what a pixel of it costs. Without
// them a wire is a box one or two pixels wide, grazing one costs almost nothing, and every label
// of a bus settles in the middle of it a few pixels from four other wires — near everything, and
// therefore naming nothing. Crowding stays cheaper per pixel than covering a model, which is the
// one thing a reader loses outright: a chip that is merely close to a wire it does not name is
// still read, a model row underneath one is not.
const WIRE_CLEARANCE = 10
const WIRE_CROWDING = 0.25
// What a pixel of distance from its own wire costs, per pixel of the chip's width — so the term
// is an area, like the rest of the cost. A chip that drifts reads as belonging to nothing, so it
// only goes where it has to: a ring further out is worth about a third of one crowding wire, and
// is taken when the near spot is in the bus and the far one is not.
const OFF_WIRE = 1

/**
 * The segments of every edge as thin boxes, each with the edge it belongs to: a caption is meant
 * to sit on its own edge, so what it has to stay off is everybody else's.
 */
function wireBoxes<E extends CaptionedEdge>(
  edges: readonly E[],
): readonly { readonly edge: E; readonly box: Box }[] {
  return edges.flatMap((edge) =>
    edge.points.slice(0, -1).map((a, index) => {
      const b = edge.points[index + 1] ?? a
      return {
        edge,
        box: {
          x: Math.min(a.x, b.x) - WIRE_HALF_WIDTH,
          y: Math.min(a.y, b.y) - WIRE_HALF_WIDTH,
          width: Math.abs(b.x - a.x) + WIRE_HALF_WIDTH * 2,
          height: Math.abs(b.y - a.y) + WIRE_HALF_WIDTH * 2,
        },
      }
    }),
  )
}

/** The smallest box holding them all, grown by a margin. */
function around(boxes: readonly Box[], margin: number): Box {
  const x = Math.min(...boxes.map((box) => box.x)) - margin
  const y = Math.min(...boxes.map((box) => box.y)) - margin
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) + margin - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) + margin - y,
  }
}

function meets(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * The captions that stand in columns in front of the cards their edges come into. Each sits on the
 * stretch into its target, centred on that wire and flush right a gap short of the end symbol, so
 * the captions of a rank line up down its left edge. Two rows are nearer each other than a chip
 * is tall, but never nearer than half of it, so where the caption of the row above is in the way
 * a caption stands just left of it, and every caption stays on its own wire. One that would then
 * reach back past its own track, or cover a model or another edge's wire, is left to the search
 * in `placeCaptions`.
 */
function inColumns<E extends CaptionedEdge>(
  edges: readonly E[],
  wires: readonly { readonly edge: E; readonly box: Box }[],
  cards: readonly Box[],
): readonly PlacedCaption<E>[] {
  const entering = edges.flatMap((edge) => {
    const end = edge.points.at(-1)
    // Where the straight run into the target starts: the corner after the last point off its line.
    const turn = edge.points[edge.points.findLastIndex((point) => point.y !== end?.y) + 1]
    if (edge.caption.length === 0 || turn === undefined || end === undefined) return []
    return turn.x < end.x ? [{ edge, turn, end }] : []
  })
  return [...Map.groupBy(entering, ({ end }) => end.x).values()].flatMap(
    (rank) =>
      rank
        .toSorted((a, b) => a.end.y - b.end.y)
        .reduce<{ readonly placed: readonly PlacedCaption<E>[] }>(
          (state, { edge, turn, end }) => {
            const { caption } = edge
            const width = captionWidth(caption)
            const height = captionHeight(caption)
            // Flush right a gap short of the end symbol, or else just left of the caption it would
            // cover, as far out as its own straight run reaches.
            const stand = (x: number): Box | undefined => {
              const spot = { x, y: end.y - height / 2, width, height }
              const covered = state.placed.filter(
                (other) => overlapArea(spot, other.box, CAPTION_MARGIN) > 0,
              )
              if (covered.length === 0) return spot
              const next = Math.min(...covered.map((other) => other.box.x)) - CAPTION_GAP - width
              return next < turn.x ? undefined : stand(next)
            }
            const box = stand(end.x - EDGE_OFFSET - CAPTION_GAP - width)
            const clear =
              box !== undefined &&
              box.x >= turn.x &&
              !cards.some((card) => overlapArea(box, card, CARD_MARGIN) > 0) &&
              !wires.some((wire) => wire.edge !== edge && meets(box, wire.box))
            return clear ? { placed: [...state.placed, { edge, caption, box }] } : state
          },
          { placed: [] },
        ).placed,
  )
}

/**
 * Puts every caption in a column in front of the card its edge comes into, and the few no column
 * holds on the clearest stretch of their edge: off the models, off the other captions and off the
 * wires, so a chip never hides the relation it names.
 */
export function placeCaptions<E extends CaptionedEdge>(
  edges: readonly E[],
  cards: readonly Box[],
): readonly PlacedCaption<E>[] {
  const wires = wireBoxes(edges)
  const { placed } = edges.reduce<{ readonly placed: readonly PlacedCaption<E>[] }>(
    (state, edge) => {
      const { caption } = edge
      if (caption.length === 0 || state.placed.some((other) => other.edge === edge)) return state
      const own = wires.filter((wire) => wire.edge === edge)
      // Nothing costs less than nothing, so once a segment holds a spot that is free, the ones
      // after it are not looked at.
      const best = captionSpots(edge.points, captionWidth(caption), captionHeight(caption)).reduce<{
        readonly box: Box
        readonly cost: number
      } | null>((found, spots) => {
        if (found?.cost === 0) return found
        const boxes = spots.map((spot) => captionBox(caption, spot))
        // The spots of a segment all lie along it, so only what is near them can be in the way.
        const reach = around(boxes, WIRE_CLEARANCE)
        const near = cards.filter((card) => meets(reach, card))
        const crossed = wires.filter((wire) => wire.edge !== edge && meets(reach, wire.box))
        const taken = state.placed.filter((other) => meets(reach, other.box))
        const scored = boxes.map((box) => {
          // How far the chip sits from the wire it names. Every pixel of it counts, so the spot
          // on the wire wins whenever it is free and the chip steps off only when staying
          // would cost it a model row — a chip on its line needs no tracing at all.
          const drift = Math.min(...own.map((wire) => boxGap(box, wire.box)))
          const cost =
            near.reduce((sum, card) => sum + overlapArea(box, card, CARD_MARGIN) * CARD_CLASH, 0) +
            taken.reduce(
              (sum, other) => sum + overlapArea(box, other.box, CAPTION_MARGIN) * CAPTION_CLASH,
              0,
            ) +
            crossed.reduce(
              (sum, wire) =>
                sum +
                overlapArea(box, wire.box, 0) * WIRE_CLASH +
                overlapArea(box, wire.box, WIRE_CLEARANCE) * WIRE_CROWDING,
              0,
            ) +
            drift * box.width * OFF_WIRE
          return { box, cost }
        })
        return scored.reduce(
          (kept, candidate) => (kept === null || candidate.cost < kept.cost ? candidate : kept),
          found,
        )
      }, null)
      const box = best?.box ?? captionBox(caption, midpoint(edge.points))
      return { placed: [...state.placed, { edge, caption, box }] }
    },
    { placed: inColumns(edges, wires, cards) },
  )
  // In the order of the edges, whichever way each was placed.
  return edges.flatMap((edge) => placed.filter((caption) => caption.edge === edge))
}
