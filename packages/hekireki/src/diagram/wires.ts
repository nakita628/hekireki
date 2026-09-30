// Everything between the cards, in the one pass the exported drawing and Studio's canvas both
// make, so the two agree: every wire routed round the cards, drawn apart from the wires it would
// run on top of, and captioned.
import type { Box, Point, Route } from '../types/index.js'
import { loopRoom, placeCaptions } from './caption.js'
import { routePoints, selfLoopPoints } from './route.js'
import { separateRoutes } from './tracks.js'

/** A wire to lay out: where it leaves and where it arrives, and what it says on the way. */
type WireEnds = {
  readonly source: Point
  readonly target: Point
  /** Whether it comes back into the card it left, as a self relation does. */
  readonly loops: boolean
  readonly caption: readonly string[]
}

/** A wire laid out: the corners it turns at, and where its caption stands, if it has one. */
type LaidWire<W extends WireEnds> = {
  readonly wire: W
  readonly points: Route
  readonly caption: Box | null
}

/** The wires laid out, in the order they came in. */
export function layoutWires<W extends WireEnds>(
  wires: readonly W[],
  cards: readonly Box[],
): readonly LaidWire<W>[] {
  const route = (wire: W, obstacles: readonly Box[]) =>
    wire.loops
      ? selfLoopPoints(wire.source, wire.target)
      : routePoints(wire.source, wire.target, obstacles)
  // The caption of a self relation stands beside its loop, out in the gap by its card, and the
  // other wires of that gap go round it as round a card.
  const obstacles = [
    ...cards,
    ...wires.filter((wire) => wire.loops).map((wire) => loopRoom(route(wire, cards), wire.caption)),
  ]
  const separated = separateRoutes(
    wires.map((wire) => route(wire, obstacles)),
    obstacles,
  )
  const routed = wires.map((wire, index) => ({
    wire,
    caption: wire.caption,
    points: separated[index] ?? [],
  }))
  const captions = new Map(placeCaptions(routed, cards).map((placed) => [placed.edge, placed.box]))
  return routed.map((laid) => ({
    wire: laid.wire,
    points: laid.points,
    caption: captions.get(laid) ?? null,
  }))
}
