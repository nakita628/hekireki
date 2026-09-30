// How the wires that different relations would draw on top of each other are drawn apart: each
// gets a track of its own, in the order that crosses least, and the wires that fork from one point
// keep one track between them.
import { EDGE_OFFSET, GRID } from '../constants/index.js'
import type { Box, Point, Route } from '../types/index.js'
import { grow, meets, routeCost } from './box.js'

// How far apart two wires are drawn where they would otherwise run on top of each other: half a
// step of the grid, so a channel down the middle of a gap and the tracks beside it stay on it.
const TRACK = GRID / 2

/** A vertical segment of a route, from `points[index]` to `points[index + 1]`. */
type Stretch = {
  readonly route: number
  readonly points: Route
  readonly index: number
  readonly x: number
  readonly from: number
  readonly to: number
  /** Whether it turns in at one end and out at the other, so it can shift sideways. */
  readonly free: boolean
}

function verticals(routes: readonly Route[]): readonly Stretch[] {
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
function shifted(points: Route, index: number, x: number): Route {
  return points.map((point, at) => (at === index || at === index + 1 ? { x, y: point.y } : point))
}

/** The part of a stretch's route that moves with it: the stretch at `x`, and the wires in and out. */
function turned({ points, index }: Stretch, x: number): Route {
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
function spreadVertical(routes: readonly Route[], cards: readonly Box[]): readonly Route[] {
  const all = verticals(routes)
  // What a stretch keeps its distance from: half a track from the cards, and a whole one from the
  // wires of other routes that cannot move out of its way, as far as from a track beside it.
  const obstacles = [
    ...cards.map((card) => ({ route: null, box: grow(card, TRACK / 2) })),
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
export function separateRoutes(routes: readonly Route[], cards: readonly Box[]): readonly Route[] {
  const across = cards.map((card) => ({
    x: card.y,
    y: card.x,
    width: card.height,
    height: card.width,
  }))
  // A stretch moved onto its track can land beside one that was not in its group, so the passes
  // run again on what they drew until they move nothing — no more often than there are routes,
  // each pass having settled at least one of them.
  const settle = (current: readonly Route[], passes: number): readonly Route[] => {
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
