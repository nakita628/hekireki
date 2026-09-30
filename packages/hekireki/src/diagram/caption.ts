// Where the caption of a relation stands: beside its loop for a self relation, in a column in
// front of the card its wire comes into for the rest, and wherever is clearest for the few no
// column holds. Shared by the exported drawing and Studio's canvas, so the two agree.
import {
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_PADDING,
  EDGE_OFFSET,
  MONO_ADVANCE,
} from '../constants/index.js'
import type { Box, Point, Route } from '../types/index.js'
import { around, grow, meets, spanning } from './box.js'
import { textUnits } from './text.js'

// The room either side of the widest line of a caption, inside its chip.
const EDGE_LABEL_PADDING_X = 5
// The room a caption keeps between itself and the wire it labels when it sits beside one.
const CAPTION_GAP = 6

function captionWidth(caption: readonly string[]) {
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

function captionBox(caption: readonly string[], center: Point): Box {
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
function captionSpots(points: Route, width: number, height: number): readonly (readonly Point[])[] {
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

/**
 * Where the caption of a self relation stands: on its loop, halfway down, hung out into the gap
 * the loop reaches into with the wire just inside its near edge, so it names the loop and covers
 * nothing of the card.
 */
function loopCaptionBox(points: Route, caption: readonly string[]): Box {
  const [, top = { x: 0, y: 0 }, bottom = top] = points
  const height = captionHeight(caption)
  return {
    x: top.x - EDGE_INSET,
    y: (top.y + bottom.y) / 2 - height / 2,
    width: captionWidth(caption),
    height,
  }
}

/**
 * What a self relation takes of the gap beside its card: the loop and the caption on it, from the
 * card's edge out. The other wires of the gap are routed round it as round a card — neither
 * through the loop nor under its caption, nor in a sliver between the card and either.
 */
export function loopRoom(points: Route, caption: readonly string[]): Box {
  return around([loopCaptionBox(points, caption), ...points.map((point) => spanning(point))], 0)
}

function midpoint(points: Route): Point {
  return {
    x: ((points[0]?.x ?? 0) + (points.at(-1)?.x ?? 0)) / 2,
    y: ((points[0]?.y ?? 0) + (points.at(-1)?.y ?? 0)) / 2,
  }
}

type CaptionedEdge = {
  readonly caption: readonly string[]
  readonly points: Route
}

/** A stretch of an edge's wire as a thin box, with the edge it belongs to. */
type Wire<E extends CaptionedEdge> = {
  readonly edge: E
  readonly box: Box
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
// A caption that straddles another edge's wire hides the relation that one names, so a pixel of it
// costs more than a pixel of a model. Its own wire is free: sitting on the edge it names is what
// the chip is for. A wire is only a couple of pixels wide, so crossing one still costs a chip far
// less than burying a model row, which a reader loses outright.
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
function wireBoxes<E extends CaptionedEdge>(edges: readonly E[]): readonly Wire<E>[] {
  return edges.flatMap((edge) =>
    edge.points.slice(0, -1).map((a, index) => {
      const b = edge.points[index + 1] ?? a
      return { edge, box: grow(spanning(a, b), WIRE_HALF_WIDTH) }
    }),
  )
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
  wires: readonly Wire<E>[],
  cards: readonly Box[],
  taken: readonly PlacedCaption<E>[],
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
              const covered = [...taken, ...state.placed].filter(
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
 * The clearest spot on or beside an edge for its caption: off the models, off the captions already
 * placed and off the other wires, as near its own wire as those allow. Where nothing is clear the
 * spot that costs least wins, and an edge with nowhere at all is captioned at its middle.
 */
function clearestSpot<E extends CaptionedEdge>(
  edge: E,
  wires: readonly Wire<E>[],
  cards: readonly Box[],
  placed: readonly PlacedCaption<E>[],
): Box {
  const { caption } = edge
  const own = wires.filter((wire) => wire.edge === edge)
  // Nothing costs less than nothing, so once a segment holds a spot that is free, the ones after it
  // are not looked at.
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
    const taken = placed.filter((other) => meets(reach, other.box))
    const scored = boxes.map((box) => {
      // How far the chip sits from the wire it names. Every pixel of it counts, so the spot on the
      // wire wins whenever it is free and the chip steps off only when staying would cost it a
      // model row — a chip on its line needs no tracing at all.
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
  return best?.box ?? captionBox(caption, midpoint(edge.points))
}

/**
 * Puts the caption of every self relation beside its loop, every other in a column in front of the
 * card its edge comes into, and the few no column holds on the clearest spot of their edge, so a
 * chip never hides the relation it names.
 */
export function placeCaptions<E extends CaptionedEdge>(
  edges: readonly E[],
  cards: readonly Box[],
): readonly PlacedCaption<E>[] {
  const wires = wireBoxes(edges)
  // A self relation's caption stands where its loop keeps room for it: a loop is the one route
  // that goes out to the right and comes back to the x it left from.
  const loops = edges.flatMap((edge) => {
    const [start, out] = edge.points
    const back = edge.points.at(-1)
    const loop = start !== undefined && out !== undefined && back?.x === start.x && out.x > start.x
    return edge.caption.length > 0 && loop
      ? [{ edge, caption: edge.caption, box: loopCaptionBox(edge.points, edge.caption) }]
      : []
  })
  const { placed } = edges.reduce<{ readonly placed: readonly PlacedCaption<E>[] }>(
    (state, edge) =>
      edge.caption.length === 0 || state.placed.some((other) => other.edge === edge)
        ? state
        : {
            placed: [
              ...state.placed,
              { edge, caption: edge.caption, box: clearestSpot(edge, wires, cards, state.placed) },
            ],
          },
    { placed: [...loops, ...inColumns(edges, wires, cards, loops)] },
  )
  // In the order of the edges, whichever way each was placed.
  return edges.flatMap((edge) => placed.filter((caption) => caption.edge === edge))
}
