import { describe, expect, it } from 'vite-plus/test'

import type { GraphEdge, GraphNode } from './analysis.js'
import {
  autoLayout,
  MAX_LINES,
  NODE_HEADER_HEIGHT,
  NODE_LINE_HEIGHT,
  NODE_PADDING,
  NODE_WIDTH,
  nodeHeight,
  nodeLines,
} from './flow-layout.js'

function node(
  id: string,
  kind: GraphNode['kind'],
  overrides: Partial<Pick<GraphNode, 'details' | 'columns'>> = {},
): GraphNode {
  return {
    id,
    kind,
    label: id,
    details: [],
    range: null,
    scope: 'main',
    columns: [],
    ...overrides,
  }
}

function column(name: string) {
  return { name, dataType: 'TEXT', used: true }
}

function edge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target, kind: 'flow', label: null }
}

describe('nodeLines', () => {
  it('lists the columns of a relation and the details of anything else', () => {
    expect(
      nodeLines(node('t', 'table', { columns: [column('id'), column('email')] })),
    ).toStrictEqual(['id', 'email'])
    expect(nodeLines(node('c', 'cte', { columns: [column('n')], details: ['x'] }))).toStrictEqual([
      'n',
    ])
    expect(nodeLines(node('s', 'subquery', { columns: [column('n')] }))).toStrictEqual(['n'])
    expect(
      nodeLines(node('f', 'filter', { details: ['u.id = ?'], columns: [column('n')] })),
    ).toStrictEqual(['u.id = ?'])
  })

  it('folds a long list into the first lines and a count of the rest', () => {
    const columns = Array.from({ length: MAX_LINES + 3 }, (_, i) => column(`c${i}`))
    const lines = nodeLines(node('t', 'table', { columns }))
    expect(lines).toHaveLength(MAX_LINES)
    expect(lines.at(-1)).toBe('… 4 more')
    expect(lines.slice(0, -1)).toStrictEqual(columns.slice(0, MAX_LINES - 1).map((c) => c.name))
  })

  it('shows exactly the limit without folding', () => {
    const columns = Array.from({ length: MAX_LINES }, (_, i) => column(`c${i}`))
    expect(nodeLines(node('t', 'table', { columns }))).toHaveLength(MAX_LINES)
    expect(nodeLines(node('t', 'table', { columns })).at(-1)).toBe(`c${MAX_LINES - 1}`)
  })
})

describe('nodeHeight', () => {
  it('is the header alone for a node without lines', () => {
    expect(nodeHeight(node('f', 'filter'))).toBe(NODE_HEADER_HEIGHT)
  })

  it('adds a line per entry plus the padding', () => {
    expect(nodeHeight(node('f', 'filter', { details: ['a', 'b'] }))).toBe(
      NODE_HEADER_HEIGHT + 2 * NODE_LINE_HEIGHT + NODE_PADDING,
    )
  })
})

describe('autoLayout', () => {
  const nodes = [
    node('users', 'table', { columns: [column('id')] }),
    node('where', 'filter', { details: ['id = ?'] }),
    node('out', 'project', { columns: [column('id')] }),
  ]
  const edges = [edge('users', 'where'), edge('where', 'out')]

  it('positions every node, sources on the left and the result on the right', () => {
    const positions = autoLayout(nodes, edges)
    expect(Object.keys(positions).toSorted()).toStrictEqual(['out', 'users', 'where'])
    const users = positions.users
    const where = positions.where
    const out = positions.out
    if (!users || !where || !out) throw new Error('every node is positioned')
    expect(users.x + NODE_WIDTH).toBeLessThanOrEqual(where.x)
    expect(where.x + NODE_WIDTH).toBeLessThanOrEqual(out.x)
    for (const position of Object.values(positions)) {
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('ignores an edge whose end is not a node', () => {
    const positions = autoLayout(nodes, [...edges, edge('users', 'ghost'), edge('ghost', 'out')])
    expect(Object.keys(positions).toSorted()).toStrictEqual(['out', 'users', 'where'])
  })

  it('handles an empty graph', () => {
    expect(autoLayout([], [])).toStrictEqual({})
  })

  it('is deterministic', () => {
    expect(autoLayout(nodes, edges)).toStrictEqual(autoLayout(nodes, edges))
  })
})
