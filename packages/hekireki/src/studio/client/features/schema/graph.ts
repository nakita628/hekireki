import type { Edge, Node } from '@xyflow/react'

import type { DiagramIndex } from '../../../../diagram/layout.js'
import { edgeCaption } from '../../../../diagram/svg.js'
import type { LayoutPositions } from '../../lib/index.js'
import { diagramFields } from './layout.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isUnique: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
  readonly indexes: readonly DiagramIndex[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly id: string
  /** What the edge is dashed on, and what decides the handle it hangs off; see `RelationOrigin`
   *  (helper/relation.ts). Dashed is "no foreign key backs this", not "many to many". */
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
  readonly onUpdate?: string | null
  readonly name?: string | null
  readonly from: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
  readonly to: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
}

type EnumBlock = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
}

type Schema = {
  readonly models: readonly Model[]
  readonly relations: readonly Relation[]
  readonly enums: readonly EnumBlock[]
}

type ModelNodeData = {
  readonly model: Model
  readonly fields: readonly Field[]
}

export type ModelNodeType = Node<ModelNodeData, 'model'>

export type EnumNodeType = Node<{ readonly value: EnumBlock }, 'enum'>

export type DiagramNodeType = ModelNodeType | EnumNodeType

type RelationEdgeData = {
  /** The caption lines, as the exported diagram writes them; empty for an enum link. */
  readonly caption: readonly string[]
  readonly dimmed?: boolean
}

export type RelationEdgeType = Edge<RelationEdgeData, 'relation'>

export const MODEL_HANDLE = '__model'

export function sourceHandle(field: string) {
  return `${field}-source`
}

export function targetHandle(field: string) {
  return `${field}-target`
}

/** A self relation comes back into the right-hand side of the model it left, as a loop. */
export function loopTargetHandle(field: string) {
  return `${field}-loop`
}

export function buildNodes(schema: Schema, positions: LayoutPositions): readonly DiagramNodeType[] {
  return [
    ...schema.models.map<DiagramNodeType>((model) => ({
      id: model.name,
      type: 'model',
      position: positions[model.name] ?? { x: 0, y: 0 },
      data: { model, fields: diagramFields(model) },
    })),
    ...schema.enums.map<DiagramNodeType>((value) => ({
      id: value.name,
      type: 'enum',
      position: positions[value.name] ?? { x: 0, y: 0 },
      data: { value },
    })),
  ]
}

/** The id of the IE (crow's foot) marker an end is drawn with; React Flow turns it into `url(#id)`. */
export function cardinalityMarker(cardinality: Cardinality) {
  return `er-${cardinality}`
}

/** A dotted link from every enum-typed field to the card that lists the values it may hold. */
function enumEdges(schema: Schema): readonly Edge[] {
  const names = new Set(schema.enums.map((value) => value.name))
  return schema.models.flatMap((model) =>
    diagramFields(model)
      .filter((field) => field.kind === 'enum' && names.has(field.type))
      .map((field) => ({
        id: `${model.name}.${field.name}->${field.type}`,
        source: model.name,
        target: field.type,
        sourceHandle: sourceHandle(field.name),
        targetHandle: targetHandle(MODEL_HANDLE),
        type: 'relation',
        className: 'enum-edge',
        selectable: false,
        data: { caption: [] },
      })),
  )
}

export function buildEdges(schema: Schema): readonly Edge[] {
  const scalarFields = new Map(
    schema.models.map((m) => [m.name, new Set(diagramFields(m).map((f) => f.name))]),
  )
  const hasField = (model: string, field: string) => scalarFields.get(model)?.has(field) ?? false
  const relations = schema.relations.map((relation) => {
    // An implicit many-to-many has no column at either end to meet, so both of its ends hang off
    // the card header rather than off a field row — as does any relation naming a field the card
    // does not list.
    const useHeader =
      relation.origin === 'implicit-many-to-many' ||
      !hasField(relation.from.model, relation.from.field) ||
      !hasField(relation.to.model, relation.to.field)
    const target = useHeader ? MODEL_HANDLE : relation.to.field
    return {
      id: relation.id,
      source: relation.from.model,
      target: relation.to.model,
      sourceHandle: sourceHandle(useHeader ? MODEL_HANDLE : relation.from.field),
      targetHandle:
        relation.from.model === relation.to.model ? loopTargetHandle(target) : targetHandle(target),
      type: 'relation',
      className: `relation-edge relation-edge--${relation.origin}`,
      markerStart: cardinalityMarker(relation.from.cardinality),
      markerEnd: cardinalityMarker(relation.to.cardinality),
      data: { relation, caption: edgeCaption(relation) },
    }
  })
  return [...relations, ...enumEdges(schema)]
}

export function highlightEdges(edges: readonly Edge[], selected: readonly string[]) {
  const focus = new Set(selected)
  return edges.map((edge) => {
    const touched = focus.has(edge.source) || focus.has(edge.target)
    if (focus.size === 0) return edge
    return {
      ...edge,
      className: `${edge.className ?? ''}${touched ? ' is-highlighted' : ' is-dimmed'}`,
      // The caption is drawn outside the edge group, so it is dimmed through its own data.
      data: { ...edge.data, dimmed: !touched },
    }
  })
}
