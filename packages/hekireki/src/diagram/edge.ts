// How a relation is drawn between two cards and where its caption sits, shared by the exported
// SVG (svg.ts) and the Studio canvas (studio/client/features/schema) so the two agree.
import { NODE_ROW_HEIGHT } from './layout.js'
import { textUnits } from './text.js'

export type Point = { readonly x: number; readonly y: number }

export type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** How far an edge runs straight out of a card before it is allowed to turn. */
export const EDGE_OFFSET = 20
const EDGE_BEND_RADIUS = 5
/** How far a self relation reaches to the right of the node it loops back into. */
export const SELF_LOOP_GAP = 34

export const EDGE_LABEL_FONT_SIZE = 9.5
export const EDGE_LABEL_LINE_HEIGHT = 12
export const EDGE_LABEL_PADDING = 4
// The room a caption keeps between itself and the wire it labels when it sits beside one.
const CAPTION_GAP = 6
// Glyph advance as a fraction of the font size, for the monospace face captions are set in.
const MONO_ADVANCE = 0.6

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

/** An edge that leaves its models first and crosses along a lane across the canvas at `y`. */
function alongLane(source: Point, target: Point, y: number): readonly Point[] {
  return [
    source,
    { x: source.x + EDGE_OFFSET, y: source.y },
    { x: source.x + EDGE_OFFSET, y },
    { x: target.x - EDGE_OFFSET, y },
    { x: target.x - EDGE_OFFSET, y: target.y },
    target,
  ]
}

/** The corners of an edge from a source on the right of a node to a target on the left of another. */
export function smoothStepPoints(source: Point, target: Point): readonly Point[] {
  const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  // A target to the left of its source has no channel to cross in, so the edge doubles back
  // along a lane instead.
  return source.x + EDGE_OFFSET < target.x - EDGE_OFFSET
    ? throughChannel(source, target, center.x)
    : alongLane(source, target, center.y)
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
  if (routeCost(direct, obstacles).hidden === 0) return direct
  // Only the cards in the corridor between the two ends suggest a way round; the rest of the
  // drawing still has a say, because every candidate is scored against all of it.
  const corridor = {
    x: Math.min(source.x, target.x) - EDGE_OFFSET,
    y: Math.min(source.y, target.y) - EDGE_OFFSET,
    width: Math.abs(target.x - source.x) + EDGE_OFFSET * 2,
    height: Math.abs(target.y - source.y) + EDGE_OFFSET * 2,
  }
  const inTheWay = cards.filter(
    (card) =>
      card.x < corridor.x + corridor.width &&
      corridor.x < card.x + card.width &&
      card.y < corridor.y + corridor.height &&
      corridor.y < card.y + card.height,
  )
  const channels = inTheWay
    .flatMap((card) => [card.x - CLEARANCE, card.x + card.width + CLEARANCE])
    .filter((x) => x > source.x + EDGE_OFFSET && x < target.x - EDGE_OFFSET)
  const lanes = inTheWay.flatMap((card) => [card.y - CLEARANCE, card.y + card.height + CLEARANCE])
  return [
    direct,
    ...channels.map((x) => throughChannel(source, target, x)),
    ...lanes.map((y) => alongLane(source, target, y)),
  ]
    .map((points) => ({ points, cost: routeCost(points, obstacles) }))
    .reduce((best, candidate) =>
      candidate.cost.hidden < best.cost.hidden ||
      (candidate.cost.hidden === best.cost.hidden && candidate.cost.length < best.cost.length)
        ? candidate
        : best,
    ).points
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
    Math.max(...caption.map((line) => textUnits(line) * EDGE_LABEL_FONT_SIZE * MONO_ADVANCE)) + 10
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

// Where along a segment a caption may sit: the middle first, then outwards in small steps to
// either end. A chip whose middle is taken slides along its own wire rather than stepping off it,
// which is what keeps it on the line it names — the offsets below are the last resort, not this.
const CAPTION_STOPS = Array.from({ length: 17 }, (_, index) => {
  const step = Math.ceil(index / 2) * 0.05
  return 0.5 + (index % 2 === 0 ? -step : step)
})

// Where a caption may sit: along the segments of its own edge, the vertical ones first — they are
// the part of a smoothstep edge that belongs to it alone, so the labels of a shared bus fan out.
// Off the wire counts too — beside a vertical stretch for a label too wide to straddle it, above
// or below a horizontal one — which is what a caption needs where several edges run the same
// corridor and every spot on the wire is already somebody's.
function captionSpots(points: readonly Point[], width: number, height: number): readonly Point[] {
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
  return segments.flatMap((segment) =>
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

/** The segments of every edge as thin boxes, so a caption can be scored against the wires. */
// Each stretch of wire with the edge it belongs to: a caption is meant to sit on its own edge, so
// what it has to stay off is everybody else's.
function wireBoxes<E extends CaptionedEdge>(
  edges: readonly E[],
): readonly { readonly edge: E; readonly box: Box }[] {
  return edges.flatMap((edge) =>
    edge.points.slice(0, -1).map((a, index) => {
      const b = edge.points[index + 1] ?? a
      return {
        edge,
        box: {
          x: Math.min(a.x, b.x) - 1,
          y: Math.min(a.y, b.y) - 1,
          width: Math.abs(b.x - a.x) + 2,
          height: Math.abs(b.y - a.y) + 2,
        },
      }
    }),
  )
}

/**
 * Puts every caption on the clearest stretch of its edge: off the models, off the other captions
 * and off the wires, so a chip never hides the relation it names.
 */
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

export function placeCaptions<E extends CaptionedEdge>(
  edges: readonly E[],
  cards: readonly Box[],
): readonly PlacedCaption<E>[] {
  const wires = wireBoxes(edges)
  return edges.reduce<{ readonly placed: readonly PlacedCaption<E>[] }>(
    (state, edge) => {
      const { caption } = edge
      if (caption.length === 0) return state
      const boxes = captionSpots(edge.points, captionWidth(caption), captionHeight(caption)).map(
        (spot) => captionBox(caption, spot),
      )
      // Every spot lies along this edge, so only what is near it can be in the way.
      const reach = around(boxes, WIRE_CLEARANCE)
      const near = cards.filter((card) => meets(reach, card))
      const own = wires.filter((wire) => wire.edge === edge)
      const crossed = wires.filter((wire) => wire.edge !== edge && meets(reach, wire.box))
      const taken = state.placed.filter((other) => meets(reach, other.box))
      const best = boxes.reduce<{ readonly box: Box; readonly cost: number } | null>(
        (found, box) => {
          // How far the chip sits from the wire it names. Every pixel of it counts, so the spot
          // on the wire wins whenever it is free and the chip steps off only when staying would
          // cost it a model row — a chip on its line needs no tracing at all.
          const drift = Math.min(...own.map((wire) => boxGap(box, wire.box)))
          const cost =
            near.reduce((sum, card) => sum + overlapArea(box, card, 4) * CARD_CLASH, 0) +
            taken.reduce((sum, other) => sum + overlapArea(box, other.box, 2) * CAPTION_CLASH, 0) +
            crossed.reduce(
              (sum, wire) =>
                sum +
                overlapArea(box, wire.box, 0) * WIRE_CLASH +
                overlapArea(box, wire.box, WIRE_CLEARANCE) * WIRE_CROWDING,
              0,
            ) +
            drift * box.width * OFF_WIRE
          return found === null || cost < found.cost ? { box, cost } : found
        },
        null,
      )
      const box = best?.box ?? captionBox(caption, midpoint(edge.points))
      return { placed: [...state.placed, { edge, caption, box }] }
    },
    { placed: [] },
  ).placed
}
