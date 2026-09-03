import { graphlib, layout } from '@dagrejs/dagre'
import * as v from 'valibot'

import type { Field, Model, Relation } from '../studio/server/routes/index.js'

export type Position = { readonly x: number; readonly y: number }

export type LayoutPositions = Readonly<Record<string, Position>>

export const NODE_WIDTH = 340
export const NODE_HEADER_HEIGHT = 36
export const NODE_ROW_HEIGHT = 22
export const NODE_DESCRIPTION_HEIGHT = 14
export const NODE_PADDING = 8

/** The fields a model node shows: everything but the relation fields. */
export function diagramFields(model: Model) {
  return model.fields.filter((f) => f.kind !== 'object')
}

export function hasDescription(field: Pick<Field, 'documentation'>) {
  return (field.documentation ?? '').trim() !== ''
}

export function fieldRowHeight(field: Pick<Field, 'documentation'>) {
  return NODE_ROW_HEIGHT + (hasDescription(field) ? NODE_DESCRIPTION_HEIGHT : 0)
}

export function nodeHeight(fields: readonly Pick<Field, 'documentation'>[]) {
  return (
    NODE_HEADER_HEIGHT +
    NODE_PADDING +
    fields.reduce((sum, field) => sum + fieldRowHeight(field), 0) +
    NODE_PADDING
  )
}

const LayoutNodeSchema = v.pipe(
  v.object({
    x: v.pipe(v.number(), v.description('Left edge in canvas pixels')),
    y: v.pipe(v.number(), v.description('Top edge in canvas pixels')),
    width: v.pipe(v.number(), v.description('Node width in pixels')),
    height: v.pipe(v.number(), v.description('Node height in pixels')),
  }),
  v.description('A positioned node of the ER diagram'),
)

/** Places the models left to right along their relations, the way Studio lays a diagram out. */
export function autoLayout(
  models: readonly Model[],
  relations: readonly Relation[],
): LayoutPositions {
  const graph = new graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 110, marginx: 40, marginy: 40 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const model of models) {
    graph.setNode(model.name, {
      width: NODE_WIDTH,
      height: nodeHeight(diagramFields(model)),
    })
  }
  const names = new Set(models.map((m) => m.name))
  const seen = new Set<string>()
  for (const relation of relations) {
    const key = `${relation.from.model}->${relation.to.model}`
    if (
      relation.from.model === relation.to.model ||
      !names.has(relation.from.model) ||
      !names.has(relation.to.model) ||
      seen.has(key)
    ) {
      continue
    }
    seen.add(key)
    graph.setEdge(relation.from.model, relation.to.model)
  }
  layout(graph)
  return Object.fromEntries(
    models.map((model) => {
      const raw: unknown = graph.node(model.name)
      const node = v.safeParse(LayoutNodeSchema, raw)
      return [
        model.name,
        node.success
          ? { x: node.output.x - node.output.width / 2, y: node.output.y - node.output.height / 2 }
          : { x: 0, y: 0 },
      ]
    }),
  )
}
