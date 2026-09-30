// Where a relation's wire runs between two cards: straight across the gap when nothing is in the
// way, round the cards when something is, and in a loop off the right of a card that refers to
// itself. Shared by the exported drawing and Studio's canvas, so the two agree.
import { EDGE_OFFSET, GRID, NODE_ROW_HEIGHT, SELF_LOOP_GAP } from '../constants/index.js'
import type { Box, Point, Route } from '../types/index.js'
import { around, meets, routeCost } from './box.js'

/** An edge that crosses the gap in a channel down the canvas at `x`. */
function throughChannel(source: Point, target: Point, x: number): Route {
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
function alongLane(source: Point, target: Point, y: number, x: number): Route {
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
export function smoothStepPoints(source: Point, target: Point): Route {
  const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  // The channel runs a step of the grid past the end of the source's stub, and leaves the rest of
  // the gap to the captions in front of the target; a gap too narrow for that is crossed in its
  // middle. A target to the left of its source has no channel to cross in, so the edge doubles
  // back along a lane instead.
  return source.x + EDGE_OFFSET < target.x - EDGE_OFFSET
    ? throughChannel(source, target, Math.min(source.x + EDGE_OFFSET + GRID, center.x))
    : alongLane(source, target, center.y, target.x - EDGE_OFFSET)
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
export function routePoints(source: Point, target: Point, cards: readonly Box[]): Route {
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
  const inRange = (x: number) => x > source.x + EDGE_OFFSET && x < target.x - EDGE_OFFSET
  const channels = inTheWay
    .flatMap((card) => [card.x - CLEARANCE, card.x + card.width + CLEARANCE])
    .filter(inRange)
  const lanes = inTheWay.flatMap((card) => [card.y - CLEARANCE, card.y + card.height + CLEARANCE])
  // Where a lane comes down: just past the last card it clears first, then in front of one, and
  // right in front of the target last. They cost the same, and of two equal routes the first is
  // kept, so the edge comes down as soon as it is past what is in its way and keeps a stretch
  // into its target that no other edge on the lane shares — where its caption can say which edge
  // it is.
  const past = inTheWay.map((card) => card.x + card.width + CLEARANCE).filter(inRange)
  const before = inTheWay.map((card) => card.x - CLEARANCE).filter(inRange)
  const descents = [
    ...past.toSorted((a, b) => b - a),
    ...before.toSorted((a, b) => b - a),
    target.x - EDGE_OFFSET,
  ]
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

// The corners of a relation that returns to the node it started from, looped off its right side.
// Two ends of the same row would flatten the loop into an invisible line, so they are pulled a
// row apart — a self many-to-many hangs both of its ends off the header.
export function selfLoopPoints(source: Point, target: Point): Route {
  const flat = Math.abs(target.y - source.y) < NODE_ROW_HEIGHT / 2
  const end = { x: target.x, y: flat ? source.y + NODE_ROW_HEIGHT : target.y }
  const turn = source.x + SELF_LOOP_GAP
  return [source, { x: turn, y: source.y }, { x: turn, y: end.y }, end]
}
