import { graphlib, layout } from '@dagrejs/dagre'
import * as v from 'valibot'

export type Position = { readonly x: number; readonly y: number }

export type LayoutPositions = Readonly<Record<string, Position>>

export const NODE_WIDTH = 340
// Wide enough for a mapped enum name and the `enum` pill beside it.
export const ENUM_WIDTH = 280
export const NODE_HEADER_HEIGHT = 36
export const NODE_ROW_HEIGHT = 22
export const NODE_DESCRIPTION_HEIGHT = 14
export const NODE_NOTE_HEIGHT = 16
export const NODE_CONSTRAINT_HEIGHT = 20
export const NODE_PADDING = 8

/** A block attribute of a model: `@@id`, `@@unique`, `@@index` or `@@fulltext`. */
export type DiagramIndex = {
  readonly type: 'id' | 'normal' | 'unique' | 'fulltext'
  readonly fields: readonly string[]
}

export type DiagramField = {
  readonly kind: string
  readonly type?: string
  readonly documentation: string | null
  readonly attributes?: readonly string[]
}

export type DiagramModel = {
  readonly documentation?: string | null
  readonly fields: readonly DiagramField[]
  readonly indexes?: readonly DiagramIndex[]
}

export type DiagramEnum = {
  readonly name: string
  readonly documentation?: string | null
  readonly values: readonly unknown[]
}

/** The fields a model node shows: everything but the relation fields. */
export function diagramFields<Field extends { readonly kind: string }>(model: {
  readonly fields: readonly Field[]
}) {
  return model.fields.filter((f) => f.kind !== 'object')
}

export function firstLine(text: string | null | undefined) {
  return text?.split('\n')[0]?.trim() ?? ''
}

// The attributes worth spelling out under a field: the drawing shows `@id`, `@unique`, `@map`
// and `@relation` in its own language already, so only what is left over is written out.
const FIELD_NOTE = /^@(?:default\(|updatedAt|db\.)/u

/**
 * The faint second line of a field row: the attributes the drawing does not show another way,
 * then the prose of its doc comment. Empty when the field has neither.
 */
export function fieldDetail(field: DiagramField) {
  const notes = (field.attributes ?? []).filter((attribute) => FIELD_NOTE.test(attribute))
  const documentation = firstLine(field.documentation)
  return [notes.join(' '), documentation].filter((part) => part !== '').join(' · ')
}

export function fieldRowHeight(field: DiagramField) {
  return NODE_ROW_HEIGHT + (fieldDetail(field) === '' ? 0 : NODE_DESCRIPTION_HEIGHT)
}

/** The block attributes a model node lists under its fields, in declaration order. */
export function diagramConstraints(model: { readonly indexes?: readonly DiagramIndex[] }) {
  return model.indexes ?? []
}

/** The height of the line a card gives to its doc comment, when it has one. */
export function noteHeight(block: { readonly documentation?: string | null }) {
  return firstLine(block.documentation) === '' ? 0 : NODE_NOTE_HEIGHT
}

export function nodeHeight(model: DiagramModel) {
  const constraints = diagramConstraints(model)
  return (
    NODE_HEADER_HEIGHT +
    noteHeight(model) +
    NODE_PADDING +
    diagramFields(model).reduce((sum, field) => sum + fieldRowHeight(field), 0) +
    NODE_PADDING +
    (constraints.length === 0 ? 0 : constraints.length * NODE_CONSTRAINT_HEIGHT + NODE_PADDING)
  )
}

/** An enum card is the same shape as a model card, one row per member. */
export function enumHeight(value: DiagramEnum) {
  return (
    NODE_HEADER_HEIGHT +
    noteHeight(value) +
    NODE_PADDING +
    value.values.length * NODE_ROW_HEIGHT +
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

export type DiagramSchema = {
  readonly models: readonly (DiagramModel & { readonly name: string })[]
  readonly relations: readonly {
    readonly from: { readonly model: string }
    readonly to: { readonly model: string }
  }[]
  readonly enums?: readonly DiagramEnum[]
}

/** The enums a model's fields hold, as edges from the model to the enum card. */
function enumEdges(schema: DiagramSchema) {
  const names = new Set((schema.enums ?? []).map((value) => value.name))
  return schema.models.flatMap((model) =>
    diagramFields(model).flatMap((field) => {
      const type = field.type ?? ''
      return field.kind === 'enum' && names.has(type) ? [{ from: model.name, to: type }] : []
    }),
  )
}

/** Places the blocks left to right along their relations, the way Studio lays a diagram out. */
export function autoLayout(schema: DiagramSchema): LayoutPositions {
  const graph = new graphlib.Graph()
  // The gap between ranks carries the edges and their captions, so it is wide enough for a
  // caption to sit in the clear rather than over a model.
  graph.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 180, marginx: 40, marginy: 40 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const model of schema.models) {
    graph.setNode(model.name, { width: NODE_WIDTH, height: nodeHeight(model) })
  }
  for (const value of schema.enums ?? []) {
    graph.setNode(value.name, { width: ENUM_WIDTH, height: enumHeight(value) })
  }
  const names = new Set([
    ...schema.models.map((m) => m.name),
    ...(schema.enums ?? []).map((e) => e.name),
  ])
  const edges = [
    ...schema.relations.map((relation) => ({ from: relation.from.model, to: relation.to.model })),
    ...enumEdges(schema),
  ]
  const seen = new Set<string>()
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`
    if (edge.from === edge.to || !names.has(edge.from) || !names.has(edge.to) || seen.has(key)) {
      continue
    }
    seen.add(key)
    graph.setEdge(edge.from, edge.to)
  }
  layout(graph)
  return Object.fromEntries(
    [...names].map((name) => {
      const raw: unknown = graph.node(name)
      const node = v.safeParse(LayoutNodeSchema, raw)
      return [
        name,
        node.success
          ? { x: node.output.x - node.output.width / 2, y: node.output.y - node.output.height / 2 }
          : { x: 0, y: 0 },
      ]
    }),
  )
}
