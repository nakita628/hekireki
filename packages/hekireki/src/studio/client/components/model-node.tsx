import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { LuKey, LuLink } from 'react-icons/lu'

import {
  loopTargetHandle,
  MODEL_HANDLE,
  sourceHandle,
  targetHandle,
} from '../features/schema/graph.js'
import type { ModelNodeType } from '../features/schema/graph.js'
import {
  diagramConstraints,
  fieldDetail,
  fieldRowHeight,
  NODE_CONSTRAINT_HEIGHT,
  NODE_ROW_HEIGHT,
} from '../features/schema/layout.js'
import { BADGE, CONSTRAINT_STYLES, fieldTypeLabel, UNIQUE_BADGE } from './labels.js'
import { OpenNodeLink } from './open-node-link.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isUnique?: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
  readonly attributes?: readonly string[]
}

// A row is taller than its name when the field is documented; the edges still meet the name.
const ROW_HANDLE = { top: NODE_ROW_HEIGHT / 2 }

function FieldIcon({ field }: { readonly field: Field }) {
  if (field.isId) {
    return <LuKey size={11} className="shrink-0 text-key" />
  }
  if (field.isForeignKey) return <LuLink size={11} className="shrink-0 text-accent" />
  return <span className="inline-block size-[11px] shrink-0" />
}

function ModelNodeComponent({ data, selected }: NodeProps<ModelNodeType>) {
  const { model, fields } = data
  const primaryKey = new Set(model.primaryKey)
  const constraints = diagramConstraints(model)
  return (
    <div
      className={`model-node w-[340px] overflow-visible rounded-lg border bg-surface font-mono shadow-sm ${
        selected ? 'border-accent ring-[3px] ring-accent-soft' : 'border-line-strong'
      }`}
    >
      <div className="relative flex h-9 items-center gap-2 rounded-t-[7px] bg-node px-2.5 text-node-text">
        <Handle
          type="target"
          position={Position.Left}
          id={targetHandle(MODEL_HANDLE)}
          className="model-handle"
        />
        <span className="mr-auto flex min-w-0 items-center gap-2">
          <span className="text-body font-bold">{model.name}</span>
          {model.dbName ? (
            <span className="truncate text-meta opacity-60">{model.dbName}</span>
          ) : null}
        </span>
        <OpenNodeLink to="/models/$name" name={model.name} />
        <Handle
          type="source"
          position={Position.Right}
          id={sourceHandle(MODEL_HANDLE)}
          className="model-handle"
        />
        <Handle
          type="target"
          position={Position.Right}
          id={loopTargetHandle(MODEL_HANDLE)}
          className="model-handle"
        />
      </div>
      <div className="py-2">
        {fields.map((field) => {
          const detail = fieldDetail(field)
          return (
            <div
              key={field.name}
              className="relative px-2.5 hover:bg-canvas"
              style={{ height: fieldRowHeight(field) }}
              title={field.documentation ?? undefined}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={targetHandle(field.name)}
                className="model-handle"
                style={ROW_HANDLE}
              />
              <div className="flex h-[22px] items-center gap-1.5 text-code">
                <FieldIcon field={{ ...field, isId: field.isId || primaryKey.has(field.name) }} />
                <span className="min-w-0 flex-1 truncate">{field.name}</span>
                {field.isUnique && !(field.isId || primaryKey.has(field.name)) ? (
                  <span className={`${BADGE} ${UNIQUE_BADGE} shrink-0`}>UK</span>
                ) : null}
                <span
                  className={`shrink-0 text-meta ${field.kind === 'enum' ? 'text-enum' : 'text-muted'}`}
                >
                  {fieldTypeLabel(field)}
                </span>
              </div>
              {detail ? (
                <div className="-mt-[3px] truncate pl-[17px] font-sans text-detail text-faint">
                  {detail}
                </div>
              ) : null}
              <Handle
                type="source"
                position={Position.Right}
                id={sourceHandle(field.name)}
                className="model-handle"
                style={ROW_HANDLE}
              />
              <Handle
                type="target"
                position={Position.Right}
                id={loopTargetHandle(field.name)}
                className="model-handle"
                style={ROW_HANDLE}
              />
            </div>
          )
        })}
      </div>
      {constraints.length === 0 ? null : (
        <div className="border-t border-line pb-2">
          {constraints.map((constraint) => {
            const style = CONSTRAINT_STYLES[constraint.type]
            return (
              <div
                key={`${constraint.type}:${constraint.fields.join(',')}`}
                className="flex items-center gap-1.5 px-2.5 text-detail"
                style={{ height: NODE_CONSTRAINT_HEIGHT }}
              >
                <span className={`${BADGE} shrink-0 ${style.className}`}>{style.label}</span>
                <span className="min-w-0 truncate text-muted">{constraint.fields.join(', ')}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const ModelNode = memo(ModelNodeComponent)
