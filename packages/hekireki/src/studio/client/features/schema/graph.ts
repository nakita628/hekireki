import { MarkerType } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'

import type { Model, Relation, Schema } from '../../../server/routes/index.js'
import type { LayoutPositions } from '../../lib/index.js'
import { diagramFields } from './layout.js'

type ModelNodeData = {
  readonly model: Model
  readonly fields: ReturnType<typeof diagramFields>
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
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
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
