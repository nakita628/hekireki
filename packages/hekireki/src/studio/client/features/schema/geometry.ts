import { useNodes, useStore } from '@xyflow/react'
import type { Edge, InternalNode, Node } from '@xyflow/react'
import { createContext, useContext, useMemo } from 'react'

import {
  placeCaptions,
  polylinePath,
  routePoints,
  selfLoopPoints,
} from '../../../../diagram/edge.js'
import type { Box, Point } from '../../../../diagram/edge.js'

/** Where an edge runs and where its caption sits, both in flow coordinates. */
export type EdgeGeometry = {
  /** The corners the wire turns at; `path` is these, with the corners rounded. */
  readonly points: readonly Point[]
  readonly path: string
  readonly caption: Point | null
}

export type DiagramGeometry = ReadonlyMap<string, EdgeGeometry>

/** A card as the geometry pass sees it: where it sits, and where each of its handles is. */
export type GeometryCard = {
  readonly box: Box
  readonly source: ReadonlyMap<string, Point>
  readonly target: ReadonlyMap<string, Point>
}

/** An edge as the geometry pass sees it: which handles it joins, and what it says along the way. */
export type GeometryEdge = {
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
  const routed = edges.flatMap((edge) => {
    const source = cards.get(edge.source)?.source.get(edge.sourceHandle ?? '')
    const target = cards.get(edge.target)?.target.get(edge.targetHandle ?? '')
    if (source === undefined || target === undefined) return []
    const loops = edge.source === edge.target
    return [
      {
        id: edge.id,
        caption: edge.caption,
        points: loops ? selfLoopPoints(source, target) : routePoints(source, target, boxes),
      },
    ]
  })
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

/** The middle of every handle of a node, keyed by handle id, in flow coordinates. */
function handlePoints(node: InternalNode<Node>, type: 'source' | 'target') {
  return new Map(
    (node.internals.handleBounds?.[type] ?? []).map((handle) => [
      handle.id ?? '',
      {
        x: node.internals.positionAbsolute.x + handle.x + handle.width / 2,
        y: node.internals.positionAbsolute.y + handle.y + handle.height / 2,
      },
    ]),
  )
}

function geometryCard(node: InternalNode<Node>): GeometryCard {
  return {
    box: {
      x: node.internals.positionAbsolute.x,
      y: node.internals.positionAbsolute.y,
      width: node.measured.width ?? 0,
      height: node.measured.height ?? 0,
    },
    source: handlePoints(node, 'source'),
    target: handlePoints(node, 'target'),
  }
}

/** The caption an edge carries; `Edge['data']` is loosely typed, so its lines are read back. */
function captionOf(edge: Edge): readonly string[] {
  const caption: unknown = edge.data?.caption
  return Array.isArray(caption) ? caption.filter((line) => typeof line === 'string') : []
}

/** {@link diagramGeometry} over what React Flow has measured, recomputed whenever a model moves. */
export function useDiagramGeometry(edges: readonly Edge[]): DiagramGeometry {
  const nodes = useNodes()
  const lookup = useStore((state) => state.nodeLookup)
  // `nodes` changes whenever a model moves or is measured; the lookup is mutated in place, so it
  // is read through that render rather than subscribed to on its own.
  return useMemo(() => {
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
  }, [nodes, lookup, edges])
}
