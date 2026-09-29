import { useNodes, useStore } from '@xyflow/react'
import type { Edge, InternalNode, Node } from '@xyflow/react'
import { createContext, useContext, useMemo, useState } from 'react'

import {
  loopRoom,
  placeCaptions,
  polylinePath,
  routePoints,
  selfLoopPoints,
  separateRoutes,
} from '../../../../diagram/edge.js'
import type { Box, Point } from '../../../../types/index.js'

/** Where an edge runs and where its caption sits, both in flow coordinates. */
type EdgeGeometry = {
  /** The corners the wire turns at; `path` is these, with the corners rounded. */
  readonly points: readonly Point[]
  readonly path: string
  readonly caption: Point | null
}

type DiagramGeometry = ReadonlyMap<string, EdgeGeometry>

/** A card as the geometry pass sees it: where it sits, and where each of its handles is. */
type GeometryCard = {
  readonly box: Box
  readonly source: ReadonlyMap<string, Point>
  readonly target: ReadonlyMap<string, Point>
}

/** An edge as the geometry pass sees it: which handles it joins, and what it says along the way. */
type GeometryEdge = {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly sourceHandle: string | null
  readonly targetHandle: string | null
  readonly caption: readonly string[]
}

const EMPTY: DiagramGeometry = new Map()

export const GeometryContext = createContext<DiagramGeometry>(EMPTY)

/** The geometry of one edge, or null while React Flow has not measured its models yet. */
export function useEdgeGeometry(id: string) {
  return useContext(GeometryContext).get(id) ?? null
}

function center(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Routes every edge and places every caption in one pass, with the same geometry the exported
 * drawing uses: the canvas and the download agree, and a caption is laid out knowing where the
 * other captions and every wire went, so it never covers the relation it names.
 *
 * An edge whose ends are not both on a card that has been measured is left out; the edge draws
 * React Flow's own path until the next pass has it.
 */
export function diagramGeometry(
  edges: readonly GeometryEdge[],
  cards: ReadonlyMap<string, GeometryCard>,
): DiagramGeometry {
  const boxes = [...cards.values()].map((card) => card.box)
  const anchored = edges.flatMap((edge) => {
    const source = cards.get(edge.source)?.source.get(edge.sourceHandle ?? '')
    const target = cards.get(edge.target)?.target.get(edge.targetHandle ?? '')
    if (source === undefined || target === undefined) return []
    return [{ edge, source, target, loops: edge.source === edge.target }]
  })
  // The caption of a self relation stands beside its loop, out in the gap by its card, and the
  // wires of that gap go round it as round a card — as the exported drawing does.
  const obstacles = [
    ...boxes,
    ...anchored
      .filter(({ loops }) => loops)
      .map(({ edge, source, target }) => loopRoom(selfLoopPoints(source, target), edge.caption)),
  ]
  const joined = anchored.map(({ edge, source, target, loops }) => ({
    edge,
    points: loops ? selfLoopPoints(source, target) : routePoints(source, target, obstacles),
  }))
  const separated = separateRoutes(
    joined.map(({ points }) => points),
    obstacles,
  )
  const routed = joined.map(({ edge }, index) => ({
    id: edge.id,
    caption: edge.caption,
    points: separated[index] ?? [],
  }))
  const captions = new Map(
    placeCaptions(routed, boxes).map((placed) => [placed.edge.id, center(placed.box)]),
  )
  return new Map(
    routed.map((edge) => [
      edge.id,
      {
        points: edge.points,
        path: polylinePath(edge.points),
        caption: captions.get(edge.id) ?? null,
      },
    ]),
  )
}

/**
 * Where every handle of a node meets its card, keyed by handle id, in flow coordinates: level with
 * the middle of the handle, on the edge of the card it sits on. React Flow measures a handle a
 * pixel or so inside the card, and a wire that starts there would be routed as if the card ended
 * short of where it does — no longer the wire the exported drawing draws from the same schema.
 */
function handlePoints(node: InternalNode<Node>, box: Box, type: 'source' | 'target') {
  return new Map(
    (node.internals.handleBounds?.[type] ?? []).map((handle) => {
      const middle = box.x + handle.x + handle.width / 2
      return [
        handle.id ?? '',
        {
          x: middle < box.x + box.width / 2 ? box.x : box.x + box.width,
          y: box.y + handle.y + handle.height / 2,
        },
      ]
    }),
  )
}

function geometryCard(node: InternalNode<Node>): GeometryCard {
  const box = {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
  }
  return {
    box,
    source: handlePoints(node, box, 'source'),
    target: handlePoints(node, box, 'target'),
  }
}

/** The caption an edge carries; `Edge['data']` is loosely typed, so its lines are read back. */
function captionOf(edge: Edge): readonly string[] {
  const caption: unknown = edge.data?.caption
  return Array.isArray(caption) ? caption.filter((line) => typeof line === 'string') : []
}

/** {@link diagramGeometry} over what React Flow has measured, recomputed once a model has moved. */
export function useDiagramGeometry(edges: readonly Edge[]): DiagramGeometry {
  const nodes = useNodes()
  const lookup = useStore((state) => state.nodeLookup)
  const moving = useMemo(
    () => new Set(nodes.filter((node) => node.dragging === true).map((node) => node.id)),
    [nodes],
  )
  // `nodes` changes whenever a model moves or is measured; the lookup is mutated in place, so it
  // is read through that render rather than subscribed to on its own.
  const routed = useMemo(() => {
    if (moving.size > 0) return null
    const cards = new Map(
      nodes.flatMap((node) => {
        const internal = lookup.get(node.id)
        return internal === undefined ? [] : [[node.id, geometryCard(internal)] as const]
      }),
    )
    if (cards.size !== nodes.length) return EMPTY
    return diagramGeometry(
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        caption: captionOf(edge),
      })),
      cards,
    )
  }, [nodes, lookup, edges, moving])
  // The geometry last routed, which stands while a model is dragged; kept as it is routed, the way
  // React keeps a value from an earlier render.
  const [settled, setSettled] = useState<DiagramGeometry>(EMPTY)
  if (routed !== null && routed !== settled) setSettled(routed)
  // Routing every wire and caption again on every frame of a drag is what makes a large schema
  // stutter. So while a model moves, the wires of those that stay put keep where they were routed,
  // and the ones of the model that moves draw React Flow's own path, which follows the card for
  // nothing, until it is let go and everything is routed again.
  return useMemo(() => {
    if (routed !== null) return routed
    const still = new Set(
      edges
        .filter((edge) => !moving.has(edge.source) && !moving.has(edge.target))
        .map((edge) => edge.id),
    )
    return new Map([...settled].filter(([id]) => still.has(id)))
  }, [routed, settled, edges, moving])
}
