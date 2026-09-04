import type { Edge, Node } from '@xyflow/react'

import type { LayoutPositions } from '../../lib/index.js'
import { diagramFields } from './layout.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly id: string
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
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

type Schema = {
  readonly models: readonly Model[]
  readonly relations: readonly Relation[]
}

type ModelNodeData = {
  readonly model: Model
  readonly fields: readonly Field[]
}

export type ModelNodeType = Node<ModelNodeData, 'model'>

export const MODEL_HANDLE = '__model'

export function sourceHandle(field: string) {
  return `${field}-source`
}

export function targetHandle(field: string) {
  return `${field}-target`
}

export function buildNodes(schema: Schema, positions: LayoutPositions): readonly ModelNodeType[] {
  return schema.models.map((model) => ({
    id: model.name,
    type: 'model',
    position: positions[model.name] ?? { x: 0, y: 0 },
    data: { model, fields: diagramFields(model) },
  }))
}

function humanizeAction(action: string) {
  return action
    .replaceAll(/([A-Z])/gu, ' $1')
    .trim()
    .toLowerCase()
}

/** The id of the IE (crow's foot) marker an end is drawn with; React Flow turns it into `url(#id)`. */
export function cardinalityMarker(cardinality: Cardinality) {
  return `er-${cardinality}`
}

export function edgeLabel(relation: Relation) {
  if (relation.origin === 'implicit-many-to-many') return 'many to many'
  if (relation.origin === 'annotated') return '@relation'
  return relation.onDelete === null ? undefined : `on delete ${humanizeAction(relation.onDelete)}`
}

export function buildEdges(schema: Schema): readonly Edge[] {
  const scalarFields = new Map(
    schema.models.map((m) => [m.name, new Set(diagramFields(m).map((f) => f.name))]),
  )
  const hasField = (model: string, field: string) => scalarFields.get(model)?.has(field) ?? false
  return schema.relations.map((relation) => {
    const useHeader =
      relation.origin === 'implicit-many-to-many' ||
      !hasField(relation.from.model, relation.from.field) ||
      !hasField(relation.to.model, relation.to.field)
    return {
      id: relation.id,
      source: relation.from.model,
      target: relation.to.model,
      sourceHandle: sourceHandle(useHeader ? MODEL_HANDLE : relation.from.field),
      targetHandle: targetHandle(useHeader ? MODEL_HANDLE : relation.to.field),
      type: 'smoothstep',
      label: edgeLabel(relation),
      className: `relation-edge relation-edge--${relation.origin}`,
      markerStart: cardinalityMarker(relation.from.cardinality),
      markerEnd: cardinalityMarker(relation.to.cardinality),
      data: { relation },
    }
  })
}

export function highlightEdges(edges: readonly Edge[], selected: readonly string[]) {
  const focus = new Set(selected)
  return edges.map((edge) => ({
    ...edge,
    className:
      focus.size === 0
        ? edge.className
        : `${edge.className ?? ''}${
            focus.has(edge.source) || focus.has(edge.target) ? ' is-highlighted' : ' is-dimmed'
          }`,
  }))
}
