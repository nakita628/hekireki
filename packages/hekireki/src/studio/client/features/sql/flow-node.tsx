import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowDownUp,
  LuBraces,
  LuCombine,
  LuDatabase,
  LuFilter,
  LuSquareFunction,
  LuGitMerge,
  LuLayers,
  LuListFilter,
  LuPencil,
  LuScissors,
  LuSigma,
  LuTable,
  LuTrash2,
  LuUpload,
} from 'react-icons/lu'

import type { GraphNode } from './analysis.js'
import { nodeLines } from './flow-layout.js'

export type FlowNodeType = Node<{ readonly node: GraphNode }, 'flow'>

type Family = 'source' | 'shape' | 'filter' | 'output' | 'write'

/** The colour family and the mark of every node kind. */
const KINDS: Readonly<
  Record<GraphNode['kind'], { readonly family: Family; readonly icon: IconType }>
> = {
  table: { family: 'source', icon: LuTable },
  cte: { family: 'source', icon: LuLayers },
  subquery: { family: 'source', icon: LuLayers },
  values: { family: 'source', icon: LuDatabase },
  function: { family: 'source', icon: LuSquareFunction },
  join: { family: 'shape', icon: LuGitMerge },
  filter: { family: 'filter', icon: LuFilter },
  aggregate: { family: 'shape', icon: LuSigma },
  having: { family: 'filter', icon: LuListFilter },
  project: { family: 'output', icon: LuBraces },
  distinct: { family: 'shape', icon: LuCombine },
  sort: { family: 'shape', icon: LuArrowDownUp },
  limit: { family: 'shape', icon: LuScissors },
  union: { family: 'shape', icon: LuCombine },
  insert: { family: 'write', icon: LuUpload },
  update: { family: 'write', icon: LuPencil },
  delete: { family: 'write', icon: LuTrash2 },
  returning: { family: 'output', icon: LuBraces },
}

const FAMILY_STYLES: Readonly<
  Record<Family, { readonly header: string; readonly border: string }>
> = {
  source: { header: 'bg-kind-source-soft text-kind-source', border: 'border-kind-source/40' },
  shape: { header: 'bg-kind-shape-soft text-kind-shape', border: 'border-kind-shape/40' },
  filter: { header: 'bg-kind-filter-soft text-kind-filter', border: 'border-kind-filter/40' },
  output: { header: 'bg-kind-output-soft text-kind-output', border: 'border-kind-output/40' },
  write: { header: 'bg-kind-write-soft text-kind-write', border: 'border-kind-write/40' },
}

function FlowNodeComponent({ data, selected }: NodeProps<FlowNodeType>) {
  const { node } = data
  const kind = KINDS[node.kind]
  const style = FAMILY_STYLES[kind.family]
  const Icon = kind.icon
  const relation = node.kind === 'table' || node.kind === 'cte' || node.kind === 'subquery'
  const lines = nodeLines(node)
  return (
    <div
      className={`w-[240px] overflow-hidden rounded-lg border bg-surface font-mono shadow-sm ${
        selected ? 'border-accent ring-[3px] ring-accent-soft' : style.border
      }`}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className={`flex h-[34px] items-center gap-2 px-2.5 ${style.header}`}>
        <Icon size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-body font-bold" title={node.label}>
          {node.label}
        </span>
        {node.scope === 'main' ? null : (
          <span className="max-w-[80px] truncate text-caption opacity-70" title={node.scope}>
            {node.scope}
          </span>
        )}
      </div>
      {lines.length === 0 ? null : (
        <div className="py-[5px]">
          {lines.map((line, index) => {
            const column = relation ? node.columns[index] : undefined
            const used = column?.used ?? true
            return (
              <div
                // A node's lines carry no identity of their own; the position is the only stable key.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                className={`flex h-[18px] items-center gap-1.5 px-2.5 text-code ${used ? 'text-ink' : 'text-faint'}`}
                title={column?.dataType ?? line}
              >
                {relation ? (
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${used ? 'bg-accent' : 'bg-line-strong'}`}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{line}</span>
                {column?.dataType ? (
                  <span className="shrink-0 text-caption text-faint">{column.dataType}</span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  )
}

export const FlowNode = memo(FlowNodeComponent)
