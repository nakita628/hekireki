import { graphlib, layout } from '@dagrejs/dagre'
import * as v from 'valibot'

import type { LayoutPositions } from '../../lib/index.js'
import type { GraphEdge, GraphNode } from './analysis.js'

const LayoutNodeSchema = v.pipe(
  v.object({
    x: v.pipe(v.number(), v.description('Centre x in canvas pixels')),
    y: v.pipe(v.number(), v.description('Centre y in canvas pixels')),
  }),
  v.description('A node as dagre placed it'),
)

export const NODE_WIDTH = 240
export const NODE_HEADER_HEIGHT = 34
export const NODE_LINE_HEIGHT = 18
export const NODE_PADDING = 10
export const MAX_LINES = 8

/** The lines a node shows under its caption: its columns for a relation, its details otherwise. */
export function nodeLines(node: GraphNode): readonly string[] {
  const lines =
    node.kind === 'table' || node.kind === 'cte' || node.kind === 'subquery'
      ? node.columns.map((column) => column.name)
      : node.details
  return lines.length > MAX_LINES
    ? [...lines.slice(0, MAX_LINES - 1), `… ${lines.length - MAX_LINES + 1} more`]
    : lines
}

export function nodeHeight(node: GraphNode) {
  const lines = nodeLines(node).length
  return NODE_HEADER_HEIGHT + (lines === 0 ? 0 : lines * NODE_LINE_HEIGHT + NODE_PADDING)
}

/** Left-to-right layers: sources on the left, the result on the right. */
export function autoLayout(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): LayoutPositions {
  const graph = new graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 70, marginx: 24, marginy: 24 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight(node) })
  const ids = new Set(nodes.map((node) => node.id))
  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target)) graph.setEdge(edge.source, edge.target)
  }
  layout(graph)
  return Object.fromEntries(
    nodes.map((node) => {
      const raw: unknown = graph.node(node.id)
      const placed = v.safeParse(LayoutNodeSchema, raw)
      return [
        node.id,
        placed.success
          ? { x: placed.output.x - NODE_WIDTH / 2, y: placed.output.y - nodeHeight(node) / 2 }
          : { x: 0, y: 0 },
      ]
    }),
  )
}
