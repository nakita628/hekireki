import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'

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
  firstLine,
  NODE_CONSTRAINT_HEIGHT,
  NODE_ROW_HEIGHT,
} from '../features/schema/layout.js'
import { KeyIcon, LinkIcon } from './icons.js'
import { BADGE, CONSTRAINT_STYLES, fieldTypeLabel, UNIQUE_BADGE } from './labels.js'

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
    return <KeyIcon size={11} className="shrink-0 text-amber-600 dark:text-amber-400" />
  }
  if (field.isForeignKey) return <LinkIcon size={11} className="shrink-0 text-accent" />
  return <span className="inline-block size-[11px] shrink-0" />
}

function ModelNodeComponent({ data, selected }: NodeProps<ModelNodeType>) {
  const { model, fields } = data
  const primaryKey = new Set(model.primaryKey)
  const constraints = diagramConstraints(model)
  const note = firstLine(model.documentation)
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
        <span className="text-[13px] font-bold">{model.name}</span>
        {model.dbName ? (
          <span className="truncate text-[11px] opacity-60">{model.dbName}</span>
        ) : null}
        <span className="ml-auto rounded-full bg-surface/15 px-2 py-px font-sans text-[11px] whitespace-nowrap">
          {fields.length} {fields.length === 1 ? 'field' : 'fields'}
        </span>
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
      {note ? (
        <div className="h-4 truncate px-2.5 font-sans text-[10.5px] leading-4 text-faint">
          {note}
        </div>
      ) : null}
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
              <div className="flex h-[22px] items-center gap-1.5 text-xs">
                <FieldIcon field={{ ...field, isId: field.isId || primaryKey.has(field.name) }} />
                <span className="min-w-0 flex-1 truncate">{field.name}</span>
                {field.isUnique && !(field.isId || primaryKey.has(field.name)) ? (
                  <span className={`${BADGE} ${UNIQUE_BADGE} shrink-0`}>UK</span>
                ) : null}
                <span
                  className={`shrink-0 text-[11px] ${field.kind === 'enum' ? 'text-violet-600 dark:text-violet-300' : 'text-muted'}`}
                >
                  {fieldTypeLabel(field)}
                </span>
              </div>
              {detail ? (
                <div className="-mt-[3px] truncate pl-[17px] font-sans text-[10.5px] leading-[14px] text-faint">
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
                className="flex items-center gap-1.5 px-2.5 text-[10.5px]"
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
